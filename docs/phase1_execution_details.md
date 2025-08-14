## 阶段一执行细节（Game Loop MVP）——含完整规则与边界处理（KISS / YAGNI）

本文件从 `plan_detailed.md` 提炼并深化阶段一内容，作为落地执行指南。严格遵循 KISS / YAGNI：仅实现“一轮”所需的完整规则；生命周期、持久化、UI 优化、部署等延后。

---

### 1. 目标与验收

- 目标：稳定跑通从发牌到摊牌/弃牌结束的一轮流程，支持 2–3 人桌；All-in 与边池正确；增购仅局间允许；最简 UI 可操控演示。
- 验收：
  - 双人与三人完整一轮可重复演示；
  - 典型 All-in/边池场景分配正确；
  - 单元/集成测试通过；
  - 任一源文件 < 200 行。

---

### 2. 技术栈与目录

- 后端：Node.js LTS（18+）、Socket.IO（或 ws），可选 Express（静态页/健康检查）。
- 前端：原生 HTML/CSS/JS + Socket.IO 客户端（或原生 WebSocket）。
- 牌力：封装 `pokersolver` 或 `poker-evaluator` 为统一接口。
- 日志：`pino`（或 console）。

参考目录（保持单文件 <200 行，必要时拆分）：
```text
src/
  server/{server.js, playerRegistry.js, protocol.js}
  game/
    {Game.js, GameState.js, TurnManager.js, BlindsManager.js}
    actions/{ActionValidator.js, ActionApplier.js}
    pot/{PotManager.js}
    core/{Deck.js, HandEvaluator.js}
    rules/{TableRules.js}
ui/public/{index.html, client.js}
test/unit/*  test/integration/*
```

---

### 3. 执行流程（状态机）

1) 初始化桌面：设按钮/盲注；洗牌；每人两张手牌；street=PRE_FLOP。
2) 回合循环：`currentTurn` 等待动作 → 校验 → 应用 → 广播。
3) 回合闭合：下注量一致且无待行动者，或仅一人未弃牌 → 推进下一街。
4) 街道推进：PRE_FLOP→FLOP(3)→TURN(1)→RIVER(1)→SHOWDOWN。
5) 摊牌结算：根据参与资格对每个池比牌并分配。
6) 轮次结束：清理临时字段；按钮右移；（增购仅此时允许）。

---

### 4. 通信协议（全量状态广播）

- C→S：`{"type":"playerAction","payload":{"action":"bet","amount":100}}`
- S→C（公共）：`{"type":"gameState","data":{players, community, pots, currentTurn, street}}`
- S→C（私有）：`{"type":"privateState","data":{holeCards}}`

说明：保持全量广播，避免复杂增量同步。

---

### 5. 组件职责与关键接口

- Game（聚合根）
  - `applyAction({playerId, type, amount?})`
  - `getPublicState()` / `getPrivateStateFor(playerId)`
- TurnManager
  - `getCurrentActor()`, `isRoundClosed()`, `advanceStreet()`
- BlindsManager
  - `setupBlindsAndButton(players)`, `getPreflopFirstActor()`, `getPostflopFirstActor()`
- ActionValidator
  - `validate(action, gameState)` → ok/errors
- ActionApplier
  - `apply(action, gameState)` → newState（归集下注、推进指针）
- PotManager
  - `accumulateBets()`（本街归集）
  - `splitSidePots()`（按阈值拆分）
  - `settle(pots, players, board, evaluator)`（按资格/牌力分配）
- Deck
  - `shuffle()`, `dealToPlayer(player, n)`, `dealCommunity(n)`
- HandEvaluator
  - `evaluate(holeCards, board)` → score，可比较
- TableRules
  - `smallBlind`, `bigBlind`, `minRaiseUnit`, `rebuyAllowedBetweenRounds=true`

---

### 6. 完整规则（第一阶段实现范围）

#### 6.1 基本桌面规则

- 人数：2–3 人（MVP 上限 3）。
- 盲注：小盲/大盲固定值，`TableRules` 配置。
- 按钮位：每轮结束顺时针移动一位。
- 座次：数组顺序代表顺时针；按钮索引记录于 `buttonIndex`。

#### 6.2 行动顺序规则

- Heads-up（双人）：
  - Preflop：按钮位（亦小盲）先行动；
  - Flop/Turn/River：按钮位后行动。
- 三人局：
  - Preflop：大盲左侧第一位先行动；
  - 翻牌后各街：按钮左侧第一位先行动。
