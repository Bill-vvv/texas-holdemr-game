/**
 * ReplayEngine - 回放引擎
 * 
 * 支持双模式回放：
 * 1. 公共模式：基于快照和公共事件日志，回放公共可见的游戏过程
 * 2. 管理员模式：额外使用私有事件日志，实现100%保真回放
 * 
 * 功能特性：
 * - 从快照加载初始状态
 * - 顺序重放事件流
 * - 替换Game内的Deck为ScriptedDeck
 * - 验证回放结果一致性
 * - 支持逐事件播放和快进
 * 
 * 设计原则：
 * - 不修改Game核心逻辑
 * - 通过依赖注入替换随机组件
 * - 严格按事件顺序重放
 * - 提供回放状态查询接口
 */

import ScriptedDeck from './ScriptedDeck.js';

class ReplayEngine {
  constructor(storage, gameClass) {
    this.storage = storage;
    this.GameClass = gameClass;
    
    // 回放状态
    this.game = null;
    this.sessionId = null;
    this.mode = 'public'; // 'public' | 'admin'
    this.currentEventIndex = 0;
    this.events = [];
    this.privateEvents = [];
    this.snapshot = null;
    
    // 回放配置
    this.scriptedDeck = new ScriptedDeck();
    this.replaySpeed = 1; // 回放速度倍数
    this.autoPlay = false;
    this.playbackState = 'stopped'; // 'stopped' | 'playing' | 'paused'
  }

  /**
   * 加载会话进行回放
   * @param {string} sessionId - 会话ID
   * @param {string} mode - 回放模式 'public' | 'admin'
   * @returns {Promise<boolean>} 是否加载成功
   */
  async loadSession(sessionId, mode = 'public') {
    try {
      this.sessionId = sessionId;
      this.mode = mode;

      // 1. 加载快照
      this.snapshot = await this.storage.readSession(sessionId);
      if (!this.snapshot || !this.snapshot.gameState) {
        throw new Error('会话快照未找到或格式错误');
      }

      // 2. 加载公共事件
      this.events = [];
      const eventStream = this.storage.streamPublicEvents(sessionId);
      for await (const event of eventStream) {
        this.events.push(event);
      }

      // 3. 如果是管理员模式，加载私有事件
      if (mode === 'admin') {
        this.privateEvents = [];
        try {
          const privateStream = this.storage.streamPrivateEvents(sessionId);
          for await (const event of privateStream) {
            this.privateEvents.push(event);
          }
        } catch (error) {
          console.warn('私有事件日志不可用，降级为公共模式回放');
          this.mode = 'public';
        }
      }

      // 4. 初始化回放状态
      this.currentEventIndex = 0;
      this.playbackState = 'stopped';

      console.log(`✅ 会话 ${sessionId} 加载完成`);
      console.log(`📊 快照时间: ${new Date(this.snapshot.meta.savedAt).toISOString()}`);
      console.log(`📝 公共事件: ${this.events.length} 条`);
      if (this.mode === 'admin') {
        console.log(`🔐 私有事件: ${this.privateEvents.length} 条`);
      }

      return true;

    } catch (error) {
      console.error('❌ 加载会话失败:', error.message);
      this._resetState();
      return false;
    }
  }

  /**
   * 开始回放
   * @param {Object} options - 回放选项
   * @returns {Promise<void>}
   */
  async startReplay(options = {}) {
    if (!this.snapshot) {
      throw new Error('未加载会话，请先调用 loadSession()');
    }

    // 设置回放选项
    this.replaySpeed = options.speed || 1;
    this.autoPlay = options.autoPlay !== false;

    try {
      // 1. 从快照恢复游戏状态
      await this._restoreFromSnapshot();

      // 2. 配置ScriptedDeck
      await this._setupScriptedDeck();

      // 3. 开始事件回放
      this.playbackState = 'playing';
      console.log(`🎬 开始回放，模式: ${this.mode}`);

      if (this.autoPlay) {
        await this._autoPlayEvents();
      }

    } catch (error) {
      console.error('❌ 回放失败:', error.message);
      this.playbackState = 'stopped';
      throw error;
    }
  }

  /**
   * 逐步执行下一个事件
   * @returns {Promise<Object|null>} 执行的事件或null（已结束）
   */
  async stepNext() {
    if (!this.game || this.currentEventIndex >= this.events.length) {
      return null;
    }

    const event = this.events[this.currentEventIndex];
    await this._replayEvent(event);
    this.currentEventIndex++;

    return event;
  }

