/**
 * 德州扑克服务器主文件
 * 启动HTTP/WebSocket服务，协调游戏逻辑与客户端通信
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// 游戏模块
import Game from '../game/Game.js';
import TableRules from '../game/rules/TableRules.js';

// 服务器模块
import PlayerRegistry from './playerRegistry.js';
import {
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  PLAYER_ACTIONS,
  validateClientMessage,
  createServerMessage,
  createErrorMessage,
  createGameEventMessage,
  ERROR_TYPES
} from './protocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PokerServer {
  constructor(port = 3000) {
    this.port = port;
    this.playerRegistry = new PlayerRegistry();
    
    // 初始化游戏
    const tableRules = TableRules.createCashGame(20); // 10/20 盲注
    this.game = new Game(tableRules);
    
    this.setupServer();
    this.setupSocketHandlers();
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
        this.handlePlayerLeave(socket.id);
      });
    });
  }

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

      // 根据消息类型分发处理
      switch (message.type) {
        case CLIENT_MESSAGES.JOIN_GAME:
          this.handlePlayerJoin(socket, message.payload);
          break;

        case CLIENT_MESSAGES.START_GAME:
          this.handleStartGame(socket);
          break;

        case CLIENT_MESSAGES.PLAYER_ACTION:
          this.handlePlayerAction(socket, message.payload);
          break;

        case CLIENT_MESSAGES.REQUEST_GAME_STATE:
          this.handleGameStateRequest(socket);
          break;

        case CLIENT_MESSAGES.LEAVE_GAME:
          this.handlePlayerLeave(socket.id);
          break;

        case CLIENT_MESSAGES.HOST_END_GAME:  // 阶段1.5新增
          this.handleHostEndGame(socket);
          break;

        default:
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

    // 尝试将玩家添加到游戏中
    const gameResult = this.game.addPlayer(registrationResult.playerData);
    
    if (!gameResult) {
      // 游戏添加失败，清理注册
      this.playerRegistry.unregisterPlayer(socket.id);
      socket.emit('message', createErrorMessage(
        ERROR_TYPES.GAME_ERROR,
        '无法加入游戏，请稍后重试'
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
    events.forEach(event => {
      // 广播游戏事件
      this.playerRegistry.broadcastToAll(
        createGameEventMessage(event.type, event)
      );

      console.log(`游戏事件: ${event.type}`, event);
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
    
    if (gameState.phase === 'WAITING' && gameState.players.length >= 2) {
      const startResult = this.game.startNewHand();
      
      if (startResult) {
        console.log('新一轮游戏开始！');
        
        // 广播游戏开始事件
        this.playerRegistry.broadcastToAll(
          createGameEventMessage('GAME_STARTED')
        );
        
        // 广播状态
        this.broadcastGameState();
        return true;
      }
    }
    return false;
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

// 创建并启动服务器  
const port = process.env.PORT || 3001;
const server = new PokerServer(port);
server.start();

export default PokerServer;