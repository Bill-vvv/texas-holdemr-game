# Pot 模块文档

## 模块概述
pot目录包含德州扑克的彩池管理相关模块，负责处理复杂的多层边池构建、下注收集和彩池分配逻辑。

---

# PotManager 模块文档

## 概述
PotManager模块是德州扑克彩池管理的核心，负责处理从简单主池到复杂多层边池的完整彩池生命周期。严格遵循计划文档12.3的每街清算原则，实现精确的彩池分配算法。

## 功能特性
- 每街下注自动收集到彩池
- 基于all-in金额的多层边池拆分
- 摊牌时的精确彩池分配
- 余数处理（按钮位后顺时针分配）
- 彩池合并优化（相同参与者的池子自动合并）
- 完整的彩池摘要信息

## 核心方法

### 彩池收集
```javascript
// 从当前街道收集所有玩家下注
const pots = PotManager.collectBetsFromStreet(players, existingPots);

// 清空所有彩池（新一轮开始时）
const emptyPots = PotManager.clearPots();
```

### 彩池分配
```javascript
// 摊牌时分配所有彩池
const results = PotManager.distributePots(
  pots, players, board, handEvaluator, buttonIndex
);
```

### 彩池信息
```javascript
// 获取彩池摘要信息
const summary = PotManager.getPotsSummary(pots);
```

## 多层边池构建算法

### 基本原理
多层边池基于玩家的总投入金额（totalBet）构建：
1. **按投入排序**: 将所有有下注的玩家按totalBet升序排序
2. **分层构建**: 为每个不同的投入阈值创建一层边池
3. **参与者确定**: 每层池子只包含达到该阈值的玩家
4. **金额计算**: 每层的金额 = (当前阈值 - 前一阈值) × 参与者数量

### 构建示例
```javascript
// 玩家投入情况
const players = [
  { id: 'player1', totalBet: 100, status: 'ALL_IN' },  // all-in 100
  { id: 'player2', totalBet: 150 },                     // 下注 150  
  { id: 'player3', totalBet: 150 }                      // 下注 150
];

// 生成的边池结构
const pots = [
  {
    id: 'pot_1',
    amount: 300,           // 3人 × 100 = 300
    eligiblePlayers: ['player1', 'player2', 'player3'],
    threshold: 100,
    type: 'main'           // 所有人参与为主池
  },
  {
    id: 'pot_2', 
    amount: 100,           // 2人 × 50 = 100  
    eligiblePlayers: ['player2', 'player3'],
    threshold: 150,
    type: 'side'           // 边池
  }
];
```

### 三层边池示例
```javascript
// 复杂的all-in场景
const players = [
  { id: 'player1', totalBet: 50, status: 'ALL_IN' },   // all-in 50
  { id: 'player2', totalBet: 100, status: 'ALL_IN' },  // all-in 100
  { id: 'player3', totalBet: 200 }                     // 下注 200
];

// 生成三层边池
const pots = [
  { amount: 150, eligiblePlayers: ['player1', 'player2', 'player3'] }, // 3×50
  { amount: 100, eligiblePlayers: ['player2', 'player3'] },             // 2×50  
  { amount: 100, eligiblePlayers: ['player3'] }                         // 1×100
];
```

## 彩池分配机制

### 分配原则
1. **牌力比较**: 使用HandEvaluator评估所有有资格玩家的牌力
2. **最佳确定**: 找出每个池子中牌力最强的玩家（可能多人平局）
3. **筹码分配**: 平分彩池金额，余数按位置顺序分配
4. **直接获得**: 只有一人有资格时直接获得整个池子

### 位置顺序余数分配
按钮位后顺时针顺序分配余数，按钮位玩家最后获得：
```javascript
// 100筹码被3个获胜者平分：每人33，余数1
// 按钮位为0，获胜者为player1(0)、player2(1)、player3(2)
// 余数分配顺序：player2 → player3 → player1（按钮最后）
const distribution = {
  sharePerWinner: 33,
  remainder: 1,
  remainderRecipients: ['player2'] // 按钮后第一位获得余数
};
```

### 分配结果格式
```javascript
const distributionResult = {
  potId: 'pot_1',
  amount: 300,
  winners: ['player1', 'player2'],          // 获胜者列表
  winningHand: {
    rank: 8,                                // 牌型等级
    name: '一对',                           // 中文牌型名
    cards: ['AH', 'AS', 'KD', 'QC', 'JH']  // 最佳五张牌
  },
  distribution: {
    sharePerWinner: 150,                    // 每人获得
    remainder: 0,                           // 余数
    remainderRecipients: []                 // 余数接收者
  },
  reason: 'best_hand'                       // 获胜原因
};
```

## 彩池合并优化
相同参与者的彩池会自动合并，提高效率：
```javascript
// 原始彩池
const existingPots = [
  { amount: 100, eligiblePlayers: ['player1', 'player2'] }
];

// 新收集的下注也是这两个玩家参与
const newBets = [
  { id: 'player1', currentBet: 50 },
  { id: 'player2', currentBet: 50 }
];

// 自动合并为
const mergedPots = [
  { amount: 200, eligiblePlayers: ['player1', 'player2'] } // 100 + 100
];
```

