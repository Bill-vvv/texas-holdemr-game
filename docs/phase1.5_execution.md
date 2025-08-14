## 阶段 1.5 执行计划（KISS，完美接轨阶段一）

本阶段在阶段一（Game Loop MVP）基础上做两项小而稳的增强，保持全量状态广播与既有模块边界不变：
- 功能 A：摊牌场景下（非“全员弃牌提前结束”），展示获胜者的最终成牌组合。
- 功能 B：房主可手动结束一整局（Game Session），并广播最终结算摘要与最简 UI 呈现。

不引入阶段二的生命周期/会话复杂度；不改动下注/边池/闭合等核心逻辑；所有增量均为“加法”，与现有代码完美接轨、易于回滚。

---

### 1. 原则与边界

- 仍采用全量 `gameState` 广播；少量新增的只读“摘要字段”随 `gameState` 一并下发。
- 仅在摊牌（SHOWDOWN）时展示赢家的最佳五张牌与牌型名；若因为他人弃牌而提前结束，不展示。
- 结束整局为“演示用”的手动命令，默认仅本地“房主客户端”可见；不涉及持久化与账户系统。
- 单文件 < 200 行；KISS：不改动既有函数签名，采用“新增字段/新增辅助函数”的方式接入。

---

### 2. 数据模型（GameState 最小增量）

在 `src/game/GameState.js` 增加两个可序列化、只读字段：

```ts
// 摊牌摘要：仅当上一手是摊牌结束时才有值，下一手开始前清空
lastShowdownSummary?: {
  handId: number
  winners: Array<{
    playerId: string
    rankName: string             // 如 'Flush', 'Full House'
    bestFive: string[]           // 5 张具体牌，如 ['Ah','Kh','Qh','Jh','Th']
    usedHole?: string[]          // 可选：赢家所用的底牌，用于 UI 标注
  }>
}

// 会话基线（用于整局结算），在“第一次发牌”之前初始化
session?: {
  id: string                     // 简单时间戳或自增
  startedAt: number              // ms
  baselineStacks: Record<string /*playerId*/, number>
  handsPlayed: number
}
```

注意：
- `lastShowdownSummary` 仅承载公共信息（摊牌时底牌公开，安全）；非摊牌结尾则不设置该字段。
- `session` 只为演示整局结算：记录基线筹码与手数；不涉及买入/增购。

---

### 3. 评估与摘要（核心库最小新增）

- `src/game/core/HandEvaluator.js`
  - 保持现有 `evaluate(holeCards, board) -> score` 不变。
  - 新增一个纯函数辅助：`describeBestHand(holeCards, board) -> { score, rankName, bestFive, usedHole }`。
    - 可基于现有库（七取五）枚举最佳组合，映射到 rank 名称（与已有测试用例命名保持一致）。
    - 仅供摊牌摘要生成调用，不影响其他路径。

---

### 4. 摘要生成与清理（与现有流程接轨）

- `src/game/pot/PotManager.js`
  - 结算仍按阶段一逻辑完成主/边池分配（无需改动接口）。

- `src/game/Game.js`
  - 在触发摊牌并完成分配后：
    1) 若“本手因弃牌提前结束”→ 不设置 `lastShowdownSummary`。
    2) 若“进入摊牌且有牌力比拼”→ 对每个池的赢家计算 `describeBestHand`；去重合并赢家（可能多池同人），写入 `state.lastShowdownSummary = { handId, winners }`。
  - 在“开始新一手发牌”前（Deck 洗牌/发底牌之前）清空 `state.lastShowdownSummary`，`session.handsPlayed++`。

- `src/game/GameStateSerializer.js`
  - `getPublicState()` 保持不变，仅把 `state.lastShowdownSummary` 原样包含在公共数据中（若存在）。

---

### 5. 广播与 UI（最小化改动）

