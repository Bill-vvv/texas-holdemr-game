/**
 * GameState.js - 德州扑克游戏状态管理
 * 职责：集中存放可序列化的游戏状态，提供派生只读视图
 * 依赖：GameStateSerializer（序列化功能）
 */

import GameStateSerializer from './GameStateSerializer.js';

class GameState {
  constructor() {
    this.reset();
  }

  /**
   * 重置到初始状态
   */
  reset() {
    // 基本游戏信息
    this.gameId = null;
    this.street = 'PRE_FLOP'; // PRE_FLOP, FLOP, TURN, RIVER, SHOWDOWN
    this.phase = 'WAITING';   // WAITING, PLAYING, FINISHED
    
    // 玩家信息
    this.players = [];        // [{id, name, chips, holeCards, position, status}]
    this.buttonIndex = 0;     // 庄家按钮位置索引
    this.activePlayers = [];  // 当前轮参与玩家ID列表
    
    // 公共牌
    this.communityCards = []; // ['AH', 'KS', ...]
    
    // 彩池信息
    this.pots = [];          // [{amount, eligiblePlayers}]
    this.totalPot = 0;       // 所有彩池总额
    
    // 回合状态 (精确状态模型，参考计划文档12.1)
    this.currentTurn = null;     // 当前行动玩家ID
    this.amountToCall = 0;       // 当前需匹配的总下注额
    this.lastAggressorId = null; // 最近进攻者ID (bet/raise/all-in)
    this.activePlayersCount = 0; // 未弃牌且未all-in的玩家数
    this.isActionReopened = true; // 是否允许再次加注
    
    // 历史记录（最小化，仅必要信息）
    this.actionHistory = [];  // 当前街的动作历史
    this.handNumber = 0;      // 当前手牌编号
    
    // 阶段1.5新增字段
    // 摊牌摘要：仅当上一手是摊牌结束时才有值，下一手开始前清空
    this.lastShowdownSummary = null; // { handId, winners: [{ playerId, rankName, bestFive, usedHole }] }
    
    // 会话基线（用于整局结算），在"第一次发牌"之前初始化
    this.session = null; // { id, startedAt, baselineStacks: Record<playerId, chips>, handsPlayed }
  }

  /**
   * 添加玩家
   * @param {Object} player {id, name, chips}
   */
  addPlayer(player) {
    if (!player || !player.id || typeof player.chips !== 'number') {
      throw new Error('Invalid player data');
    }
    
    // 检查玩家是否已存在
    if (this.players.some(p => p.id === player.id)) {
      throw new Error(`Player ${player.id} already exists`);
    }

    const newPlayer = {
      id: player.id,
      name: player.name || player.id,
      chips: player.chips,
      holeCards: [],           // 手牌
      position: this.players.length, // 座位位置
      status: 'ACTIVE',        // ACTIVE, FOLDED, ALL_IN, SITTING_OUT
      currentBet: 0,          // 本街已下注金额
      totalBet: 0,            // 本轮总下注金额
      isDealer: false,        // 是否是庄家
      isSmallBlind: false,    // 是否是小盲
      isBigBlind: false       // 是否是大盲
    };

    this.players.push(newPlayer);
    this.updateActivePlayers();
  }

  /**
   * 移除玩家
   * @param {string} playerId 
   */
  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) {
      throw new Error(`Player ${playerId} not found`);
    }

    this.players.splice(index, 1);
    
    // 更新位置索引
    this.players.forEach((p, idx) => p.position = idx);
    
    // 调整按钮位置
    if (this.buttonIndex >= this.players.length) {
      this.buttonIndex = 0;
    }
    
    this.updateActivePlayers();
  }

  /**
   * 获取玩家
   * @param {string} playerId 
   * @returns {Object|null}
   */
  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  /**
   * 更新活跃玩家列表和计数
   */
  updateActivePlayers() {
    this.activePlayers = this.players
      .filter(p => p.status === 'ACTIVE')
      .map(p => p.id);
    
    this.activePlayersCount = this.activePlayers.length;
  }

  /**
   * 获取公共状态（客户端可见）
   * @returns {Object}
   */
  getPublicState() {
    return {
      gameId: this.gameId,
      street: this.street,
      phase: this.phase,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        position: p.position,
        status: p.status,
        currentBet: p.currentBet,
        totalBet: p.totalBet,
        isDealer: p.isDealer,
        isSmallBlind: p.isSmallBlind,
        isBigBlind: p.isBigBlind,
        hasCards: p.holeCards.length > 0 // 不暴露具体牌面
      })),
      communityCards: this.communityCards,
      pots: this.pots,
      totalPot: this.totalPot,
      currentTurn: this.currentTurn,
      amountToCall: this.amountToCall,
      buttonIndex: this.buttonIndex,
      handNumber: this.handNumber,
      isActionReopened: this.isActionReopened,
      activePlayersCount: this.activePlayersCount,
      lastAggressorId: this.lastAggressorId,
      actionHistory: this.actionHistory,
      lastShowdownSummary: this.lastShowdownSummary // 阶段1.5: 摊牌摘要（公共信息）
    };
  }

  /**
   * 获取玩家私有状态
   * @param {string} playerId 
   * @returns {Object}
   */
  getPrivateStateFor(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) {
      return { holeCards: [] };
    }

    return {
      holeCards: player.holeCards,
      playerId: playerId
    };
  }

  /**
   * 检查游戏是否可以开始
   * @returns {boolean}
   */
  canStart() {
    return this.players.length >= 2 && this.players.length <= 3 && this.phase === 'WAITING';
  }

  /**
   * 序列化状态（委托给序列化器）
   * @returns {Object}
   */
  serialize() {
    return GameStateSerializer.serialize(this);
  }

  /**
   * 从序列化数据恢复状态（委托给序列化器）
   * @param {Object} data 
   */
  deserialize(data) {
    GameStateSerializer.deserialize(this, data);
  }

  // 阶段1.5新增方法

  /**
   * 初始化会话基线（在第一手开始前调用）
   */
  initializeSession() {
    if (!this.session) {
      this.session = {
        id: `session_${Date.now()}`,
        startedAt: Date.now(),
        baselineStacks: {},
        handsPlayed: 0
      };
      
      // 记录所有玩家的基线筹码
      this.players.forEach(player => {
        this.session.baselineStacks[player.id] = player.chips;
      });
    }
  }

  /**
   * 清空摊牌摘要（新一手开始前调用）
   */
  clearShowdownSummary() {
    this.lastShowdownSummary = null;
  }

  /**
   * 设置摊牌摘要
   * @param {Array} winners 获胜者信息数组
   */
  setShowdownSummary(winners) {
    this.lastShowdownSummary = {
      handId: this.handNumber,
      winners: winners
    };
  }
}

export default GameState;