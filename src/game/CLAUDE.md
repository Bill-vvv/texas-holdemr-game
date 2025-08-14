# 游戏模块文档

## 模块概述
game目录包含德州扑克的核心游戏逻辑，包括状态管理、规则配置、回合管理等基础模块。

## 子模块索引
- **[@actions/CLAUDE.md](./actions/CLAUDE.md)** - 动作处理模块（ActionValidator、ActionApplier）
- **[@pot/CLAUDE.md](./pot/CLAUDE.md)** - 彩池管理模块（PotManager）
- **Game.js** - 游戏聚合根，协调所有模块的主控制器

---

# GameState 模块文档

## 概述
GameState模块负责管理整个德州扑克游戏的状态数据，提供集中的状态存储和派生视图。这是一个纯数据结构类，不包含业务逻辑，易于序列化和测试。

## 功能特性
- 集中管理游戏状态（玩家、牌面、彩池等）
- 精确的回合状态模型（支持复杂边界情况）
- 公共/私有状态视图分离
- 完整的序列化/反序列化支持
- 玩家生命周期管理
- **阶段1.5新增**: 摊牌结果展示和会话管理

## 核心状态字段

### 基本游戏信息
- `gameId` - 游戏唯一标识
- `street` - 当前街道 (PRE_FLOP, FLOP, TURN, RIVER, SHOWDOWN)
- `phase` - 游戏阶段 (WAITING, PLAYING, FINISHED)
- `handNumber` - 当前手牌编号

### 玩家信息
- `players[]` - 玩家列表，包含筹码、手牌、状态等
- `buttonIndex` - 庄家按钮位置索引
- `activePlayers[]` - 当前轮参与玩家ID列表

### 精确回合状态
- `currentTurn` - 当前行动玩家ID
- `amountToCall` - 当前需匹配的总下注额
- `lastAggressorId` - 最近进攻者ID
- `activePlayersCount` - 未弃牌且未all-in的玩家数
- `isActionReopened` - 是否允许再次加注

### 阶段1.5新增字段
- `lastShowdownSummary` - 摊牌结果摘要（公共信息）
  ```javascript
  {
    handId: number,           // 手牌编号
    winners: [{               // 获胜者数组
      playerId: string,       // 玩家ID
      rankName: string,       // 牌型名称（如"一对"）
      bestFive: string[],     // 最佳五张牌
      usedHole?: string[]     // 使用的底牌
    }]
  }
  ```
- `session` - 会话基线数据（私有，用于整局结算）
  ```javascript
  {
    id: string,               // 会话ID
    startedAt: number,        // 开始时间戳
    baselineStacks: Record<string, number>, // 基线筹码
    handsPlayed: number       // 已玩手数
  }
  ```

## API接口

### 玩家管理
```javascript
// 添加玩家
gameState.addPlayer({id: 'player1', name: 'Alice', chips: 1000});

// 移除玩家
gameState.removePlayer('player1');

// 获取玩家
const player = gameState.getPlayer('player1');

// 更新活跃玩家
gameState.updateActivePlayers();
```

### 状态视图
```javascript
// 获取公共状态（不包含手牌等私密信息）
const publicState = gameState.getPublicState();

// 获取特定玩家的私有状态
const privateState = gameState.getPrivateStateFor('player1');
```

### 游戏控制
```javascript
// 检查是否可以开始游戏
const canStart = gameState.canStart(); // 需要2-3名玩家

// 重置到初始状态
gameState.reset();
```

### 持久化
```javascript
// 序列化状态
const serialized = gameState.serialize();

// 恢复状态
gameState.deserialize(serialized);
```

### 阶段1.5新增方法
```javascript
// 初始化会话基线（第一手开始前调用）
gameState.initializeSession();

// 清空摊牌摘要（新一手开始前调用）
gameState.clearShowdownSummary();

// 设置摊牌摘要
gameState.setShowdownSummary([
  {
    playerId: 'player1',
    rankName: '同花顺',
    bestFive: ['AH', 'KH', 'QH', 'JH', 'TH'],
    usedHole: ['AH', 'KH']
  }
]);
```