- 广播：仍是统一的 `gameState` 全量下发；其中可包含 `lastShowdownSummary`（可空）。
- UI：
  - 在 `src/ui/public/client.js` 渲染收到的 `gameState` 时，若存在 `lastShowdownSummary`：
    - 在公共牌区下方新增一个“赢家展示”面板，逐条显示：玩家名（或 ID）、`rankName` 与 `bestFive` 文本。
    - KISS：文本方式展示（“Player A - Full House: J J J 8 8”），不做卡面图形。
  - 下一手开始后该面板自然消失（因字段被清空）。

---

### 6. 房主手动结束整局（Final Settlement）

目标：演示“一整局”的最终结算，不改变阶段一的回合/手牌流程。

#### 6.1 协议（演示用）

- C→S：`{"type":"HOST_END_GAME","payload":{}}`
- S→C：`{"type":"GAME_ENDED","data":{ finalSettlement }} `（亦可直接把 `finalSettlement` 并入最后一次 `gameState` 内）

`finalSettlement` 结构（KISS）：
```ts
{
  sessionId: string,
  handsPlayed: number,
  perPlayer: Array<{
    playerId: string,
    baseline: number,     // session.baselineStacks[playerId]
    current: number,      // 当前 stack
    pnl: number           // current - baseline
  }>,
  totalChips: number      // 校验和，用于前端展示一致性
}
```

#### 6.2 触发与实现

- “房主”定义：为演示简化，客户端以查询串 `?host=1` 或本地开关启用“房主模式”，前端显示“结束整局”按钮；服务端不做复杂鉴权（KISS）。
- `server.js` 接收到 `HOST_END_GAME`：
  - 基于 `state.session.baselineStacks` 与当前 `players[*].stack` 计算 `finalSettlement`。
  - 广播 `GAME_ENDED`（或将 `finalSettlement` 并入下一次 `gameState`）。
  - 可选：标记 `state.session.ended=true`，前端据此禁用所有动作按钮。

#### 6.3 最简 UI

- 在 `index.html` 增加按钮：`[结束整局]`（仅 host 模式可见）。
- 在 `client.js`：
  - 发送 `HOST_END_GAME`。
  - 收到 `GAME_ENDED` 或含 `finalSettlement` 的 `gameState` 后，展示一个只读表格：玩家、基线、当前、盈亏。
  - KISS：文本表格/列表，不做导出与分页。

---

### 7. 初始化与回滚

- `session.baselineStacks` 何时建立：在“第一手开始前”，以 `players[*].stack` 快照作为基线。
- 若未建立 `session` 而触发 `HOST_END_GAME`：返回错误 `SESSION_NOT_INITIALIZED`（或自动补建基线为当前值，pnl=0）。
- 回滚策略：
  - 若不希望启用“结束整局”，前端隐藏按钮即可；后端忽略该消息，不影响阶段一流程。

---

### 8. 测试建议（补充于阶段一测试）

- `HandEvaluator.describeBestHand`：覆盖顺子/同花/葫芦等典型组合的 `rankName/bestFive` 正确性；与 `evaluate` 分数排序一致。
- 摊牌摘要：构造多人摊牌平分场景，`winners` 正确、人数匹配、`bestFive` 与 `rankName` 合理；非摊牌（他人弃牌）不产生摘要。
- 整局结算：构造基线与当前 stack 场景，校验 `pnl` 与 `totalChips` 守恒；`handsPlayed` 自增。

---

### 9. 变更点清单（确保 <200 行原则）

- `GameState.js`：+ 两个只读字段定义与初始化/清理（<30 行）。
- `HandEvaluator.js`：+ `describeBestHand` 辅助函数（<50 行，按现有库实现）。
- `Game.js`：在摊牌路径写入 `lastShowdownSummary`，新一手前清空；`session.handsPlayed++`（<40 行）。
- `GameStateSerializer.js`：公共状态中包含 `lastShowdownSummary`（<10 行）。
- `server.js`：可选监听 `HOST_END_GAME` 并广播 `GAME_ENDED`（<30 行）。
- `ui/public/index.html`/`client.js`：赢家摘要文本面板 + 结束整局按钮与结果表（<40 行）。

以上改动均为“加法”，不触碰下注/校验/分池等敏感路径；若不启用新能力，原有演示与测试不受影响。


