# Rules 模块文档

## 模块概述
rules目录包含德州扑克的规则配置相关模块，负责定义和验证桌面参数、盲注配置、买入规则等游戏规则。

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
- `minPlayers/maxPlayers` - 玩家数量限制（2-3人，MVP阶段）
- `smallBlind/bigBlind` - 小盲/大盲注额
- `minRaise` - 最小加注额（默认等于大盲）
- `noLimit` - 是否无限注模式（默认true）

### 买入规则
- `minBuyIn/maxBuyIn` - 买入金额范围（40BB-100BB）
- `rebuyAllowed` - 是否允许增购（默认true）
- `rebuyOnlyBetweenHands` - 是否仅局间增购（默认true）
- `rebuyMaxAmount` - 增购上限（默认等于maxBuyIn）

### 时间规则（预留）
- `actionTimeoutSeconds` - 行动超时时间（默认30s）
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
import TableRules from './TableRules.js';

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
- 最小玩家数≥2，最大玩家数≤9（MVP阶段限制≤3）
- 小盲 < 大盲，且都为正数  
- 买入范围合理（minBuyIn ≤ maxBuyIn）
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

# TableRulesValidator 模块文档

## 概述
TableRulesValidator模块负责验证TableRules配置参数的合理性，确保游戏规则的逻辑一致性。这是一个静态工具类，提供纯函数式的验证功能。

## 功能特性
- 参数合理性验证
- 错误信息提供
- 边界条件检查
- 静态方法设计

## 核心验证方法

### 主验证接口
```javascript
// 验证完整配置
TableRulesValidator.validate(options);
```

### 具体验证方法
- `validatePlayerCount()` - 验证玩家数量配置
- `validateBlinds()` - 验证盲注配置
- `validateBuyIn()` - 验证买入配置
- `validateRebuy()` - 验证增购配置

## 验证规则详解

### 玩家数量验证
- 最小玩家数≥2
- 最大玩家数≥最小玩家数
- 支持的玩家数量范围检查

### 盲注验证
- 小盲和大盲都必须为正数
- 小盲 < 大盲
- 最小加注额合理性

### 买入验证
- 最小买入 > 0
- 最大买入 ≥ 最小买入
- 买入金额与盲注的合理比例

## 使用示例
```javascript
import TableRulesValidator from './TableRulesValidator.js';

try {
  TableRulesValidator.validate({
    minPlayers: 2,
    maxPlayers: 3,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 800,
    maxBuyIn: 2000
  });
  console.log('配置验证通过');
} catch (error) {
  console.error('配置验证失败:', error.message);
}
```

## 错误处理
验证失败时抛出具有描述性信息的错误：
- `'Minimum players must be at least 2'`
- `'Small blind must be less than big blind'`
- `'Buy-in range is invalid'`

## 依赖关系
- **依赖**: 无（纯函数静态类）
- **被依赖**: TableRules（配置验证）

## 技术特点
- **纯函数**: 无副作用，只进行验证
- **静态设计**: 所有方法都是静态的
- **早期验证**: 在配置对象创建时立即验证
- **清晰错误**: 提供具体的错误信息

## 扩展性考虑
便于添加新的验证规则：
- 新增验证方法
- 扩展现有验证逻辑
- 支持自定义验证规则

---

Rules模块为德州扑克游戏提供了灵活而严格的规则配置系统，通过清晰的参数定义和完善的验证机制，确保游戏规则的正确性和一致性。