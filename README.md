# 德州扑克 - Game Loop MVP

基于KISS和YAGNI原则开发的德州扑克游戏，实现完整的一轮游戏流程，支持2-3人桌，包含All-in和边池处理。

## 🎯 项目特点

- **完整Game Loop**: 从发牌到摊牌/弃牌结束的完整一轮流程
- **精确规则实现**: 严格按照标准德州扑克规则，处理复杂边界情况
- **实时多人游戏**: WebSocket实现的实时状态同步
- **模块化设计**: 清晰的职责分离，单文件<200行限制
- **全测试覆盖**: 172个测试用例，覆盖所有核心逻辑

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

### 运行测试
```bash
npm test
```

## 🎮 游戏功能

### 支持的游戏特性
- ✅ 2-3人桌游戏
- ✅ 标准德州扑克规则
- ✅ 精确的行动顺序（双人局特例处理）
- ✅ All-in和多层边池处理
- ✅ 完整的动作验证（check/bet/call/raise/fold/all-in）
- ✅ 实时游戏状态同步
- ✅ 增购（仅局间允许）

### 当前限制（MVP范围）
- 最多3人同时游戏
- 无超时机制
- 无断线重连
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
│   └── rules/            # 游戏规则
│       └── TableRules.js       # 桌面规则配置
├── server/            # 服务端
│   ├── server.js         # HTTP/WebSocket服务器
│   ├── playerRegistry.js # 玩家连接管理
│   └── protocol.js       # 通信协议定义
└── ui/                # 用户界面
    └── public/
        ├── index.html    # 游戏界面
        └── client.js     # 客户端逻辑
```

## 🔧 技术架构

### 后端架构
- **Node.js + Express**: HTTP服务器和静态文件服务
- **Socket.IO**: WebSocket实时通信
- **模块化设计**: 清晰的职责分离和依赖关系

### 前端架构
- **原生JavaScript**: 无框架依赖，轻量级实现
- **WebSocket客户端**: 实时状态同步
- **响应式设计**: 支持移动端和桌面端

### 核心算法
- **Fisher-Yates洗牌**: 确保随机性
- **多层边池算法**: 精确处理All-in场景
- **精确回合闭合**: 基于状态模型的回合判定
- **牌力评估**: 封装pokersolver库提供统一接口

## 📊 测试覆盖

项目包含172个测试用例，覆盖：

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

## 🔄 后续计划

### 阶段二：玩家生命周期
- 断线重连机制
- 玩家加入/离开处理
- 等待队列管理
- 简单结算记录

### 阶段三：持久化
- 游戏状态持久化
- Redis/MongoDB支持
- 数据恢复机制

### 阶段四：UI优化
- 高质量卡面设计
- 动画和特效
- 响应式布局优化
- 音效支持

### 阶段五：生产部署
- PM2进程管理
- Nginx反向代理
- HTTPS支持
- CI/CD流水线

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