## 玩家状态模型
每个玩家包含以下属性：
```javascript
{
  id: 'player1',           // 玩家ID
  name: 'Alice',           // 显示名称
  chips: 1000,             // 当前筹码
  holeCards: ['AH', 'KS'], // 手牌（私密）
  position: 0,             // 座位位置
  status: 'ACTIVE',        // ACTIVE, FOLDED, ALL_IN, SITTING_OUT
  currentBet: 100,         // 本街已下注金额
  totalBet: 150,           // 本轮总下注金额
  isDealer: false,         // 是否是庄家
  isSmallBlind: false,     // 是否是小盲
  isBigBlind: false        // 是否是大盲
}
```

## 使用示例
```javascript
import GameState from './GameState.js';

const gameState = new GameState();

// 设置游戏
gameState.gameId = 'game-001';
gameState.addPlayer({id: 'alice', name: 'Alice', chips: 1000});
gameState.addPlayer({id: 'bob', name: 'Bob', chips: 2000});

// 检查是否可以开始
if (gameState.canStart()) {
  gameState.phase = 'PLAYING';
  gameState.currentTurn = 'alice';
}

// 广播公共状态给客户端
const publicState = gameState.getPublicState();
broadcastToAllClients(publicState);

// 发送私有状态给特定玩家
const alicePrivate = gameState.getPrivateStateFor('alice');
sendToClient('alice', alicePrivate);
```

## 依赖关系
- **依赖**: GameStateSerializer（序列化功能）
- **被依赖**: Game, TurnManager, ActionApplier等所有游戏逻辑模块

---

# TableRules 模块文档

## 概述
TableRules模块定义德州扑克桌面的各种规则参数，包括盲注、买入、增购等配置。提供规则验证和工厂方法，支持不同类型的游戏配置。

## 功能特性
- 灵活的规则配置（盲注、买入、增购等）
- 配置合理性验证
- 规则检查和计算方法
- 工厂模式创建预设规则
- 序列化支持

## 核心配置参数

### 基本桌面配置
- `minPlayers/maxPlayers` - 玩家数量限制
- `smallBlind/bigBlind` - 小盲/大盲注额
- `minRaise` - 最小加注额
- `noLimit` - 是否无限注模式

### 买入规则
- `minBuyIn/maxBuyIn` - 买入金额范围
- `rebuyAllowed` - 是否允许增购
- `rebuyOnlyBetweenHands` - 是否仅局间增购
- `rebuyMaxAmount` - 增购上限

### 时间规则（预留）
- `actionTimeoutSeconds` - 行动超时时间
- `enableTimeout` - 是否启用超时（MVP阶段暂不实现）

## API接口

### 构造函数
```javascript
// 默认规则
const rules = new TableRules();

// 自定义规则
const rules = new TableRules({
  smallBlind: 25,
  bigBlind: 50,
  minBuyIn: 1000,
  maxBuyIn: 5000,
  rebuyAllowed: false
});
```

### 规则检查
```javascript
// 检查买入是否有效
rules.isValidBuyIn(1500); // true/false

// 检查增购是否被允许
rules.isRebuyAllowed('PLAYING'); // 根据阶段和规则返回

// 检查增购金额是否有效  
rules.isValidRebuy(500, currentChips); // true/false

// 检查玩家数量是否符合要求
rules.isValidPlayerCount(3); // true/false
```

### 规则计算
```javascript
// 计算最小加注金额
const minRaise = rules.getMinRaiseAmount(currentBet, lastRaiseAmount);

// 获取建议买入金额
const recommended = rules.getRecommendedBuyIn();
```

### 工厂方法
```javascript
// 创建现金局规则
const cashRules = TableRules.createCashGame(50); // 50为大盲

// 创建锦标赛规则（MVP阶段未实现）
// const tournamentRules = TableRules.createTournament(options);
```

### 序列化和信息
```javascript
// 序列化
const data = rules.serialize();
const newRules = TableRules.deserialize(data);

// 获取规则摘要
const summary = rules.getSummary();
// "No-Limit Hold'em 10/20, 买入: 800-2000, 允许增购"
```

## 预设规则类型

### 标准现金局
```javascript
const rules = TableRules.createCashGame(20);
// 小盲10/大盲20, 买入800-2000, 允许局间增购
```

