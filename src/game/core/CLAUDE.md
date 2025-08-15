# Core 模块文档

## 模块概述
core目录包含德州扑克游戏的基础核心组件，提供牌堆管理和牌力评估的底层功能，是整个游戏系统的基石。

---

# Deck 模块文档

## 概述
Deck模块负责德州扑克的牌堆管理，提供标准52张牌的创建、洗牌、发牌等核心功能。这是一个无状态的纯功能类，确保牌堆操作的可靠性和可测试性。

## 功能特性
- 标准52张牌初始化
- Fisher-Yates洗牌算法
- 单张和批量发牌
- 剩余牌数查询
- 牌堆状态检查
- 完整的牌堆重置

## 牌面格式规范
Deck使用统一的2字符牌面格式：
- **点数**: 2-9, T(10), J(11), Q(12), K(13), A(14)
- **花色**: S(黑桃), H(红心), D(方块), C(梅花)
- **示例**: 'AH'(红心A), 'KS'(黑桃K), 'TC'(梅花10)

## 核心方法

### 初始化和重置
```javascript
// 创建新牌堆
const deck = new Deck();

// 重置到初始状态（52张牌）
deck.reset();
```

### 洗牌操作
```javascript
// Fisher-Yates算法洗牌
deck.shuffle();
// 确保随机性和公平性
```

### 发牌操作
```javascript
// 发一张牌
const card = deck.dealOne();
// 返回: 'AH' | null（牌堆空时）

// 发多张牌
const cards = deck.dealMany(5);
// 返回: ['AH', 'KS', 'QD', ...] （最多发完所有剩余牌）
```

### 状态查询
```javascript
// 获取剩余牌数
const remaining = deck.getRemainingCount();
// 返回: 0-52

// 检查是否有足够的牌
const hasEnough = deck.hasEnough(5);
// 返回: boolean
```

## 使用示例

### 基本游戏流程
```javascript
import Deck from './Deck.js';

// 开始新一轮
const deck = new Deck();
deck.shuffle();

// 发手牌（每人2张）
const players = ['alice', 'bob', 'charlie'];
const holeCards = {};

players.forEach(playerId => {
  holeCards[playerId] = deck.dealMany(2);
});

console.log('Alice的手牌:', holeCards.alice); // ['AH', 'KD']

// 发公共牌
const flop = deck.dealMany(3);      // 翻牌
const turn = deck.dealOne();        // 转牌
const river = deck.dealOne();       // 河牌

console.log('公共牌:', [...flop, turn, river]); // ['QS', 'JC', 'TD', '9H', '8S']

// 检查剩余牌数
console.log('剩余牌数:', deck.getRemainingCount()); // 52 - 2*3 - 5 = 41
```

### 错误处理
```javascript
// 牌堆耗尽时的处理
while (deck.getRemainingCount() > 0) {
  const card = deck.dealOne();
  console.log('发牌:', card);
}

// 牌堆空时返回null
const emptyCard = deck.dealOne();
console.log(emptyCard); // null

// 批量发牌不足时返回剩余所有牌
deck.reset();
deck.dealMany(50); // 发掉50张
const lastCards = deck.dealMany(5); // 只能得到2张
console.log(lastCards.length); // 2
```

## 技术特点
- **纯函数设计**: 所有操作都是可预测的
- **Fisher-Yates算法**: 确保洗牌的统计学随机性
- **边界安全**: 处理牌堆耗尽等边界情况
- **格式统一**: 与HandEvaluator等模块兼容的牌面格式
- **性能优化**: 简单高效的数组操作

## 依赖关系
- **依赖**: 无（纯JavaScript实现）
- **被依赖**: Game、HandEvaluator、ReplayEngine等需要牌堆功能的模块

---

# HandEvaluator 模块文档

## 概述
HandEvaluator模块负责德州扑克的牌力评估和比较，封装第三方pokersolver库，提供统一的牌力分析接口。支持7张牌（2张手牌+5张公共牌）的最佳5张组合评估。

## 功能特性
- 7张牌的最佳5张组合评估
- 多玩家牌力比较和获胜者确定
- 牌型等级和中文名称映射
- 牌面格式转换和兼容性处理
- **阶段1.5新增**: 摊牌结果详细分析
- 完整的错误处理和边界检查

## 牌力评估等级
HandEvaluator使用1-9的牌力等级系统：
1. **高牌** (High Card)
2. **一对** (Pair)
3. **两对** (Two Pair)
4. **三条** (Three of a Kind)
5. **顺子** (Straight)
6. **同花** (Flush)
7. **葫芦** (Full House)
8. **四条** (Four of a Kind)
9. **同花顺** (Straight Flush, 包含皇家同花顺)

## 核心方法

### 基础评估
```javascript
// 评估单个玩家的牌力
const result = handEvaluator.evaluate(holeCards, board);
// 参数: ['AH', 'KD'], ['QS', 'JC', 'TD', '9H', '8S']
// 返回: { rank: 5, name: 'Straight', score: 5, cards: [...], description: '...' }
```

### 牌力比较
```javascript
// 比较两手牌的大小
const comparison = handEvaluator.compare(hand1, hand2);
// 返回: 1=hand1胜, -1=hand2胜, 0=平局
```

### 获胜者确定
```javascript
// 从多个玩家中找出获胜者
const winners = handEvaluator.findWinners(players, board);
// 参数: [{ id: 'alice', holeCards: ['AH', 'KD'] }, ...], ['QS', 'JC', 'TD', '9H', '8S']
// 返回: ['alice'] 或 ['alice', 'bob'] (平局时多人)
```