- 若某玩家弃牌或 all-in，则被跳过；`TurnManager` 仅在“有行动资格”的玩家间轮转。

#### 6.3 动作与下注规则

- 动作集合：`check`, `bet(amount)`, `call`, `raise(amount)`, `fold`, `all-in(amount)`。
- 金额规则：
  - `bet/raise` 金额必须 ≥ 当前最小要求；
  - `minRaise` = 上次加注后新的最高注额与此前最高注额之差；
  - `all-in` 允许少于 `minRaise`（形成无法再加注的“非完整加注”情形）。
- 资金约束：任何 `amount` 不得超过玩家当前可用筹码；`call` 金额按差额取 min(差额, 筹码)。
- 回合闭合：当所有未弃牌且未 all-in 的玩家下注额相等，并且最后一次进攻（bet/raise）被响应完毕时，本街闭合。

#### 6.4 彩池与边池（All-in）

- 归集：每当新一街开始或摊牌前，将各玩家本街投注归集到主池/边池集合中。
- 拆分：
  - 以各玩家总投入的升序阈值逐层切分；
  - 每个池包含“达到该层阈值”的玩家集合；
  - 任何低于阈值的玩家不参与更高层边池。
- 分配：
  - 对每个池计算参与者的最佳牌力；
  - 高分者平分该池（如平手，按人数均分，余数规则见 6.8）。

#### 6.5 弃牌与提前结束

- 当除一名玩家外全部弃牌时，立即结束一轮，该玩家无需摊牌即获得所有主池及其有资格参与的边池。

#### 6.6 发牌与烧牌（简化）

- 本阶段不实现烧牌（burn），发牌顺序不影响结果；如需贴近现实可在 `Deck` 增加占位逻辑（不改变概率分布）。

#### 6.7 发牌/公共牌数量

- 手牌：每位玩家两张面朝下；
- 公共牌：FLOP 3 张，TURN 1 张，RIVER 1 张；
- 摊牌：评估手牌+公共牌 7 取 5 最佳组合。

#### 6.8 分池余数（不可整除筹码）

- 若分配时出现不可整除的最小单位余数（以整数筹码为单位），采用“最近按钮位后的顺时针顺序分配余数”（公平规则）；MVP 可先不实现余数（选择筹码单位可被整除以规避）。

#### 6.9 增购筹码（Rebuy/Add-on）

- 仅在两轮之间允许；进行中禁止；上限/步长由 `TableRules` 配置（本阶段可固定上限）。

#### 6.10 超时与断线（本阶段简化）

- 不实现自动超时弃牌；断线后可刷新页面重连为新连接（生命周期与原位重连留待阶段二）。

---

### 7. 典型边界用例（必须覆盖）

1) 双人：小盲按钮玩家 Preflop 先行动；对手直接 all-in；按钮玩家 `call` → 摊牌 → 唯一主池分配。
2) 三人：A 短筹 all-in，B/C 继续下注与加注，形成两层或三层边池；摊牌按资格多池分配。
3) Preflop 直接弃牌：首个行动玩家弃牌后，若另一位为大盲且未有进攻，直接赢得当前池（无人跟注）。
4) 非完整加注：一玩家 all-in 金额不足以构成完整加注，后续仅允许跟注或弃牌（不得再加注）。
5) 同分平分：两位或多位在某一池评分相同，按平分处理（MVP 可保证筹码单位可整除）。

---

### 8. 最简 UI（演示所需）

- 元素：公共牌区、玩家区（名/筹码/本街投注/回合高亮）、彩池合计、日志、动作按钮与金额输入。
- 行为：连接 WS → 接收 `gameState`/`privateState` → 渲染；发送 `playerAction`。
- 无路由/无框架；仅最小 DOM 操作。

---

### 9. 测试计划

- 单元：
  - Deck：发牌数量、洗牌基本随机性；
  - Evaluator：典型组合相对大小；
  - PotManager：两层/三层边池切分与分配；
  - ActionValidator：最小加注、非完整加注、call 资金不足、turn 轮转。
- 集成：
  - Heads-up all-in 到摊牌；
  - 三人一人短筹 all-in 形成多层边池；
  - 直接弃牌提前结束。

---

### 10. 任务分解与排期（5–8 人日）

1) 骨架与联通（0.5d）：`server.js`/`index.html`/`client.js`，状态广播。
2) 核心库封装（0.5–1d）：`Deck`/`HandEvaluator` 与单测。
3) Turn/Blinds（1d）：行动与位置规则，含 heads-up 特例。
4) 动作管线（1–1.5d）：Validator/Applier 与广播、日志。
5) PotManager（1–1.5d）：多层边池；分配接口。
6) UI 最简（0.5–1d）：渲染、动作上报、日志。
7) 集成与收尾（0.5–1d）：三主场景通过与回归。