## 使用示例
```javascript
import TableRules from './rules/TableRules.js';

// 创建标准现金局
const rules = TableRules.createCashGame(20);

// 验证玩家买入
if (!rules.isValidBuyIn(playerChips)) {
  throw new Error('买入金额不符合要求');
}

// 检查是否可以增购
if (rules.isRebuyAllowed(gamePhase)) {
  // 允许增购
  if (rules.isValidRebuy(rebuyAmount, playerChips)) {
    // 执行增购逻辑
  }
}

// 计算最小加注
const minRaise = rules.getMinRaiseAmount(currentBet, lastRaise);

// 显示桌面信息
console.log(rules.getSummary());
```

## 配置验证
TableRules在创建时会自动验证配置的合理性：
- 最小玩家数≥2，最大玩家数≤9
- 小盲 < 大盲，且都为正数  
- 买入范围合理
- 最小买入建议≥10BB以避免频繁all-in

## 依赖关系
- **依赖**: TableRulesValidator（验证功能）
- **被依赖**: Game, ActionValidator, BlindsManager等需要规则配置的模块

## 技术特点
- **配置驱动**: 通过参数控制游戏行为，易于调整
- **类型安全**: 完善的参数验证和类型检查
- **扩展友好**: 易于添加新的规则类型和参数
- **序列化支持**: 便于持久化和网络传输

---

# TurnManager 模块文档

## 概述
TurnManager模块负责管理德州扑克的行动顺序和回合闭合逻辑，实现精确的状态模型来处理复杂的回合判定和街道推进。

## 功能特性
- 精确的回合闭合判定（基于计划文档12.1精确状态模型）
- 行动顺序管理（支持双人局特例）
- 街道推进和状态重置
- 游戏结束条件判断
- 跨街道的行动者确定

## 核心方法

### 行动管理
```javascript
// 获取当前应该行动的玩家
const currentActor = TurnManager.getCurrentActor(gameState);

// 推进到下一个行动者
TurnManager.advanceToNextActor(gameState);
```

### 回合闭合判定
```javascript
// 判断当前回合是否已闭合
const isClosed = TurnManager.isRoundClosed(gameState);
```

### 街道推进
```javascript
// 推进到下一街道
TurnManager.advanceStreet(gameState);

// 检查游戏是否应该结束
const shouldEnd = TurnManager.shouldEndGame(gameState);
```

## 回合闭合算法
基于精确状态模型的闭合判定：

1. **仅一人可行动**: `activePlayersCount <= 1` → 立即闭合
2. **无需跟注情况**: `amountToCall === 0`
   - 所有可行动玩家都已行动 → 闭合
3. **需跟注情况**: `amountToCall > 0`
   - 所有可行动玩家注额匹配 `currentBet === amountToCall`
   - 且行动回到最后进攻者 `lastAggressorId` → 闭合

## 街道推进机制
进入新街道时自动执行：
- 重置回合状态：`amountToCall=0`, `lastAggressorId=null`
- 重置行动权限：`isActionReopened=true`
- 清空行动历史：`actionHistory=[]`
- 重置玩家本街下注：`currentBet=0`
- 设置新街道第一个行动者

## 行动顺序规则

### Preflop
- **双人局**: 按钮位（小盲）先行动
- **多人局**: UTG（大盲左侧第一位）先行动

### Postflop (Flop/Turn/River)
- **所有情况**: 按钮左侧第一位在局玩家先行动

## 使用示例
```javascript
import TurnManager from './TurnManager.js';

// 检查当前行动者
const currentPlayer = TurnManager.getCurrentActor(gameState);
if (currentPlayer) {
  // 等待该玩家行动
  console.log(`等待 ${currentPlayer} 行动`);
}

// 玩家行动后检查回合状态
if (TurnManager.isRoundClosed(gameState)) {
  // 回合闭合，推进街道
  TurnManager.advanceStreet(gameState);
  
  // 检查游戏是否结束
  if (TurnManager.shouldEndGame(gameState)) {
    // 进入结算阶段
    gameState.phase = 'FINISHED';
  }
} else {
  // 继续当前回合，推进到下一个玩家
  TurnManager.advanceToNextActor(gameState);
}
```

## 边界情况处理
- **All-in玩家**: 自动跳过，不参与行动轮转
- **弃牌玩家**: 自动跳过，从可行动列表中移除
- **筹码不足**: 按实际情况处理all-in状态
- **单人剩余**: 立即结束游戏，无需摊牌

