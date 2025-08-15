# Storage 模块文档

## 模块概述
storage目录包含德州扑克阶段三持久化功能的存储抽象层，提供统一的存储接口和文件系统实现，支持快照保存、事件追加和流式读取。

## 设计原则
- **抽象分离**: Storage接口与具体实现分离，支持多种存储后端
- **原子操作**: 所有写操作确保原子性，避免数据损坏
- **流式处理**: 支持大文件的流式读取，避免内存爆炸
- **错误容错**: 优雅处理文件损坏、权限错误等异常情况
- **职责分离**: 通过辅助类实现功能模块化

## 模块组件
- **Storage.js** - 存储抽象接口定义
- **FileStorage.js** - 文件系统存储实现
- **FileStorageHelpers.js** - 文件操作辅助工具
- **StreamReader.js** - 流式事件读取器

---

# Storage 抽象接口文档

## 概述
Storage类定义了持久化存储的统一接口，为不同存储后端（文件系统、Redis、数据库等）提供抽象层。所有方法都是抽象的，需要具体实现类来提供功能。

## 功能特性
- 会话快照的保存和读取
- 公共事件和私有事件的追加记录
- 会话管理和存在性检查
- 流式事件读取支持
- 统一的错误处理规范

## 核心接口

### 快照操作
```javascript
/**
 * 保存会话快照（覆盖写入）
 * @param {string} sessionId - 会话ID
 * @param {Object} data - 快照数据对象
 * @returns {Promise<void>}
 */
async saveSnapshot(sessionId, data);

/**
 * 读取会话快照
 * @param {string} sessionId - 会话ID  
 * @returns {Promise<Object>} 快照数据对象
 */
async readSnapshot(sessionId);

/**
 * 读取会话信息（与readSnapshot等价）
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Object>} 会话数据对象
 */
async readSession(sessionId);
```

### 事件操作
```javascript
/**
 * 追加公共事件到日志
 * @param {string} sessionId - 会话ID
 * @param {Object} event - 事件对象
 * @returns {Promise<void>}
 */
async appendPublicEvent(sessionId, event);

/**
 * 追加私有事件到日志（可选功能）
 * @param {string} sessionId - 会话ID
 * @param {Object} event - 私有事件对象
 * @returns {Promise<void>}
 */
async appendPrivateEvent(sessionId, event);
```

### 会话管理
```javascript
/**
 * 列出所有会话
 * @returns {Promise<Array>} 会话信息数组
 */
async listSessions();

/**
 * 检查会话是否存在
 * @param {string} sessionId - 会话ID
 * @returns {Promise<boolean>} 是否存在
 */
async sessionExists(sessionId);
```

### 流式读取
```javascript
/**
 * 流式读取公共事件（支持从指定序号开始）
 * @param {string} sessionId - 会话ID
 * @param {number} fromSeq - 起始序号，默认0
 * @returns {AsyncIterator<Object>} 事件对象迭代器
 */
async *streamPublicEvents(sessionId, fromSeq = 0);

/**
 * 流式读取私有事件（管理员模式，可选功能）
 * @param {string} sessionId - 会话ID
 * @param {number} fromSeq - 起始序号，默认0
 * @returns {AsyncIterator<Object>} 私有事件对象迭代器
 */
async *streamPrivateEvents(sessionId, fromSeq = 0);
```

## 实现要求
Storage接口的实现类必须：
- **错误处理**: 对文件不存在返回null或空迭代器，对其他异常抛出详细错误信息
- **原子性**: 确保写操作的原子性和数据一致性
- **并发安全**: 支持多进程安全的并发访问
- **资源管理**: 正确管理文件句柄和内存使用

## 扩展接口
实现类可以提供额外的扩展功能：
- 批量事件写入
- 事件计数统计
- 索引管理
- 备份恢复

## 依赖关系
- **依赖**: 无（纯抽象接口）
- **被依赖**: FileStorage、EventLogger、SnapshotManager等

---

# FileStorage 文件存储文档

## 概述
FileStorage是Storage接口的文件系统实现，基于本地文件系统提供高性能、高可靠性的持久化存储能力。采用目录分层和辅助类设计，确保代码的可维护性。

