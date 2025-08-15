/**
 * ActionValidator - 动作合法性校验器
 * 
 * 负责验证德州扑克所有动作的合法性：
 * - check: 无人下注时过牌
 * - bet: 无人下注时主动下注
 * - call: 跟注到当前最高注额
 * - raise: 加注到更高金额
 * - fold: 弃牌
 * - all-in: 全押（可能是非完整加注）
 * 
 * 严格遵循德州扑克无限注现金局规则
 */

export default class ActionValidator {
  /**
   * 验证玩家动作是否合法
   * @param {Object} action - 动作对象 {type, playerId, amount?}
   * @param {Object} gameState - 游戏状态
   * @param {Object} tableRules - 桌面规则
   * @returns {Object|null} - 错误信息对象或null(合法)
   */
  static validate(action, gameState, tableRules) {
    // 基本参数验证
    const basicError = this._validateBasicParams(action, gameState);
    if (basicError) return basicError;

    const { type, playerId, amount } = action;
    const player = gameState.getPlayer(playerId);

    // 轮转验证 - 是否轮到该玩家
    if (gameState.currentTurn !== playerId) {
      return { 
        error: 'NOT_YOUR_TURN', 
        message: '不是您的行动轮次' 
      };
    }

    // 玩家状态验证 - 只有ACTIVE状态才能行动
    if (player.status !== 'ACTIVE') {
      return { 
        error: 'INVALID_PLAYER_STATUS', 
        message: '当前状态不允许行动' 
      };
    }

    // 根据动作类型进行具体验证
    switch (type) {
      case 'check':
        return this._validateCheck(gameState, player);
      
      case 'bet':
        return this._validateBet(amount, gameState, player, tableRules);
      
      case 'call':
        return this._validateCall(gameState, player);
      
      case 'raise':
        return this._validateRaise(amount, gameState, player, tableRules);
      
      case 'fold':
        return null; // 弃牌总是合法的
      
      case 'all-in':
        return this._validateAllIn(gameState, player);
      
      default:
        return { 
          error: 'INVALID_ACTION_TYPE', 
          message: '无效的动作类型' 
        };
    }
  }

  /**
   * 基本参数验证
   */
  static _validateBasicParams(action, gameState) {
    if (!action || !action.type || !action.playerId) {
      return { 
        error: 'INVALID_ACTION_FORMAT', 
        message: '动作格式无效' 
      };
    }

    const player = gameState.getPlayer(action.playerId);
    if (!player) {
      return { 
        error: 'PLAYER_NOT_FOUND', 
        message: '玩家不存在' 
      };
    }

    return null;
  }

  /**
   * 验证check动作
   */
  static _validateCheck(gameState, player) {
    // check只能在无人下注或玩家已跟到最高注时使用
    const amountToCall = this._calculateAmountToCall(gameState, player);
    
    if (amountToCall > 0) {
      return { 
        error: 'CANNOT_CHECK', 
        message: `需要跟注${amountToCall}，不能过牌` 
      };
    }

    return null;
  }

  /**
   * 验证bet动作
   */
  static _validateBet(amount, gameState, player, tableRules) {
    // 只能在无人下注时bet
    if (gameState.amountToCall > 0) {
      return { 
        error: 'CANNOT_BET', 
        message: '已有下注，不能bet，请使用call或raise' 
      };
    }

    // 金额验证
    const amountError = this._validateBetAmount(amount, player, tableRules);
    if (amountError) return amountError;

    return null;
  }

  /**
   * 验证call动作
   */
  static _validateCall(gameState, player) {
    const amountToCall = this._calculateAmountToCall(gameState, player);
    
    if (amountToCall === 0) {
      return { 
        error: 'CANNOT_CALL', 
        message: '无需跟注，请使用check' 
      };
    }

    // call总是合法的，即使筹码不足也会自动all-in
    return null;
  }

  /**
   * 验证raise动作
   */
  static _validateRaise(amount, gameState, player, tableRules) {
    const amountToCall = this._calculateAmountToCall(gameState, player);
    
    if (gameState.amountToCall === 0) {
      return { 
        error: 'CANNOT_RAISE', 
        message: '无人下注，请使用bet' 
      };
    }

    // 检查是否允许再次加注（非完整加注后不能再raise）
    if (!gameState.isActionReopened) {
      return { 
        error: 'ACTION_NOT_REOPENED', 
        message: '非完整加注后不允许再次加注' 
      };
    }

    // 验证加注金额
    const raiseError = this._validateRaiseAmount(amount, gameState, player, tableRules);
    if (raiseError) return raiseError;

    return null;
  }

  /**
   * 验证all-in动作
   */
  static _validateAllIn(gameState, player) {
    if (player.chips === 0) {
      return { 
        error: 'NO_CHIPS_TO_ALLIN', 
        message: '没有筹码可以all-in' 
      };
    }

    // all-in总是合法的，金额就是剩余所有筹码
    return null;
  }

  /**
   * 验证下注金额
   */
  static _validateBetAmount(amount, player, tableRules) {
    if (!amount || amount <= 0) {
      return { 
        error: 'INVALID_BET_AMOUNT', 
        message: '下注金额必须大于0' 
      };
    }

    if (amount > player.chips) {
      return { 
        error: 'INSUFFICIENT_CHIPS', 
        message: '筹码不足' 
      };
    }

    // 检查最小下注额（通常是1BB）
    if (amount < tableRules.bigBlind) {
      return { 
        error: 'BET_TOO_SMALL', 
        message: `最小下注金额为${tableRules.bigBlind}` 
      };
    }

    return null;
  }

  /**
   * 验证加注金额
   */
  static _validateRaiseAmount(amount, gameState, player, tableRules) {
    if (!amount || amount <= 0) {
      return { 
        error: 'INVALID_RAISE_AMOUNT', 
        message: '加注金额必须大于0' 
      };
    }

    const amountToCall = this._calculateAmountToCall(gameState, player);
    
    if (amount <= amountToCall) {
      return { 
        error: 'RAISE_TOO_SMALL', 
        message: `加注金额必须大于跟注金额${amountToCall}` 
      };
    }

    if (amount > player.chips) {
      return { 
        error: 'INSUFFICIENT_CHIPS', 
        message: '筹码不足，请使用all-in' 
      };
    }

    // 计算最小加注金额
    const minRaise = this._calculateMinRaise(gameState, tableRules);
    if (amount < amountToCall + minRaise && amount < player.chips) {
      return { 
        error: 'RAISE_TOO_SMALL', 
        message: `最小加注至${amountToCall + minRaise}` 
      };
    }

    return null;
  }

  /**
   * 计算玩家需要跟注的金额
   */
  static _calculateAmountToCall(gameState, player) {
    return Math.max(0, gameState.amountToCall - player.currentBet);
  }

  /**
   * 计算最小加注金额
   */
  static _calculateMinRaise(gameState, tableRules) {
    // 最小加注 = 上一次加注的增量，或者大盲注
    return Math.max(tableRules.bigBlind, tableRules.minRaise);
  }
}