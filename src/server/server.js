/**
 * 德州扑克服务器主文件
 * 启动HTTP/WebSocket服务，协调游戏逻辑与客户端通信
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// 游戏模块
import Game from '../game/Game.js';
import ReplayEngine from '../game/replay/ReplayEngine.js';
import TableRules from '../game/rules/TableRules.js';

// 服务器模块
import PlayerRegistry from './playerRegistry.js';
import Session from './session.js';
import Lifecycle from './lifecycle.js';
// 持久化模块（最小侵入式接入）
import EventLogger from './persistence/EventLogger.js';
import SnapshotManager from './persistence/SnapshotManager.js';
import FileStorage from './persistence/storage/FileStorage.js';
import { SERVER_MESSAGES, validateClientMessage, createServerMessage, createErrorMessage, createGameEventMessage, ERROR_TYPES, GAME_EVENTS } from './protocol.js';
import { createMessageHandlers } from './messageHandlers.js';
import { enableDevReload } from './devReload.js';
import { broadcastGameState, sendGameStateToPlayer } from './handlers/broadcast.js';
import { startTurnTimer, cancelTurnTimer, handleTurnTimeout } from './handlers/turnTimer.js';
import { handlePlayerAction as handlePlayerActionExt, handleGameEvents as handleGameEventsExt } from './handlers/actionHandlers.js';
import { handleStartGame as handleStartGameExt, startGame as startGameExt } from './handlers/startHandlers.js';
import { handlePlayerJoin as handlePlayerJoinExt } from './handlers/joinHandler.js';
import { handlePlayerDisconnect as handlePlayerDisconnectExt, cleanupExpiredPlayer as cleanupExpiredPlayerExt } from './handlers/disconnectHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PokerServer {
  constructor(port = 3000) {
    this.port = port;
    this.playerRegistry = new PlayerRegistry();
    this.session = new Session();  // 阶段2新增：会话管理
    this.lifecycle = new Lifecycle();  // 阶段2新增：生命周期管理
    this.socketToSession = new Map();
    
    // 回合计时器（1分钟决策超时）
    this.TURN_TIMEOUT_MS = 60 * 1000;
    this.turnTimer = null;
    this.turnPlayerId = null;
    this.turnDeadlineAt = null;
    
    // 初始化游戏
    const tableRules = TableRules.createCashGame(20); // 10/20 盲注
    this.game = new Game(tableRules);
    
    // 初始化持久化（启用与否由EventLogger内部环境变量控制）
    try {
      const storage = new FileStorage(process.env.DATA_DIR || './data/sessions');
      this.storage = storage;
      this.eventLogger = new EventLogger(storage);
      this.snapshotManager = new SnapshotManager(storage);
    } catch (_) {
      this.eventLogger = null;
    }

    // 消息处理器映射外置
    this.messageHandlers = createMessageHandlers(this);
    
    this.setupServer();
    this.setupSocketHandlers();

    // 开发模式：启用前端资源热刷新
    if (process.env.NODE_ENV !== 'production') {
      enableDevReload(this.io);
    }

    // 启动时尝试从最近快照恢复（可选）
    this._attemptStartupRecovery().catch(() => {});
  }

  /**
   * 设置HTTP服务器和Socket.IO
   */
  setupServer() {
    // Express应用用于静态文件服务和健康检查
    this.app = express();
    
    // 静态文件服务
    this.app.use(express.static(path.join(__dirname, '../ui/public')));
    
    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        playerCount: this.playerRegistry.getConnectionCount(),
        gamePhase: this.game.getGameSummary().phase,
        timestamp: new Date().toISOString()
      });
    });

    // 只读 Admin 端点（最小集成）
    this.app.get('/admin/sessions', async (req, res) => {
      try {
        if (!this.storage || typeof this.storage.listSessions !== 'function') return res.json([]);
        const sessions = await this.storage.listSessions();
        res.json(sessions || []);
      } catch (error) {
        res.status(500).json({ error: 'failed_to_list_sessions', message: error.message });
      }
    });

    this.app.get('/admin/sessions/:id/meta', async (req, res) => {
      try {
        if (!this.storage || typeof this.storage.readSession !== 'function') return res.status(404).json({ error: 'not_found' });
        const snapshot = await this.storage.readSession(req.params.id);
        if (!snapshot) return res.status(404).json({ error: 'not_found' });
        res.json(snapshot);
      } catch (error) {
        res.status(500).json({ error: 'failed_to_read_session', message: error.message });
      }
    });

    this.app.get('/admin/sessions/:id/events', async (req, res) => {
      try {
        if (!this.storage || typeof this.storage.streamPublicEvents !== 'function') return res.status(404).end();
        const fromSeq = Number(req.query.fromSeq || 0);
        res.set('Content-Type', 'application/x-ndjson');
        for await (const evt of this.storage.streamPublicEvents(req.params.id, fromSeq)) {
          res.write(JSON.stringify(evt) + '\n');
        }
        res.end();
      } catch (_) {
        try { res.end(); } catch (__) {}
      }
    });

    // 简易回放校验端点（公共/管理员模式）
    this.app.get('/admin/sessions/:id/replay', async (req, res) => {
      try {
        if (!this.storage) return res.status(404).json({ error: 'not_found' });
        const mode = (req.query.mode === 'admin') ? 'admin' : 'public';
        const engine = new ReplayEngine(this.storage, Game);
        const loaded = await engine.loadSession(req.params.id, mode);
        if (!loaded) return res.status(400).json({ error: 'load_failed' });

        // 回放至最后一个完成手局
        let lastFinishedIdx = -1;
        engine.events.forEach((e, idx) => { if (e.type === 'HAND_FINISHED') lastFinishedIdx = idx; });
        await engine.startReplay({ autoPlay: false });
        if (lastFinishedIdx >= 0) {
          await engine.seekTo(lastFinishedIdx + 1);
        }

        const validation = engine.validateReplay();
        const state = engine.getCurrentGameState();
        res.json({ mode: engine.mode, validation, state });
      } catch (error) {
        res.status(500).json({ error: 'replay_failed', message: error.message });
      }
    });

    // 创建HTTP服务器
    this.server = createServer(this.app);
    
    // 设置Socket.IO
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
  }

  /**
   * 设置Socket连接处理
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`新连接: ${socket.id}`);

      // 处理客户端消息
      socket.on('message', (message) => {
        this.handleClientMessage(socket, message);
      });

      // 处理断开连接
      socket.on('disconnect', () => {
        console.log(`连接断开: ${socket.id}`);
        this.handlePlayerDisconnect(socket.id);  // 阶段2修改：支持断线重连
      });
    });
  }

  /**
   * 开发模式：监听静态资源变化并通知客户端刷新
   */
  // dev 热刷新逻辑已外置到 devReload.js

  /**
   * 处理客户端消息
   */
  handleClientMessage(socket, message) {
    try {
      // 验证消息格式
      const validationError = validateClientMessage(message);
      if (validationError) {
        socket.emit('message', validationError);
        return;
      }

      // 根据消息类型分发处理（Handler Map）
      const handler = this.messageHandlers[message.type];
      if (handler) {
        handler(socket, message.payload);
      } else {
          socket.emit('message', createErrorMessage(
            ERROR_TYPES.SYSTEM_ERROR, 
            '未知消息类型'
          ));
      }
    } catch (error) {
      console.error('处理客户端消息时出错:', error);
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.SYSTEM_ERROR, 
        `服务器内部错误: ${error.message}`
      ));
    }
  }

  /**
   * 处理玩家加入
   */
  handlePlayerJoin(socket, payload) {
    return handlePlayerJoinExt(this, socket, payload);
  }

  /**
   * 处理玩家动作
   */
  handlePlayerAction(socket, payload) {
    return handlePlayerActionExt(this, socket, payload);
  }

  /**
   * 处理游戏事件
   */
  handleGameEvents(events) {
    return handleGameEventsExt(this, events);
  }

  /**
   * 处理游戏状态请求
   */
  handleGameStateRequest(socket) {
    const playerId = this.playerRegistry.getPlayerBySocket(socket.id);
    
    if (!playerId) {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.PLAYER_NOT_FOUND,
        '玩家未找到'
      ));
      return;
    }

    // 发送公共状态
    const publicState = this.game.getPublicState();
    socket.emit('message', createServerMessage(SERVER_MESSAGES.GAME_STATE, publicState));

    // 发送私有状态
    const privateState = this.game.getPrivateStateFor(playerId);
    if (privateState.holeCards) {
      socket.emit('message', createServerMessage(SERVER_MESSAGES.PRIVATE_STATE, privateState));
    }
  }

  /**
   * 处理玩家离开
   */
  handlePlayerLeave(socketId) {
    const playerId = this.playerRegistry.unregisterPlayer(socketId);
    
    if (playerId) {
      // 从游戏中移除玩家
      this.game.removePlayer(playerId);
      console.log(`玩家 ${playerId} 离开游戏`);
      
      // 广播状态更新
      this.broadcastGameState();
    }
  }

  /**
   * 处理手动开始游戏
   */
  handleStartGame(socket) {
    return handleStartGameExt(this, socket);
  }

  /**
   * 手动开始游戏（房主触发）
   */
  startGame() {
    return startGameExt(this);
  }

  /**
   * 阶段2新增：处理握手与会话
   */
  handleHello(socket, payload) {
    const { sessionToken } = payload || {};
    
    if (sessionToken) {
      // 验证现有会话令牌
      const tokenResult = this.session.verifySessionToken(sessionToken);
      if (tokenResult.success) {
        const { sid: sessionId, pid: playerId } = tokenResult.payload;
        
        // 检查会话是否仍在宽限期内
        if (this.session.isWithinGrace(playerId)) {
          // 重连成功
          this.session.reconnectPlayer(playerId, socket.id);
          this.playerRegistry.reconnectPlayer(playerId, socket.id, socket);
          this.socketToSession.set(socket.id, sessionId);
          
          console.log(`玩家 ${playerId} 重连成功`);
          
          socket.emit('message', createServerMessage(SERVER_MESSAGES.SESSION_ACCEPTED, {
            sessionToken,
            playerId,
            reconnected: true
          }));
          
          // 发送当前游戏状态
          this.sendGameStateToPlayer(socket, playerId);
          return;
        }
      }
    }
    
    // 创建新会话
    const { sessionId } = this.session.ensureSession();
    const newToken = this.session.createSessionToken(sessionId, null);
    this.socketToSession.set(socket.id, sessionId);
    
    socket.emit('message', createServerMessage(SERVER_MESSAGES.SESSION_ACCEPTED, {
      sessionToken: newToken,
      playerId: null,
      reconnected: false
    }));
  }

  /**
   * 阶段2新增：处理断线（不立即移除玩家）
   */
  handlePlayerDisconnect(socketId) {
    return handlePlayerDisconnectExt(this, socketId);
  }

  /**
   * 阶段2新增：清理过期玩家
   */
  cleanupExpiredPlayer(playerId) {
    return cleanupExpiredPlayerExt(this, playerId);
  }

  /**
   * 阶段2新增：处理入座
   */
  handleTakeSeat(socket, payload) {
    const playerId = this.getAuthenticatedPlayer(socket);
    if (!playerId) return;
    
    const { buyIn } = payload;
    const result = this.lifecycle.handleTakeSeat({
      gameState: this.game.gameState,
      tableRules: this.game.tableRules,
      playerId,
      buyIn
    });
    
    if (result.success) {
      console.log(`玩家 ${playerId} 入座成功`);
      this.broadcastGameState();
    } else {
      socket.emit('message', createErrorMessage(
        result.error.code,
        result.error.message
      ));
    }
  }

  /**
   * 阶段2新增：处理离座
   */
  handleLeaveSeat(socket, payload) {
    const playerId = this.getAuthenticatedPlayer(socket);
    if (!playerId) return;
    
    const result = this.lifecycle.handleLeaveSeat({
      gameState: this.game.gameState,
      playerId
    });
    
    if (result.success) {
      console.log(`玩家 ${playerId} 离座成功`);
      this.broadcastGameState();
    } else {
      socket.emit('message', createErrorMessage(
        result.error.code,
        result.error.message
      ));
    }
  }

  /**
   * 阶段2新增：处理离开桌面
   */
  handleLeaveTable(socket, payload) {
    const playerId = this.getAuthenticatedPlayer(socket);
    if (!playerId) return;
    
    const result = this.lifecycle.handleLeaveTable({
      gameState: this.game.gameState,
      playerId
    });
    
    if (result.success) {
      console.log(`玩家 ${playerId} 离开桌面，最终筹码: ${result.finalChips}`);
      this.session.unbindPlayer(playerId);
      this.playerRegistry.unregisterPlayerById(playerId);
      this.broadcastGameState();
    } else {
      socket.emit('message', createErrorMessage(
        result.error.code,
        result.error.message
      ));
    }
  }

  /**
   * 阶段2新增：处理增购
   */
  handleAddOn(socket, payload) {
    const playerId = this.getAuthenticatedPlayer(socket);
    if (!playerId) return;
    
    const { amount } = payload;
    const result = this.lifecycle.handleAddOn({
      gameState: this.game.gameState,
      tableRules: this.game.tableRules,
      playerId,
      amount
    });
    
    if (result.success) {
      console.log(`玩家 ${playerId} 增购 ${amount}，新总额: ${result.newTotal}`);
      this.broadcastGameState();
    } else {
      socket.emit('message', createErrorMessage(
        result.error.code,
        result.error.message
      ));
    }
  }

  /**
   * 阶段2新增：获取已认证的玩家ID
   */
  getAuthenticatedPlayer(socket) {
    const playerId = this.playerRegistry.getPlayerBySocket(socket.id);
    if (!playerId) {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.PLAYER_NOT_FOUND,
        '玩家未找到，请重新连接'
      ));
      return null;
    }
    return playerId;
  }

  /**
   * 启动某玩家的回合计时器（1分钟）
   * @private
   */
  _startTurnTimerFor(playerId) {
    return startTurnTimer(this, playerId);
  }

  /**
   * 取消当前回合计时器
   * @private
   */
  _cancelTurnTimer() {
    return cancelTurnTimer(this);
  }

  /**
   * 回合超时处理：可过则过，否则弃牌
   * @private
   */
  _handleTurnTimeout(expectedPlayerId) {
    return handleTurnTimeout(this, expectedPlayerId);
  }

  /**
   * 阶段2新增：向特定玩家发送游戏状态
   */
  sendGameStateToPlayer(socket, playerId) {
    return sendGameStateToPlayer(this, socket, playerId);
  }

  /**
   * 阶段1.5新增：处理房主结束整局
   */
  handleHostEndGame(socket) {
    const playerId = this.playerRegistry.getPlayerBySocket(socket.id);
    
    if (!playerId) {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.PLAYER_NOT_FOUND,
        '玩家未找到'
      ));
      return;
    }

    // 检查是否是房主
    if (!this.playerRegistry.isRoomHost(playerId)) {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.NOT_ROOM_HOST,
        '只有房主可以结束整局'
      ));
      return;
    }

    // 调用Game的endSession方法
    const finalSettlement = this.game.endSession();
    
    if (!finalSettlement) {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.SESSION_NOT_INITIALIZED,
        '会话未初始化，无法结束整局'
      ));
      return;
    }

    console.log(`房主 ${playerId} 结束了整局`);
    
    // 广播整局结束消息
    this.playerRegistry.broadcastToAll(
      createServerMessage(SERVER_MESSAGES.GAME_ENDED, finalSettlement)
    );
    // 追加：作为 game_event 广播会话汇总，供日志/历史面板使用
    try {
      this.playerRegistry.broadcastToAll(
        createGameEventMessage(GAME_EVENTS.GAME_OVER_SUMMARY, finalSettlement)
      );
    } catch (_) { /* ignore */ }

    // 记录公共事件：GAME_ENDED（不触发快照）
    try {
      if (this.eventLogger && this.eventLogger.enabled) {
        const currentTurnId = this.game?.gameState?.currentTurn;
        const sessionIdForLog = currentTurnId
          ? this.session.playerToSession.get(currentTurnId)
          : (this.session.playerToSession.size > 0
            ? Array.from(this.session.playerToSession.values())[0]
            : null);
        const handNumber = this.game?.gameState?.handNumber;
        if (sessionIdForLog) {
          this.eventLogger.appendPublicEvent(sessionIdForLog, {
            type: 'GAME_ENDED',
            payload: finalSettlement
          }, handNumber).catch(() => {});
        }
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * 广播游戏状态给所有玩家
   */
  broadcastGameState() {
    return broadcastGameState(this);
  }

  /**
   * 启动服务器
   */
  start() {
    this.server.listen(this.port, () => {
      console.log(`德州扑克服务器启动在端口 ${this.port}`);
      console.log(`访问 http://localhost:${this.port} 开始游戏`);
    });
  }

  /**
   * 停止服务器
   */
  stop() {
    this.server.close();
    this.playerRegistry.clear();
    console.log('服务器已停止');
  }

  /**
   * 启动时尝试从最近会话快照恢复（若启用持久化）
   * @private
   */
  async _attemptStartupRecovery() {
    try {
      if (!this.storage || !this.snapshotManager || !this.snapshotManager.isEnabled()) {
        return;
      }

      const sessions = await this.storage.listSessions();
      if (!sessions || sessions.length === 0) return;

      const latest = sessions[0];
      const snapshot = await this.snapshotManager.readSnapshot(latest.sessionId);
      if (!snapshot) return;

      // 使用回放引擎从快照+事件恢复到最近完整手局后的状态
      const engine = new ReplayEngine(this.storage, Game);
      const loaded = await engine.loadSession(latest.sessionId, 'public');
      if (!loaded) return;
      await engine.startReplay({ autoPlay: true, speed: 10 });

      if (engine.game && engine.game.gameState) {
        const recovered = JSON.parse(JSON.stringify(engine.game.gameState));
        Object.assign(this.game.gameState, recovered);
      } else {
        // 兜底：仅从快照恢复
        const ok = this.snapshotManager.restoreFromSnapshot(this.game.gameState, snapshot);
        if (!ok) return;
      }

      // 确保进入等待状态
      this.game.gameState.phase = 'WAITING';
      this.game.gameState.currentTurn = null;
      console.log(`[StartupRecovery] 从会话 ${latest.sessionId} 恢复完成`);
    } catch (error) {
      console.warn('[StartupRecovery] 恢复失败:', error && error.message ? error.message : error);
    }
  }
}

// 仅在作为主模块执行时启动服务器（兼容Windows/相对路径）
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = process.env.PORT || 3001;
  const server = new PokerServer(port);
  server.start();
}

export default PokerServer;