## 依赖关系
- **依赖**: GameState（状态数据）、TurnOrderCalculator（行动顺序计算）、RoundClosureChecker（回合闭合判定）
- **被依赖**: Game（聚合根）、ActionApplier等

## 技术特点
- **静态方法**: 无状态设计，所有方法都是静态的
- **模块化**: 通过提取辅助类实现职责分离
- **精确算法**: 实现复杂但准确的回合闭合判定
- **KISS原则**: 主类专注核心协调职能，复杂逻辑委托给专门类处理

---

# BlindsManager 模块文档

## 概述
BlindsManager模块负责管理德州扑克的按钮位、盲注设置和收取，正确处理双人局和多人局的不同规则。

## 功能特性
- 按钮位置管理和移动
- 小盲/大盲位置自动设置
- 盲注收取和筹码扣除
- 双人局特例处理（按钮位即小盲）
- 筹码不足时的all-in处理
- Preflop/Postflop行动者确定

## 核心方法

### 盲注设置
```javascript
// 设置新一轮的按钮位和盲注
BlindsManager.setupBlindsAndButton(gameState, rules);

// 移动按钮到下一位置
BlindsManager.moveButton(gameState);
```

### 行动者确定
```javascript
// 获取Preflop第一个行动者
const preflopActor = BlindsManager.getPreflopFirstActor(gameState);

// 获取Postflop第一个行动者
const postflopActor = BlindsManager.getPostflopFirstActor(gameState);
```

### 状态检查
```javascript
// 检查盲注是否已正确设置
const blindsSet = BlindsManager.areBlindsSet(gameState);

// 获取盲注信息摘要
const blindsInfo = BlindsManager.getBlindsInfo(gameState, rules);
```

## 位置设置规则

### 双人局 (Heads-up)
- **按钮位**: 同时是小盲位
- **对面玩家**: 大盲位
- **Preflop行动顺序**: 小盲（按钮）→ 大盲
- **Postflop行动顺序**: 大盲 → 小盲（按钮）

### 多人局
- **按钮位**: 庄家标记
- **小盲位**: 按钮左侧第一位
- **大盲位**: 小盲左侧第一位
- **行动顺序**: 按座位顺时针进行

## 盲注收取机制
自动处理以下情况：
- 正常收取：扣除对应筹码，设置下注额
- 筹码不足：收取所有剩余筹码，设置all-in状态
- 状态更新：更新`amountToCall`为大盲注额

## 按钮移动规则
- 每手结束后顺时针移动一位
- 自动跳过`SITTING_OUT`状态的玩家
- 确保按钮位玩家处于活跃状态

## 使用示例
```javascript
import BlindsManager from './BlindsManager.js';
import TableRules from './rules/TableRules.js';

const gameState = new GameState();
const rules = TableRules.createCashGame(20);

// 新手牌开始，设置盲注
BlindsManager.setupBlindsAndButton(gameState, rules);

// 检查设置结果
if (BlindsManager.areBlindsSet(gameState)) {
  console.log('盲注设置完成');
  
  // 获取Preflop第一个行动者
  const firstActor = BlindsManager.getPreflopFirstActor(gameState);
  gameState.currentTurn = firstActor;
}

// 手牌结束后移动按钮
BlindsManager.moveButton(gameState);

// 获取盲注信息用于显示
const blindsInfo = BlindsManager.getBlindsInfo(gameState, rules);
console.log(`小盲: ${blindsInfo.smallBlind.playerId} (${blindsInfo.smallBlind.actualAmount})`);
console.log(`大盲: ${blindsInfo.bigBlind.playerId} (${blindsInfo.bigBlind.actualAmount})`);
```

## 盲注信息结构
```javascript
{
  smallBlind: {
    playerId: 'player2',     // 小盲玩家ID
    amount: 10,              // 规定小盲额
    actualAmount: 10         // 实际收取金额
  },
  bigBlind: {
    playerId: 'player3',     // 大盲玩家ID  
    amount: 20,              // 规定大盲额
    actualAmount: 20         // 实际收取金额
  },
  isHeadsUp: false           // 是否双人局
}
```

## 特殊情况处理
- **筹码不足**: 自动all-in，实际金额小于规定金额
- **玩家坐出**: 按钮移动时自动跳过
- **人数不足**: 优雅处理，不抛出异常
- **位置冲突**: 自动清除之前的错误标记

