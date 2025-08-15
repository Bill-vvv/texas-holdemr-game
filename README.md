# 德州扑克 - 完整功能版

基于KISS和YAGNI原则开发的完整德州扑克游戏系统，支持多人实时对战、摊牌结果展示、整局结算、数据持久化和回放功能。

## 🎯 项目特点

- **完整Game Loop**: 从发牌到摊牌/弃牌结束的完整一轮流程
- **精确规则实现**: 严格按照标准德州扑克规则，处理复杂边界情况
- **实时多人游戏**: WebSocket实现的实时状态同步
- **摊牌结果展示**: 详细的获胜者信息，包括牌型、最佳五张牌和底牌使用情况
- **整局结算统计**: 房主可手动结束整局，查看完整的盈亏统计和会话数据
- **持久化系统**: 完整的数据持久化，支持游戏状态保存和恢复
- **双模式回放**: 公共模式和管理员模式的游戏回放功能
- **模块化设计**: 清晰的职责分离，单文件<200行限制
- **全测试覆盖**: 完整的单元测试和集成测试覆盖

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm

### 安装依赖
```bash
npm install
```

### 启动游戏服务器
```bash
npm start
```

服务器启动后访问 http://localhost:3001 开始游戏

### 持久化配置（可选）
```bash
# 启用持久化功能
PERSIST_ENABLED=true npm start

# 启用私有事件日志（管理员模式回放）
PERSIST_ENABLED=true PERSIST_PRIVATE=true npm start

# 自定义数据目录
PERSIST_ENABLED=true DATA_DIR=./custom-data npm start
```

### 运行测试
```bash
npm test
```

## 🎮 游戏功能

### 支持的游戏特性
- ✅ 2-9人桌游戏
- ✅ 标准德州扑克规则
- ✅ 精确的行动顺序（双人局特例处理）
- ✅ All-in和多层边池处理
- ✅ 完整的动作验证（check/bet/call/raise/fold/all-in）
- ✅ 实时游戏状态同步
- ✅ 增购（仅局间允许）
- ✅ **摊牌结果详细展示**（阶段1.5）
- ✅ **房主手动结束整局功能**（阶段1.5）
- ✅ **完整的盈亏统计和会话数据**（阶段1.5）

### 持久化功能（阶段三）
- ✅ **游戏状态自动保存**: 手局开始时创建快照检查点
- ✅ **事件日志记录**: 完整的游戏事件追踪（公共/私有双日志）
- ✅ **服务器状态恢复**: 重启后自动恢复到上次完整手局后状态
- ✅ **双模式回放**: 公共模式（一般用户）和管理员模式（100%保真）
- ✅ **管理员API**: 查询会话、事件流和触发回放的HTTP端点

### 当前限制
- 文件系统存储（生产环境可扩展到数据库）
- 基础UI（功能完整但界面简单）

## 📁 项目结构

```
src/
├── game/              # 游戏逻辑核心
│   ├── Game.js           # 聚合根，协调所有模块
│   ├── GameState.js      # 游戏状态管理
│   ├── TurnManager.js    # 回合和行动管理
│   ├── BlindsManager.js  # 盲注管理
│   ├── actions/          # 动作处理
│   │   ├── ActionValidator.js  # 动作验证
│   │   └── ActionApplier.js    # 动作应用
│   ├── pot/              # 彩池管理
│   │   └── PotManager.js       # 边池构建和分配
│   ├── core/             # 基础工具
│   │   ├── Deck.js             # 52张牌管理
│   │   └── HandEvaluator.js    # 牌力评估
│   ├── rules/            # 游戏规则
│   │   └── TableRules.js       # 桌面规则配置
│   └── replay/           # 回放系统（阶段三）
│       ├── ReplayEngine.js     # 双模式回放引擎
│       └── ScriptedDeck.js     # 受控发牌机制
├── server/            # 服务端
│   ├── server.js         # HTTP/WebSocket服务器
│   ├── playerRegistry.js # 玩家连接管理
│   ├── protocol.js       # 通信协议定义
│   ├── persistence/      # 持久化系统（阶段三）
│   │   ├── EventLogger.js      # 公共事件记录器
│   │   ├── PrivateEventLogger.js # 私有事件记录器
│   │   ├── SnapshotManager.js  # 快照管理器
│   │   └── storage/            # 存储抽象层
│   │       ├── Storage.js      # 存储接口定义
│   │       ├── FileStorage.js  # 文件系统存储实现
│   │       ├── FileStorageHelpers.js # 文件操作工具
│   │       └── StreamReader.js # 流式事件读取器
│   └── handlers/         # 消息处理器
└── ui/                # 用户界面
    └── public/
        ├── index.html    # 游戏界面
        └── client.js     # 客户端逻辑
```

