/**
 * Session.js - JWT会话管理模块
 * 
 * 职责：
 * - JWT令牌签发与验证（24h有效期）
 * - 会话管理（sessionId ↔ playerId绑定）
 * - 断线时间标记和宽限期判断
 * - 在线状态维护
 * 
 * 严格遵循单文件<200行约束
 */

import jwt from 'jsonwebtoken';

// JWT密钥，生产环境应从环境变量获取
const JWT_SECRET = process.env.JWT_SECRET || 'poker-game-secret-key-2024';
const JWT_EXPIRES_IN = '24h';
const GRACE_PERIOD_MS = 60 * 1000; // 60秒宽限期

class Session {
  constructor() {
    // 会话存储：sessionId -> { playerId, socketId, disconnectAt }
    this.sessions = new Map();
    
    // 玩家到会话的反向索引：playerId -> sessionId  
    this.playerToSession = new Map();
  }

  /**
   * 创建JWT会话令牌
   * @param {string} sessionId - 会话ID
   * @param {string} playerId - 玩家ID
   * @returns {string} JWT令牌
   */
  createSessionToken(sessionId, playerId) {
    const payload = {
      sid: sessionId,
      pid: playerId,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * 验证JWT令牌
   * @param {string} token - JWT令牌
   * @returns {Object} { success: boolean, payload?: { sid, pid } }
   */
  verifySessionToken(token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return {
        success: true,
        payload: {
          sid: payload.sid,
          pid: payload.pid
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 确保会话存在（新建或获取）
   * @param {string} sessionId - 可选的现有会话ID
   * @returns {Object} { sessionId: string }
   */
  ensureSession(sessionId = null) {
    if (sessionId && this.sessions.has(sessionId)) {
      return { sessionId };
    }
    
    // 生成新的会话ID
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.sessions.set(newSessionId, {
      playerId: null,
      socketId: null,
      disconnectAt: null
    });
    
    return { sessionId: newSessionId };
  }

  /**
   * 绑定会话到玩家
   * @param {string} sessionId - 会话ID
   * @param {string} playerId - 玩家ID
   * @param {string} socketId - Socket连接ID
   */
  bindSessionToPlayer(sessionId, playerId, socketId) {
    // 清理玩家的旧会话绑定
    const oldSessionId = this.playerToSession.get(playerId);
    if (oldSessionId && oldSessionId !== sessionId) {
      this.unbindPlayer(playerId);
    }
    
    // 建立新绑定
    this.sessions.set(sessionId, {
      playerId,
      socketId,
      disconnectAt: null
    });
    
    this.playerToSession.set(playerId, sessionId);
  }

  /**
   * 标记玩家断线
   * @param {string} playerId - 玩家ID
   */
  markDisconnected(playerId) {
    const sessionId = this.playerToSession.get(playerId);
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      session.socketId = null;
      session.disconnectAt = Date.now();
    }
  }

  /**
   * 重新连接玩家
   * @param {string} playerId - 玩家ID
   * @param {string} socketId - 新的Socket连接ID
   * @returns {boolean} 是否成功重连
   */
  reconnectPlayer(playerId, socketId) {
    const sessionId = this.playerToSession.get(playerId);
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      session.socketId = socketId;
      session.disconnectAt = null;
      return true;
    }
    return false;
  }

  /**
   * 检查玩家是否在宽限期内
   * @param {string} playerId - 玩家ID
   * @param {number} nowMs - 当前时间戳（毫秒）
   * @returns {boolean} 是否在宽限期内
   */
  isWithinGrace(playerId, nowMs = Date.now()) {
    const sessionId = this.playerToSession.get(playerId);
    if (!sessionId || !this.sessions.has(sessionId)) {
      return false;
    }
    
    const session = this.sessions.get(sessionId);
    if (!session.disconnectAt) {
      return true; // 未断线，视为在线
    }
    
    const timeSinceDisconnect = nowMs - session.disconnectAt;
    return timeSinceDisconnect <= GRACE_PERIOD_MS;
  }

  /**
   * 获取玩家的Socket ID
   * @param {string} playerId - 玩家ID
   * @returns {string|null} Socket ID，未连接时返回null
   */
  getPlayerSocketId(playerId) {
    const sessionId = this.playerToSession.get(playerId);
    if (!sessionId || !this.sessions.has(sessionId)) {
      return null;
    }
    
    return this.sessions.get(sessionId).socketId;
  }

  /**
   * 根据Socket ID获取玩家ID
   * @param {string} socketId - Socket连接ID
   * @returns {string|null} 玩家ID，未找到时返回null
   */
  getPlayerBySocketId(socketId) {
    for (const [sessionId, session] of this.sessions) {
      if (session.socketId === socketId) {
        return session.playerId;
      }
    }
    return null;
  }

  /**
   * 解绑玩家（清理会话）
   * @param {string} playerId - 玩家ID
   */
  unbindPlayer(playerId) {
    const sessionId = this.playerToSession.get(playerId);
    if (sessionId) {
      this.sessions.delete(sessionId);
      this.playerToSession.delete(playerId);
    }
  }

  /**
   * 清理过期的宽限期会话
   * @param {number} nowMs - 当前时间戳（毫秒）
   * @returns {string[]} 被清理的玩家ID列表
   */
  cleanupExpiredSessions(nowMs = Date.now()) {
    const expiredPlayers = [];
    
    for (const [playerId] of this.playerToSession) {
      if (!this.isWithinGrace(playerId, nowMs)) {
        const sessionId = this.playerToSession.get(playerId);
        const session = this.sessions.get(sessionId);
        
        // 只清理已断线的会话
        if (session && session.disconnectAt) {
          expiredPlayers.push(playerId);
          this.unbindPlayer(playerId);
        }
      }
    }
    
    return expiredPlayers;
  }

  /**
   * 获取会话状态摘要（用于调试）
   * @returns {Object} 会话状态摘要
   */
  getSessionSummary() {
    const activeSessions = Array.from(this.sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      playerId: session.playerId,
      isOnline: !!session.socketId,
      disconnectAt: session.disconnectAt
    }));
    
    return {
      totalSessions: this.sessions.size,
      activeSessions,
      gracePeriodMs: GRACE_PERIOD_MS
    };
  }
}

export default Session;