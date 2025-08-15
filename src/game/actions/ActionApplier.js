/**
 * ActionApplier - 动作状态应用器
 * 
 * 负责将验证过的动作安全地应用到游戏状态：
 * - 纯函数式设计，无副作用
 * - 只负责状态变更，不包含业务逻辑
 * - 不进行验证（假设动作已通过ActionValidator）
 * - 不处理流程推进（由Game聚合根负责）
 * 
 * 遵循计划文档12.2的职责界定原则
 */

export default class ActionApplier {
  /**
   * 应用玩家动作到游戏状态
   * @param {Object} action - 动作对象 {type, playerId, amount?}
   * @param {Object} gameState - 游戏状态（会被直接修改）
   * @param {Object} tableRules - 桌面规则
   * @returns {Object} gameState - 修改后的游戏状态
   */
  static apply(action, gameState, tableRules) {
    const { type, playerId, amount } = action;
    const player = gameState.getPlayer(playerId);

    // 记录动作历史
    this._recordAction(gameState, action);

    // 根据动作类型应用相应变更
    switch (type) {
      case 'check':
        this._applyCheck(gameState, player);
        break;
      
      case 'bet':
        this._applyBet(gameState, player, amount, tableRules);
        break;
      
      case 'call':
        this._applyCall(gameState, player);
        break;
      
      case 'raise':
        this._applyRaise(gameState, player, amount, tableRules);
        break;
      
      case 'fold':
        this._applyFold(gameState, player);
        break;
      
      case 'all-in':
        this._applyAllIn(gameState, player, tableRules);
        break;
    }

    return gameState;
  }

  /**
   * 记录动作到历史中
   */
  static _recordAction(gameState, action) {
    if (!gameState.actionHistory) {
      gameState.actionHistory = [];
    }
    
    gameState.actionHistory.push({
      ...action,
      timestamp: Date.now(),
      street: gameState.street
    });
  }

  /**
   * 应用check动作
   */
  static _applyCheck(gameState, player) {
    // check不改变下注状态，只是跳过行动
    // 实际的玩家推进由Game聚合根负责
  }

  /**
   * 应用bet动作
   */
  static _applyBet(gameState, player, amount, tableRules) {
    // 扣除筹码并更新下注
    player.chips -= amount;
    player.currentBet += amount;
    player.totalBet += amount;

    // 更新游戏状态
    gameState.amountToCall = Math.max(gameState.amountToCall, player.currentBet);
    gameState.lastAggressorId = player.id;
    gameState.isActionReopened = true;
    
    // 更新最小加注额为当前下注额
    this._updateMinRaise(gameState, amount, tableRules);
  }

  /**
   * 应用call动作
   */
  static _applyCall(gameState, player) {
    const amountToCall = this._calculateAmountToCall(gameState, player);
    const actualCall = Math.min(amountToCall, player.chips);

    // 扣除筹码并更新下注
    player.chips -= actualCall;
    player.currentBet += actualCall;
    player.totalBet += actualCall;

    // 如果筹码不足完全跟注，设置为all-in
    if (actualCall < amountToCall) {
      player.status = 'ALL_IN';
      this._updateActivePlayersCount(gameState);
      
      // 非完整跟注不重开行动（如果实际跟注少于需要的金额）
      if (actualCall < amountToCall) {
        gameState.isActionReopened = false;
      }
    }
  }

  /**
   * 应用raise动作
   */
  static _applyRaise(gameState, player, amount, tableRules) {
    const currentBet = player.currentBet;
    const raiseAmount = amount - currentBet;

    // 扣除筹码并更新下注
    player.chips -= raiseAmount;
    player.currentBet = amount;
    player.totalBet += raiseAmount;

    // 更新游戏状态
    gameState.amountToCall = amount;
    gameState.lastAggressorId = player.id;
    gameState.isActionReopened = true;
    
    // 更新最小加注额
    this._updateMinRaise(gameState, raiseAmount, tableRules);
  }

