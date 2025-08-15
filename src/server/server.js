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
import TurnManager from '../game/TurnManager.js';
import TableRules from '../game/rules/TableRules.js';

// 服务器模块
import PlayerRegistry from './playerRegistry.js';
import Session from './session.js';
import Lifecycle from './lifecycle.js';
// 持久化模块（最小侵入式接入）
import EventLogger from './persistence/EventLogger.js';
import FileStorage from './persistence/storage/FileStorage.js';
import { SERVER_MESSAGES, PLAYER_ACTIONS, validateClientMessage, createServerMessage, createErrorMessage, createGameEventMessage, ERROR_TYPES } from './protocol.js';
import { createMessageHandlers } from './messageHandlers.js';
import { enableDevReload } from './devReload.js';

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
      const storage = new FileStorage();
      this.storage = storage;
      this.eventLogger = new EventLogger(storage);
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
    const { playerName, buyIn } = payload;

    // 注册玩家
    const registrationResult = this.playerRegistry.registerPlayer(
      socket.id, socket, playerName, buyIn
    );

    if (!registrationResult.success) {
      socket.emit('message', registrationResult.error);
      return;
    }

    // 加入桌面前：去重同名的"僵尸观察者"（离线且过宽限且0筹码且坐出）
    try {
      const staleIds = (this.game.gameState.players || [])
        .filter(p => p.name === playerName && p.id !== registrationResult.playerId)
        .filter(p => !this.playerRegistry.isPlayerOnline(p.id))
        .filter(p => !this.session.isWithinGrace(p.id))
        .filter(p => p.status === 'SITTING_OUT' && (p.chips || 0) === 0)
        .map(p => p.id);
      if (staleIds.length > 0) {
        staleIds.forEach(pid => this.game.gameState.removePlayer(pid));
      }
    } catch { /* ignore */ }

    // 高优先：绑定会话到玩家（用于后续宽限与重连）
    try {
      const sid = this.socketToSession.get(socket.id);
      if (sid) {
        this.session.bindSessionToPlayer(sid, registrationResult.playerId, socket.id);
      } else {
        const ensured = this.session.ensureSession();
        this.session.bindSessionToPlayer(ensured.sessionId, registrationResult.playerId, socket.id);
        this.socketToSession.set(socket.id, ensured.sessionId);
      }
    } catch (e) {
      console.warn('绑定会话到玩家失败（将继续流程）:', e && e.message ? e.message : e);
    }

    // 阶段2：使用生命周期加入桌面为“旁观者/坐出”，不直接入座
    const joinResult = this.lifecycle.handleJoinTable({
      gameState: this.game.gameState,
      playerId: registrationResult.playerId,
      nickname: playerName
    });

    if (!joinResult.success) {
      // 加入失败，清理注册
      this.playerRegistry.unregisterPlayer(socket.id);
      socket.emit('message', createErrorMessage(
        joinResult.error.code || ERROR_TYPES.GAME_ERROR,
        joinResult.error.message || '无法加入游戏，请稍后重试'
      ));
      return;
    }

    // 成功加入，发送确认消息
    socket.emit('message', createServerMessage(SERVER_MESSAGES.CONNECTION_SUCCESS, {
      playerId: registrationResult.playerId,
      playerName: playerName,
      isRoomHost: registrationResult.isRoomHost,
      roomHostId: this.playerRegistry.getRoomHostId()
    }));

    console.log(`玩家 ${playerName} (${registrationResult.playerId}) 加入游戏`);

    // 广播状态更新
    this.broadcastGameState();
  }

  /**
   * 处理玩家动作
   */
  handlePlayerAction(socket, payload) {
    const playerId = this.playerRegistry.getPlayerBySocket(socket.id);
    
    if (!playerId) {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.PLAYER_NOT_FOUND, 
        '玩家未找到，请重新连接'
      ));
      return;
    }

    // 构造游戏动作
    const action = {
      type: payload.action,
      playerId: playerId,
      amount: payload.amount || 0
    };

    // 持久化：记录玩家动作事件（在应用动作前）
    try {
      if (this.eventLogger && this.eventLogger.enabled) {
        const sessionId = this.socketToSession.get(socket.id);
        const handNumber = this.game?.gameState?.handNumber;
        this.eventLogger.appendPublicEvent(sessionId, {
          type: 'PLAYER_ACTION',
          payload: { ...payload, playerId }
        }, handNumber).catch(() => {});
      }
    } catch (_) { /* 忽略持久化错误，不影响主流程 */ }

    // 应用动作到游戏
    const result = this.game.applyAction(action);

    if (result.success) {
      console.log(`玩家 ${playerId} 执行动作: ${payload.action} ${payload.amount || ''}`);
      
      // 处理游戏事件
      if (result.gameEvents && result.gameEvents.length > 0) {
        this.handleGameEvents(result.gameEvents);
      }

      // 广播更新的游戏状态
      this.broadcastGameState();
    } else {
      // 动作失败，发送错误给该玩家
      socket.emit('message', createErrorMessage(
        result.error.error,
        result.error.message
      ));
    }
  }

  /**
   * 处理游戏事件
   */
  handleGameEvents(events) {
    // 选择一个会话ID用于事件记录：优先当前行动者所属的会话，其次任意已存在会话
    const currentTurnId = this.game?.gameState?.currentTurn;
    const sessionIdForLog = currentTurnId
      ? this.session.playerToSession.get(currentTurnId)
      : (this.session.playerToSession.size > 0
          ? Array.from(this.session.playerToSession.values())[0]
          : null);

    events.forEach(event => {
      // 持久化：在新一手开始时保存快照
      try {
        if (this.storage && sessionIdForLog && (event.type === 'GAME_STARTED' || event.type === 'HAND_STARTED')) {
          const snapshot = this.game?.gameState?.serialize ? this.game.gameState.serialize() : this.game?.gameState;
          if (snapshot) {
            this.storage.saveSnapshot(sessionIdForLog, snapshot).catch(() => {});
          }
        }
      } catch (_) { /* 忽略快照保存错误 */ }

      // 持久化：记录公共流程事件
      try {
        if (this.eventLogger && this.eventLogger.enabled && sessionIdForLog) {
          const handNumber = this.game?.gameState?.handNumber;
          this.eventLogger.appendPublicEvent(sessionIdForLog, {
            type: event.type,
            payload: event
          }, handNumber).catch(() => {});
        }
      } catch (_) { /* 忽略持久化错误 */ }

      // 广播游戏事件
      this.playerRegistry.broadcastToAll(
        createGameEventMessage(event.type, event)
      );

      console.log(`游戏事件: ${event.type}`, event);

      // 回合计时器控制与局间清理
      if (event.type === 'TURN_CHANGED') {
        this._cancelTurnTimer();
        if (event.playerId) {
          this._startTurnTimerFor(event.playerId);
        }
      }

      if (event.type === 'HAND_FINISHED' || event.type === 'GAME_ENDED' || event.type === 'SHOWDOWN_STARTED') {
        this._cancelTurnTimer();
      }

      // 局间：自动移除断线者（不解绑会话，保留重连为未入座）
      if (event.type === 'HAND_FINISHED' || event.type === 'GAME_ENDED') {
        const disconnectedIds = this.game.gameState.players
          .map(p => p.id)
          .filter(pid => this.playerRegistry.isPlayerDisconnected(pid));
        if (disconnectedIds.length > 0) {
          disconnectedIds.forEach(pid => this.game.removePlayer(pid));
          this.broadcastGameState();
        }
      }
    });
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
        '只有房主可以开始游戏'
      ));
      return;
    }

    // 检查游戏状态
    const gameState = this.game.getPublicState();
    if (gameState.phase !== 'WAITING') {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.GAME_IN_PROGRESS,
        '游戏已在进行中'
      ));
      return;
    }

    // 检查玩家数量
    if (gameState.players.length < 2) {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.ACTION_NOT_ALLOWED,
        '至少需要2个玩家才能开始游戏'
      ));
      return;
    }

    // 开始游戏
    const success = this.startGame();
    if (success) {
      console.log(`房主 ${playerId} 开始了游戏`);
    } else {
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.GAME_ERROR,
        '开始游戏失败，请稍后重试'
      ));
    }
  }

  /**
   * 手动开始游戏（房主触发）
   */
  startGame() {
    const gameState = this.game.getPublicState();
    
    console.log('startGame调试信息:');
    console.log('- phase:', gameState.phase);
    console.log('- players.length:', gameState.players.length);
    console.log('- 条件检查: phase === WAITING:', gameState.phase === 'WAITING');
    console.log('- 条件检查: players.length >= 2:', gameState.players.length >= 2);
    
    if (gameState.phase === 'WAITING' && gameState.players.length >= 2) {
      console.log('尝试调用startNewHand...');
      const startResult = this.game.startNewHand();
      console.log('startNewHand返回:', startResult);
      
      if (startResult) {
        console.log('新一轮游戏开始！');
        
        // 广播游戏开始事件
        this.playerRegistry.broadcastToAll(
          createGameEventMessage('GAME_STARTED')
        );
        
        // 广播状态
        this.broadcastGameState();

        // 启动首个行动者的计时器
        const ct = this.game.gameState.currentTurn;
        if (ct) {
          this._cancelTurnTimer();
          this._startTurnTimerFor(ct);
        }
        return true;
      } else {
        console.log('startNewHand返回false，游戏启动失败');
      }
    } else {
      console.log('启动游戏条件不满足');
    }
    return false;
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
    const playerId = this.playerRegistry.getPlayerBySocket(socketId);
    
    if (playerId) {
      // 标记会话断线，开始宽限期
      this.session.markDisconnected(playerId);
      this.playerRegistry.markPlayerDisconnected(playerId);
      
      console.log(`玩家 ${playerId} 断线，开始宽限期`);
      
      // 启动宽限期清理定时器
      setTimeout(() => {
        this.cleanupExpiredPlayer(playerId);
      }, 5 * 60 * 1000);

      // 若当前不在手牌中（局间），立即将其移出桌面
      const gameState = this.game.gameState;
      if (gameState && gameState.phase !== 'PLAYING') {
        this.game.removePlayer(playerId);
        this.broadcastGameState();
      }
    }
  }

  /**
   * 阶段2新增：清理过期玩家
   */
  cleanupExpiredPlayer(playerId) {
    if (!this.session.isWithinGrace(playerId)) {
      console.log(`玩家 ${playerId} 宽限期到期，执行清理`);

      const gameState = this.game.gameState;
      const isPlaying = gameState && gameState.phase === 'PLAYING';
      const wasCurrentTurn = isPlaying && gameState.currentTurn === playerId;

      if (isPlaying) {
        try {
          if (wasCurrentTurn) {
            // 优先通过正规动作触发游戏流程推进
            const result = this.game.applyAction({ type: 'fold', playerId });
            if (result && result.success && result.gameEvents && result.gameEvents.length > 0) {
              this.handleGameEvents(result.gameEvents);
            } else {
              // 兜底：直接标记弃牌并手动推进到下一行动者
              const player = gameState.getPlayer(playerId);
              if (player) {
                player.status = 'FOLDED';
                gameState.updateActivePlayers();
                TurnManager.advanceToNextActor(gameState);
                this.handleGameEvents([{ type: 'TURN_CHANGED', playerId: gameState.currentTurn }]);
              }
            }
          } else {
            // 非当前行动者：直接标记弃牌，防止后续卡住
            const player = gameState.getPlayer(playerId);
            if (player) {
              player.status = 'FOLDED';
              gameState.updateActivePlayers();
            }
          }
        } catch (e) {
          console.warn(`清理玩家 ${playerId} 时自动弃牌失败:`, e && e.message ? e.message : e);
        }

        // 广播最新状态
        this.broadcastGameState();
      } else {
        // 非进行中，直接从桌面移除
        this.game.removePlayer(playerId);
        this.broadcastGameState();
      }

      // 最后清理会话与注册信息（触发房主转移等）
      this.session.unbindPlayer(playerId);
      this.playerRegistry.unregisterPlayerById(playerId);
    }
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
    if (!playerId) return;
    // 仅在手牌进行中有效
    if (!this.game || this.game.gameState.phase !== 'PLAYING') return;

    this.turnPlayerId = playerId;
    this.turnDeadlineAt = Date.now() + this.TURN_TIMEOUT_MS;
    this.turnTimer = setTimeout(() => this._handleTurnTimeout(playerId), this.TURN_TIMEOUT_MS);
  }

  /**
   * 取消当前回合计时器
   * @private
   */
  _cancelTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
      this.turnPlayerId = null;
      this.turnDeadlineAt = null;
    }
  }

  /**
   * 回合超时处理：可过则过，否则弃牌
   * @private
   */
  _handleTurnTimeout(expectedPlayerId) {
    try {
      // 状态变化保护
      const gameState = this.game && this.game.gameState;
      if (!gameState || gameState.phase !== 'PLAYING') return;
      if (gameState.currentTurn !== expectedPlayerId) return; // 已换人

      const player = gameState.getPlayer(expectedPlayerId);
      if (!player) return;

      const amountToCall = gameState.amountToCall || 0;
      const currentBet = player.currentBet || 0;
      const callCost = Math.max(0, amountToCall - currentBet);
      const canCheck = callCost === 0;

      const actionType = canCheck ? PLAYER_ACTIONS.CHECK : PLAYER_ACTIONS.FOLD;
      const result = this.game.applyAction({ type: actionType, playerId: expectedPlayerId });

      if (result && result.success) {
        if (result.gameEvents && result.gameEvents.length > 0) {
          this.handleGameEvents(result.gameEvents);
        }
        this.broadcastGameState();
      }
    } catch (e) {
      console.warn('回合超时自动处理失败:', e && e.message ? e.message : e);
    } finally {
      this._cancelTurnTimer();
    }
  }

  /**
   * 阶段2新增：向特定玩家发送游戏状态
   */
  sendGameStateToPlayer(socket, playerId) {
    // 发送公共状态
    const publicState = this.game.getPublicState();
    publicState.roomHostId = this.playerRegistry.getRoomHostId();
    socket.emit('message', createServerMessage(SERVER_MESSAGES.GAME_STATE, publicState));

    // 发送私有状态
    const privateState = this.game.getPrivateStateFor(playerId);
    if (privateState.holeCards) {
      socket.emit('message', createServerMessage(SERVER_MESSAGES.PRIVATE_STATE, privateState));
    }
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
  }

  /**
   * 广播游戏状态给所有玩家
   */
  broadcastGameState() {
    // 获取公共状态
    const publicState = this.game.getPublicState();
    
    // 添加房主信息
    publicState.roomHostId = this.playerRegistry.getRoomHostId();
    // 添加断线玩家列表，供前端标识
    if (typeof this.playerRegistry.getDisconnectedPlayerIds === 'function') {
      publicState.disconnectedPlayerIds = this.playerRegistry.getDisconnectedPlayerIds();
    }
    
    const publicMessage = createServerMessage(SERVER_MESSAGES.GAME_STATE, publicState);

    // 广播公共状态给所有玩家
    this.playerRegistry.broadcastToAll(publicMessage);

    // 为每个玩家发送私有状态
    this.playerRegistry.getActivePlayerIds().forEach(playerId => {
      const privateState = this.game.getPrivateStateFor(playerId);
      if (privateState.holeCards) {
        const privateMessage = createServerMessage(SERVER_MESSAGES.PRIVATE_STATE, privateState);
        this.playerRegistry.sendToPlayer(playerId, privateMessage);
      }
    });
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
}

// 仅在作为主模块执行时启动服务器（兼容Windows/相对路径）
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = process.env.PORT || 3001;
  const server = new PokerServer(port);
  server.start();
}

export default PokerServer;