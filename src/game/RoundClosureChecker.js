/**
 * RoundClosureChecker.js - 回合闭合判定辅助类
 * 职责：回合闭合逻辑判定
 * 依赖：GameState, TurnOrderCalculator
 */

import TurnOrderCalculator from './TurnOrderCalculator.js';

class RoundClosureChecker {
  /**
   * 判断当前回合是否已闭合（基于精确状态模型）
   * @param {GameState} gameState 游戏状态
   * @returns {boolean}
   */
  static isRoundClosed(gameState) {
    const actionablePlayers = TurnOrderCalculator.getActionablePlayers(gameState);
    
    // 如果只有≤1个玩家可行动，回合闭合
    if (actionablePlayers.length <= 1) {
      return true;
    }

    // 如果没有需要跟注的金额，且所有人都行动过，回合闭合
    if (gameState.amountToCall === 0) {
      return this._allPlayersActed(gameState, actionablePlayers);
    }

    // 如果有需要跟注的金额
    if (gameState.amountToCall > 0) {
      // 检查是否所有可行动玩家都已匹配到当前注额
      const allMatched = actionablePlayers.every(playerId => {
        const player = gameState.getPlayer(playerId);
        return player && player.currentBet === gameState.amountToCall;
      });

      // 如果所有人都匹配了注额，且行动轮已回到最后进攻者，回合闭合
      if (allMatched && gameState.lastAggressorId) {
        // 检查行动是否回到了最后进攻者
        return this._hasActionReturnedToAggressor(gameState, actionablePlayers);
      }

      return allMatched && this._allPlayersActed(gameState, actionablePlayers);
    }

    return false;
  }

  /**
   * 检查所有玩家是否都已行动过
   * @private
   * @param {GameState} gameState 
   * @param {string[]} actionablePlayers 可行动玩家列表
   * @returns {boolean}
   */
  static _allPlayersActed(gameState, actionablePlayers) {
    // 简化版本：检查是否所有可行动玩家都有过行动记录
    return gameState.actionHistory.length >= actionablePlayers.length;
  }

  /**
   * 检查行动是否已回到最后进攻者
   * @private
   * @param {GameState} gameState 
   * @param {string[]} actionablePlayers 可行动玩家列表
   * @returns {boolean}
   */
  static _hasActionReturnedToAggressor(gameState, actionablePlayers) {
    if (!gameState.lastAggressorId) {
      return true;
    }

    // 如果最后进攻者不在可行动玩家中（比如已all-in），则认为已回到
    if (!actionablePlayers.includes(gameState.lastAggressorId)) {
      return true;
    }

    // 检查当前是否轮到最后进攻者
    return gameState.currentTurn === gameState.lastAggressorId;
  }
}

export default RoundClosureChecker;