## 功能特性
- 基于`data/sessions/{sessionId}/`的目录结构
- 原子快照保存（临时文件+rename操作）
- 并发安全的事件追加（O_APPEND模式）
- 自动会话目录管理
- 损坏数据的容错处理
- 批量事件写入优化
- 事件计数统计功能

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
每行一个JSON事件对象（NDJSON格式）：
```json
{\"seq\":1,\"t\":1730000000100,\"sessionId\":\"session_xxx\",\"handNumber\":14,\"type\":\"HAND_STARTED\",\"payload\":{}}
{\"seq\":2,\"t\":1730000000200,\"sessionId\":\"session_xxx\",\"handNumber\":14,\"type\":\"PLAYER_ACTION\",\"payload\":{\"playerId\":\"p1\",\"action\":\"bet\",\"amount\":100}}
```

### private.ndjson格式（可选）
```json
{\"seq\":1,\"t\":1730000000050,\"type\":\"DECK_SHUFFLED\",\"payload\":{\"orderedDeck\":[\"As\",\"Kh\",\"...\"]}}
{\"seq\":2,\"t\":1730000000150,\"type\":\"HOLE_CARDS_DEALT\",\"payload\":{\"playerId\":\"p1\",\"cards\":[\"Ah\",\"Kd\"]}}
```

## 核心方法

### 快照管理
```javascript
// 原子保存快照
await storage.saveSnapshot(sessionId, {
  meta: { version: 1, savedAt: Date.now() },
  session: { id: sessionId, startedAt: Date.now(), handsPlayed: 0 },
  gameState: { /* 游戏状态 */ }
});

// 读取快照
const snapshot = await storage.readSnapshot(sessionId);
```

### 事件操作
```javascript  
// 追加单个公共事件
await storage.appendPublicEvent(sessionId, {
  seq: 1,
  t: Date.now(),
  sessionId: sessionId,
  handNumber: 1,
  type: 'HAND_STARTED',
  payload: {}
});

// 追加私有事件
await storage.appendPrivateEvent(sessionId, {
  seq: 1,
  t: Date.now(),
  type: 'DECK_SHUFFLED',
  payload: { orderedDeck: ['AS', 'KH', ...] }
});
```

### 流式读取
```javascript
// 流式读取公共事件
for await (const event of storage.streamPublicEvents(sessionId, fromSeq)) {
  console.log('事件:', event.type);
}

// 流式读取私有事件
for await (const event of storage.streamPrivateEvents(sessionId, fromSeq)) {
  console.log('私有事件:', event.type);
}
```

## 技术实现

### 原子写入机制
使用临时文件+重命名确保写入原子性：
```javascript
async saveSnapshot(sessionId, data) {
  const sessionDir = await this.sessionDirManager.ensureSessionDir(sessionId);
  const snapshotFile = path.join(sessionDir, 'session.json');
  const content = JSON.stringify(data, null, 2);
  
  // FileOperations.atomicSave 实现原子写入
  await FileOperations.atomicSave(snapshotFile, content);
}
```

### 并发安全追加
利用文件系统的O_APPEND模式确保并发安全：
```javascript
async appendPublicEvent(sessionId, event) {
  const sessionDir = await this.sessionDirManager.ensureSessionDir(sessionId);
  const eventsFile = path.join(sessionDir, 'events.ndjson');
  const content = JSON.stringify(event) + '\\n';
  
  await fs.appendFile(eventsFile, content, { flag: 'a' });
}
```

### 流式读取优化
通过readline接口实现内存友好的流式读取：
```javascript
async *streamPublicEvents(sessionId, fromSeq = 0) {
  return this.streamReader.streamPublicEvents(sessionId, fromSeq);
}
```

## 错误处理策略
- **文件不存在**: 返回null或空迭代器，不抛异常
- **权限错误**: 抛出详细错误信息，包含文件路径和权限需求
- **磁盘空间不足**: 抛出存储错误，建议用户清理磁盘
- **JSON解析错误**: 跳过损坏行，记录警告，继续处理
- **写入失败**: 清理临时文件，抛出具体失败原因

## 使用示例

