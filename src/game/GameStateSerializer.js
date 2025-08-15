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
      tableStatus: gameState.tableStatus,
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
      handNumber: gameState.handNumber,
      lastShowdownSummary: gameState.lastShowdownSummary,
      session: gameState.session
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

  /**
   * 阶段三新增：创建公共快照（剔除私有信息）
   * 用于持久化存储，不包含未揭示的底牌等私密信息
   * @param {GameState} gameState 游戏状态实例
   * @returns {Object} 公共快照数据
   */
  static serializePublic(gameState) {
    const serialized = this.serialize(gameState);
    
    // 深拷贝并剔除私有信息
    const publicData = JSON.parse(JSON.stringify(serialized));
    
    // 剔除未揭示的底牌
    if (publicData.players) {
      publicData.players.forEach(player => {
        // 保留玩家公开信息，但移除手牌（私密信息）
        if (player.holeCards) {
          delete player.holeCards;
        }
      });
    }
    
    return publicData;
  }

  /**
   * 阶段三新增：创建完整的会话快照
   * 包含元信息、会话摘要和公共游戏状态
   * @param {GameState} gameState 游戏状态实例
   * @returns {Object} 完整快照数据
   */
  static createSessionSnapshot(gameState) {
    return {
      meta: {
        version: 1,
        savedAt: Date.now()
      },
      session: gameState.session ? {
        id: gameState.session.id,
        startedAt: gameState.session.startedAt,
        handsPlayed: gameState.session.handsPlayed
      } : null,
      gameState: this.serializePublic(gameState)
    };
  }

  /**
   * 阶段三新增：从会话快照恢复游戏状态
   * @param {GameState} gameState 目标游戏状态实例
   * @param {Object} sessionSnapshot 会话快照数据
   */
  static restoreFromSessionSnapshot(gameState, sessionSnapshot) {
    if (!sessionSnapshot || !sessionSnapshot.gameState) {
      throw new Error('Invalid session snapshot format');
    }
    
    // 恢复游戏状态
    this.deserialize(gameState, sessionSnapshot.gameState);
    
    // 恢复会话信息
    if (sessionSnapshot.session) {
      gameState.session = { ...sessionSnapshot.session };
    }
  }
}

export default GameStateSerializer;