# 回放模块文档

## 模块概述
replay目录包含德州扑克的回放系统，支持基于快照和事件日志的游戏回放功能，提供公共模式和管理员模式两种回放精度。

---

# ScriptedDeck 模块文档

## 概述
ScriptedDeck是受控发牌机制，用于回放时的确定性发牌。替代随机Deck，确保回放过程的可重现性和一致性。

## 功能特性
- 两种发牌模式（公共/管理员）
- 与原Deck相同的接口
- 确定性发牌顺序
- 支持预设牌序和公共牌信息
- 处理牌不足等边界情况

## 核心方法

### 模式设置
```javascript
// 管理员模式：完整牌序
deck.setAdminMode(['AS', 'KH', 'QD', ...]);

// 公共模式：仅公共牌信息
deck.setPublicMode({
  flop: ['AH', 'KD', '7S'],
  turn: ['QC'],
  river: ['JH']
});
```

### 发牌接口
```javascript
// 发单张牌
const card = deck.dealCard();

// 发多张牌
const cards = deck.dealCards(3);

// 发底牌（德州扑克专用）
const holeCards = deck.dealHoleCards(playerCount);

// 发公共牌
const flop = deck.dealFlop();    // 3张（含烧牌）
const turn = deck.dealTurn();    // 1张（含烧牌）
const river = deck.dealRiver();  // 1张（含烧牌）
```

### 状态管理
```javascript
// 重置发牌位置
deck.reset();

// 设置发牌位置
deck.setCurrentIndex(index);

// 查询状态
const state = deck.getState();
const hasCards = deck.hasCards();
const remaining = deck.getRemainingCardCount();
```

## 两种模式详解

### 管理员模式
- **数据源**: 私有事件日志中的DECK_SHUFFLED事件
- **精度**: 100%保真，完全复现原始发牌顺序
- **用途**: 调试、审计、纠纷解决
- **权限**: 仅管理员可访问

### 公共模式
- **数据源**: 公共事件中的FLOP_DEALT、TURN_DEALT、RIVER_DEALT
- **精度**: 公共信息一致，底牌不可见
- **用途**: 一般回放、学习分析
- **权限**: 所有用户可访问

## 使用示例
```javascript
import ScriptedDeck from './ScriptedDeck.js';

// 创建受控发牌器
const deck = new ScriptedDeck();

// 管理员模式回放
if (isAdmin) {
  const orderedDeck = privateEvents.find(e => e.type === 'DECK_SHUFFLED').payload.orderedDeck;
  deck.setAdminMode(orderedDeck);
  
  // 按原始顺序发牌
  const holeCards = deck.dealHoleCards(playerCount);
  const flop = deck.dealFlop();
}

// 公共模式回放
else {
  const publicCards = extractFromEvents(events);
  deck.setPublicMode(publicCards);
  
  // 仅公共牌可见
  const flop = deck.dealFlop(); // 从事件中获取
}
```

## 技术特点
- **接口兼容**: 与原Deck完全兼容，可无缝替换
- **状态可控**: 支持精确的发牌位置控制
- **模式切换**: 运行时可在两种模式间切换
- **边界安全**: 优雅处理牌不足等异常情况

---

# ReplayEngine 模块文档

## 概述
ReplayEngine是回放系统的核心引擎，负责加载快照、重放事件流，并控制回放过程。支持公共模式和管理员模式两种回放精度。

## 功能特性
- 双模式回放（公共/管理员）
- 从快照恢复初始状态
- 顺序重放事件流
- 播放控制（播放/暂停/停止/跳转）
- 回放验证和一致性检查
- 可配置回放速度

## 核心方法

### 会话加载
```javascript
// 加载会话进行回放
const success = await engine.loadSession(sessionId, mode);

// mode: 'public' | 'admin'
```

### 回放控制
```javascript
// 开始回放
await engine.startReplay({
  speed: 1,        // 回放速度倍数
  autoPlay: true   // 是否自动播放
});

// 逐步执行
const event = await engine.stepNext();

// 播放控制
engine.pause();
await engine.resume();
engine.stop();

// 跳转到指定位置
await engine.seekTo(eventIndex);
```

### 状态查询
```javascript
// 获取回放状态
const status = engine.getReplayStatus();

// 获取当前游戏状态
const gameState = engine.getCurrentGameState();

// 验证回放结果
const validation = engine.validateReplay();
```

## 回放流程

### 1. 加载阶段
```
加载快照 → 加载公共事件 → 加载私有事件(可选) → 初始化状态
```

