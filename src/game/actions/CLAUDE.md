# Actions 模块文档

## 模块概述
actions目录包含德州扑克的动作处理相关模块，负责验证和应用玩家的各种动作（check、bet、call、raise、fold、all-in）。

---

# ActionValidator 模块文档

## 概述
ActionValidator模块负责验证玩家动作的合法性，实现完整的德州扑克规则校验。这是一个纯函数静态类，不修改任何状态，只进行规则验证。

## 功能特性
- 完整的德州扑克动作规则验证
- 支持所有动作类型（check、bet、call、raise、fold、all-in）
- 精确的筹码约束和最小加注规则
- 复杂边界情况处理（非完整加注、all-in等）
- 详细的错误信息返回

## 核心方法

### 主验证接口
```javascript
// 验证玩家动作
const error = ActionValidator.validate(action, gameState, tableRules);
// 返回null表示动作合法，否则返回错误对象
```

### 动作类型验证
- `_validateCheck()` - 验证check动作
- `_validateBet()` - 验证bet动作
- `_validateCall()` - 验证call动作
- `_validateRaise()` - 验证raise动作
- `_validateFold()` - 验证fold动作
- `_validateAllIn()` - 验证all-in动作

## 验证规则详解

### 基础验证
所有动作都需要通过：
- 动作格式验证（必需参数）
- 玩家存在性验证
- 当前轮次验证（必须是currentTurn玩家）
- 玩家状态验证（必须是ACTIVE状态）

### Check 动作
**允许情况**：
- 无人下注且玩家未下注
- 玩家已跟到当前最高注额

**拒绝情况**：
- 有人下注但玩家未跟注
- 需要支付额外筹码才能继续

### Bet 动作
**允许情况**：
- 当前无人下注（amountToCall === 0）
- 下注金额≥最小下注额
- 下注金额≤玩家筹码

**拒绝情况**：
- 已有人下注（应该使用raise）
- 金额小于规定的最小下注额
- 金额超过玩家筹码

### Call 动作
**允许情况**：
- 有人下注需要跟注
- 即使筹码不足也允许（自动all-in）

**拒绝情况**：
- 无人下注（应该使用check）
- 玩家已跟到最高注额

### Raise 动作
**允许情况**：
- 有人下注可以加注
- 行动未被关闭（isActionReopened为true）
- 加注金额≥跟注金额 + 最小加注额
- 加注总额≤玩家筹码

**拒绝情况**：
- 无人下注（应该使用bet）
- 非完整加注后行动已关闭
- 加注额小于最小要求
- 超出筹码限制

### Fold 动作
**允许情况**：
- 任何情况下都允许弃牌

### All-in 动作
**允许情况**：
- 玩家有筹码可以全押

**拒绝情况**：
- 玩家筹码为0

## 最小加注规则
遵循标准德州扑克规则：
- 首次下注：最小金额为大盲注
- 加注：最小加注额为上一次的加注额
- All-in后：根据实际加注额判断是否重开行动

## 使用示例
```javascript
import ActionValidator from './ActionValidator.js';

const action = { type: 'raise', playerId: 'player1', amount: 100 };
const error = ActionValidator.validate(action, gameState, tableRules);

if (error) {
  console.error('Invalid action:', error.message);
  return { success: false, error };
} else {
  // 动作合法，可以应用
  ActionApplier.apply(action, gameState, tableRules);
}
```

## 错误信息格式
```javascript
{
  error: 'INVALID_ACTION',        // 错误类型
  message: '具体错误描述',        // 详细错误信息  
  expected: '期望的正确操作'      // 可选：建议的正确动作
}
```

## 常见错误类型
- `INVALID_ACTION` - 基本动作无效
- `INSUFFICIENT_CHIPS` - 筹码不足
- `INVALID_AMOUNT` - 金额无效
- `ACTION_NOT_ALLOWED` - 当前状况不允许此动作
- `PLAYER_NOT_FOUND` - 玩家不存在
- `OUT_OF_TURN` - 非当前行动玩家

## 依赖关系
- **依赖**: GameState（游戏状态）、TableRules（规则配置）
- **被依赖**: Game（游戏主控制器）

## 技术特点
- **纯函数**: 所有方法都是静态的，无副作用
- **规则完整**: 涵盖德州扑克的所有动作验证规则
- **错误友好**: 提供详细的错误信息帮助调试
- **高性能**: 轻量级验证，不进行状态修改

---

# ActionApplier 模块文档

## 概述
ActionApplier模块负责将验证过的动作安全地应用到游戏状态。采用纯函数式设计，只负责状态变更，不包含业务逻辑验证。

## 功能特性
- 纯函数式状态变更（无副作用）
- 完整的动作状态应用
- 自动处理筹码计算和扣除
- 精确的游戏状态更新
- All-in和非完整跟注的边界处理

## 核心方法

### 主应用接口
```javascript
// 应用验证过的动作到游戏状态
ActionApplier.apply(action, gameState, tableRules);
// 直接修改gameState对象
```

### 状态管理
```javascript
// 重置街道状态（推进街道时调用）
ActionApplier.resetStreetState(gameState);
```

