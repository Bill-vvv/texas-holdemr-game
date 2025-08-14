/**
 * TurnOrderCalculator.js - 行动顺序计算辅助类
 * 职责：计算玩家行动顺序、下一个行动者
 * 依赖：GameState
 */

class TurnOrderCalculator {
  /**
   * 获取可行动的玩家列表（未弃牌且未all-in）
   * @param {GameState} gameState 
   * @returns {string[]} 玩家ID列表
   */
  static getActionablePlayers(gameState) {
    return gameState.players
      .filter(p => p.status === 'ACTIVE')
      .map(p => p.id);
  }

  /**
   * 获取指定玩家之后的下一个可行动玩家
   * @param {GameState} gameState 
   * @param {string|null} currentPlayerId 当前玩家ID
   * @returns {string|null}
   */
  static getNextActorAfter(gameState, currentPlayerId) {
    const actionablePlayers = this.getActionablePlayers(gameState);
    if (actionablePlayers.length === 0) {
      return null;
    }

    if (!currentPlayerId) {
      return actionablePlayers[0];
    }

    // 按座位顺序找到下一个可行动玩家
    const allPlayers = gameState.players.sort((a, b) => a.position - b.position);
    const currentPlayerIndex = allPlayers.findIndex(p => p.id === currentPlayerId);
    
    if (currentPlayerIndex === -1) {
      return actionablePlayers[0];
    }

    // 从当前玩家的下一个位置开始循环查找
    for (let i = 1; i < allPlayers.length; i++) {
      const nextIndex = (currentPlayerIndex + i) % allPlayers.length;
      const nextPlayer = allPlayers[nextIndex];
      
      if (actionablePlayers.includes(nextPlayer.id)) {
        return nextPlayer.id;
      }
    }

    return null;
  }

  /**
   * 获取UTG玩家（大盲左侧第一位）
   * @param {GameState} gameState 
   * @returns {string|null}
   */
  static getUTGPlayer(gameState) {
    const bigBlindPlayer = gameState.players.find(p => p.isBigBlind);
    if (!bigBlindPlayer) {
      return this.getFirstPlayerAfterButton(gameState);
    }

    return this.getNextActorAfter(gameState, bigBlindPlayer.id);
  }

  /**
   * 获取按钮位之后的第一个可行动玩家
   * @param {GameState} gameState 
   * @returns {string|null}
   */
  static getFirstPlayerAfterButton(gameState) {
    if (gameState.players.length === 0) {
      return null;
    }

    const buttonPlayer = gameState.players.find(p => p.isDealer);
    if (!buttonPlayer) {
      const actionablePlayers = this.getActionablePlayers(gameState);
      return actionablePlayers.length > 0 ? actionablePlayers[0] : null;
    }

    return this.getNextActorAfter(gameState, buttonPlayer.id);
  }
}

export default TurnOrderCalculator;