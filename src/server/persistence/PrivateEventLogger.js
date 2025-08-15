/**
 * PrivateEventLogger - 私有事件记录器
 * 
 * 负责记录会话的私有事件（如发牌剧本）到private.ndjson文件，支持：
 * - 管理员模式下的100%保真回放
 * - 私有事件的安全记录和访问控制
 * - 可选开启/关闭功能
 * - 与EventLogger独立的序号管理
 */
export default class PrivateEventLogger {
  constructor(storage) {
    this.storage = storage;
    this.sequenceCounters = new Map(); // sessionId -> nextSeq
    this.enabled = process.env.PERSIST_PRIVATE === 'true';
    this.defaultEnabled = process.env.PERSIST_ENABLED === 'true';
  }

  /**
   * 检查私有日志是否启用
   * @returns {boolean} 是否启用
   */
  isEnabled() {
    return this.defaultEnabled && this.enabled;
  }

  /**
   * 追加私有事件到会话日志
   * @param {string} sessionId - 会话ID
   * @param {object} eventData - 事件数据 {type, payload}
   * @returns {Promise<number>} 事件序号，未启用时返回-1
   */
  async appendPrivateEvent(sessionId, eventData) {
    if (!this.isEnabled()) {
      return -1; // 私有日志禁用时返回假序号
    }

    try {
      await this._ensureSequenceInitialized(sessionId);
      // 获取下一个序号
      const seq = this._getNextSequence(sessionId);
      
      // 构建私有事件格式（不包含sessionId/handNumber，避免泄露）
      const event = {
        seq,
        t: Date.now(),
        type: eventData.type,
        payload: eventData.payload || {}
      };

      // 追加到私有文件
      await this.storage.appendPrivateEvent(sessionId, event);

      return seq;
    } catch (error) {
      // 重置序号计数器，避免序号不连续
      this._resetSequence(sessionId);
      throw new Error(`Failed to append private event: ${error.message}`);
    }
  }

  /**
   * 记录牌堆洗牌事件
   * @param {string} sessionId - 会话ID
   * @param {Array<string>} orderedDeck - 洗牌后的牌序
   * @returns {Promise<number>} 事件序号
   */
  async logDeckShuffled(sessionId, orderedDeck) {
    return await this.appendPrivateEvent(sessionId, {
      type: 'DECK_SHUFFLED',
      payload: { orderedDeck: [...orderedDeck] } // 深拷贝避免外部修改
    });
  }

  /**
   * 记录底牌发放事件
   * @param {string} sessionId - 会话ID
   * @param {string} playerId - 玩家ID
   * @param {Array<string>} cards - 发放的底牌
   * @returns {Promise<number>} 事件序号
   */
  async logHoleCardsDealt(sessionId, playerId, cards) {
    return await this.appendPrivateEvent(sessionId, {
      type: 'HOLE_CARDS_DEALT',
      payload: { 
        playerId, 
        cards: [...cards] // 深拷贝避免外部修改
      }
    });
  }

  /**
   * 记录公共牌发放事件
   * @param {string} sessionId - 会话ID
   * @param {string} street - 街道名称（FLOP/TURN/RIVER）
   * @param {Array<string>} cards - 发放的公共牌
   * @returns {Promise<number>} 事件序号
   */
  async logCommunityCardsDealt(sessionId, street, cards) {
    return await this.appendPrivateEvent(sessionId, {
      type: 'COMMUNITY_CARDS_DEALT',
      payload: { 
        street,
        cards: [...cards] // 深拷贝避免外部修改
      }
    });
  }

  /**
   * 记录随机种子事件（可选，用于可重现的随机性）
   * @param {string} sessionId - 会话ID
   * @param {number} seed - 随机种子
   * @param {string} source - 种子来源（如'system'、'user'）
   * @returns {Promise<number>} 事件序号
   */
  async logRandomSeed(sessionId, seed, source = 'system') {
    return await this.appendPrivateEvent(sessionId, {
      type: 'RANDOM_SEED',
      payload: { seed, source }
    });
  }