## 动作应用详解

### Check 动作
- 不改变筹码或下注
- 记录动作历史
- 保持当前状态

### Bet 动作
```javascript
// 扣除筹码并更新下注
player.chips -= amount;
player.currentBet = amount;
player.totalBet += amount;

// 更新游戏状态
gameState.amountToCall = amount;
gameState.lastAggressorId = playerId;
gameState.isActionReopened = true;
```

### Call 动作
```javascript
// 计算需要跟注的金额
const amountToCall = gameState.amountToCall - player.currentBet;
const actualCall = Math.min(amountToCall, player.chips);

// 扣除筹码并更新下注
player.chips -= actualCall;
player.currentBet += actualCall;
player.totalBet += actualCall;

// 筹码不足时自动all-in
if (actualCall < amountToCall) {
  player.status = 'ALL_IN';
  gameState.isActionReopened = false; // 非完整跟注关闭行动
}
```

### Raise 动作
```javascript
// 计算加注金额
const raiseAmount = amount - player.currentBet;

// 扣除筹码并更新下注
player.chips -= raiseAmount;
player.currentBet = amount;
player.totalBet += raiseAmount;

// 更新游戏状态
gameState.amountToCall = amount;
gameState.lastAggressorId = playerId;
gameState.isActionReopened = true;
```

### Fold 动作
```javascript
// 设置玩家状态
player.status = 'FOLDED';
player.holeCards = []; // 清除手牌保护隐私

// 更新活跃玩家计数
gameState.updateActivePlayers();
```

### All-in 动作
```javascript
// 全押所有筹码
const allInAmount = player.chips;
player.chips = 0;
player.currentBet += allInAmount;
player.totalBet += allInAmount;
player.status = 'ALL_IN';

// 检查是否构成加注
if (player.currentBet > gameState.amountToCall) {
  const actualRaise = player.currentBet - gameState.amountToCall;
  gameState.amountToCall = player.currentBet;
  gameState.lastAggressorId = playerId;
  
  // 判断是否为完整加注
  if (actualRaise >= minRaise) {
    gameState.isActionReopened = true;
  } else {
    gameState.isActionReopened = false; // 非完整加注
  }
}
```

## 状态重置机制
推进街道时重置回合状态：
```javascript
static resetStreetState(gameState) {
  gameState.amountToCall = 0;
  gameState.lastAggressorId = null;
  gameState.isActionReopened = true;
  gameState.actionHistory = [];
  
  // 重置玩家本街下注
  gameState.players.forEach(player => {
    player.currentBet = 0;
  });
  
  gameState.updateActivePlayers();
}
```

## 辅助功能

### 动作历史记录
```javascript
// 记录每个动作到历史中
gameState.actionHistory.push({
  playerId: action.playerId,
  action: action.type,
  amount: action.amount || 0,
  timestamp: Date.now()
});
```

### 筹码计算
```javascript
// 计算玩家需要跟注的金额
static _calculateAmountToCall(gameState, player) {
  return Math.max(0, gameState.amountToCall - player.currentBet);
}
```

### 最小加注管理
```javascript
// 更新最小加注额
static _updateMinRaise(gameState, raiseAmount, tableRules) {
  // 记录本次加注额作为下次最小加注额
}
```

## 使用示例
```javascript
import ActionApplier from './ActionApplier.js';

// 假设动作已通过ActionValidator验证
const action = { type: 'raise', playerId: 'player1', amount: 100 };

// 应用动作到游戏状态
ActionApplier.apply(action, gameState, tableRules);

// 检查状态变更
console.log('Player chips:', gameState.getPlayer('player1').chips);
console.log('Amount to call:', gameState.amountToCall);
console.log('Last aggressor:', gameState.lastAggressorId);

// 推进街道时重置状态
ActionApplier.resetStreetState(gameState);
```

## 边界情况处理

### 筹码不足场景
- **Call时筹码不足**: 自动转为all-in，设置相应状态
- **非完整跟注**: 关闭行动重开，避免无限循环
- **All-in加注**: 根据实际加注额判断是否重开行动

### 状态一致性
- 自动更新活跃玩家计数
- 维护精确的amountToCall状态
- 正确设置lastAggressorId和isActionReopened

## 依赖关系
- **依赖**: GameState（状态修改）、TableRules（规则参数）
- **被依赖**: Game（游戏主控制器）

## 技术特点
- **纯函数式**: 无副作用，只进行状态变更
- **职责单一**: 专注状态应用，不包含验证逻辑
- **边界完善**: 处理各种筹码不足和all-in场景
- **状态精确**: 维护游戏状态的一致性和准确性

## 错误处理
ActionApplier假设传入的动作已经过ActionValidator验证，因此不进行额外的错误检查。如果传入无效动作，可能导致状态不一致。正确的使用方式是：

```javascript
// 1. 先验证
const error = ActionValidator.validate(action, gameState, tableRules);
if (error) return { success: false, error };

// 2. 后应用
ActionApplier.apply(action, gameState, tableRules);
return { success: true };
```