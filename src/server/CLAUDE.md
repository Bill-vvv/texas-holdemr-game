# 服务端模块文档

## 模块概述
server目录包含德州扑克的服务端实现，负责WebSocket通信、玩家管理和游戏状态同步。

---

# Server 模块文档

## 概述
server.js是德州扑克的主服务器文件，集成HTTP服务器、Socket.IO和游戏逻辑，提供完整的端到端Game Loop服务。

## 功能特性
- HTTP/WebSocket服务器（Express + Socket.IO）
- 静态文件服务（UI资源）
- 实时游戏状态广播
- 玩家连接管理
- 游戏事件处理
- 健康检查端点

## 架构设计
```
PokerServer 类
├── Express应用 (静态文件 + API)
├── HTTP服务器
├── Socket.IO (WebSocket通信)
├── PlayerRegistry (玩家管理)
└── Game (游戏逻辑聚合根)
```

## 核心方法

### 服务器生命周期
- `setupServer()` - 初始化HTTP和Socket.IO
- `setupSocketHandlers()` - 设置WebSocket事件处理
- `start()` - 启动服务器
- `stop()` - 停止服务器

### 消息处理
- `handleClientMessage()` - 统一客户端消息处理
- `handlePlayerJoin()` - 玩家加入处理
- `handlePlayerAction()` - 游戏动作处理
- `handlePlayerLeave()` - 玩家离开处理

### 状态管理
- `broadcastGameState()` - 广播游戏状态给所有玩家
- `handleGameEvents()` - 处理并广播游戏事件
- `tryStartGame()` - 尝试开始新游戏

## API端点

### HTTP端点
- `GET /` - 静态文件服务（游戏UI）
- `GET /health` - 健康检查
  ```json
  {
    "status": "ok",
    "playerCount": 2,
    "gamePhase": "PLAYING",
    "timestamp": "2025-08-13T18:00:00.000Z"
  }
  ```

### WebSocket消息

#### 客户端到服务端
- `join_game` - 加入游戏请求
- `player_action` - 玩家动作
- `request_game_state` - 请求游戏状态
- `leave_game` - 离开游戏

#### 服务端到客户端
- `connection_success` - 连接成功
- `game_state` - 游戏公共状态
- `private_state` - 玩家私有状态（手牌）
- `game_event` - 游戏事件通知
- `action_error` - 动作错误

## 使用示例

### 启动服务器
```bash
npm start
# 或者
PORT=3001 npm start
```

### 客户端连接示例
```javascript
const socket = io('http://localhost:3001');

// 加入游戏
socket.emit('message', {
  type: 'join_game',
  payload: {
    playerName: 'Alice',
    buyIn: 1000
  }
});

// 执行动作
socket.emit('message', {
  type: 'player_action', 
  payload: {
    action: 'raise',
    amount: 100
  }
});
```

## 游戏流程
1. **玩家连接** → PlayerRegistry注册 → 加入Game
2. **人数满足** → 自动开始新一轮
3. **玩家动作** → Game处理 → 广播状态更新
4. **游戏事件** → 广播事件通知
5. **游戏结束** → 等待下一轮或玩家离开

## 技术特点
- **实时通信**: Socket.IO提供稳定的WebSocket连接
- **全量广播**: 采用全量状态广播，简化同步逻辑
- **事件驱动**: 游戏事件自动广播给所有玩家
- **错误处理**: 完善的错误处理和回滚机制
- **健康检查**: 提供服务监控端点

## 依赖关系
- **依赖**: express, socket.io, Game, PlayerRegistry, protocol
- **被依赖**: 客户端UI (client.js)

---

# PlayerRegistry 模块文档

## 概述
PlayerRegistry负责管理玩家与Socket连接的映射关系，处理玩家注册、注销和消息发送。

## 功能特性
- 双向映射（playerId ↔ socketId）
- 玩家名称唯一性检查
- 消息发送和广播
- 连接状态管理

## 核心方法
- `registerPlayer()` - 注册新玩家连接
- `unregisterPlayer()` - 注销玩家连接
- `sendToPlayer()` - 向特定玩家发送消息
- `broadcastToAll()` - 向所有玩家广播消息
- `getActivePlayerIds()` - 获取活跃玩家列表

## 使用示例
```javascript
const registry = new PlayerRegistry();

// 注册玩家
const result = registry.registerPlayer(socketId, socket, 'Alice', 1000);
if (result.success) {
  console.log('玩家注册成功:', result.playerId);
}

// 广播消息
registry.broadcastToAll({
  type: 'game_state',
  data: gameState
});
```

---

# Protocol 模块文档

## 概述
Protocol定义客户端和服务端之间的通信协议，提供消息类型常量和验证函数。