  /**
   * 暂停回放
   */
  pause() {
    this.playbackState = 'paused';
  }

  /**
   * 恢复回放
   */
  async resume() {
    if (this.playbackState === 'paused') {
      this.playbackState = 'playing';
      if (this.autoPlay) {
        await this._autoPlayEvents();
      }
    }
  }

  /**
   * 停止回放
   */
  stop() {
    this.playbackState = 'stopped';
    this.currentEventIndex = 0;
  }

  /**
   * 跳转到指定事件位置
   * @param {number} eventIndex - 事件索引
   * @returns {Promise<void>}
   */
  async seekTo(eventIndex) {
    if (!this.snapshot || eventIndex < 0 || eventIndex > this.events.length) {
      throw new Error('无效的事件位置');
    }

    // 从快照重新开始
    await this._restoreFromSnapshot();
    await this._setupScriptedDeck();

    // 重放到指定位置
    for (let i = 0; i < eventIndex && i < this.events.length; i++) {
      await this._replayEvent(this.events[i]);
    }

    this.currentEventIndex = eventIndex;
  }

  /**
   * 获取回放状态
   * @returns {Object} 回放状态信息
   */
  getReplayStatus() {
    return {
      sessionId: this.sessionId,
      mode: this.mode,
      playbackState: this.playbackState,
      currentEventIndex: this.currentEventIndex,
      totalEvents: this.events.length,
      progress: this.events.length > 0 ? this.currentEventIndex / this.events.length : 0,
      gameState: this.game ? this.game.getPublicState() : null,
      replaySpeed: this.replaySpeed
    };
  }

  /**
   * 获取当前游戏状态
   * @returns {Object|null} 游戏公共状态
   */
  getCurrentGameState() {
    return this.game ? this.game.getPublicState() : null;
  }