  /**
   * 批量追加私有事件（发牌时的批量操作）
   * @param {string} sessionId - 会话ID
   * @param {Array} events - 私有事件数组
   * @returns {Promise<Array<number>>} 事件序号数组
   */
  async appendBatch(sessionId, events) {
    if (!this.isEnabled() || !events.length) {
      return events.map(() => -1);
    }

    const sequences = [];
    await this._ensureSequenceInitialized(sessionId);
    const startSeq = this._peekNextSequence(sessionId);

    try {
      // 准备所有事件
      const formattedEvents = events.map((eventData, index) => {
        const seq = startSeq + index;
        sequences.push(seq);
        
        return {
          seq,
          t: Date.now(),
          type: eventData.type,
          payload: eventData.payload || {}
        };
      });

      // 批量写入（需要FileStorage支持私有事件批量写入）
      if (this.storage.appendPrivateBatch) {
        await this.storage.appendPrivateBatch(sessionId, formattedEvents);
      } else {
        await this._appendBatchFallback(sessionId, formattedEvents);
      }
      
      // 更新序号计数器
      this._advanceSequence(sessionId, events.length);

      return sequences;
    } catch (error) {
      // 回滚序号计数器
      this._resetSequence(sessionId);
      throw new Error(`Failed to append private batch: ${error.message}`);
    }
  }

  /**
   * 流式读取私有事件（管理员模式）
   * @param {string} sessionId - 会话ID
   * @param {number} fromSeq - 起始序号（可选）
   * @returns {AsyncIterable<object>} 私有事件流
   */
  async *streamPrivateEvents(sessionId, fromSeq = 1) {
    if (!this.isEnabled()) {
      console.warn('Private logging is disabled, no private events available');
      return;
    }

    try {
      for await (const event of this.storage.streamPrivateEvents(sessionId, fromSeq)) {
        yield event;
      }
    } catch (error) {
      throw new Error(`Failed to stream private events: ${error.message}`);
    }
  }

  /**
   * 获取私有事件总数
   * @param {string} sessionId - 会话ID
   * @returns {Promise<number>} 私有事件总数
   */
  async getPrivateEventCount(sessionId) {
    if (!this.isEnabled()) {
      return 0;
    }

    try {
      return await this.storage.getPrivateEventCount?.(sessionId) || 0;
    } catch (error) {
      console.warn(`Failed to get private event count for ${sessionId}:`, error.message);
      return 0;
    }
  }

  // === 私有方法 ===

  /**
   * 获取下一个序号
   * @param {string} sessionId - 会话ID
   * @returns {number} 序号
   */
  _getNextSequence(sessionId) {
    const current = this.sequenceCounters.get(sessionId) || 1;
    this.sequenceCounters.set(sessionId, current + 1);
    return current;
  }

  /**
   * 预览下一个序号（不消耗）
   * @param {string} sessionId - 会话ID
   * @returns {number} 序号
   */
  _peekNextSequence(sessionId) {
    return this.sequenceCounters.get(sessionId) || 1;
  }

  /**
   * 前进序号计数器
   * @param {string} sessionId - 会话ID
   * @param {number} count - 前进数量
   */
  _advanceSequence(sessionId, count) {
    const current = this.sequenceCounters.get(sessionId) || 1;
    this.sequenceCounters.set(sessionId, current + count);
  }

  /**
   * 重置序号计数器
   * @param {string} sessionId - 会话ID
   */
  _resetSequence(sessionId) {
    this.sequenceCounters.delete(sessionId);
  }

  /**
   * 批量写入的回退实现（逐条写入）
   * @param {string} sessionId - 会话ID
   * @param {Array} formattedEvents - 格式化的事件数组
   */
  async _appendBatchFallback(sessionId, formattedEvents) {
    // 注意：事件已经包含了正确的序号，直接写入即可
    for (const event of formattedEvents) {
      await this.storage.appendPrivateEvent(sessionId, event);
    }
  }

  /**
   * 确保私有序号计数器从磁盘最新位置初始化
   */
  async _ensureSequenceInitialized(sessionId) {
    if (this.sequenceCounters.has(sessionId)) {
      return;
    }
    try {
      let lastSeq = 0;
      if (typeof this.storage.getLastPrivateSeq === 'function') {
        lastSeq = await this.storage.getLastPrivateSeq(sessionId);
      } else if (typeof this.storage.getPrivateEventCount === 'function') {
        lastSeq = await this.storage.getPrivateEventCount(sessionId);
      }
      this.sequenceCounters.set(sessionId, (lastSeq || 0) + 1);
    } catch (_) {
      this.sequenceCounters.set(sessionId, 1);
    }
  }
}