## 依赖关系
- **依赖**: GameState（状态管理）、TableRules（规则配置）、PositionHelper（位置计算）、BlindsCollector（盲注收取）
- **被依赖**: Game（聚合根）、TurnManager（行动管理）

## 技术特点
- **静态方法**: 无状态设计，职责单一
- **模块化**: 通过辅助类分离复杂逻辑
- **规则隔离**: 双人局和多人局逻辑分离
- **KISS原则**: 主类专注协调，细节逻辑委托专门类处理

---

# 辅助模块文档

## TurnOrderCalculator 模块

### 概述
TurnOrderCalculator负责计算玩家行动顺序，提供纯函数式的位置计算服务。

### 核心功能
- 获取可行动玩家列表
- 计算下一个行动玩家
- 确定特定街道的首个行动者

### 主要方法
- `getActionablePlayers(gameState)` - 获取可行动玩家ID列表
- `getNextActorAfter(gameState, playerId)` - 获取指定玩家后的下一个行动者
- `getUTGPlayer(gameState)` - 获取UTG位置玩家
- `getFirstPlayerAfterButton(gameState)` - 获取按钮后首个玩家

## RoundClosureChecker 模块

### 概述
RoundClosureChecker实现基于精确状态模型的回合闭合判定逻辑。

### 核心功能
- 精确的回合闭合判定
- 玩家行动状态检查
- 进攻者回归检测

### 主要方法
- `isRoundClosed(gameState)` - 判断回合是否闭合
- `_allPlayersActed(gameState, actionablePlayers)` - 检查所有玩家是否已行动
- `_hasActionReturnedToAggressor(gameState, actionablePlayers)` - 检查是否回到进攻者

## PositionHelper 模块

### 概述
PositionHelper提供位置管理和计算服务，处理按钮位和盲注位设置。

### 核心功能
- 位置标记管理
- 按钮位设置
- 盲注位置计算

### 主要方法
- `getNextActivePlayer(gameState, playerId)` - 获取下一个活跃玩家
- `clearPositionMarkers(gameState)` - 清除位置标记
- `setButtonPosition(gameState)` - 设置按钮位
- `setHeadsUpBlinds(gameState)` - 设置双人局盲注
- `setMultiPlayerBlinds(gameState)` - 设置多人局盲注

## BlindsCollector 模块

### 概述
BlindsCollector专门处理盲注收取逻辑，包括筹码不足的边界情况。

### 核心功能
- 盲注收取和扣除
- All-in状态处理
- 盲注信息统计

### 主要方法
- `collectBlinds(gameState, rules)` - 收取盲注
- `getBlindsInfo(gameState, rules)` - 获取盲注信息摘要

---

# Game 模块文档

## 概述
Game模块是德州扑克游戏的聚合根（Aggregate Root），负责协调所有游戏模块，提供统一的对外接口。严格遵循聚合根模式和KISS原则，是整个游戏系统的核心控制器。

## 功能特性
- 游戏生命周期管理（开始、进行、结束）
- 协调所有子模块（TurnManager、BlindsManager、ActionValidator等）
- 处理发牌逻辑（Deck、HandEvaluator）
- 提供公共/私有状态视图
- 执行完整的Game Loop流程
- 玩家管理（添加、移除、状态查询）

## 架构设计

### 依赖模块
```javascript
// 状态管理
import GameState from './GameState.js';

// 游戏流程控制
import TurnManager from './TurnManager.js';
import BlindsManager from './BlindsManager.js';

// 动作处理
import ActionValidator from './actions/ActionValidator.js';
import ActionApplier from './actions/ActionApplier.js';

// 彩池管理
import PotManager from './pot/PotManager.js';

// 核心功能
import Deck from './core/Deck.js';
import HandEvaluator from './core/HandEvaluator.js';
```

### 聚合根职责
Game作为聚合根，负责：
1. **对外接口**: 统一的游戏操作接口
2. **流程协调**: 协调各个模块的交互
3. **事务边界**: 确保操作的原子性
4. **状态一致性**: 维护整个游戏状态的一致性

## 核心方法

### 游戏生命周期
```javascript
// 开始新一轮游戏
const success = game.startNewHand();

// 应用玩家动作
const result = game.applyAction({
  type: 'raise',
  playerId: 'player1',
  amount: 100
});
```

