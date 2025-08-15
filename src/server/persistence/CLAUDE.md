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

## 文件布局
```
data/sessions/{sessionId}/
├── session.json        # 会话快照（原子写入）
├── events.ndjson       # 公共事件日志（追加写入）
└── private.ndjson      # 私有事件日志（可选）
```

### session.json格式
```json
{
  \"meta\": {
    \"version\": 1,
    \"savedAt\": 1730000000000
  },
  \"session\": {
    \"id\": \"session_xxx\",
    \"startedAt\": 1729990000000,
    \"handsPlayed\": 13
  },
  \"gameState\": {
    // GameState序列化输出，剔除holeCards等私密信息
  }
}
```

### events.ndjson格式
每行一个JSON事件对象：
```json
{\"seq\":1,\"t\":1730000000100,\"sessionId\":\"session_xxx\",\"handNumber\":14,\"type\":\"HAND_STARTED\",\"payload\":{}}
{\"seq\":2,\"t\":1730000000200,\"sessionId\":\"session_xxx\",\"handNumber\":14,\"type\":\"PLAYER_ACTION\",\"payload\":{\"playerId\":\"p1\",\"action\":\"bet\",\"amount\":100}}
```

### private.ndjson格式（可选）
```json
{\"seq\":1,\"t\":1730000000050,\"type\":\"DECK_SHUFFLED\",\"payload\":{\"orderedDeck\":[\"As\",\"Kh\",\"...\"]}}
{\"seq\":2,\"t\":1730000000150,\"type\":\"HOLE_CARDS_DEALT\",\"payload\":{\"playerId\":\"p1\",\"cards\":[\"Ah\",\"Kd\"]}}
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
  await fs.appendFile('events.ndjson', JSON.stringify(event) + '\\n');
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

// 读取事件
for await (const event of storage.streamPublicEvents('session_123')) {
  console.log('事件:', event.type);
}
```

## 性能特点
- **写入性能**: 追加写入O(1)，快照写入O(size)
- **读取性能**: 流式读取避免内存爆炸
- **并发性**: 支持多进程安全的追加操作
- **存储效率**: NDJSON格式紧凑，易于解析

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

FileStorage为阶段三持久化功能提供了可靠的存储基础，通过文件系统实现了高性能、高可靠性的数据持久化能力。