## 🔧 技术架构

### 后端架构
- **Node.js + Express**: HTTP服务器和静态文件服务
- **Socket.IO**: WebSocket实时通信
- **聚合根模式**: Game作为游戏逻辑的统一入口
- **事件驱动**: 基于游戏事件的状态更新和通知
- **模块化设计**: 清晰的职责分离和依赖关系

### 前端架构
- **原生JavaScript**: 无框架依赖，轻量级实现
- **WebSocket客户端**: 实时状态同步
- **响应式设计**: 支持移动端和桌面端

### 持久化架构（阶段三）
- **双日志系统**: 公共事件日志 + 私有事件日志（可选）
- **快照检查点**: 手局开始时保存游戏状态快照
- **存储抽象层**: 支持文件系统存储，可扩展到数据库
- **回放引擎**: 基于快照+事件流的双模式回放
- **状态恢复**: 服务器重启时自动恢复到一致性状态

### 核心算法
- **Fisher-Yates洗牌**: 确保随机性
- **多层边池算法**: 精确处理All-in场景
- **精确回合闭合**: 基于状态模型的回合判定
- **牌力评估**: 封装pokersolver库提供统一接口
- **事件流重放**: 确定性的游戏状态重建

## 📊 测试覆盖

项目包含完整的测试套件，覆盖所有核心功能：

### 单元测试
- **Deck**: 洗牌、发牌、牌堆管理 (9个测试)
- **HandEvaluator**: 牌型识别、大小比较 (15个测试)  
- **GameState**: 状态管理、序列化 (13个测试)
- **ActionValidator**: 动作规则验证 (25个测试)
- **ActionApplier**: 状态变更应用 (20个测试)
- **PotManager**: 边池构建和分配 (18个测试)
- **TurnManager**: 行动顺序和回合管理 (16个测试)
- **BlindsManager**: 盲注设置和位置管理 (17个测试)
- **TableRules**: 规则配置和验证 (13个测试)

### 集成测试
- **Game**: 完整游戏流程集成测试 (19个测试)

### 持久化测试（阶段三）
- **FileStorage**: 文件系统存储、原子操作、并发安全
- **EventLogger**: 事件记录、序号管理、批量操作
- **SnapshotManager**: 快照保存、读取、状态恢复
- **ReplayEngine**: 双模式回放、状态验证
- **ScriptedDeck**: 受控发牌、接口兼容性

### 端到端测试
- **完整游戏流程**: 从玩家加入到结算的完整测试
- **持久化链路**: 数据保存→读取→回放的端到端验证
- **状态恢复**: 服务器重启后状态一致性验证

运行 `npm test` 查看详细测试结果。

## 🎲 游戏规则

### 基本规则
- **No-Limit Texas Hold'em**: 无限注德州扑克
- **盲注结构**: 小盲/大盲 = 10/20（可配置）
- **买入范围**: 800-2000筹码（可配置）

### 特殊规则处理
- **双人局**: 按钮位即小盲，Preflop先行动，Postflop后行动
- **All-in**: 支持不足最小加注的All-in，正确处理非完整加注
- **边池**: 多层边池构建，按投入金额阶梯分层
- **余数分配**: 按钮位后顺时针顺序分配不可整除的筹码

## 🛠️ 开发指南

### 代码规范
- **单文件限制**: 每个源文件不超过200行
- **KISS原则**: 保持简单，优先可读性
- **模块职责单一**: 清晰的接口和依赖关系
- **完整测试**: 所有核心逻辑都有对应测试用例

### 开发命令
```bash
# 开发模式（监听文件变化自动重启）
npm run dev

# 生产模式
npm start

# 运行测试
npm test

# 健康检查
curl http://localhost:3001/health
```