### 工具方法
```javascript
// 获取牌型中文名称
const rankName = handEvaluator.getRankName(5);
// 返回: '顺子'
```

## 阶段1.5新增功能

### 摊牌详细分析
```javascript
// 描述最佳手牌组合（用于摊牌展示）
const detailed = handEvaluator.describeBestHand(holeCards, board);
// 返回: {
//   score: 5,
//   rankName: '顺子',
//   bestFive: ['AS', 'KH', 'QD', 'JC', 'TH'],
//   usedHole: ['AS', 'KH']  // 使用的底牌
// }
```

### 底牌使用分析
describeBestHand方法会自动分析最佳5张牌组合中使用了哪些底牌：
- **完全使用**: 两张底牌都在最佳组合中
- **部分使用**: 仅一张底牌在最佳组合中
- **未使用**: 完全依靠公共牌形成最佳组合

## 格式转换机制
HandEvaluator自动处理两种牌面格式：
- **项目格式**: 'AH'（红心A）
- **pokersolver格式**: 'Ah'（红心a）

转换规则：
- 点数保持不变：A, K, Q, J, T, 9-2
- 花色转换：S→s, H→h, D→d, C→c

## 使用示例

### 基本牌力评估
```javascript
import HandEvaluator from './HandEvaluator.js';

const evaluator = new HandEvaluator();

// 评估一手牌
const holeCards = ['AH', 'AD'];
const board = ['KS', 'QH', 'JC', 'TD', '9S'];

const result = evaluator.evaluate(holeCards, board);
console.log(`牌型: ${result.name}`);           // "Straight"
console.log(`等级: ${result.rank}`);           // 5
console.log(`中文: ${evaluator.getRankName(result.rank)}`); // "顺子"
```

### 多人对决
```javascript
const players = [
  { id: 'alice', holeCards: ['AH', 'AD'] },  // 一对A
  { id: 'bob', holeCards: ['KH', 'KD'] },    // 一对K
  { id: 'charlie', holeCards: ['QH', 'JH'] } // 高牌
];

const board = ['TS', '9C', '8D', '7H', '2S'];
const winners = evaluator.findWinners(players, board);

console.log('获胜者:', winners); // ['alice']
```

### 阶段1.5摊牌展示
```javascript
// 获取获胜者详细信息用于界面展示
const detailed = evaluator.describeBestHand(['AH', 'AD'], board);

console.log('获胜牌型:', detailed.rankName);        // "一对"
console.log('最佳五张:', detailed.bestFive);         // ['AH', 'AD', 'TS', '9C', '8D']
console.log('使用底牌:', detailed.usedHole);         // ['AH', 'AD']

// UI显示逻辑
if (detailed.usedHole.length === 2) {
  console.log('🃏 使用了两张底牌');
} else if (detailed.usedHole.length === 1) {
  console.log('🃏 使用了一张底牌');
} else {
  console.log('🃏 完全依靠公共牌');
}
```

### 错误处理
```javascript
try {
  // 不足5张牌的错误处理
  const result = evaluator.evaluate(['AH'], ['KS']);
} catch (error) {
  console.error(error.message); // "至少需要5张牌才能评估"
}

try {
  // 无效牌面格式的错误处理
  const result = evaluator.evaluate(['XX', 'YY'], ['KS', 'QH', 'JC']);
} catch (error) {
  console.error(error.message); // "无效的牌面格式: XX"
}
```

## 技术实现特点

### 第三方库集成
- **pokersolver**: 成熟的牌力评估库
- **格式转换**: 透明的格式兼容性处理
- **错误封装**: 将第三方库异常转换为项目标准错误

### 性能优化
- **缓存友好**: 评估结果结构化，便于缓存
- **批量处理**: findWinners方法高效处理多玩家对决
- **格式转换**: 最小化格式转换开销

### 扩展性设计
- **中文映射**: 支持本地化的牌型名称
- **详细分析**: 阶段1.5扩展的摊牌分析功能
- **接口稳定**: 向后兼容的API设计

## 错误处理策略
HandEvaluator实现了完善的错误处理：
- **输入验证**: 严格的参数类型和数量检查
- **格式验证**: 牌面格式有效性验证
- **第三方异常**: pokersolver异常的捕获和转换
- **边界情况**: 牌数不足等边界情况的优雅处理

## 依赖关系
- **依赖**: pokersolver（第三方牌力评估库）
- **被依赖**: Game、PotManager、TournamentManager等需要牌力比较的模块

## 阶段1.5集成要点
HandEvaluator在阶段1.5中新增了摊牌详细展示功能：
- **Game集成**: Game.js在摊牌时调用describeBestHand方法
- **UI展示**: 客户端使用详细信息展示获胜者牌型
- **数据完整**: 提供牌型名称、最佳组合、底牌使用等完整信息

## 技术特点总结
- **专业性**: 基于成熟的pokersolver库确保算法准确性
- **易用性**: 简洁的API设计和完善的错误提示
- **兼容性**: 无缝的格式转换和向后兼容
- **扩展性**: 便于添加新的分析功能和本地化支持
- **可靠性**: 全面的错误处理和边界情况覆盖

Core模块为德州扑克游戏提供了坚实的基础功能，Deck确保了公平的牌堆管理，HandEvaluator提供了准确的牌力评估，两者共同构成了游戏系统的核心基石。