---

### 11. 交付物

- 可运行的最小端到端演示；
- `test` 单元+集成测试通过；
- `README` 启动说明与“单文件 <200 行”原则声明。




---

### 12. 规则精化与实现建议（编码落地要点）

以下内容来自对阶段一执行细节的工程化评审，旨在在不改变既有宏观设计的前提下，补强最易出错的“回合闭合、职责边界、彩池归集、非完整加注”等微观实现细节。保持 KISS/YAGNI，仅增加必要状态与职责划分。

#### 12.1 回合闭合的精确状态模型（必须）

为消除“下注额相等但并未真正闭合”的二义性，在 `GameState` 引入显式字段：

```javascript
// 回合（本街）级状态字段（示意，落地于 src/game/GameState.js）
amountToCall: number            // 当前街需匹配到的总下注额（桌面最高注）
lastAggressorId: string | null  // 本街最近一次 bet/raise/all-in 的玩家 ID（进攻者）
activePlayersCount: number      // 未弃牌且未 all-in 的可行动玩家数
isActionReopened: boolean       // 本街是否允许再次加注（完整加注重开，非完整加注关闭）
```

`TurnManager.isRoundClosed(state)` 判断建议：

- 若 `activePlayersCount <= 1` → 闭合（仅一人有行动资格）。
- 若 `amountToCall > 0`：
  - 当行动轮回到 `lastAggressorId` → 闭合（最后进攻者被“追平”）。
  - 或所有仍可行动玩家的 `currentBet === amountToCall` → 闭合。
- Preflop 特例：无人加注时轮到大盲位，大盲选择 `check` 后闭合。

以上将自然语言规则转化为确定性的布尔计算，避免“刚 call 完即被误判闭合”等时序陷阱。

#### 12.2 职责界定（去“上帝模块”）

- `ActionApplier`：纯状态转换（无 I/O、无流程推进、无指针移动）。输入 `action + state`，返回“新 state”。
- `Game.applyAction`：负责调用校验/应用后，基于“新 state”决定推进街道或轮转行动。

```javascript
// 伪代码（落地于 src/game/Game.js）
applyAction(action) {
  const err = validator.validate(action, state);
  if (err) throw new Error(err);

  state = applier.apply(action, state); // 纯函数

  if (turnManager.isRoundClosed(state)) {
    potManager.collectBetsFromStreet(state.players, state.pots);
    turnManager.advanceStreet(state); // 进入下一街时请重置：amountToCall=0, lastAggressorId=null, isActionReopened=true
  } else {
    turnManager.advanceTurn(state);
  }
}
```

#### 12.3 彩池管理时机简化（每街清算）

在“本街闭合”与“推进下一街”之间，立即调用归集：

```javascript
// 伪接口（落地于 src/game/pot/PotManager.js）
collectBetsFromStreet(players, pots) {
  // 1) 收集 currentBet>0 的玩家；2) 升序分层构建主池/边池；3) 将对应金额写入 pots
  // 4) players.forEach(p => p.currentBet = 0)
}
```

好处：

- 每街起点都“干净”（所有 `currentBet` 清零），降低后续逻辑复杂度；
- 边池拆分不再需要回溯多街资金轨迹。

#### 12.4 非完整加注的显式状态（re-open 规则）

- 当出现“加注额度 < 最小加注额度”的 all-in（非完整加注）时：`isActionReopened = false`。
- 当出现“加注额度 ≥ 最小加注额度”的完整加注时：`isActionReopened = true`。
- `ActionValidator` 在校验 `raise` 时若 `!isActionReopened` → 拒绝（仅允许 `call/fold`）。

注意：进入下一街时统一重置 `isActionReopened=true`。

#### 12.5 推进与重置建议（一致性）

- 进入新街：`amountToCall=0`，`lastAggressorId=null`，`isActionReopened=true`，`players[*].currentBet=0`（已由归集完成），并重新计算 `activePlayersCount`。
- 摊牌前再执行一次 `collectBetsFromStreet`，确保最后一街下注全部入池。

#### 12.6 与既有章节的对应关系

- 第 5 章 组件职责：补充上述状态字段与职责边界；`PotManager` 新增 `collectBetsFromStreet`；`TurnManager` 的闭合判定使用 `amountToCall/lastAggressorId`。
- 第 6 章 规则：在 6.3/6.4 强化“最小加注/非完整加注”的 re-open 规则与 Preflop 大盲过牌闭合特例。
- 第 9 章 测试：新增“非完整加注不重开”“大盲过牌闭合”“闭合后归集清零”用例。