### 扩展指南
1. **新增游戏规则**: 修改 `TableRules.js`
2. **新增动作类型**: 扩展 `ActionValidator.js` 和 `ActionApplier.js`
3. **UI改进**: 修改 `ui/public/` 下的文件
4. **新增事件**: 在 `protocol.js` 中定义事件类型

## 📝 API文档

### WebSocket消息

#### 加入游戏
```javascript
// 发送
{
  type: 'join_game',
  payload: {
    playerName: 'Alice',
    buyIn: 1000
  }
}

// 响应
{
  type: 'connection_success',
  data: {
    playerId: 'Alice_1692345678_abc123',
    playerName: 'Alice'
  }
}
```

#### 执行动作
```javascript
// 发送
{
  type: 'player_action',
  payload: {
    action: 'raise',  // check/bet/call/raise/fold/all_in
    amount: 100       // bet/raise/all_in时需要
  }
}
```

#### 游戏状态更新
```javascript
// 服务端广播
{
  type: 'game_state',
  data: {
    street: 'FLOP',
    players: [...],
    communityCards: ['AH', 'KD', 'QS'],
    pots: { totalAmount: 300 },
    currentTurn: 'playerId',
    amountToCall: 50
  }
}
```

### HTTP端点
- `GET /`: 游戏界面
- `GET /health`: 服务器状态

### 管理员API（阶段三）
- `GET /admin/sessions`: 列出所有会话
- `GET /admin/sessions/:id/meta`: 获取会话基本信息
- `GET /admin/sessions/:id/events?fromSeq=N`: 流式返回公共事件
- `GET /admin/sessions/:id/replay?mode=public|admin`: 触发会话回放

#### 管理员API示例
```bash
# 列出所有会话
curl http://localhost:3001/admin/sessions

# 获取指定会话信息
curl http://localhost:3001/admin/sessions/session_123/meta

# 获取事件流（从序号10开始）
curl http://localhost:3001/admin/sessions/session_123/events?fromSeq=10

# 公共模式回放验证
curl "http://localhost:3001/admin/sessions/session_123/replay?mode=public"

# 管理员模式回放（需要私有日志）
curl "http://localhost:3001/admin/sessions/session_123/replay?mode=admin"
```

## 🔄 项目进度

### ✅ 阶段一：游戏核心逻辑 (已完成)
- 完整的德州扑克游戏规则实现
- 多人实时对战功能
- All-in和边池处理
- 精确的行动顺序和回合管理
- 完整的单元测试覆盖

### ✅ 阶段1.5：摊牌和结算功能 (已完成)
- 摊牌结果详细展示（获胜牌型、最佳五张牌）
- 房主手动结束整局功能
- 完整的盈亏统计和会话数据
- 增强的用户界面和用户体验

### ✅ 阶段三：持久化与回放系统 (已完成)
- 游戏状态自动保存和恢复
- 双日志事件记录（公共/私有）
- 双模式回放引擎
- 管理员查询API
- 服务器重启状态恢复

### 🔄 后续扩展规划

#### 阶段四：生产优化
- Docker容器化部署
- 性能监控和告警
- 负载均衡支持
- 数据库存储后端（MongoDB/PostgreSQL）
- HTTPS和安全强化

#### 阶段五：功能增强
- 前端回放播放器UI
- 多桌游戏支持
- 高级统计和分析功能
- 用户权限和管理系统
- 移动端原生应用

#### 阶段六：运维和分析
- 管理员面板
- 游戏数据分析工具
- 系统健康监控
- 自动化运维脚本
- 备份和灾难恢复

## 🤝 贡献指南

1. Fork项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开Pull Request

### 开发原则
- 遵循KISS和YAGNI原则
- 保持单文件<200行限制
- 为新功能编写测试用例
- 更新相关文档

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🎮 立即体验

1. 克隆仓库: `git clone <repo-url>`
2. 安装依赖: `npm install`  
3. 启动服务器: `npm start`
4. 打开浏览器: http://localhost:3001
5. 邀请朋友一起游戏！

---

**享受德州扑克的乐趣！** 🃏♠️♥️♦️♣️