### 基本操作流程
```javascript
import FileStorage from './FileStorage.js';

// 初始化存储
const storage = new FileStorage('./data/sessions');

// 保存会话快照
await storage.saveSnapshot('session_123', {
  meta: { version: 1, savedAt: Date.now() },
  session: { id: 'session_123', startedAt: Date.now(), handsPlayed: 0 },
  gameState: { phase: 'WAITING', players: [] }
});

// 追加游戏事件
await storage.appendPublicEvent('session_123', {
  seq: 1,
  t: Date.now(),
  sessionId: 'session_123', 
  handNumber: 1,
  type: 'HAND_STARTED',
  payload: {}
});

// 流式读取事件
console.log('读取事件:');
for await (const event of storage.streamPublicEvents('session_123')) {
  console.log(`${event.seq}: ${event.type}`);
}
```

### 错误处理示例
```javascript
try {
  const snapshot = await storage.readSnapshot('nonexistent_session');
  if (!snapshot) {
    console.log('会话不存在');
  }
} catch (error) {
  console.error('读取快照失败:', error.message);
}

// 流式读取的错误恢复
for await (const event of storage.streamPublicEvents('session_123')) {
  // 损坏的事件行会被自动跳过
  console.log('有效事件:', event);
}
```

## 性能特点
- **写入性能**: 追加写入O(1)，快照写入O(size)
- **读取性能**: 流式读取避免内存爆炸，支持大文件
- **并发性**: 支持多进程安全的追加操作
- **存储效率**: NDJSON格式紧凑，易于解析和处理
- **目录管理**: 按会话分目录，避免单目录文件过多

## 依赖关系
- **依赖**: FileStorageHelpers、StreamReader、Node.js fs/promises
- **被依赖**: EventLogger、SnapshotManager、ReplayEngine

---

# FileStorageHelpers 辅助工具文档

## 概述
FileStorageHelpers提供FileStorage的辅助功能，通过职责分离保持主文件的简洁性。包含目录管理、文件操作和会话列表管理等工具类。

## 组件详解

### SessionDirManager - 会话目录管理器
负责会话目录的创建、检查和路径管理：

```javascript
export class SessionDirManager {
  constructor(dataDir);
  
  // 获取会话目录路径
  getSessionDir(sessionId);
  
  // 确保会话目录存在（自动创建）
  async ensureSessionDir(sessionId);
  
  // 检查会话是否存在
  async sessionExists(sessionId);
}
```

### FileOperations - 文件操作工具
提供原子文件操作和JSON读写功能：

```javascript
export class FileOperations {
  // 原子保存文件（临时文件+重命名）
  static async atomicSave(filePath, content);
  
  // 读取JSON文件
  static async readJSON(filePath);
  
  // 安全读取文件（不存在时返回null）
  static async safeReadFile(filePath);
}
```

### SessionListManager - 会话列表管理器
管理所有会话的列表和元信息：

```javascript
export class SessionListManager {
  constructor(sessionDirManager);
  
  // 列出所有会话
  async listSessions();
  
  // 获取会话元信息
  async getSessionInfo(sessionId);
}
```

## 技术实现

### 原子文件保存
```javascript
static async atomicSave(filePath, content) {
  const tempFile = `${filePath}.tmp.${Date.now()}`;
  
  try {
    await fs.writeFile(tempFile, content, 'utf8');
    await fs.rename(tempFile, filePath);  // 原子操作
  } catch (error) {
    // 清理临时文件
    try {
      await fs.unlink(tempFile);
    } catch (unlinkError) {
      // 忽略清理失败
    }
    throw error;
  }
}
```

### 安全JSON读取
```javascript
static async readJSON(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // 文件不存在返回null
    }
    throw new Error(`Failed to read JSON from ${filePath}: ${error.message}`);
  }
}
```

## 使用示例
```javascript
import { SessionDirManager, FileOperations } from './FileStorageHelpers.js';

// 目录管理
const dirManager = new SessionDirManager('./data/sessions');
const sessionDir = await dirManager.ensureSessionDir('session_123');

// 原子文件操作
const data = { key: 'value' };
const filePath = path.join(sessionDir, 'data.json');
await FileOperations.atomicSave(filePath, JSON.stringify(data, null, 2));

// 读取JSON
const loadedData = await FileOperations.readJSON(filePath);
```

## 依赖关系
- **依赖**: Node.js fs/promises、path
- **被依赖**: FileStorage

---

# StreamReader 流式读取器文档

## 概述
StreamReader专门负责从NDJSON文件中流式读取事件，支持序号过滤、错误恢复和内存优化的大文件处理。