---

### 13. 现金局（No-Limit）规则源文件（Source of Truth）

面向无限注德州扑克现金局，作为 `rules` 与 `validator` 的统一依据。

#### 13.1 核心概念

- 目标：七取五成最佳五张牌赢取彩池，或通过让他人全部弃牌直接赢池。
- 按钮（BTN）：每手结束顺时针移动一位；行动与位置以此为基准。
- 盲注：`SB`、`BB` 分别为按钮左侧第一、第二位玩家的强制注。
- 位置：UTG（Preflop 首行动位）、MP、CO/BTN（后位）。

#### 13.2 单手流程

1) Setup：移按钮 → 下盲注 → 洗牌发各两张底牌。
2) Preflop：自 UTG 起行动；动作 `fold/call/raise`；无人加注到大盲可 `check` 闭合。
3) Flop：发三张公共牌；自按钮左侧第一位在局者先；有/无前注分别允许 `check/bet` 或 `fold/call/raise`。
4) Turn：同 Flop（发第四张公共牌）。
5) River：同 Flop（发第五张公共牌）。
6) Showdown：
   - 若河牌圈有人进攻，则“河牌圈最后主动者”先亮牌；
   - 若全员过牌，则按钮左侧第一位在局者先亮；
   - 七取五比牌，平手则平分彩池。

#### 13.3 动作与最小加注规则

- `check`：无人下注时允许。
- `bet`：无人下注时的主动下注；最小下注通常为 1BB（可由 `TableRules` 配置）。
- `call`：补齐至 `amountToCall`，但不超过自身筹码。
- `raise`：加注至更高注额；最小加注量 = “上一次下注或加注的增量”。
  - 例：BB=10，若 A 下注到 30，则 B 最少加注到 60（增加 30）。
  - 再例：BB=10，若 A 加到 40（增量 30），则 B 再加最少到 70。

#### 13.4 All-in 与边池

- 任意时刻允许全下；`call` 可为不足额的 all-in。
- 非完整加注（all-in 增量 < 最小加注量）不会“重开行动”，后续玩家仅可 `call/fold`。
- 边池构建：
  1) 以总投入阈值升序切分层级；
  2) 达到该层阈值者参与该池；
  3) 逐层剥离直至资金全部入池。
- 结算：每个池只在有资格的玩家中评测牌力并分配，可多人不同池同时获胜。

#### 13.5 平局与奇数筹码（Odd Chip）

- 牌力完全相同（含 kicker）→ 平分彩池。
- 不可整除的最小单位余数，发给“最靠近按钮位后的顺时针第一位获胜者”。

#### 13.6 现金局特性

- 买入：入桌携带筹码须在最小/最大范围内（如 40BB–100BB）。
- 增购：仅两手之间允许，且不超过最大买入上限。
- 严禁 Going South：离桌前不得取走在桌筹码。

#### 13.7 牌力等级（高→低）

1) 皇家同花顺
2) 同花顺
3) 四条（金刚）
4) 葫芦
5) 同花
6) 顺子（A 可作大/小）
7) 三条（Trips/Set）
8) 两对
9) 一对
10) 高牌

#### 13.8 与实现接口的约束

- `ActionValidator`：强制“最小加注”“re-open”与资金上限校验；Preflop 大盲过牌闭合特例；
- `PotManager`：每街归集与多层边池拆分、结算；
- `HandEvaluator`：七取五比较且可判平局；
- `TurnManager`：基于 `amountToCall/lastAggressorId/isActionReopened` 的闭合与轮转。


---

### 14. 测试补充用例（在第 9 章基础上新增）

- 非完整加注不重开：A bet，B all-in 不足完整加注，验证后续仅能 `call/fold`；
- 完整加注重开：A bet，B 完整加注，A 获得再加注权；
- Preflop 大盲过牌闭合：无人加注，轮到 BB 过牌直接闭合进入 Flop；
- 闭合后每街归集：闭合瞬间执行 `collectBetsFromStreet` 且所有 `currentBet` 清零；
- lastAggressor 回轮闭合：从最后进攻者起一圈后回到其本人即闭合；
- 多层边池结算：三人局一人短筹 all-in，另两人继续加注，验证各池资格与分配；
- 平局与奇数筹码：构造完全平手与奇数筹码分配到“最近按钮位后第一位获胜者”。