## 功能特性
- 消息类型标准化
- 客户端消息验证
- 错误类型定义
- 消息构造工具函数
- **阶段1.5新增**: 房主结束整局协议支持

## 主要常量
- `CLIENT_MESSAGES` - 客户端消息类型
- `SERVER_MESSAGES` - 服务端消息类型
- `PLAYER_ACTIONS` - 玩家动作类型
- `GAME_EVENTS` - 游戏事件类型
- `ERROR_TYPES` - 错误类型

## 阶段1.5新增消息类型

### 客户端消息
- `HOST_END_GAME` - 房主结束整局请求
  ```javascript
  {
    type: 'host_end_game',
    payload: {}  // 无需额外参数
  }
  ```

### 服务端消息
- `GAME_ENDED` - 整局结束通知
  ```javascript
  {
    type: 'game_ended',
    data: {
      sessionId: 'session_123',
      startedAt: 1692345678901,
      endedAt: 1692349278901,
      handsPlayed: 15,
      totalChips: 3000,
      perPlayer: [{
        playerId: 'player1',
        playerName: 'Alice',
        baseline: 1000,
        current: 1500,
        pnl: +500
      }]
    }
  }
  ```

### 错误类型
- `SESSION_NOT_INITIALIZED` - 会话未初始化
- `NOT_ROOM_HOST` - 非房主操作

## 工具函数
- `validateClientMessage()` - 验证客户端消息
- `createServerMessage()` - 创建服务端消息
- `createErrorMessage()` - 创建错误消息
- `createGameEventMessage()` - 创建游戏事件消息

## 使用示例
```javascript
import { createServerMessage, SERVER_MESSAGES, CLIENT_MESSAGES } from './protocol.js';

const message = createServerMessage(SERVER_MESSAGES.GAME_STATE, gameState);
socket.emit('message', message);

// 阶段1.5新增：房主结束整局
// 客户端发送
socket.emit('message', {
  type: CLIENT_MESSAGES.HOST_END_GAME,
  payload: {}
});

// 服务端响应
const endGameMessage = createServerMessage(SERVER_MESSAGES.GAME_ENDED, finalSettlement);
socket.broadcast.emit('message', endGameMessage);
```

## 消息格式

### 标准消息结构
```javascript
{
  type: 'message_type',
  data: { /* 消息数据 */ },
  timestamp: 1692345678901
}
```

### 错误消息结构
```javascript
{
  type: 'action_error',
  data: {
    error: 'INVALID_ACTION',
    message: '具体错误描述'
  },
  timestamp: 1692345678901
}
```

---

## 阶段1.5服务端功能增强

### 房主结束整局处理
服务端新增`handleHostEndGame()`方法，专门处理房主的结束整局请求：

```javascript
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
```

### 消息处理扩展
在`handleClientMessage()`方法中新增对`HOST_END_GAME`消息的处理：

```javascript
switch (message.type) {
  // ... 现有消息类型处理
  
  case CLIENT_MESSAGES.HOST_END_GAME:  // 阶段1.5新增
    this.handleHostEndGame(socket);
    break;
    
  // ... 其他处理
}
```

### 权限验证
- **双重验证**: 客户端UI层面隐藏非房主按钮，服务端再次验证房主身份
- **状态检查**: 确保会话已初始化才能执行结束操作
- **错误处理**: 提供详细的错误信息和错误类型

### 数据广播
- **全员通知**: 使用`broadcastToAll()`向所有玩家发送结束消息
- **完整数据**: 包含完整的结算统计数据
- **即时响应**: 房主操作后立即生效并通知

### 日志记录
```javascript
console.log(`房主 ${playerId} 结束了整局`);
```
记录房主操作，便于服务端监控和调试。

### 集成现有系统
- **PlayerRegistry**: 利用现有的房主权限检查功能
- **Game聚合根**: 调用新增的`endSession()`方法
- **Protocol**: 使用标准化的消息创建和错误处理

### 使用流程
1. **客户端**: 房主点击"结束整局"按钮
2. **前端验证**: 确认操作并发送`HOST_END_GAME`消息
3. **服务端验证**: 检查玩家身份和房主权限
4. **游戏处理**: 调用`game.endSession()`生成结算数据
5. **结果广播**: 向所有玩家发送`GAME_ENDED`消息
6. **客户端处理**: 显示整局结算界面

### 技术特点
- **权限控制**: 严格的房主身份验证
- **状态管理**: 确保会话状态的一致性
- **错误友好**: 提供清晰的错误提示
- **即时同步**: 所有玩家同时收到结束通知
- **数据完整**: 包含详细的会话统计信息

服务端模块为德州扑克游戏提供了完整的后端支持，通过清晰的模块分离和标准化的通信协议，实现了稳定可靠的实时多人游戏服务。