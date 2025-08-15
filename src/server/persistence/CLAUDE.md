# 持久化模块文档

## 模块概述
persistence目录包含德州扑克阶段三持久化功能的核心实现，负责游戏状态快照保存、事件日志记录和数据恢复。

## 设计原则
- **单一数据源**: events.ndjson作为唯一权威数据源，快照仅作为性能优化的检查点
- **最小侵入**: 不修改现有Game聚合根和游戏逻辑，仅在server.js添加持久化钩子
- **原子操作**: 所有写操作确保原子性，避免数据损坏
- **并发安全**: 支持多进程安全的事件追加写入
- **KISS原则**: 优先文件系统存储，避免过度工程化

## 子模块索引
- **[@storage/CLAUDE.md](#存储层模块)** - 存储抽象层和文件系统实现

---

# SnapshotManager 模块文档

## 概述
SnapshotManager负责在手局开始时保存会话快照，作为恢复的检查点。专注于公共信息快照，剔除私有信息，严格控制在200行内。

## 功能特性
- 手局开始时机触发快照保存
- 公共信息快照（剔除未揭示底牌）
- 会话快照格式管理
- 快照读取和验证
- 游戏状态恢复
- 配置开关控制

## 核心API

### 快照保存
```javascript
// 在手局开始后保存快照
const success = await snapshotManager.saveHandStartSnapshot(sessionId, gameState);

// 检查功能是否启用
const enabled = snapshotManager.isEnabled();
```

### 快照读取
```javascript
// 读取最新会话快照
const snapshot = await snapshotManager.readSnapshot(sessionId);

// 获取快照元信息
const metadata = await snapshotManager.getSnapshotMetadata(sessionId);

// 检查快照是否存在
const exists = await snapshotManager.snapshotExists(sessionId);
```

### 状态恢复
```javascript
// 从快照恢复游戏状态
const success = snapshotManager.restoreFromSnapshot(gameState, snapshot);
```

## 快照格式
```javascript
{
  meta: {
    version: 1,                    // 快照格式版本
    savedAt: 1730000000000,       // 保存时间戳
    type: 'hand_start',           // 快照类型
    handNumber: 14                // 手局编号
  },
  session: {
    id: 'session_xxx',           // 会话ID
    startedAt: 1729990000000,    // 会话开始时间
    handsPlayed: 13              // 已玩手数
  },
  gameState: {
    // 公共游戏状态，已剔除holeCards等私密信息
    gameId: 'game_123',
    street: 'PRE_FLOP',
    phase: 'PLAYING',
    players: [{
      id: 'player1',
      name: 'Alice',
      chips: 1000,
      status: 'ACTIVE'
      // 注意：无holeCards字段
    }],
    // ... 其他公共状态
  }
}
```

## 私有信息剔除策略
快照管理器确保敏感信息不被持久化：
- **holeCards**: 未揭示的底牌被完全移除
- **临时对象**: 任何临时引用被清理
- **验证机制**: 自动检测并拒绝包含私有信息的快照

## 触发时机
- **仅在手局开始后**: HAND_STARTED事件写入events.ndjson后触发
- **覆盖写入**: 每次保存都覆盖之前的快照
- **单一检查点**: 每个会话只保留最新的手局开始快照

## 配置控制
```javascript
// 环境变量控制
process.env.PERSIST_ENABLED = 'true';   // 启用持久化（默认false）

// 检查状态
const snapshotManager = new SnapshotManager(storage);
if (snapshotManager.isEnabled()) {
  // 执行快照操作
}
```

## 使用示例
```javascript
import SnapshotManager from './SnapshotManager.js';
import FileStorage from './storage/FileStorage.js';

// 初始化
const storage = new FileStorage('./data/sessions');
const snapshotManager = new SnapshotManager(storage);

// 手局开始时保存快照
if (gameEvent.type === 'HAND_STARTED') {
  const success = await snapshotManager.saveHandStartSnapshot(
    sessionId, 
    gameState
  );
  if (success) {
    console.log('快照保存成功');
  }
}

// 服务启动时恢复状态
const snapshot = await snapshotManager.readSnapshot(sessionId);
if (snapshot) {
  const restored = snapshotManager.restoreFromSnapshot(gameState, snapshot);
  if (restored) {
    console.log('状态恢复成功');
  }
}
```

## 错误处理
- **输入验证**: 验证sessionId和gameState有效性
- **格式验证**: 确保快照格式正确性
- **私有信息检测**: 自动检测并拒绝包含私有信息的快照
- **存储错误**: 优雅处理存储层异常
- **恢复失败**: 提供详细的错误信息

## 技术特点
- **轻量级**: 严格控制在<200行
- **无状态**: 所有方法无副作用
- **类型安全**: 完善的参数验证
- **性能优化**: 最小化内存使用
- **可测试**: 完整的单元测试覆盖

## 依赖关系
- **依赖**: Storage（存储抽象）、GameStateSerializer（序列化工具）
- **被依赖**: 服务端集成钩子

---

# EventLogger 模块文档

## 概述
EventLogger负责记录会话级的公共事件到events.ndjson文件，是持久化系统的核心组件之一。

## 功能特性
- 会话级事件追加记录
- 自动序号生成和时间戳
- 批量写入支持和错误处理
- 可选事件索引管理
- 流式读取和事件计数
- 配置开关控制

## 核心API

### 事件记录
```javascript
// 追加单个公共事件
const seq = await eventLogger.appendPublicEvent(sessionId, {
  type: 'PLAYER_ACTION',
  payload: { playerId: 'player1', action: 'bet', amount: 100 }
}, handNumber);

// 批量追加事件
const sequences = await eventLogger.appendBatch(sessionId, [
  { type: 'HAND_STARTED', payload: {} },
  { type: 'PLAYER_ACTION', payload: { playerId: 'p1', action: 'call' } }
], handNumber);
```

### 事件读取
```javascript
// 流式读取事件
for await (const event of eventLogger.streamEvents(sessionId, fromSeq)) {
  console.log(event.type, event.payload);
}

// 获取事件总数
const count = await eventLogger.getEventCount(sessionId);
```

### 配置控制
```javascript
// 环境变量控制
process.env.PERSIST_ENABLED = 'true';        // 启用持久化
process.env.EVENT_INDEX_ENABLED = 'false';   // 禁用索引（默认）
```

## 事件格式
```javascript
{
  seq: 1,                           // 自动递增序号
  t: 1730000000100,                // 时间戳
  sessionId: 'session_xxx',         // 会话ID
  handNumber: 14,                   // 手牌编号
  type: 'PLAYER_ACTION',           // 事件类型
  payload: {                       // 事件数据
    playerId: 'p1',
    action: 'bet',
    amount: 100
  }
}
```

## 技术特点
- **序号管理**: 会话级独立序号空间，支持并发安全
- **错误恢复**: 写入失败时自动回滚序号计数器
- **批量优化**: 支持批量写入提升性能
- **索引支持**: 可选的手号索引加速查找
- **流式处理**: 避免内存爆炸的流式读取
- **配置灵活**: 环境变量控制功能开关

---

# PrivateEventLogger 模块文档

## 概述
PrivateEventLogger负责记录会话的私有事件（发牌剧本等）到private.ndjson文件，支持100%保真的管理员级回放。

## 功能特性
- 私有事件安全记录
- 发牌剧本专门方法
- 独立序号管理
- 访问控制和权限验证
- 数据深拷贝保护
- 可选开启/关闭

## 核心API

### 发牌剧本记录
```javascript
// 记录牌堆洗牌
await privateLogger.logDeckShuffled(sessionId, orderedDeck);

// 记录底牌发放
await privateLogger.logHoleCardsDealt(sessionId, playerId, cards);

// 记录公共牌发放
await privateLogger.logCommunityCardsDealt(sessionId, street, cards);

// 记录随机种子
await privateLogger.logRandomSeed(sessionId, seed, source);
```

### 通用私有事件
```javascript
// 记录自定义私有事件
const seq = await privateLogger.appendPrivateEvent(sessionId, {
  type: 'CUSTOM_PRIVATE',
  payload: { secret: 'sensitive-data' }
});

// 批量记录
const sequences = await privateLogger.appendBatch(sessionId, events);
```

### 管理员读取
```javascript
// 流式读取私有事件（管理员权限）
for await (const event of privateLogger.streamPrivateEvents(sessionId)) {
  console.log(event.type, event.payload);
}

// 获取私有事件总数
const count = await privateLogger.getPrivateEventCount(sessionId);
```

## 私有事件格式
```javascript
{
  seq: 1,                          // 独立序号空间
  t: 1730000000050,               // 时间戳
  type: 'DECK_SHUFFLED',          // 私有事件类型
  payload: {                      // 私有数据
    orderedDeck: ['As', 'Kh', ...]
  }
  // 注意：不包含sessionId和handNumber，避免泄露
}
```

## 配置控制
```javascript
// 环境变量控制
process.env.PERSIST_ENABLED = 'true';   // 必须启用
process.env.PERSIST_PRIVATE = 'true';   // 启用私有日志（默认false）

// 检查状态
const enabled = privateLogger.isEnabled();
```

## 安全特性
- **访问控制**: 默认禁用，需明确启用
- **数据隔离**: 不包含会话标识，避免意外泄露
- **深拷贝**: 输入数据自动深拷贝，防止外部修改
- **独立序号**: 与公共事件完全独立的序号空间
- **权限验证**: 流式读取需要管理员权限

## 使用场景
- **100%保真回放**: 管理员模式下完全重现游戏过程
- **调试和审计**: 排查游戏逻辑问题
- **合规要求**: 满足监管部门的完整记录需求
- **作弊检测**: 分析异常的发牌模式

---

# 存储层模块文档

## 模块概述
storage目录提供持久化的存储抽象层，支持快照保存、事件追加和流式读取。

---

# Storage 抽象接口文档

## 概述
Storage类定义了持久化存储的统一接口，为不同存储后端（文件系统、Redis、数据库等）提供抽象层。

## 功能特性
- 会话快照的保存和读取
- 公共事件和私有事件的追加记录
- 会话管理和存在性检查
- 流式事件读取支持

## 核心接口

### 快照操作
```javascript
// 保存会话快照（覆盖写入）
await storage.saveSnapshot(sessionId, snapshotData);

// 读取会话快照
const snapshot = await storage.readSnapshot(sessionId);
```

### 事件操作
```javascript
// 追加公共事件
await storage.appendPublicEvent(sessionId, {
  seq: 1,
  t: Date.now(),
  sessionId: 'session_123',
  handNumber: 5,
  type: 'PLAYER_ACTION',
  payload: { playerId: 'player1', action: 'bet', amount: 100 }
});

// 追加私有事件（可选）
await storage.appendPrivateEvent(sessionId, {
  seq: 1,
  t: Date.now(),
  type: 'DECK_SHUFFLED',
  payload: { orderedDeck: ['AS', 'KH', ...] }
});
```

### 会话管理
```javascript
// 列出所有会话
const sessions = await storage.listSessions();
// 返回: [{ sessionId, startedAt, handsPlayed, lastModified }]

// 检查会话存在
const exists = await storage.sessionExists('session_123');
```

### 流式读取
```javascript
// 流式读取公共事件
for await (const event of storage.streamPublicEvents(sessionId, fromSeq)) {
  console.log('事件:', event);
}

// 流式读取私有事件（管理员模式）
for await (const event of storage.streamPrivateEvents(sessionId, fromSeq)) {
  console.log('私有事件:', event);
}
```

## 错误处理
Storage接口的实现类应该：
- 对文件不存在返回null或空迭代器
- 对权限错误、磁盘满等异常抛出详细错误信息
- 确保原子操作的事务性

## 依赖关系
- **依赖**: 无（纯抽象接口）
- **被依赖**: FileStorage、EventLogger、SnapshotManager等

---

# FileStorage 文件存储文档

## 概述
FileStorage是Storage接口的文件系统实现，基于本地文件系统提供持久化存储能力。

## 功能特性
- 基于`data/sessions/{sessionId}/`的目录结构
- 原子快照保存（临时文件+rename）
- 并发安全的事件追加（O_APPEND）
- 自动会话目录管理
- 损坏数据的容错处理
- **阶段二新增**: 批量事件写入和事件计数支持

## 文件布局
```
data/sessions/{sessionId}/
├── session.json        # 会话快照（原子写入）
├── events.ndjson       # 公共事件日志（追加写入）
├── private.ndjson      # 私有事件日志（可选）
└── events.idx          # 事件索引（可选）
```

### session.json格式
```json
{
  "meta": {
    "version": 1,
    "savedAt": 1730000000000
  },
  "session": {
    "id": "session_xxx",
    "startedAt": 1729990000000,
    "handsPlayed": 13
  },
  "gameState": {
    // GameState序列化输出，剔除holeCards等私密信息
  }
}
```

### events.ndjson格式
每行一个JSON事件对象：
```json
{"seq":1,"t":1730000000100,"sessionId":"session_xxx","handNumber":14,"type":"HAND_STARTED","payload":{}}
{"seq":2,"t":1730000000200,"sessionId":"session_xxx","handNumber":14,"type":"PLAYER_ACTION","payload":{"playerId":"p1","action":"bet","amount":100}}
```

### private.ndjson格式（可选）
```json
{"seq":1,"t":1730000000050,"type":"DECK_SHUFFLED","payload":{"orderedDeck":["As","Kh","..."]}}
{"seq":2,"t":1730000000150,"type":"HOLE_CARDS_DEALT","payload":{"playerId":"p1","cards":["Ah","Kd"]}}
```

## 阶段二扩展功能

### 批量事件写入
```javascript
// 批量追加公共事件
await storage.appendBatch(sessionId, events);

// 批量追加私有事件
await storage.appendPrivateBatch(sessionId, events);
```

### 事件计数
```javascript
// 获取公共事件总数
const publicCount = await storage.getEventCount(sessionId);

// 获取私有事件总数
const privateCount = await storage.getPrivateEventCount(sessionId);
```

### 可选索引支持
```javascript
// 更新事件索引（手号 -> 序号映射）
await storage.updateEventIndex(sessionId, handNumber, seq);

// 批量更新索引
await storage.batchUpdateEventIndex(sessionId, handNumber, sequences);
```

## 技术实现

### 原子写入机制
```javascript
async saveSnapshot(sessionId, data) {
  // 1. 写入临时文件
  const tempFile = `session.json.tmp.${Date.now()}`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  
  // 2. 原子重命名
  await fs.rename(tempFile, 'session.json');
}
```

### 并发安全追加
```javascript
async appendPublicEvent(sessionId, event) {
  // 使用fs.appendFile确保并发安全
  await fs.appendFile('events.ndjson', JSON.stringify(event) + '\n');
}
```

### 流式读取优化
```javascript
async *streamPublicEvents(sessionId, fromSeq = 0) {
  const fileStream = createReadStream('events.ndjson');
  const rl = createInterface({ input: fileStream });
  
  for await (const line of rl) {
    const event = JSON.parse(line);
    if (event.seq >= fromSeq) {
      yield event;
    }
  }
}
```

## 错误处理策略
- **文件不存在**: 返回null或空迭代器，不抛异常
- **权限错误**: 抛出详细错误信息
- **磁盘空间**: 抛出存储错误，建议清理
- **JSON解析错误**: 跳过损坏行，继续处理
- **写入失败**: 清理临时文件，抛出原因

## 使用示例
```javascript
import FileStorage from './FileStorage.js';

const storage = new FileStorage('./data/sessions');

// 保存快照
await storage.saveSnapshot('session_123', {
  meta: { version: 1, savedAt: Date.now() },
  session: { id: 'session_123', startedAt: Date.now(), handsPlayed: 0 },
  gameState: { /* 游戏状态 */ }
});

// 追加事件
await storage.appendPublicEvent('session_123', {
  seq: 1,
  t: Date.now(),
  sessionId: 'session_123',
  handNumber: 1,
  type: 'HAND_STARTED',
  payload: {}
});

// 批量追加（阶段二新增）
await storage.appendBatch('session_123', [
  { seq: 2, t: Date.now(), type: 'PLAYER_ACTION', /* ... */ },
  { seq: 3, t: Date.now(), type: 'FLOP_DEALT', /* ... */ }
]);

// 读取事件
for await (const event of storage.streamPublicEvents('session_123')) {
  console.log('事件:', event.type);
}

// 事件计数（阶段二新增）
const count = await storage.getEventCount('session_123');
console.log(`总共 ${count} 个公共事件`);
```

## 性能特点
- **写入性能**: 追加写入O(1)，快照写入O(size)
- **读取性能**: 流式读取避免内存爆炸
- **并发性**: 支持多进程安全的追加操作
- **存储效率**: NDJSON格式紧凑，易于解析
- **批量优化**: 批量写入减少系统调用开销

## 扩展性考虑
FileStorage的设计便于后续扩展：
- **压缩**: 可添加gzip压缩降低存储空间
- **分片**: 大文件可按手数或时间分片
- **索引**: 可添加events.idx加速查找
- **备份**: 支持增量备份和恢复

## 依赖关系
- **依赖**: Node.js fs/promises、path、readline
- **被依赖**: EventLogger、SnapshotManager、ReplayEngine

## 技术特点
- **原子性**: 使用临时文件+重命名确保写入原子性
- **容错性**: 损坏数据不影响整体功能
- **可维护性**: 文件格式人类可读，便于调试
- **跨平台**: 基于Node.js标准API，支持所有平台

## StreamReader辅助组件

### 概述
StreamReader专门负责从NDJSON文件中流式读取事件，支持序号过滤和错误恢复。

### 核心功能
```javascript
// 流式读取公共事件
for await (const event of streamReader.streamPublicEvents(sessionId, fromSeq)) {
  console.log(event);
}

// 流式读取私有事件
for await (const event of streamReader.streamPrivateEvents(sessionId, fromSeq)) {
  console.log(event);
}

// 统计事件数量（阶段二新增）
const count = await streamReader.countEvents(filePath);
```

### 错误恢复
- 自动跳过损坏的JSON行
- 文件不存在时返回空迭代器
- 继续处理而不中断整个流

FileStorage为阶段三持久化功能提供了可靠的存储基础，通过文件系统实现了高性能、高可靠性的数据持久化能力。