## 功能特性
- 流式读取公共事件和私有事件
- 支持从指定序号开始读取
- 自动跳过损坏的JSON行
- 文件不存在时返回空迭代器
- 内存友好的流式处理

## 核心方法

### 事件流读取
```javascript
// 流式读取公共事件
async *streamPublicEvents(sessionId, fromSeq = 0);

// 流式读取私有事件
async *streamPrivateEvents(sessionId, fromSeq = 0);

// 通用文件流读取（内部方法）
async *_streamEventsFromFile(filePath, fromSeq = 0);
```

### 统计功能
```javascript
// 统计事件数量
async countEvents(filePath);

// 获取最后一个事件的序号
async getLastSequenceNumber(filePath);
```

## 技术实现

### 流式读取算法
```javascript
async *_streamEventsFromFile(filePath, fromSeq = 0) {
  try {
    const fileStream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({ 
      input: fileStream, 
      crlfDelay: Infinity  // 正确处理Windows行尾
    });
    
    for await (const line of rl) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          if (!event.seq || event.seq >= fromSeq) {
            yield event;
          }
        } catch (parseError) {
          // 跳过损坏的JSON行，继续处理
          console.warn(`跳过损坏的事件行: ${line}`);
        }
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 文件不存在，返回空流
      return;
    }
    throw error;
  }
}
```

### 错误恢复机制
- **JSON解析错误**: 跳过损坏行，记录警告，继续处理后续行
- **文件不存在**: 返回空迭代器，不抛异常
- **读取权限错误**: 抛出详细错误信息
- **流中断**: 优雅关闭文件流，释放资源

## 使用示例

### 基本流式读取
```javascript
import StreamReader from './StreamReader.js';
import { SessionDirManager } from './FileStorageHelpers.js';

// 初始化
const sessionDirManager = new SessionDirManager('./data/sessions');
const streamReader = new StreamReader(sessionDirManager);

// 流式读取所有公共事件
for await (const event of streamReader.streamPublicEvents('session_123')) {
  console.log(`事件 ${event.seq}: ${event.type}`);
}

// 从指定序号开始读取
for await (const event of streamReader.streamPublicEvents('session_123', 10)) {
  console.log('最新事件:', event);
}
```

### 错误处理示例
```javascript
// 自动跳过损坏数据
console.log('开始读取事件（自动跳过损坏行）:');
let eventCount = 0;

for await (const event of streamReader.streamPublicEvents('session_123')) {
  eventCount++;
  console.log(`有效事件 ${eventCount}: ${event.type}`);
}

console.log(`总共处理了 ${eventCount} 个有效事件`);
```

### 高级用法
```javascript
// 读取最近N个事件
const lastN = 10;
const events = [];

for await (const event of streamReader.streamPublicEvents('session_123')) {
  events.push(event);
  if (events.length > lastN) {
    events.shift(); // 保持数组长度为N
  }
}

console.log('最近的事件:', events);
```

## 性能特点
- **内存效率**: 流式处理，不会将整个文件加载到内存
- **容错性**: 自动跳过损坏数据，不影响整体处理
- **灵活性**: 支持从任意序号开始读取
- **资源管理**: 自动管理文件流的生命周期

## 依赖关系
- **依赖**: Node.js fs、readline、SessionDirManager
- **被依赖**: FileStorage

---

# 技术特点总结

## 设计优势
- **模块化**: 清晰的职责分离和组件划分
- **可扩展**: 抽象接口支持多种存储后端
- **高性能**: 流式处理和原子操作优化
- **高可靠**: 完善的错误处理和数据容错
- **易维护**: 代码结构清晰，文档完善

## 存储特性
- **原子性**: 使用临时文件+重命名确保数据一致性
- **并发安全**: 支持多进程安全的文件操作
- **容错能力**: 优雅处理文件损坏和异常情况
- **格式简洁**: NDJSON格式便于人工检查和工具处理

## 扩展能力
Storage模块的设计便于后续扩展：
- **新存储后端**: 通过实现Storage接口支持Redis、数据库等
- **压缩优化**: 可添加文件压缩减少存储空间
- **索引加速**: 支持事件索引提升查询性能
- **备份恢复**: 支持增量备份和灾难恢复

Storage模块为德州扑克阶段三持久化功能提供了坚实的存储基础，通过抽象设计和模块化实现，确保了系统的可扩展性和可维护性。