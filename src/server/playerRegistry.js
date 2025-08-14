/**
 * PlayerRegistry.js - 玩家注册与连接管理器
 * 
 * 职责：玩家socket映射管理、房主权限管理、阶段2：断线重连支持
 * 严格遵循单文件<200行约束
 */

import { createErrorMessage, ERROR_TYPES } from './protocol.js';

export default class PlayerRegistry {
  constructor() {
    this.playerSocketMap = new Map();      // playerId -> socketId
    this.socketPlayerMap = new Map();      // socketId -> playerId  
    this.activeSockets = new Map();        // socketId -> socket实例
    this.roomHostId = null;                // 房主玩家ID
    this.disconnectedPlayers = new Map();  // 阶段2：断线玩家状态
  }

  registerPlayer(socketId, socket, playerName, buyIn) {
    try {
      const playerId = this._generatePlayerId(playerName);
      
      // 恢复严格唯一昵称策略：同名禁止
      if (this._isPlayerNameTaken(playerName)) {
        return { success: false, error: createErrorMessage(ERROR_TYPES.GAME_FULL, '玩家名称已被使用') };
      }

      if (this.socketPlayerMap.has(socketId)) {
        return { success: false, error: createErrorMessage(ERROR_TYPES.SYSTEM_ERROR, 'Socket已注册') };
      }

      // 建立映射
      this.playerSocketMap.set(playerId, socketId);
      this.socketPlayerMap.set(socketId, playerId);
      this.activeSockets.set(socketId, socket);

      // 设置房主
      if (!this.roomHostId) this.roomHostId = playerId;

      return {
        success: true, playerId, isRoomHost: playerId === this.roomHostId,
        playerData: { id: playerId, name: playerName, chips: buyIn }
      };
    } catch (error) {
      return { success: false, error: createErrorMessage(ERROR_TYPES.SYSTEM_ERROR, `注册失败: ${error.message}`) };
    }
  }

  unregisterPlayer(socketId) {
    const playerId = this.socketPlayerMap.get(socketId);
    if (playerId) {
      this._removePlayerMappings(playerId, socketId);
      this._checkAndTransferHost(playerId);
      return playerId;
    }
    return null;
  }

  // 阶段2新增：根据玩家ID注销玩家
  unregisterPlayerById(playerId) {
    const socketId = this.playerSocketMap.get(playerId);
    this._removePlayerMappings(playerId, socketId);
    this._checkAndTransferHost(playerId);
    return true;
  }

  // 阶段2新增：标记玩家断线（保留映射用于重连）
  markPlayerDisconnected(playerId) {
    const socketId = this.playerSocketMap.get(playerId);
    if (socketId) {
      this.disconnectedPlayers.set(playerId, { disconnectedAt: Date.now(), socketId });
      this.socketPlayerMap.delete(socketId);
      this.activeSockets.delete(socketId);
      // 关键修复：删除 playerId -> socketId 映射，避免被视为在线
      this.playerSocketMap.delete(playerId);
    }
  }

  // 阶段2新增：重连玩家
  reconnectPlayer(playerId, socketId, socket) {
    if (this.disconnectedPlayers.has(playerId)) {
      this.playerSocketMap.set(playerId, socketId);
      this.socketPlayerMap.set(socketId, playerId);
      this.activeSockets.set(socketId, socket);
      this.disconnectedPlayers.delete(playerId);
      return true;
    }
    return false;
  }

  getPlayerBySocket(socketId) {
    return this.socketPlayerMap.get(socketId) || null;
  }

  getSocketByPlayer(playerId) {
    const socketId = this.playerSocketMap.get(playerId);
    return socketId ? this.activeSockets.get(socketId) : null;
  }

  getActivePlayerIds() {
    return Array.from(this.playerSocketMap.keys());
  }

  getConnectionCount() {
    return this.activeSockets.size;
  }

  sendToPlayer(playerId, message) {
    const socket = this.getSocketByPlayer(playerId);
    if (socket) {
      try {
        socket.emit('message', message);
        return true;
      } catch (error) {
        console.error(`发送消息给玩家 ${playerId} 失败:`, error);
        return false;
      }
    }
    return false;
  }

  broadcastToAll(message, excludePlayerIds = []) {
    let successCount = 0;
    this.playerSocketMap.forEach((socketId, playerId) => {
      if (!excludePlayerIds.includes(playerId) && this.sendToPlayer(playerId, message)) {
        successCount++;
      }
    });
    return successCount;
  }

  // 状态检查方法
  isPlayerOnline(playerId) { return this.playerSocketMap.has(playerId); }
  isPlayerDisconnected(playerId) { return this.disconnectedPlayers.has(playerId); }
  isRoomHost(playerId) { return this.roomHostId === playerId; }
  getRoomHostId() { return this.roomHostId; }
  getDisconnectedPlayerIds() { return Array.from(this.disconnectedPlayers.keys()); }

  clear() {
    this.playerSocketMap.clear();
    this.socketPlayerMap.clear();
    this.activeSockets.clear();
    this.disconnectedPlayers.clear();
    this.roomHostId = null;
  }

  // 私有辅助方法
  _removePlayerMappings(playerId, socketId) {
    if (playerId) this.playerSocketMap.delete(playerId);
    if (socketId) {
      this.socketPlayerMap.delete(socketId);
      this.activeSockets.delete(socketId);
    }
    this.disconnectedPlayers.delete(playerId);
  }

  _checkAndTransferHost(playerId) {
    if (playerId === this.roomHostId) {
      const activePlayerIds = this.getActivePlayerIds();
      this.roomHostId = activePlayerIds.length > 0 ? activePlayerIds[0] : null;
    }
  }

  _generatePlayerId(playerName) {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `${playerName}_${timestamp}_${randomStr}`;
  }

  _isPlayerNameTaken(playerName) {
    return Array.from(this.playerSocketMap.keys())
      .some(playerId => playerId.startsWith(`${playerName}_`));
  }
}