## 彩池摘要信息
```javascript
const summary = {
  totalAmount: 450,        // 所有彩池总金额
  potCount: 3,             // 彩池数量
  mainPotAmount: 300,      // 主池金额
  sidePotAmount: 150,      // 所有边池金额
  pots: [                  // 每个池子的摘要
    {
      id: 'pot_1',
      amount: 300,
      type: 'main',
      eligiblePlayerCount: 3
    },
    // ... 其他池子
  ]
};
```

## 边界情况处理

### 所有玩家all-in
```javascript
// 三个玩家都all-in，不同金额
const players = [
  { id: 'player1', totalBet: 100, status: 'ALL_IN' },
  { id: 'player2', totalBet: 200, status: 'ALL_IN' },
  { id: 'player3', totalBet: 150, status: 'ALL_IN' }
];

// 会产生3层边池，精确分配每一层
```

### 零金额池子
分配时自动跳过金额为0的池子，不进行处理。

### 无人有资格
理论上不应该出现，但代码会安全跳过此类池子。

### 只有一人有资格
直接将整个池子分配给该玩家，不进行牌力比较。

## 使用示例

### 基本彩池收集
```javascript
import PotManager from './PotManager.js';

// 游戏进行中，玩家下注完成
const players = [
  { id: 'player1', currentBet: 50, totalBet: 50 },
  { id: 'player2', currentBet: 100, totalBet: 100 },
  { id: 'player3', currentBet: 100, totalBet: 100 }
];

// 街道结束，收集下注到彩池
const pots = PotManager.collectBetsFromStreet(players);

console.log('收集到的彩池:', pots);
// 会产生两层边池：主池150(3×50) + 边池100(2×50)

// 玩家的currentBet会被清零
console.log('玩家currentBet:', players.map(p => p.currentBet));
// [0, 0, 0]
```

### 摊牌时彩池分配
```javascript
// 摊牌阶段，分配所有彩池
const board = ['AS', 'KD', 'QC', 'JH', '10S'];
const results = PotManager.distributePots(
  pots, players, board, handEvaluator, 0
);

// 检查分配结果
results.forEach(result => {
  console.log(`池子${result.potId}: ${result.amount}筹码`);
  console.log(`获胜者: ${result.winners.join(', ')}`);
  console.log(`获胜牌型: ${result.winningHand.name}`);
  
  // 筹码已自动分配到玩家账户
  result.winners.forEach(winnerId => {
    const player = players.find(p => p.id === winnerId);
    console.log(`${winnerId}筹码: ${player.chips}`);
  });
});
```

### 彩池信息查询
```javascript
// 获取当前彩池状态
const summary = PotManager.getPotsSummary(pots);

console.log(`总彩池: ${summary.totalAmount}筹码`);
console.log(`${summary.potCount}个池子`);
console.log(`主池: ${summary.mainPotAmount}, 边池: ${summary.sidePotAmount}`);

// 显示给客户端
return {
  ...gameState,
  pots: summary
};
```

## 技术实现细节

### 位置排序算法
```javascript
// 按钮位后顺时针距离排序，按钮位距离设为最大（最后分配）
static _sortWinnersByPosition(winners, buttonIndex, allPlayers) {
  return winners.sort((a, b) => {
    const posA = allPlayers.findIndex(p => p.id === a.playerId);
    const posB = allPlayers.findIndex(p => p.id === b.playerId);
    
    // 按钮位距离为最大值，其他按顺时针距离排序
    const distanceA = posA === buttonIndex ? 
      allPlayers.length : (posA - buttonIndex + allPlayers.length) % allPlayers.length;
    const distanceB = posB === buttonIndex ? 
      allPlayers.length : (posB - buttonIndex + allPlayers.length) % allPlayers.length;
    
    return distanceA - distanceB;
  });
}
```

### 数组比较优化
```javascript
// 快速比较两个参与者数组是否相同（用于池子合并）
static _arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((val, index) => val === arr2[index]);
}
```

## 依赖关系
- **依赖**: HandEvaluator（牌力评估）
- **被依赖**: Game（游戏主控制器）

## 技术特点
- **算法精确**: 实现标准德州扑克边池分配规则
- **性能优化**: 自动合并相同参与者的池子
- **边界完善**: 处理所有可能的all-in组合场景  
- **余数公平**: 严格按位置顺序分配，确保公平性
- **静态设计**: 无状态类，所有方法都是静态的

## 调试技巧
PotManager的复杂逻辑可能需要调试，建议：
1. **打印边池结构**: 查看每层池子的参与者和金额
2. **验证总金额**: 确保边池总额等于玩家投入总额
3. **检查余数分配**: 验证余数分配的位置顺序
4. **牌力对比**: 确认HandEvaluator返回的牌力评估正确

PotManager是德州扑克中最复杂的模块之一，但通过清晰的分层设计和完整的测试用例，确保了算法的正确性和可靠性。