### 玩家管理
```javascript
// 添加玩家
const success = game.addPlayer({
  id: 'player1',
  name: 'Alice',
  chips: 1000
});

// 移除玩家
const success = game.removePlayer('player1');
```

### 状态查询
```javascript
// 获取公共状态
const publicState = game.getPublicState();

// 获取玩家私有状态
const privateState = game.getPrivateStateFor('player1');

// 获取游戏摘要
const summary = game.getGameSummary();
```

## 游戏流程处理

### 动作处理流程
```javascript
applyAction(action) {
  try {
    // 1. 验证动作
    const validationError = ActionValidator.validate(action, this.gameState, this.tableRules);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // 2. 应用动作
    ActionApplier.apply(action, this.gameState, this.tableRules);

    // 3. 处理游戏流程推进
    const gameEvents = this._processGameFlow();

    return { 
      success: true, 
      gameEvents,
      gameState: this.getPublicState()
    };
  } catch (error) {
    return { success: false, error: { error: 'INTERNAL_ERROR', message: error.message } };
  }
}
```

### 游戏流程推进
```javascript
_processGameFlow() {
  const events = [];

  // 检查是否应该结束游戏
  if (TurnManager.shouldEndGame(this.gameState)) {
    events.push({ type: 'GAME_ENDED', reason: 'only_one_player' });
    this._endHand(events);
    return events;
  }

  // 检查回合是否闭合
  if (TurnManager.isRoundClosed(this.gameState)) {
    events.push({ type: 'ROUND_CLOSED', street: this.gameState.street });
    
    // 收集本街下注到彩池
    this.pots = PotManager.collectBetsFromStreet(this.gameState.players, this.pots);
    ActionApplier.resetStreetState(this.gameState);

    // 推进到下一街
    TurnManager.advanceStreet(this.gameState);
    events.push({ type: 'STREET_ADVANCED', newStreet: this.gameState.street });

    // 发公共牌和设置行动者
    this._dealCommunityCards(events);
    
    if (this.gameState.street === 'SHOWDOWN') {
      events.push({ type: 'SHOWDOWN_STARTED' });
      this._endHand(events);
    } else {
      this.gameState.currentTurn = BlindsManager.getPostflopFirstActor(this.gameState);
      events.push({ type: 'TURN_CHANGED', playerId: this.gameState.currentTurn });
    }
  } else {
    // 推进到下一个行动者
    TurnManager.advanceToNextActor(this.gameState);
    events.push({ type: 'TURN_CHANGED', playerId: this.gameState.currentTurn });
  }

  return events;
}
```

## 事件系统

### 游戏事件类型
- `GAME_ENDED` - 游戏结束
- `ROUND_CLOSED` - 回合闭合
- `STREET_ADVANCED` - 街道推进
- `FLOP_DEALT` - 翻牌发出
- `TURN_DEALT` - 转牌发出
- `RIVER_DEALT` - 河牌发出
- `SHOWDOWN_STARTED` - 摊牌开始
- `TURN_CHANGED` - 行动者改变
- `POTS_DISTRIBUTED` - 彩池分配完成
- `HAND_FINISHED` - 手牌结束

### 事件处理示例
```javascript
const result = game.applyAction(action);
if (result.success) {
  result.gameEvents.forEach(event => {
    switch (event.type) {
      case 'STREET_ADVANCED':
        console.log(`进入 ${event.newStreet} 街道`);
        break;
      case 'FLOP_DEALT':
        console.log(`翻牌: ${event.cards.join(' ')}`);
        break;
      case 'TURN_CHANGED':
        console.log(`轮到 ${event.playerId} 行动`);
        break;
    }
  });
}
```

## 状态管理

### 公共状态结构
```javascript
const publicState = {
  gameId: 'game_1234567890',
  street: 'FLOP',
  phase: 'PLAYING',
  players: [...],           // 玩家公开信息
  communityCards: [...],    // 公共牌
  pots: {...},             // 彩池摘要
  currentTurn: 'player1',   // 当前行动者
  amountToCall: 100,        // 需跟注金额
  handNumber: 5,            // 手牌编号
  tableRules: {...}         // 桌面规则摘要
};
```

### 私有状态结构
```javascript
const privateState = {
  holeCards: ['AH', 'KS'],  // 玩家手牌
  playerId: 'player1'       // 玩家ID
};
```

