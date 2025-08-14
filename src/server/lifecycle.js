/**
 * Lifecycle.js - 玩家生命周期守卫与执行模块
 * 
 * 职责：
 * - 生命周期命令守卫："仅在WAITING状态时允许"变更
 * - 执行入座、离座、离开、增购等生命周期操作
 * - 应用状态修改并触发全量广播
 * - 维护玩家生命周期规则的一致性
 * 
 * 严格遵循单文件<200行约束
 */

// 错误类型常量
const LIFECYCLE_ERRORS = {
  ONLY_IN_WAITING_STATE: 'ONLY_IN_WAITING_STATE',
  SEAT_TAKEN: 'SEAT_TAKEN',
  BUYIN_OUT_OF_RANGE: 'BUYIN_OUT_OF_RANGE', 
  ADDON_OVER_MAX: 'ADDON_OVER_MAX',
  PLAYER_NOT_SEATED: 'PLAYER_NOT_SEATED',
  ALREADY_SEATED: 'ALREADY_SEATED',
  NO_SEATS_AVAILABLE: 'NO_SEATS_AVAILABLE'
};

class Lifecycle {
  constructor() {
    // 生命周期操作只依赖传入的状态，无内部状态
  }

  /**
   * 处理加入桌面请求
   * @param {Object} ctx - 上下文 { gameState, playerId, nickname }
   * @returns {Object} { success: boolean, error?: Object }
   */
  handleJoinTable(ctx) {
    const { gameState, playerId, nickname } = ctx;
    
    try {
      // 基础验证
      if (!playerId || !nickname) {
        return this._createError('INVALID_PARAMS', '玩家ID和昵称不能为空');
      }

      // 检查玩家是否已存在
      const existingPlayer = gameState.getPlayer(playerId);
      if (existingPlayer) {
        return this._createError('PLAYER_ALREADY_EXISTS', '玩家已存在');
      }

      // 加入桌面（观察者模式，无需分配座位，position=null 表示未入座）
      gameState.addPlayer({
        id: playerId,
        name: nickname,
        chips: 0, // 观察者状态，未买入
        status: 'SITTING_OUT',
        position: null
      });

      return { success: true };
    } catch (error) {
      return this._createError('INTERNAL_ERROR', error.message);
    }
  }

  /**
   * 处理入座请求
   * @param {Object} ctx - 上下文 { gameState, tableRules, playerId, seatId, buyIn }
   * @returns {Object} { success: boolean, error?: Object }
   */
  handleTakeSeat(ctx) {
    const { gameState, tableRules, playerId, seatId, buyIn } = ctx;
    
    // 1. 守卫：仅在WAITING状态允许
    const guardResult = this._guardWaitingState(gameState);
    if (!guardResult.success) return guardResult;

    try {
      // 2. 验证买入金额
      if (!tableRules.isValidBuyIn(buyIn)) {
        return this._createError(LIFECYCLE_ERRORS.BUYIN_OUT_OF_RANGE, 
          `买入金额必须在 ${tableRules.minBuyIn} - ${tableRules.maxBuyIn} 之间`);
      }

      // 3. 检查座位可用性
      const player = gameState.getPlayer(playerId);
      if (!player) {
        return this._createError('PLAYER_NOT_FOUND', '玩家未找到');
      }

      if (player.position !== null) {
        return this._createError(LIFECYCLE_ERRORS.ALREADY_SEATED, '玩家已经入座');
      }

      // 4. 分配座位（简化：使用玩家在数组中的索引作为座位）
      const seatPosition = gameState.players.findIndex(p => p.id === playerId);
      
      // 5. 应用入座
      player.chips = buyIn;
      player.position = seatPosition;
      player.status = 'ACTIVE';
      player.isDealer = false;
      player.isSmallBlind = false;
      player.isBigBlind = false;

      return { success: true };
    } catch (error) {
      return this._createError('INTERNAL_ERROR', error.message);
    }
  }

