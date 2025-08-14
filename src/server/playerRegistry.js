/**
 * 玩家注册管理器
 * 负责管理玩家与socket的映射、座位分配和筹码初始化
 */

import { createErrorMessage, ERROR_TYPES } from './protocol.js';

export default class PlayerRegistry {
  constructor() {
    // playerId -> socketId 映射
    this.playerSocketMap = new Map();
    // socketId -> playerId 映射  
    this.socketPlayerMap = new Map();
    // 连接的socket实例映射
    this.activeSockets = new Map();
    // 房主玩家ID
    this.roomHostId = null;
  }

  /**
   * 注册新玩家连接
   * @param {string} socketId - Socket连接ID
   * @param {Object} socket - Socket实例
   * @param {string} playerName - 玩家名称
   * @param {number} buyIn - 买入筹码
   * @returns {Object} 注册结果
   */
  registerPlayer(socketId, socket, playerName, buyIn) {
    try {
      // 生成唯一玩家ID
      const playerId = this._generatePlayerId(playerName);
      
      // 检查是否已存在相同名称的玩家
      if (this._isPlayerNameTaken(playerName)) {
        return {
          success: false,
          error: createErrorMessage(ERROR_TYPES.GAME_FULL, '玩家名称已被使用')
        };
      }

      // 检查socket是否已注册
      if (this.socketPlayerMap.has(socketId)) {
        return {
          success: false,
          error: createErrorMessage(ERROR_TYPES.SYSTEM_ERROR, 'Socket已注册')
        };
      }

      // 建立双向映射
      this.playerSocketMap.set(playerId, socketId);
      this.socketPlayerMap.set(socketId, playerId);
      this.activeSockets.set(socketId, socket);

      // 如果是第一个玩家，设为房主
      if (!this.roomHostId) {
        this.roomHostId = playerId;
      }

      return {
        success: true,
        playerId,
        isRoomHost: playerId === this.roomHostId,
        playerData: {
          id: playerId,
          name: playerName,
          chips: buyIn
        }
      };
    } catch (error) {
      return {
        success: false,
        error: createErrorMessage(ERROR_TYPES.SYSTEM_ERROR, `注册失败: ${error.message}`)
      };
    }
  }

  /**
   * 注销玩家连接
   * @param {string} socketId - Socket连接ID
   * @returns {string|null} 被注销的玩家ID
   */
  unregisterPlayer(socketId) {
    const playerId = this.socketPlayerMap.get(socketId);
    
    if (playerId) {
      this.playerSocketMap.delete(playerId);
      this.socketPlayerMap.delete(socketId);
      this.activeSockets.delete(socketId);
      
      // 如果离开的是房主，转移房主权限
      if (playerId === this.roomHostId) {
        this._transferRoomHost();
      }
      
      return playerId;
    }
    
    return null;
  }

  /**
   * 通过socketId获取玩家ID
   * @param {string} socketId - Socket连接ID
   * @returns {string|null} 玩家ID
   */
  getPlayerBySocket(socketId) {
    return this.socketPlayerMap.get(socketId) || null;
  }

  /**
   * 通过玩家ID获取socket
   * @param {string} playerId - 玩家ID
   * @returns {Object|null} Socket实例
   */
  getSocketByPlayer(playerId) {
    const socketId = this.playerSocketMap.get(playerId);
    return socketId ? this.activeSockets.get(socketId) : null;
  }

  /**
   * 获取所有活跃连接的玩家ID列表
   * @returns {string[]} 玩家ID数组
   */
  getActivePlayerIds() {
    return Array.from(this.playerSocketMap.keys());
  }

  /**
   * 获取连接数量
   * @returns {number} 当前连接数
   */
  getConnectionCount() {
    return this.activeSockets.size;
  }

  /**
   * 向指定玩家发送消息
   * @param {string} playerId - 玩家ID
   * @param {Object} message - 消息内容
   * @returns {boolean} 发送是否成功
   */
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

  /**
   * 向所有玩家广播消息
   * @param {Object} message - 消息内容
   * @param {string[]} excludePlayerIds - 排除的玩家ID列表
   * @returns {number} 成功发送的数量
   */
  broadcastToAll(message, excludePlayerIds = []) {
    let successCount = 0;
    
    this.playerSocketMap.forEach((socketId, playerId) => {
      if (!excludePlayerIds.includes(playerId)) {
        if (this.sendToPlayer(playerId, message)) {
          successCount++;
        }
      }
    });
    
    return successCount;
  }

  /**
   * 检查玩家是否在线
   * @param {string} playerId - 玩家ID
   * @returns {boolean} 是否在线
   */
  isPlayerOnline(playerId) {
    return this.playerSocketMap.has(playerId);
  }

  /**
   * 检查玩家是否是房主
   * @param {string} playerId - 玩家ID
   * @returns {boolean} 是否是房主
   */
  isRoomHost(playerId) {
    return this.roomHostId === playerId;
  }

  /**
   * 获取房主ID
   * @returns {string|null} 房主玩家ID
   */
  getRoomHostId() {
    return this.roomHostId;
  }

  /**
   * 清空所有连接
   */
  clear() {
    this.playerSocketMap.clear();
    this.socketPlayerMap.clear();
    this.activeSockets.clear();
    this.roomHostId = null;
  }

  /**
   * 转移房主权限到下一个玩家
   * @private
   */
  _transferRoomHost() {
    const activePlayerIds = this.getActivePlayerIds();
    this.roomHostId = activePlayerIds.length > 0 ? activePlayerIds[0] : null;
  }

  /**
   * 生成唯一玩家ID
   * @private
   */
  _generatePlayerId(playerName) {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `${playerName}_${timestamp}_${randomStr}`;
  }

  /**
   * 检查玩家名称是否已被使用
   * @private
   */
  _isPlayerNameTaken(playerName) {
    return Array.from(this.playerSocketMap.keys())
      .some(playerId => playerId.startsWith(`${playerName}_`));
  }
}