/**
 * TableRulesValidator.js - 桌面规则验证器
 * 职责：验证TableRules配置的合理性
 * 依赖：无
 */

class TableRulesValidator {
  /**
   * 验证基本配置参数
   * @param {Object} options 配置选项
   */
  static validate(options) {
    this.validatePlayerCount(options.minPlayers, options.maxPlayers);
    this.validateBlinds(options.smallBlind, options.bigBlind);
    this.validateBuyIn(options.minBuyIn, options.maxBuyIn, options.bigBlind);
  }

  /**
   * 验证玩家数量配置
   * @param {number} minPlayers 
   * @param {number} maxPlayers 
   */
  static validatePlayerCount(minPlayers, maxPlayers) {
    if (minPlayers < 2) {
      throw new Error('Minimum players must be at least 2');
    }
    
    if (maxPlayers < minPlayers) {
      throw new Error('Maximum players must be greater than or equal to minimum players');
    }
    
    if (maxPlayers > 8) {
      throw new Error('Maximum players cannot exceed 8 for Texas Hold\'em');
    }
  }

  /**
   * 验证盲注配置
   * @param {number} smallBlind 
   * @param {number} bigBlind 
   */
  static validateBlinds(smallBlind, bigBlind) {
    if (smallBlind >= bigBlind) {
      throw new Error('Small blind must be less than big blind');
    }
    
    if (bigBlind <= 0 || smallBlind <= 0) {
      throw new Error('Blinds must be positive numbers');
    }
  }

  /**
   * 验证买入配置
   * @param {number} minBuyIn 
   * @param {number} maxBuyIn 
   * @param {number} bigBlind 
   */
  static validateBuyIn(minBuyIn, maxBuyIn, bigBlind) {
    if (minBuyIn <= 0 || maxBuyIn <= 0) {
      throw new Error('Buy-in amounts must be positive numbers');
    }
    
    if (minBuyIn >= maxBuyIn) {
      throw new Error('Minimum buy-in must be less than maximum buy-in');
    }
    
    if (minBuyIn < bigBlind * 10) {
      console.warn('Warning: Minimum buy-in is less than 10BB, which may lead to frequent all-ins');
    }
  }

  /**
   * 验证买入金额是否在规则范围内
   * @param {number} amount 买入金额
   * @param {number} minBuyIn 最小买入
   * @param {number} maxBuyIn 最大买入
   * @returns {boolean}
   */
  static isValidBuyInAmount(amount, minBuyIn, maxBuyIn) {
    return typeof amount === 'number' && 
           amount >= minBuyIn && 
           amount <= maxBuyIn;
  }

  /**
   * 验证玩家数量是否在规则范围内
   * @param {number} playerCount 玩家数量
   * @param {number} minPlayers 最小玩家数
   * @param {number} maxPlayers 最大玩家数
   * @returns {boolean}
   */
  static isValidPlayerCountAmount(playerCount, minPlayers, maxPlayers) {
    return typeof playerCount === 'number' && 
           playerCount >= minPlayers && 
           playerCount <= maxPlayers;
  }

  /**
   * 验证增购金额是否合理
   * @param {number} amount 增购金额
   * @param {number} currentChips 当前筹码
   * @param {number} rebuyMaxAmount 增购上限
   * @returns {boolean}
   */
  static isValidRebuyAmount(amount, currentChips, rebuyMaxAmount) {
    if (typeof amount !== 'number' || amount <= 0) {
      return false;
    }
    
    const totalAfterRebuy = currentChips + amount;
    return totalAfterRebuy <= rebuyMaxAmount;
  }
}

export default TableRulesValidator;