  /**
   * 验证回放结果一致性
   * @returns {Object} 验证结果
   */
  validateReplay() {
    if (!this.game) {
      return { valid: false, error: '游戏未初始化' };
    }

    const currentState = this.game.getPublicState();
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        handsReplayed: currentState.handNumber - (this.snapshot.gameState.handNumber || 0),
        finalPlayerCount: currentState.players.length,
        totalEvents: this.currentEventIndex
      }
    };

    // 基本一致性检查
    if (currentState.players.length === 0) {
      validation.errors.push('玩家列表为空');
      validation.valid = false;
    }

    // 筹码总量守恒检查（如果可用）
    const snapshotTotalChips = this._calculateTotalChips(this.snapshot.gameState.players);
    const currentTotalChips = this._calculateTotalChips(currentState.players);
    
    if (Math.abs(snapshotTotalChips - currentTotalChips) > 1) {
      validation.warnings.push(`筹码总量变化: ${snapshotTotalChips} -> ${currentTotalChips}`);
    }

    return validation;
  }

  /**
   * 从快照恢复游戏状态
   * @private
   */
  async _restoreFromSnapshot() {
    const gameState = this.snapshot.gameState;
    
    // 创建新的Game实例
    this.game = new this.GameClass();
    
    // 恢复状态（这里需要Game支持状态恢复）
    if (typeof this.game.restoreFromState === 'function') {
      this.game.restoreFromState(gameState);
    } else {
      // 简化的状态恢复逻辑
      Object.assign(this.game.gameState, gameState);
    }

    console.log(`🔄 从快照恢复状态: 手牌 ${gameState.handNumber}, 玩家 ${gameState.players.length} 人`);
  }

  /**
   * 配置ScriptedDeck
   * @private
   */
  async _setupScriptedDeck() {
    if (this.mode === 'admin' && this.privateEvents.length > 0) {
      // 管理员模式：查找DECK_SHUFFLED事件
      const shuffleEvent = this.privateEvents.find(e => e.type === 'DECK_SHUFFLED');
      if (shuffleEvent && shuffleEvent.payload.orderedDeck) {
        this.scriptedDeck.setAdminMode(shuffleEvent.payload.orderedDeck);
        console.log('🔐 管理员模式：使用完整牌序');
      } else {
        console.warn('⚠️  未找到牌序信息，降级为公共模式');
        this.mode = 'public';
      }
    }

    if (this.mode === 'public') {
      // 公共模式：从事件中提取公共牌信息
      const publicCards = this._extractPublicCardsFromEvents();
      this.scriptedDeck.setPublicMode(publicCards);
      console.log('📊 公共模式：使用事件中的公共牌信息');
    }

    // 替换Game中的Deck（如果支持）
    if (this.game && typeof this.game.setDeck === 'function') {
      this.game.setDeck(this.scriptedDeck);
    }
  }

  /**
   * 自动播放所有事件
   * @private
   */
  async _autoPlayEvents() {
    while (this.currentEventIndex < this.events.length && this.playbackState === 'playing') {
      const event = this.events[this.currentEventIndex];
      await this._replayEvent(event);
      this.currentEventIndex++;

      // 根据回放速度添加延迟
      if (this.replaySpeed < 10) {
        await this._sleep(100 / this.replaySpeed);
      }
    }

    if (this.currentEventIndex >= this.events.length) {
      this.playbackState = 'stopped';
      console.log('🎬 回放完成');
    }
  }

  /**
   * 重放单个事件
   * @private
   */
  async _replayEvent(event) {
    try {
      switch (event.type) {
        case 'HAND_STARTED':
          // 手牌开始：更新手牌号
          if (event.handNumber && this.game.gameState) {
            this.game.gameState.handNumber = event.handNumber;
            this.game.gameState.phase = 'PLAYING';
          }
          break;
        case 'PLAYER_ACTION':
          await this._replayPlayerAction(event);
          break;
        case 'FLOP_DEALT':
          if (this.game.dealFlop) {
            this.game.dealFlop();
          } else if (event.payload && event.payload.cards) {
            this.game.gameState.communityCards = event.payload.cards;
            this.game.gameState.street = 'FLOP';
          }
          break;
        case 'TURN_DEALT':
          if (this.game.dealTurn) {
            this.game.dealTurn();
          } else if (event.payload && event.payload.card) {
            this.game.gameState.communityCards.push(event.payload.card);
            this.game.gameState.street = 'TURN';
          }
          break;
        case 'RIVER_DEALT':
          if (this.game.dealRiver) {
            this.game.dealRiver();
          } else if (event.payload && event.payload.card) {
            this.game.gameState.communityCards.push(event.payload.card);
            this.game.gameState.street = 'RIVER';
          }
          break;
        case 'ROUND_CLOSED':
        case 'STREET_ADVANCED':
        case 'SHOWDOWN_STARTED':
        case 'POTS_DISTRIBUTED':
        case 'HAND_FINISHED':
        case 'GAME_ENDED':
          // 这些事件由Game内部产生，不需要主动重放
          break;
        default:
          console.warn(`⚠️  未知事件类型: ${event.type}`);
      }

    } catch (error) {
      console.error(`❌ 重放事件失败: ${event.type}`, error.message);
      throw error;
    }
  }

  /**
   * 重放玩家动作
   * @private
   */
  async _replayPlayerAction(event) {
    if (!this.game || !event.payload) return;

    const action = {
      type: event.payload.action,
      playerId: event.payload.playerId,
      amount: event.payload.amount
    };

    const result = this.game.applyAction(action);
    if (!result.success) {
      console.warn(`⚠️  回放动作失败: ${action.type}`, result.error?.message);
    }
  }

  /**
   * 从事件中提取公共牌信息
   * @private
   */
  _extractPublicCardsFromEvents() {
    const publicCards = {};

    for (const event of this.events) {
      switch (event.type) {
        case 'FLOP_DEALT':
          if (event.payload && event.payload.cards) {
            publicCards.flop = event.payload.cards;
          }
          break;
        case 'TURN_DEALT':
          if (event.payload && event.payload.card) {
            publicCards.turn = [event.payload.card];
          }
          break;
        case 'RIVER_DEALT':
          if (event.payload && event.payload.card) {
            publicCards.river = [event.payload.card];
          }
          break;
      }
    }

    return publicCards;
  }

  /**
   * 计算总筹码数
   * @private
   */
  _calculateTotalChips(players) {
    return players.reduce((total, player) => total + (player.chips || 0), 0);
  }

  /**
   * 重置内部状态
   * @private
   */
  _resetState() {
    this.game = null;
    this.sessionId = null;
    this.currentEventIndex = 0;
    this.events = [];
    this.privateEvents = [];
    this.snapshot = null;
    this.playbackState = 'stopped';
  }

  /**
   * 异步延迟
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ReplayEngine;