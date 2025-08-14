# Core游戏核心模块文档

## 模块概述
core目录包含德州扑克游戏的核心工具类，提供基础的牌堆管理和牌力评估功能。

---

# Deck 模块文档

## 概述
Deck模块负责管理德州扑克的标准52张牌，提供洗牌和发牌功能。这是一个纯工具类，无业务依赖。

## 功能特性
- 标准52张牌创建（4种花色 × 13种点数）
- Fisher-Yates算法洗牌
- 单张/多张发牌
- 牌堆状态查询

## API接口

### 构造函数
```javascript
const deck = new Deck();
```
创建一个新的标准52张牌堆。

### 核心方法

#### `reset()`
重置牌堆到初始52张牌状态。

#### `shuffle()`
使用Fisher-Yates算法洗牌，确保随机性。

#### `dealOne()` 
- **返回**: `string|null` - 牌面字符串（如'AH'表示红心A），牌堆空时返回null

#### `dealMany(count)`
- **参数**: `count` (number) - 要发的牌数
- **返回**: `string[]` - 牌面数组，不足时返回剩余所有牌

#### `getRemainingCount()`
- **返回**: `number` - 剩余牌数

#### `hasEnough(needed)`
- **参数**: `needed` (number) - 需要的牌数  
- **返回**: `boolean` - 是否有足够的牌

## 牌面格式
使用2字符格式：`[点数][花色]`
- **点数**: 2-9, T(10), J(11), Q(12), K(13), A(14)
- **花色**: S(黑桃), H(红心), D(方块), C(梅花)
- **示例**: 'AH'=红心A, 'KS'=黑桃K, 'TD'=方块10

## 使用示例
```javascript
import Deck from './Deck.js';

const deck = new Deck();
deck.shuffle();

// 发德州扑克手牌
const player1 = deck.dealMany(2); // ['AH', 'KD']
const player2 = deck.dealMany(2); // ['QS', 'JC'] 

// 发公共牌
const flop = deck.dealMany(3);    // ['TD', '9H', '8S']
const turn = deck.dealOne();      // '7C'
const river = deck.dealOne();     // '6H'

console.log(`剩余牌数: ${deck.getRemainingCount()}`); // 42
```

---

# HandEvaluator 模块文档

## 概述
HandEvaluator模块负责德州扑克牌力评估，封装第三方pokersolver库，提供统一的牌力比较接口。

## 功能特性
- 7张牌最佳5张组合评估
- 牌型识别（高牌到同花顺）
- 多玩家获胜者确定
- 平局处理

## API接口

### 构造函数
```javascript
const evaluator = new HandEvaluator();
```

### 核心方法

#### `evaluate(holeCards, board)`
评估7张牌的最佳5张组合
- **参数**: 
  - `holeCards` (string[2]) - 手牌，如['AH', 'KD']
  - `board` (string[]) - 公共牌，如['QS', 'JC', 'TD', '9H', '8S']
- **返回**: `Object` - 评估结果
  ```javascript
  {
    rank: 4,              // 牌型等级(1-9, 数字越大越好)
    name: "Three of a Kind", // 牌型英文名
    score: 4,             // 用于比较的分数
    cards: [...],         // 最佳5张牌
    description: "..."    // 详细描述
  }
  ```

#### `compare(hand1, hand2)`
比较两手牌的大小
- **参数**: `hand1`, `hand2` - evaluate()返回的结果对象
- **返回**: `number` - 1=hand1胜, -1=hand2胜, 0=平局

#### `findWinners(players, board)`
从多个玩家中找出获胜者
- **参数**:
  - `players` (Array) - 玩家数组，每个包含{id, holeCards}
  - `board` (string[]) - 公共牌
- **返回**: `string[]` - 获胜者ID数组（平局时多人）

#### `getRankName(rank)`
获取牌型中文名称
- **参数**: `rank` (number) - 牌型等级
- **返回**: `string` - 中文牌型名

## 牌型等级
按pokersolver标准，rank值越大牌型越好：
- 1: 高牌
- 2: 一对  
- 3: 两对
- 4: 三条
- 5: 顺子
- 6: 同花
- 7: 葫芦
- 8: 四条
- 9: 同花顺（包含皇家同花顺）

## 使用示例
```javascript
import HandEvaluator from './HandEvaluator.js';

const evaluator = new HandEvaluator();

// 评估单手牌
const result = evaluator.evaluate(['AH', 'AS'], ['AD', 'KC', '7H', '3D', '2S']);
console.log(`牌型: ${evaluator.getRankName(result.rank)}`); // 三条

// 多人比牌
const players = [
  { id: 'player1', holeCards: ['AH', 'AS'] },
  { id: 'player2', holeCards: ['KH', 'KS'] }
];
const winners = evaluator.findWinners(players, ['QC', 'JD', '9H']);
console.log('获胜者:', winners); // ['player1']

// 阶段1.5新增：获取详细牌型信息（用于摊牌展示）
const detailed = evaluator.describeBestHand(['AH', 'AS'], ['AD', 'KC', '7H']);
console.log('牌型:', detailed.rankName);        // "三条"
console.log('最佳5张:', detailed.bestFive);     // ['AH', 'AS', 'AD', 'KC', '7H']
console.log('使用底牌:', detailed.usedHole);    // ['AH', 'AS']
```

## 依赖关系
- **依赖**: pokersolver（第三方牌力评估库）
- **被依赖**: Game, PotManager等游戏逻辑模块

## 技术特点
- **统一接口**: 封装第三方库，提供项目统一API
- **格式转换**: 自动处理内部牌面格式与pokersolver格式转换
- **错误处理**: 完善的输入验证和错误提示
- **性能优化**: 复用pokersolver实例，避免重复计算
- **阶段1.5新增**: 摊牌详细信息展示，支持底牌使用分析

## 测试覆盖
- ✅ 各种牌型正确识别（皇家同花顺到高牌）
- ✅ 牌力比较逻辑验证
- ✅ 多人获胜者确定
- ✅ 平局处理
- ✅ 输入验证和错误处理
- ✅ 格式转换功能