  /**
   * 应用fold动作
   */
  static _applyFold(gameState, player) {
    player.status = 'FOLDED';
    player.holeCards = []; // 清除手牌保护隐私
    
    // 更新活跃玩家计数
    this._updateActivePlayersCount(gameState);
  }

  /**
   * 应用all-in动作
   */
  static _applyAllIn(gameState, player, tableRules) {
    const allInAmount = player.chips;
    const previousBet = player.currentBet;
    const raiseAmount = allInAmount;

    // 全押所有筹码
    player.chips = 0;
    player.currentBet += allInAmount;
    player.totalBet += allInAmount;
    player.status = 'ALL_IN';

    // 更新游戏状态
    const newTotalBet = player.currentBet;
    if (newTotalBet > gameState.amountToCall) {
      // 这是一次加注
      const actualRaise = newTotalBet - gameState.amountToCall;
      gameState.amountToCall = newTotalBet;
      gameState.lastAggressorId = player.id;
      
      // 检查是否为完整加注
      const minRaise = this._getMinRaise(gameState, tableRules);
      if (actualRaise >= minRaise) {
        gameState.isActionReopened = true;
        this._updateMinRaise(gameState, actualRaise, tableRules);
      } else {
        // 非完整加注，不重开行动
        gameState.isActionReopened = false;
      }
    }

    // 更新活跃玩家计数
    this._updateActivePlayersCount(gameState);
  }

  /**
   * 计算玩家需要跟注的金额
   */
  static _calculateAmountToCall(gameState, player) {
    return Math.max(0, gameState.amountToCall - player.currentBet);
  }

  /**
   * 获取最小跟注金额
   */
  static _getMinCallAmount(gameState, tableRules) {
    // 最小跟注不依赖minRaise，直接由amountToCall决定；此处保留与大盲的下限一致性
    const dynamicMinRaise = gameState.minRaiseAmount || 0;
    return Math.max(tableRules.bigBlind, dynamicMinRaise);
  }

  /**
   * 获取最小加注金额
   */
  static _getMinRaise(gameState, tableRules) {
    // 动态最小加注来自游戏状态，规则对象保持只读
    const dynamicMinRaise = gameState.minRaiseAmount || 0;
    return Math.max(tableRules.bigBlind, dynamicMinRaise);
  }

  /**
   * 更新最小加注额
   */
  static _updateMinRaise(gameState, raiseAmount, tableRules) {
    // 最小加注额为本次加注额或当前动态最小加注额的较大值（写入gameState，不修改规则）
    const current = gameState.minRaiseAmount || 0;
    gameState.minRaiseAmount = Math.max(raiseAmount, current);
  }

  /**
   * 更新活跃玩家计数
   */
  static _updateActivePlayersCount(gameState) {
    const activePlayers = gameState.players.filter(
      player => player.status === 'ACTIVE'
    );
    gameState.activePlayersCount = activePlayers.length;
  }

  /**
   * 重置街道状态（由Game聚合根调用）
   */
  static resetStreetState(gameState, tableRules) {
    // 重置回合状态
    gameState.amountToCall = 0;
    gameState.lastAggressorId = null;
    gameState.isActionReopened = true;
    // 新一街开始时，动态最小加注回到基础大盲（No-Limit规则）
    if (tableRules && typeof tableRules.bigBlind === 'number') {
      gameState.minRaiseAmount = tableRules.bigBlind;
    } else {
      gameState.minRaiseAmount = 0;
    }
    
    // 清空动作历史（保留当前街道）
    if (gameState.actionHistory) {
      gameState.actionHistory = gameState.actionHistory.filter(
        action => action.street === gameState.street
      );
    }
    
    // 重置玩家本街下注
    gameState.players.forEach(player => {
      player.currentBet = 0;
    });

    // 更新活跃玩家计数
    this._updateActivePlayersCount(gameState);
  }
}