### 游戏摘要结构
```javascript
const summary = {
  gameId: 'game_1234567890',
  phase: 'PLAYING',
  street: 'FLOP',
  handNumber: 5,
  playerCount: 3,
  activePlayerCount: 2,
  currentTurn: 'player1',
  potTotal: 300,
  tableRules: {...}
};
```

## 使用示例

### 完整游戏流程
```javascript
import Game from './Game.js';
import TableRules from './rules/TableRules.js';

// 创建游戏
const rules = TableRules.createCashGame(20); // 10/20盲注
const game = new Game(rules);

// 添加玩家
game.addPlayer({ id: 'alice', name: 'Alice', chips: 1000 });
game.addPlayer({ id: 'bob', name: 'Bob', chips: 2000 });
game.addPlayer({ id: 'charlie', name: 'Charlie', chips: 1500 });

// 开始游戏
if (game.startNewHand()) {
  console.log('游戏开始!');
  
  // 处理玩家动作
  let gameRunning = true;
  while (gameRunning) {
    const state = game.getPublicState();
    
    if (state.phase === 'WAITING') {
      gameRunning = false;
      break;
    }
    
    // 获取当前行动者的动作（这里简化处理）
    const action = getPlayerAction(state.currentTurn, state);
    const result = game.applyAction(action);
    
    if (result.success) {
      // 处理游戏事件
      result.gameEvents.forEach(event => {
        console.log('游戏事件:', event);
      });
    }
  }
}

// 查询最终结果
const summary = game.getGameSummary();
console.log('游戏结束:', summary);
```

### 错误处理
```javascript
const result = game.applyAction({
  type: 'raise',
  playerId: 'player1',
  amount: 50
});

if (!result.success) {
  console.error('动作失败:', result.error.message);
  // 根据错误类型进行处理
  switch (result.error.error) {
    case 'INVALID_ACTION':
      // 提示玩家重新操作
      break;
    case 'INSUFFICIENT_CHIPS':
      // 建议玩家调整金额
      break;
    default:
      // 其他错误处理
  }
}
```

## 技术特点
- **聚合根模式**: 统一管理游戏状态和业务规则
- **事件驱动**: 通过事件通知外部系统状态变化
- **模块协调**: 协调多个专门模块完成复杂业务逻辑
- **状态封装**: 提供合适的状态视图给不同的消费者
- **错误处理**: 完善的错误处理和恢复机制

## 扩展性考虑
Game聚合根的设计便于后续扩展：
- **新动作类型**: 通过ActionValidator和ActionApplier扩展
- **新游戏规则**: 通过TableRules配置扩展
- **新事件类型**: 在_processGameFlow中添加新事件
- **状态持久化**: 通过GameState的序列化功能
- **多人游戏**: 当前设计已支持2-9人游戏

## 阶段1.5新增功能

### 摊牌结果展示
Game聚合根现在在摊牌结束时自动生成获胜者的详细信息：
```javascript
// 在_endHand方法中，当street为SHOWDOWN时自动调用
_generateShowdownSummary(distributionResults) {
  const winners = [];
  
  distributionResults.forEach(result => {
    result.winners.forEach(winnerId => {
      const player = this.gameState.getPlayer(winnerId);
      if (player && player.holeCards.length > 0) {
        // 使用HandEvaluator获取详细牌型信息
        const detailed = this.handEvaluator.describeBestHand(
          player.holeCards,
          this.gameState.communityCards
        );
        
        winners.push({
          playerId: winnerId,
          rankName: detailed.rankName,  // "同花顺"、"三条"等
          bestFive: detailed.bestFive,  // 最佳五张牌
          usedHole: detailed.usedHole   // 使用的底牌
        });
      }
    });
  });
  
  // 设置到GameState中供客户端获取
  if (winners.length > 0) {
    this.gameState.setShowdownSummary(winners);
  }
}
```

