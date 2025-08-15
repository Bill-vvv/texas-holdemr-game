/**
 * EventLogger - 公共事件记录器
 * 
 * 负责记录会话级的公共事件到events.ndjson文件，支持：
 * - 自动序号生成和时间戳
 * - 会话级事件追加记录
 * - 错误处理和重试机制
 * - 可选事件索引管理
 */
export default class EventLogger {
  constructor(storage) {
    this.storage = storage;
    this.sequenceCounters = new Map(); // sessionId -> nextSeq
    this.enabled = process.env.PERSIST_ENABLED === 'true';
    this.indexEnabled = process.env.EVENT_INDEX_ENABLED === 'true';
  }

  /**
   * 追加公共事件到会话日志
   * @param {string} sessionId - 会话ID
   * @param {object} eventData - 事件数据 {type, payload}
   * @param {number} handNumber - 手牌编号
   * @returns {Promise<number>} 事件序号
   */
  async appendPublicEvent(sessionId, eventData, handNumber) {
    if (!this.enabled) {
      return -1; // 持久化禁用时返回假序号
    }

    try {
      await this._ensureSequenceInitialized(sessionId);
      // 获取下一个序号
      const seq = this._getNextSequence(sessionId);
      
      // 构建标准事件格式
      const event = {
        seq,
        t: Date.now(),
        sessionId,
        handNumber,
        type: eventData.type,
        payload: eventData.payload || {}
      };

      // 追加到文件
      await this.storage.appendPublicEvent(sessionId, event);

      // 可选：更新索引
      if (this.indexEnabled) {
        await this._updateIndex(sessionId, handNumber, seq);
      }

      return seq;
    } catch (error) {
      // 重置序号计数器，避免序号不连续
      this._resetSequence(sessionId);
      throw new Error(`Failed to append event: ${error.message}`);
    }
  }

  /**
   * 批量追加多个事件（事务性）
   * @param {string} sessionId - 会话ID
   * @param {Array} events - 事件数组
   * @param {number} handNumber - 手牌编号
   * @returns {Promise<Array<number>>} 事件序号数组
   */
  async appendBatch(sessionId, events, handNumber) {
    if (!this.enabled || !events.length) {
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
          sessionId,
          handNumber,
          type: eventData.type,
          payload: eventData.payload || {}
        };
      });

      // 批量写入
      await this.storage.appendBatch(sessionId, formattedEvents);
      
      // 更新序号计数器
      this._advanceSequence(sessionId, events.length);

      // 可选：批量更新索引
      if (this.indexEnabled) {
        await this._batchUpdateIndex(sessionId, handNumber, sequences);
      }

      return sequences;
    } catch (error) {
      // 回滚序号计数器
      this._resetSequence(sessionId);
      throw new Error(`Failed to append batch: ${error.message}`);
    }
  }

  /**
   * 获取事件总数
   * @param {string} sessionId - 会话ID
   * @returns {Promise<number>} 事件总数
   */
  async getEventCount(sessionId) {
    if (!this.enabled) {
      return 0;
    }

    try {
      return await this.storage.getEventCount(sessionId);
    } catch (error) {
      console.warn(`Failed to get event count for ${sessionId}:`, error.message);
      return 0;
    }
  }

  /**
   * 流式读取事件
   * @param {string} sessionId - 会话ID
   * @param {number} fromSeq - 起始序号（可选）
   * @returns {AsyncIterable<object>} 事件流
   */
  async *streamEvents(sessionId, fromSeq = 1) {
    if (!this.enabled) {
      return;
    }

    try {
      for await (const event of this.storage.streamPublicEvents(sessionId, fromSeq)) {
        yield event;
      }
    } catch (error) {
      throw new Error(`Failed to stream events: ${error.message}`);
    }
  }

  /**
   * 清理旧事件（可选，用于会话轮转）
   * @param {string} sessionId - 会话ID
   * @param {number} keepLastHands - 保留最近N手的事件
   */
  async rotateEvents(sessionId, keepLastHands = 100) {
    if (!this.enabled || !this.indexEnabled) {
      return; // 需要索引支持才能安全轮转
    }

    try {
      await this.storage.rotateEvents(sessionId, keepLastHands);
      console.log(`Rotated events for session ${sessionId}, keeping last ${keepLastHands} hands`);
    } catch (error) {
      console.warn(`Failed to rotate events for ${sessionId}:`, error.message);
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
   * 更新事件索引
   * @param {string} sessionId - 会话ID
   * @param {number} handNumber - 手牌编号
   * @param {number} seq - 事件序号
   */
  async _updateIndex(sessionId, handNumber, seq) {
    try {
      await this.storage.updateEventIndex(sessionId, handNumber, seq);
    } catch (error) {
      console.warn(`Failed to update index for ${sessionId}:`, error.message);
      // 索引更新失败不影响事件记录
    }
  }

  /**
   * 批量更新索引
   * @param {string} sessionId - 会话ID
   * @param {number} handNumber - 手牌编号
   * @param {Array<number>} sequences - 序号数组
   */
  async _batchUpdateIndex(sessionId, handNumber, sequences) {
    try {
      await this.storage.batchUpdateEventIndex(sessionId, handNumber, sequences);
    } catch (error) {
      console.warn(`Failed to batch update index for ${sessionId}:`, error.message);
    }
  }

  /**
   * 确保序号计数器从磁盘最新位置初始化，避免重启后重复序号
   */
  async _ensureSequenceInitialized(sessionId) {
    if (this.sequenceCounters.has(sessionId)) {
      return;
    }
    try {
      let lastSeq = 0;
      if (typeof this.storage.getLastPublicSeq === 'function') {
        lastSeq = await this.storage.getLastPublicSeq(sessionId);
      } else if (typeof this.storage.getEventCount === 'function') {
        lastSeq = await this.storage.getEventCount(sessionId);
      }
      this.sequenceCounters.set(sessionId, (lastSeq || 0) + 1);
    } catch (_) {
      // 出错时从1开始
      this.sequenceCounters.set(sessionId, 1);
    }
  }
}