  /**
   * 处理离座请求
   * @param {Object} ctx - 上下文 { gameState, playerId }
   * @returns {Object} { success: boolean, error?: Object }
   */
  handleLeaveSeat(ctx) {
    const { gameState, playerId } = ctx;
    
    // 1. 守卫：仅在WAITING状态允许
    const guardResult = this._guardWaitingState(gameState);
    if (!guardResult.success) return guardResult;

    try {
      // 2. 检查玩家状态
      const player = gameState.getPlayer(playerId);
      if (!player || player.position === null) {
        return this._createError(LIFECYCLE_ERRORS.PLAYER_NOT_SEATED, '玩家未入座');
      }

      // 3. 应用离座
      player.position = null;
      player.status = 'SITTING_OUT';
      player.isDealer = false;
      player.isSmallBlind = false;
      player.isBigBlind = false;
      // 保留筹码（现金局规则）

      return { success: true };
    } catch (error) {
      return this._createError('INTERNAL_ERROR', error.message);
    }
  }

  /**
   * 处理离开桌面请求
   * @param {Object} ctx - 上下文 { gameState, playerId }
   * @returns {Object} { success: boolean, error?: Object }
   */
  handleLeaveTable(ctx) {
    const { gameState, playerId } = ctx;
    
    // 1. 守卫：仅在WAITING状态允许
    const guardResult = this._guardWaitingState(gameState);
    if (!guardResult.success) return guardResult;

    try {
      // 2. 检查玩家存在
      const player = gameState.getPlayer(playerId);
      if (!player) {
        return this._createError('PLAYER_NOT_FOUND', '玩家未找到');
      }

      // 3. 记录最终筹码（用于结算日志）
      const finalChips = player.chips;
      
      // 4. 移除玩家
      gameState.removePlayer(playerId);

      return { 
        success: true, 
        finalChips 
      };
    } catch (error) {
      return this._createError('INTERNAL_ERROR', error.message);
    }
  }

  /**
   * 处理增购请求
   * @param {Object} ctx - 上下文 { gameState, tableRules, playerId, amount }
   * @returns {Object} { success: boolean, error?: Object }
   */
  handleAddOn(ctx) {
    const { gameState, tableRules, playerId, amount } = ctx;
    
    // 1. 守卫：仅在WAITING状态允许
    const guardResult = this._guardWaitingState(gameState);
    if (!guardResult.success) return guardResult;

    try {
      // 2. 检查玩家状态
      const player = gameState.getPlayer(playerId);
      if (!player || player.position === null) {
        return this._createError(LIFECYCLE_ERRORS.PLAYER_NOT_SEATED, '只有已入座的玩家可以增购');
      }

      // 3. 验证增购金额
      if (!tableRules.isValidRebuy(amount, player.chips)) {
        return this._createError(LIFECYCLE_ERRORS.ADDON_OVER_MAX, 
          `增购后总金额不能超过 ${tableRules.rebuyMaxAmount}`);
      }

      // 4. 应用增购
      player.chips += amount;

      return { success: true, newTotal: player.chips };
    } catch (error) {
      return this._createError('INTERNAL_ERROR', error.message);
    }
  }

  /**
   * 守卫：检查是否在WAITING状态
   * @param {Object} gameState - 游戏状态
   * @returns {Object} { success: boolean, error?: Object }
   */
  _guardWaitingState(gameState) {
    if (gameState.tableStatus && gameState.tableStatus !== 'WAITING') {
      return this._createError(LIFECYCLE_ERRORS.ONLY_IN_WAITING_STATE, 
        '只能在等待状态下进行此操作');
    }
    
    if (gameState.phase !== 'WAITING') {
      return this._createError(LIFECYCLE_ERRORS.ONLY_IN_WAITING_STATE, 
        '只能在游戏等待阶段进行此操作');
    }
    
    return { success: true };
  }

  /**
   * 创建错误响应
   * @param {string} code - 错误码
   * @param {string} message - 错误信息
   * @returns {Object} 错误响应对象
   */
  _createError(code, message) {
    return {
      success: false,
      error: {
        code,
        message
      }
    };
  }

  /**
   * 获取错误类型常量（用于外部引用）
   * @returns {Object} 错误类型常量
   */
  static get ERRORS() {
    return LIFECYCLE_ERRORS;
  }
}

export default Lifecycle;