### 会话管理和整局结算
新增的会话系统跟踪整个游戏会话的统计信息：
```javascript
// 第一手牌开始时初始化会话基线
if (this.gameState.handNumber === 0) {
  this.gameState.initializeSession();
}

// 结束整局并生成最终结算
endSession() {
  if (!this.gameState.session) {
    return null; // 会话未初始化
  }

  const finalSettlement = {
    sessionId: this.gameState.session.id,
    startedAt: this.gameState.session.startedAt,
    endedAt: Date.now(),
    handsPlayed: this.gameState.session.handsPlayed,
    perPlayer: [],
    totalChips: 0
  };

  // 计算每个玩家的盈亏
  this.gameState.players.forEach(player => {
    const baseline = this.gameState.session.baselineStacks[player.id] || 0;
    const current = player.chips;
    const pnl = current - baseline;

    finalSettlement.perPlayer.push({
      playerId: player.id,
      playerName: player.name,
      baseline: baseline,
      current: current,
      pnl: pnl
    });

    finalSettlement.totalChips += current;
  });

  return finalSettlement;
}
```

### 新增API方法
- `_generateShowdownSummary()` - 生成摊牌结果摘要
- `endSession()` - 结束会话并返回最终结算数据

### 数据结构扩展

#### 摊牌摘要结构
```javascript
// GameState.lastShowdownSummary
[{
  playerId: 'player1',
  rankName: '同花顺',
  bestFive: ['AH', 'KH', 'QH', 'JH', 'TH'],
  usedHole: ['AH', 'KH']
}]
```

#### 会话数据结构
```javascript
// GameState.session
{
  id: 'session_1692345678901',
  startedAt: 1692345678901,
  baselineStacks: {
    'player1': 1000,
    'player2': 1500,
    'player3': 2000
  },
  handsPlayed: 15,
  ended: false,
  endedAt: null
}
```

#### 整局结算结构
```javascript
// endSession()返回值
{
  sessionId: 'session_1692345678901',
  startedAt: 1692345678901,
  endedAt: 1692349278901,
  handsPlayed: 15,
  totalChips: 4500,
  perPlayer: [{
    playerId: 'player1',
    playerName: 'Alice',
    baseline: 1000,
    current: 1500,
    pnl: +500
  }, {
    playerId: 'player2', 
    playerName: 'Bob',
    baseline: 1500,
    current: 1200,
    pnl: -300
  }]
}
```

### 使用示例

#### 摊牌结果获取
```javascript
// 游戏结束后获取摊牌摘要
const publicState = game.getPublicState();
if (publicState.lastShowdownSummary) {
  publicState.lastShowdownSummary.forEach(winner => {
    console.log(`${winner.playerId}: ${winner.rankName}`);
    console.log(`最佳五张: ${winner.bestFive.join(' ')}`);
    console.log(`使用底牌: ${winner.usedHole.join(' ')}`);
  });
}
```

#### 整局结算处理
```javascript
// 房主结束整局
const finalSettlement = game.endSession();
if (finalSettlement) {
  console.log(`会话时长: ${finalSettlement.endedAt - finalSettlement.startedAt}ms`);
  console.log(`总手数: ${finalSettlement.handsPlayed}`);
  
  finalSettlement.perPlayer.forEach(player => {
    const status = player.pnl > 0 ? '盈利' : player.pnl < 0 ? '亏损' : '持平';
    console.log(`${player.playerName}: ${status} ${Math.abs(player.pnl)}筹码`);
  });
} else {
  console.log('会话未初始化，无法结束');
}
```

### 技术特点
- **自动化**: 摊牌摘要在摊牌结束时自动生成，无需手动调用
- **数据完整**: 提供获胜牌型的完整信息，包括使用的底牌
- **状态管理**: 摊牌摘要存储在GameState中，可通过公共状态获取
- **会话跟踪**: 从第一手牌开始跟踪整个会话的统计数据
- **盈亏计算**: 基于初始买入金额计算准确的盈亏情况
- **防重复**: 会话结束标记防止重复调用endSession

### 与现有系统集成
- **HandEvaluator扩展**: 利用新增的describeBestHand方法获取详细牌型信息
- **GameState扩展**: 新增的lastShowdownSummary和session字段
- **Protocol支持**: 通过HOST_END_GAME和GAME_ENDED消息支持房主控制
- **Server集成**: 服务端handleHostEndGame处理房主结束整局请求

阶段1.5的功能增强为德州扑克游戏提供了更完整的用户体验，包括详细的摊牌信息展示和全面的会话统计功能，让玩家能够更好地分析游戏结果和个人表现。

Game模块是整个德州扑克系统的核心，通过清晰的职责分离和模块化设计，实现了复杂业务逻辑的有效管理。
