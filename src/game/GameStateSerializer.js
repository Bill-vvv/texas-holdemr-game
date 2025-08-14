/**
 * GameStateSerializer.js - 游戏状态序列化工具
 * 职责：GameState的序列化和反序列化
 * 依赖：无
 */

class GameStateSerializer {
  /**
   * 序列化游戏状态
   * @param {GameState} gameState 游戏状态实例
   * @returns {Object} 序列化后的数据
   */
  static serialize(gameState) {
    return {
      gameId: gameState.gameId,
      street: gameState.street,
      phase: gameState.phase,
      players: gameState.players,
      buttonIndex: gameState.buttonIndex,
      activePlayers: gameState.activePlayers,
      communityCards: gameState.communityCards,
      pots: gameState.pots,
      totalPot: gameState.totalPot,
      currentTurn: gameState.currentTurn,
      amountToCall: gameState.amountToCall,
      lastAggressorId: gameState.lastAggressorId,
      activePlayersCount: gameState.activePlayersCount,
      isActionReopened: gameState.isActionReopened,
      actionHistory: gameState.actionHistory,
      handNumber: gameState.handNumber
    };
  }

  /**
   * 反序列化到游戏状态
   * @param {GameState} gameState 目标游戏状态实例
   * @param {Object} data 序列化的数据
   */
  static deserialize(gameState, data) {
    Object.assign(gameState, data);
  }

  /**
   * 创建游戏状态快照（深拷贝）
   * @param {GameState} gameState 
   * @returns {Object}
   */
  static createSnapshot(gameState) {
    const serialized = this.serialize(gameState);
    return JSON.parse(JSON.stringify(serialized));
  }

  /**
   * 从快照恢复游戏状态
   * @param {GameState} gameState 
   * @param {Object} snapshot 
   */
  static restoreFromSnapshot(gameState, snapshot) {
    this.deserialize(gameState, snapshot);
  }
}

export default GameStateSerializer;