### 2. 初始化阶段
```
恢复快照状态 → 配置ScriptedDeck → 替换Game的Deck → 准备回放
```

### 3. 回放阶段
```
逐事件重放 → 更新游戏状态 → 记录回放进度 → 验证一致性
```

## 事件处理

### 可重放事件
- `PLAYER_ACTION`: 重新执行玩家动作
- 其他事件: 由Game内部逻辑自动产生，不需主动重放

### 事件重放逻辑
```javascript
switch (event.type) {
  case 'PLAYER_ACTION':
    const action = {
      type: event.payload.action,
      playerId: event.payload.playerId,
      amount: event.payload.amount
    };
    game.applyAction(action);
    break;
    
  // 其他事件由Game自动处理
}
```

## 回放验证

### 一致性检查
- 玩家数量匹配
- 筹码总量守恒
- 游戏状态合理性
- 事件序列完整性

### 验证结果格式
```javascript
{
  valid: true,
  errors: [],
  warnings: [],
  summary: {
    handsReplayed: 5,
    finalPlayerCount: 3,
    totalEvents: 42
  }
}
```

## 使用示例

### 基本回放流程
```javascript
import ReplayEngine from './ReplayEngine.js';
import Game from '../Game.js';
import FileStorage from '../../server/persistence/storage/FileStorage.js';

// 创建回放引擎
const storage = new FileStorage('./data/sessions');
const engine = new ReplayEngine(storage, Game);

// 加载并回放会话
const success = await engine.loadSession('session_123', 'public');
if (success) {
  await engine.startReplay({
    speed: 2,      // 2倍速
    autoPlay: true
  });
  
  // 等待回放完成
  while (engine.playbackState === 'playing') {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 验证结果
  const validation = engine.validateReplay();
  console.log('回放验证:', validation);
}
```

### 逐步回放
```javascript
// 手动控制回放
await engine.loadSession('session_123', 'public');
await engine.startReplay({ autoPlay: false });

// 逐个事件执行
let event;
while ((event = await engine.stepNext()) !== null) {
  console.log(`执行事件: ${event.type}`);
  
  // 查看当前状态
  const gameState = engine.getCurrentGameState();
  console.log(`当前手牌: ${gameState.handNumber}`);
  
  // 可以暂停等待用户输入
  if (needsUserInput()) {
    engine.pause();
    await waitForUserInput();
    await engine.resume();
  }
}
```

### 管理员模式回放
```javascript
// 管理员权限下的完整回放
const success = await engine.loadSession('session_123', 'admin');
if (success) {
  await engine.startReplay({ autoPlay: false });
  
  // 可以看到完整的发牌顺序
  while (await engine.stepNext()) {
    const status = engine.getReplayStatus();
    console.log(`进度: ${status.progress * 100}%`);
  }
  
  // 验证100%保真性
  const validation = engine.validateReplay();
  if (validation.valid) {
    console.log('✅ 回放完全一致');
  }
}
```

## 配置选项

### 回放选项
```javascript
const options = {
  speed: 1,         // 回放速度 (0.1-10)
  autoPlay: true,   // 自动播放
  skipToHand: 5,    // 跳转到指定手牌
  stopAtEvents: ['SHOWDOWN_STARTED'] // 在特定事件暂停
};
```

## 错误处理

### 常见错误情况
- 会话文件损坏或不存在
- 事件序列不完整
- Game状态恢复失败
- 私有事件权限不足

### 错误恢复策略
- 自动降级：管理员模式→公共模式
- 部分回放：跳过损坏的事件
- 状态重置：回到最近的有效快照

## 性能优化

### 快进机制
- 批量事件处理
- 跳过UI更新
- 最小化状态复制

### 内存管理
- 延迟加载事件
- 适时清理缓存
- 避免大对象复制

## 技术特点
- **无侵入性**: 不修改Game核心逻辑
- **高度兼容**: 通过依赖注入替换组件
- **精确控制**: 支持逐事件和批量回放
- **双模式**: 公共透明度和管理员保真度并存
- **验证完整**: 提供多层次的一致性检查

## 扩展性考虑
- **新事件类型**: 通过事件处理器模式扩展
- **回放UI**: 提供标准化的状态查询接口
- **分析工具**: 支持统计和分析功能
- **导出功能**: 可导出回放数据为其他格式

回放模块为德州扑克游戏提供了完整的历史重现能力，既满足一般用户的学习需求，又为管理员提供了完整的审计工具。通过清晰的模块分离和标准化的接口设计，实现了高精度和高可用性的回放系统。