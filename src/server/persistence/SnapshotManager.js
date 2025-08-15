/**
 * SnapshotManager.js - 阶段三快照管理器
 * 职责：在手局开始时保存会话快照，作为恢复的检查点
 * 依赖：Storage、GameStateSerializer
 * 特点：仅在HAND_STARTED后触发，公共信息快照，<200行
 */

import GameStateSerializer from '../../game/GameStateSerializer.js';

class SnapshotManager {
  /**
   * 构造函数
   * @param {Storage} storage 存储实例
   */
  constructor(storage) {
    this.storage = storage;
    this.enabled = process.env.PERSIST_ENABLED === 'true';
  }

  /**
   * 检查快照功能是否启用
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 保存手局开始快照
   * 仅在手局开始后调用，作为该手的检查点
   * @param {string} sessionId 会话ID
   * @param {GameState} gameState 游戏状态（只读访问）
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveHandStartSnapshot(sessionId, gameState) {
    if (!this.enabled) {
      return false;
    }

    try {
      // 验证输入
      if (!sessionId || !gameState) {
        throw new Error('SnapshotManager: sessionId and gameState are required');
      }

      // 创建会话快照
      const snapshot = GameStateSerializer.createSessionSnapshot(gameState);
      
      // 添加快照类型标识
      snapshot.meta.type = 'hand_start';
      snapshot.meta.handNumber = gameState.handNumber;

      // 保存到存储
      await this.storage.saveSnapshot(sessionId, snapshot);
      
      console.log(`[SnapshotManager] 手局 ${gameState.handNumber} 快照已保存`);
      return true;

    } catch (error) {
      console.error('[SnapshotManager] 保存快照失败:', error.message);
      return false;
    }
  }

  /**
   * 读取最新的会话快照
   * @param {string} sessionId 会话ID
   * @returns {Promise<Object|null>} 快照数据或null
   */
  async readSnapshot(sessionId) {
    if (!this.enabled) {
      return null;
    }

    try {
      if (!sessionId) {
        throw new Error('SnapshotManager: sessionId is required');
      }

      const snapshot = await this.storage.readSnapshot(sessionId);
      
      if (snapshot) {
        // 验证快照格式
        if (!this._validateSnapshotFormat(snapshot)) {
          console.warn(`[SnapshotManager] 会话 ${sessionId} 快照格式无效`);
          return null;
        }
        
        console.log(`[SnapshotManager] 成功读取会话 ${sessionId} 快照`);
      }
      
      return snapshot;

    } catch (error) {
      console.error('[SnapshotManager] 读取快照失败:', error.message);
      return null;
    }
  }

  /**
   * 恢复游戏状态从快照
   * @param {GameState} gameState 目标游戏状态实例
   * @param {Object} snapshot 快照数据
   * @returns {boolean} 是否恢复成功
   */
  restoreFromSnapshot(gameState, snapshot) {
    if (!this.enabled || !snapshot) {
      return false;
    }

    try {
      // 验证快照格式
      if (!this._validateSnapshotFormat(snapshot)) {
        throw new Error('Invalid snapshot format');
      }

      // 使用GameStateSerializer恢复状态
      GameStateSerializer.restoreFromSessionSnapshot(gameState, snapshot);
      
      console.log(`[SnapshotManager] 游戏状态已从快照恢复 (手局 ${snapshot.meta.handNumber})`);
      return true;

    } catch (error) {
      console.error('[SnapshotManager] 从快照恢复失败:', error.message);
      return false;
    }
  }

  /**
   * 获取快照元信息
   * @param {string} sessionId 会话ID
   * @returns {Promise<Object|null>} 快照元信息
   */
  async getSnapshotMetadata(sessionId) {
    try {
      const snapshot = await this.readSnapshot(sessionId);
      return snapshot ? {
        version: snapshot.meta.version,
        savedAt: snapshot.meta.savedAt,
        type: snapshot.meta.type,
        handNumber: snapshot.meta.handNumber,
        sessionId: snapshot.session?.id,
        handsPlayed: snapshot.session?.handsPlayed
      } : null;

    } catch (error) {
      console.error('[SnapshotManager] 获取快照元信息失败:', error.message);
      return null;
    }
  }

  /**
   * 检查快照是否存在
   * @param {string} sessionId 会话ID
   * @returns {Promise<boolean>}
   */
  async snapshotExists(sessionId) {
    try {
      const snapshot = await this.readSnapshot(sessionId);
      return snapshot !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * 验证快照格式
   * @param {Object} snapshot 快照数据
   * @returns {boolean}
   * @private
   */
  _validateSnapshotFormat(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return false;
    }

    // 检查必需的元信息
    if (!snapshot.meta || 
        typeof snapshot.meta.version !== 'number' ||
        typeof snapshot.meta.savedAt !== 'number') {
      return false;
    }

    // 检查游戏状态
    if (!snapshot.gameState || typeof snapshot.gameState !== 'object') {
      return false;
    }

    // 检查基本游戏字段
    const gameState = snapshot.gameState;
    if (typeof gameState.handNumber !== 'number' ||
        typeof gameState.street !== 'string' ||
        typeof gameState.phase !== 'string' ||
        !Array.isArray(gameState.players)) {
      return false;
    }

    // 验证玩家信息不包含私有数据
    for (const player of gameState.players) {
      if (player.holeCards !== undefined) {
        console.warn('[SnapshotManager] 警告：快照包含私有手牌信息');
        return false;
      }
    }

    return true;
  }

  /**
   * 清理过期快照（可选功能）
   * @param {number} maxAge 最大保留时间（毫秒）
   * @returns {Promise<number>} 清理的快照数量
   */
  async cleanupExpiredSnapshots(maxAge = 7 * 24 * 60 * 60 * 1000) { // 默认7天
    if (!this.enabled) {
      return 0;
    }

    try {
      // 这需要Storage接口支持列表功能
      // 当前版本简化实现，仅返回0
      console.log('[SnapshotManager] 快照清理功能待实现');
      return 0;

    } catch (error) {
      console.error('[SnapshotManager] 清理快照失败:', error.message);
      return 0;
    }
  }
}

export default SnapshotManager;