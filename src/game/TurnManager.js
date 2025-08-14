/**
 * TurnManager.js - 德州扑克行动顺序和回合管理
 * 职责：确定当前行动玩家、判断回合闭合、街道推进
 * 依赖：GameState, TurnOrderCalculator, RoundClosureChecker
 */

import TurnOrderCalculator from './TurnOrderCalculator.js';
import RoundClosureChecker from './RoundClosureChecker.js';

class TurnManager {
  /**
   * 获取当前应该行动的玩家ID
   * @param {GameState} gameState 游戏状态
   * @returns {string|null} 玩家ID，无人行动时返回null
   */
  static getCurrentActor(gameState) {
    const activePlayers = TurnOrderCalculator.getActionablePlayers(gameState);
    if (activePlayers.length === 0) {
      return null;
    }

    // 如果当前轮转的玩家仍可行动，继续
    if (gameState.currentTurn && activePlayers.includes(gameState.currentTurn)) {
      return gameState.currentTurn;
    }

    // 否则找到下一个可行动的玩家
    return TurnOrderCalculator.getNextActorAfter(gameState, gameState.currentTurn);
  }

  /**
   * 推进到下一个行动者
   * @param {GameState} gameState 游戏状态
   */
  static advanceToNextActor(gameState) {
    const nextActor = TurnOrderCalculator.getNextActorAfter(gameState, gameState.currentTurn);
    gameState.currentTurn = nextActor;
  }

  /**
   * 判断当前回合是否已闭合（基于精确状态模型）
   * @param {GameState} gameState 游戏状态
   * @returns {boolean}
   */
  static isRoundClosed(gameState) {
    return RoundClosureChecker.isRoundClosed(gameState);
  }

  /**
   * 推进到下一街道
   * @param {GameState} gameState 游戏状态
   */
  static advanceStreet(gameState) {
    const streetOrder = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];
    const currentIndex = streetOrder.indexOf(gameState.street);
    
    if (currentIndex >= 0 && currentIndex < streetOrder.length - 1) {
      gameState.street = streetOrder[currentIndex + 1];
      
      // 重置回合状态
      this._resetRoundState(gameState);
      
      // 设置新街道的第一个行动者
      this._setFirstActorForStreet(gameState);
    }
  }

  /**
   * 检查游戏是否应该结束（只剩一人或到达摊牌）
   * @param {GameState} gameState 游戏状态
   * @returns {boolean}
   */
  static shouldEndGame(gameState) {
    const nonFoldedPlayers = gameState.players.filter(p => p.status !== 'FOLDED');
    return nonFoldedPlayers.length <= 1 || gameState.street === 'SHOWDOWN';
  }

  /**
   * 重置回合状态（进入新街道时）
   * @private
   * @param {GameState} gameState 
   */
  static _resetRoundState(gameState) {
    gameState.amountToCall = 0;
    gameState.lastAggressorId = null;
    gameState.isActionReopened = true;
    gameState.actionHistory = [];
    
    // 重置所有玩家的本街下注额
    gameState.players.forEach(player => {
      player.currentBet = 0;
    });
    
    // 重新计算可行动玩家数
    gameState.updateActivePlayers();
  }

  /**
   * 设置新街道的第一个行动者
   * @private
   * @param {GameState} gameState 
   */
  static _setFirstActorForStreet(gameState) {
    if (gameState.street === 'PRE_FLOP') {
      gameState.currentTurn = TurnOrderCalculator.getUTGPlayer(gameState);
    } else {
      gameState.currentTurn = TurnOrderCalculator.getFirstPlayerAfterButton(gameState);
    }
  }
}

export default TurnManager;