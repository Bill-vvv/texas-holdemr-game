/**
 * TableRules.js - 德州扑克桌面规则配置
 * 职责：定义桌面参数（盲注、最小加注、局间增购等规则）
 * 依赖：TableRulesValidator（验证功能）
 */

import TableRulesValidator from './TableRulesValidator.js';

class TableRules {
  /**
   * 创建桌面规则
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    // 基本桌面配置
    this.minPlayers = options.minPlayers || 2;
    this.maxPlayers = options.maxPlayers || 8; // 调整默认上限为8人
    
    // 盲注配置
    this.smallBlind = options.smallBlind || 10;
    this.bigBlind = options.bigBlind || 20;
    
    // 下注规则
    this.minRaise = options.minRaise || this.bigBlind; // 最小加注额，默认等于大盲
    this.noLimit = options.noLimit !== false; // 是否无限注（默认true）
    
    // 买入规则
    this.minBuyIn = options.minBuyIn || this.bigBlind * 40;  // 最小买入（40BB）
    this.maxBuyIn = options.maxBuyIn || this.bigBlind * 100; // 最大买入（100BB）
    
    // 增购规则
    this.rebuyAllowed = options.rebuyAllowed !== false; // 是否允许增购（默认true）
    this.rebuyOnlyBetweenHands = options.rebuyOnlyBetweenHands !== false; // 仅局间增购
    this.rebuyMaxAmount = options.rebuyMaxAmount || this.maxBuyIn; // 增购上限
    
    // 时间规则（MVP阶段先设置但不实现）
    this.actionTimeoutSeconds = options.actionTimeoutSeconds || 30;
    this.enableTimeout = options.enableTimeout || false; // MVP阶段暂不启用
    
    // 验证配置合理性
    this.validate();
  }

  /**
   * 验证规则配置的合理性（委托给验证器）
   */
  validate() {
    TableRulesValidator.validate({
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      minBuyIn: this.minBuyIn,
      maxBuyIn: this.maxBuyIn
    });
  }

  /**
   * 检查买入金额是否有效
   * @param {number} amount 买入金额
   * @returns {boolean}
   */
  isValidBuyIn(amount) {
    return TableRulesValidator.isValidBuyInAmount(amount, this.minBuyIn, this.maxBuyIn);
  }

  /**
   * 检查增购是否被允许
   * @param {string} gamePhase 游戏阶段 ('WAITING', 'PLAYING', 'FINISHED')
   * @returns {boolean}
   */
  isRebuyAllowed(gamePhase = 'WAITING') {
    if (!this.rebuyAllowed) {
      return false;
    }
    
    if (this.rebuyOnlyBetweenHands) {
      return gamePhase === 'WAITING' || gamePhase === 'FINISHED';
    }
    
    return true;
  }

  /**
   * 检查增购金额是否有效
   * @param {number} amount 增购金额
   * @param {number} currentChips 玩家当前筹码
   * @returns {boolean}
   */
  isValidRebuy(amount, currentChips = 0) {
    if (!this.rebuyAllowed) {
      return false;
    }
    
    return TableRulesValidator.isValidRebuyAmount(amount, currentChips, this.rebuyMaxAmount);
  }

  /**
   * 计算最小加注金额
   * @param {number} currentBet 当前最高下注
   * @param {number} lastRaiseAmount 上次加注增量
   * @returns {number}
   */
  getMinRaiseAmount(currentBet = 0, lastRaiseAmount = this.bigBlind) {
    return Math.max(this.minRaise, lastRaiseAmount);
  }

  /**
   * 检查人数是否符合要求
   * @param {number} playerCount 玩家数量
   * @returns {boolean}
   */
  isValidPlayerCount(playerCount) {
    return TableRulesValidator.isValidPlayerCountAmount(
      playerCount, 
      this.minPlayers, 
      this.maxPlayers
    );
  }

  /**
   * 获取建议的初始筹码数量
   * @returns {number}
   */
  getRecommendedBuyIn() {
    return Math.floor((this.minBuyIn + this.maxBuyIn) / 2);
  }

  /**
   * 创建默认规则（现金局）
   * @param {number} bigBlind 大盲注大小
   * @returns {TableRules}
   */
  static createCashGame(bigBlind = 20) {
    return new TableRules({
      smallBlind: bigBlind / 2,
      bigBlind: bigBlind,
      minBuyIn: bigBlind * 40,
      maxBuyIn: bigBlind * 100,
      rebuyAllowed: true,
      rebuyOnlyBetweenHands: true,
      noLimit: true
    });
  }

  /**
   * 创建锦标赛规则（MVP阶段不实现，预留接口）
   * @param {Object} options 锦标赛配置
   * @returns {TableRules}
   */
  static createTournament(options = {}) {
    throw new Error('Tournament mode not implemented in MVP phase');
  }

  /**
   * 序列化规则配置
   * @returns {Object}
   */
  serialize() {
    return {
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      minRaise: this.minRaise,
      noLimit: this.noLimit,
      minBuyIn: this.minBuyIn,
      maxBuyIn: this.maxBuyIn,
      rebuyAllowed: this.rebuyAllowed,
      rebuyOnlyBetweenHands: this.rebuyOnlyBetweenHands,
      rebuyMaxAmount: this.rebuyMaxAmount,
      actionTimeoutSeconds: this.actionTimeoutSeconds,
      enableTimeout: this.enableTimeout
    };
  }

  /**
   * 从序列化数据创建规则实例
   * @param {Object} data 序列化的数据
   * @returns {TableRules}
   */
  static deserialize(data) {
    return new TableRules(data);
  }

  /**
   * 获取规则摘要信息（用于显示）
   * @returns {string}
   */
  getSummary() {
    const gameType = this.noLimit ? 'No-Limit' : 'Limit';
    const rebuy = this.rebuyAllowed ? '允许增购' : '不允许增购';
    
    return `${gameType} Hold'em ${this.smallBlind}/${this.bigBlind}, ` +
           `买入: ${this.minBuyIn}-${this.maxBuyIn}, ${rebuy}`;
  }
}

export default TableRules;