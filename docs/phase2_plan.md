## 阶段二执行计划（玩家生命周期与结算）——对齐阶段一（KISS / YAGNI，单文件 <200 行）

本计划在阶段一稳定的“单手流程（从发牌到摊牌/弃牌）”之上，补齐“玩家生命周期、断线重连、局间增购与局末结算播报”。严格延续阶段一的工程约束：KISS/YAGNI、服务端为单一数据真相、优先全量状态广播、任何源文件 < 200 行。

---

### 1. 目标与验收

- 目标
  - 支持玩家生命周期：加入/入座/离座/离开、局间增购与买入；遵守现金局规则（No Going South）。
  - 支持断线重连：宽限期内原位重连与私有状态恢复；宽限过期进入坐起（Sitting Out）。
  - 局末结算：每手结算摘要（主池/边池归属、各玩家盈亏）广播与可视化展示。
- 验收（2–3 人桌）
  - 演示串：加入→入座→开局→其中一人断线→宽限期重连→摊牌→结算摘要→局间增购→下一局。
  - 单元/集成测试通过（详见第 9 章）。
  - 保持全量 `TABLE_STATE` 广播；必要的私有 `PRIVATE_STATE` 单播。
  - 任一源文件 < 200 行。

---

### 2. 范围与非目标

- 本阶段范围：生命周期与会话、断线重连、买入与局间增购、结算摘要与局间状态管理、最小 UI 支持。
- 非目标（推迟到后续阶段）：
  - 外部持久化与回放（阶段三）。
  - 将全量广播替换为事件广播（参见阶段一文档“9.1 事件广播演进”，本阶段仅预留接口）。
  - 自动超时弃牌/托管代理（阶段二不实现，以演示为主）。

---

### 3. 目录与模块变更（保持职责单一）

- `src/server/`
  - `server.js`（扩展）：握手/会话、消息路由、断线标记/重连恢复、全量状态广播。
  - `protocol.js`（扩展）：新增会话与生命周期消息类型、错误码与轻量校验。
  - `playerRegistry.js`（扩展）：席位/筹码权威库（入座/离座/增购/买入规则）。
  - 新增 `session.js`：`sessionId` 管理、宽限时钟、`sessionId ↔ playerId` 绑定、在线状态。
  - 新增 `lifecycle.js`：生命周期命令守卫与执行（仅局间可变更）。
- `src/game/`
  - `Game.js`（轻改）：新增手局边界钩子 `startNewHand()`、`endHand()`、`resetForNextHand()`，产出结算摘要；不侵入下注/分池核心逻辑。
  - `GameState.js`（轻改）：新增桌面级生命周期字段（见第 4 章）。
- `src/ui/public/`
  - `index.html`/`client.js`（轻改）：新增会话/生命周期控件（入座/离座/离开/增购/买入），渲染 `tableStatus/handId/结算摘要`。

---

### 4. 状态模型扩展（最小必要集）

- 位于 `GameState` 的桌面级字段（可序列化、对外广播）
  - `tableStatus: 'WAITING' | 'HAND_IN_PROGRESS' | 'SETTLING'`  // 以 SETTLING 作为结算与重置期间的原子锁
  - `handId: number`（自增）
  - `seats: Array<{ seatId: number, playerId: string | null, stack: number, buyIn: number, isSittingOut: boolean }>`
  - `buyInLimits: { minBB: number, maxBB: number }`（由 `rules/TableRules` 提供）
  - `pendingRebuys: Record<string /*playerId*/, number /*amount*/>`（局间收集、开局前一次性应用）
- 仅服务端内部结构（不进入公共广播）
  - `session: { sessionId → { playerId, socketId|null, disconnectAt?: number } }`
  - `playerToSession: { playerId → sessionId }`
  - 令牌：`sessionToken`（JWT），内容含 `{ sid, pid }`，签名密钥通过环境变量提供，设置合理有效期（如 24h）。

约束与重置：
- “仅在 `tableStatus==='WAITING'` 时允许”变更：`seats` 的占用/释放、`stack` 增购、`buyIn` 初始值、`isSittingOut` 切换。
- 进入新一局：`tableStatus='HAND_IN_PROGRESS'`，清空并应用 `pendingRebuys`，依据阶段一“12.5 推进与重置建议”重置本街临时状态（`amountToCall`、`lastAggressorId`、`isActionReopened` 等）。

---

### 5. 通信协议扩展（保持全量 `TABLE_STATE`）

- 握手与会话（将纯文本 sessionId 升级为签名令牌 sessionToken / JWT）
```json
{"type":"HELLO","payload":{"sessionToken":"optional"}}
```
```json
{"type":"SESSION_ACCEPTED","payload":{"sessionToken":"jwt-token","playerId":"optional"}}
```

- 生命周期命令（除显式注明外，仅局间允许）
```json
{"type":"JOIN_TABLE","payload":{"nickname":"str"}}
```
```json
{"type":"TAKE_SEAT","payload":{"seatId":2,"buyIn":80}}
```
```json
{"type":"LEAVE_SEAT","payload":{}}
```
```json
{"type":"LEAVE_TABLE","payload":{}}
```
```json
{"type":"ADD_ON","payload":{"amount":20}}
```

- 广播（公共，结算时将结果并入 `TABLE_STATE.lastHandResult` 原子化更新）
```json
{"type":"TABLE_STATE","data":{"players":[],"seats":[],"community":[],"pots":[],"street":"FLOP","tableStatus":"HAND_IN_PROGRESS","handId":13}}
```
```json
{"type":"TABLE_STATE","data":{"tableStatus":"WAITING","handId":14,"seats":[...],"lastHandResult":{"pots":[{"type":"main","amount":200,"winnerIds":["p1"]}],"deltasByPlayer":{"p1":120,"p2":-120}}}}
```

- 私有单播（与阶段一一致）
```json
{"type":"PRIVATE_STATE","data":{"holeCards":["Ah","Kd"]}}
```

- 错误返回（建议枚举）
```json
{"type":"ERROR","payload":{"code":"ONLY_BETWEEN_HANDS","message":"Operation allowed only between hands"}}
```

常见错误码：`SEAT_TAKEN` | `BUYIN_OUT_OF_RANGE` | `ADDON_OVER_MAX` | `ONLY_IN_WAITING_STATE` | `SESSION_NOT_FOUND` | `INVALID_TOKEN`。

---

### 6. 生命周期与流程（与阶段一状态机衔接）

- 手局边界（引入原子化结算阶段 SETTLING）
  - `endHand()`：将 `tableStatus='SETTLING'` → 确保最后一街归集 → `PotManager` 结算，计算 deltas → 应用到 `seats[*].stack` → 合成 `lastHandResult` → 广播包含 `lastHandResult` 的 `TABLE_STATE`（原子化） → 应用 `pendingRebuys` → 将 `tableStatus='WAITING'`。
  - `startNewHand()`：按钮右移 → 过滤坐起玩家（`isSittingOut=true`）后检查 `activeSeats` 人数（<2 则仍保持 `WAITING`）→ 清理上手临时字段 → 发底牌 → `tableStatus='HAND_IN_PROGRESS'`。
  - `resetForNextHand()`：如需手动清理，保持与上步一致；推荐将重置动作并入 `endHand()` 末尾与 `startNewHand()` 开头。
- 断线/重连（JWT）
  - `disconnect`：记录 `disconnectAt`，保留席位与筹码，不自动弃牌（阶段二不实现超时）。
  - 宽限（默认 60s）：收到 `HELLO(sessionToken)`，服务端校验 JWT 有效性 → 原位重连 → 单播 `PRIVATE_STATE` 与全量 `TABLE_STATE`。
  - 宽限过期仍离线：标记 `isSittingOut=true`（席位保留）；是否局末自动 `LEAVE_SEAT` 可配置（默认不自动）。
- 入座/离座/离开
  - `TAKE_SEAT`：仅 `tableStatus==='WAITING'`；校验 `minBB ≤ buyIn ≤ maxBB`；`stack=buyIn`，`buyIn` 记录以供规则核对。
  - `LEAVE_SEAT`：仅 `tableStatus==='WAITING'`；若局中请求则拒绝（阶段二不提供“即弃即离座”）。
  - `LEAVE_TABLE`：局末移除玩家，遵守 No Going South（阶段二仅日志，不做跨局结算与持久化）。
- 买入/增购
  - 买入：`minBB ≤ buyIn ≤ maxBB`；占座即生效。
  - 增购：仅局间；`stack + amount ≤ maxBuyIn`；立即更新 `stack` 并广播。

- 坐起（Sitting Out）影响（需在核心模块显式处理）
  - `BlindsManager`：计算按钮与盲注前先过滤 `isSittingOut` 的座位；若有效人数 < 2，则不开局。
  - `TurnManager`：轮转与闭合判断时跳过 `isSittingOut` 的玩家（同弃牌/all-in 跳过语义）。

---

### 7. 服务端实现要点

- `server.js`
  - 握手：处理 `HELLO(sessionToken)` → 验证 JWT → 返回 `SESSION_ACCEPTED(sessionToken)`；建立 `session ↔ player` 与 `player ↔ socketId`。
  - 路由：区分“动作类”（转发至 `Game.applyAction`）与“生命周期类”（转发至 `lifecycle`）。
  - 断线：标记 `disconnectAt`；重连恢复；在 `endHand()` 原子化结算后、`startNewHand()` 前后广播全量。

- `protocol.js`
  - 定义消息枚举与字段校验；统一错误码与文本；避免魔法字符串。
  - 在生命周期守卫中统一使用：`ONLY_IN_WAITING_STATE`；会话校验失败统一返回：`INVALID_TOKEN`。

- `session.js`
```ts
createSessionToken(sessionId: string, playerId: string): string // JWT 签发
verifySessionToken(token: string): { success: boolean, payload?: { sid: string, pid: string } }
ensureSession(sessionId?: string): { sessionId: string }
bindSessionToPlayer(sessionId: string, playerId: string): void
markDisconnected(playerId: string): void
isWithinGrace(playerId: string, nowMs: number): boolean
```

- `playerRegistry.js`（扩展）
```ts
takeSeat(state, { playerId, seatId, buyIn }): Result
leaveSeat(state, { playerId }): Result
applyAddon(state, { playerId, amount, maxBuyIn }): Result
findSeatByPlayer(state, playerId): Seat | null
```
  - 职责：席位占用/释放、买入区间校验、增购上限校验、Sitting Out 标志维护。

- `lifecycle.js`
```ts
handleJoinTable(ctx, { nickname }): Result
handleTakeSeat(ctx, { seatId, buyIn }): Result
handleLeaveSeat(ctx, {}): Result
handleLeaveTable(ctx, {}): Result
handleAddOn(ctx, { amount }): Result
```
  - 守卫：“仅在 `tableStatus === 'WAITING'` 时允许”。
  - 应用：修改 `GameState.seats/stack/isSittingOut`/`pendingRebuys` 并触发全量广播。

- `game/Game.js`（轻改）
  - 在 `applyAction` 完成时机，对 `RoundClosureChecker` 判定闭合后执行收街与推进（延续阶段一 12.2/12.3/12.5 建议）。
  - 在 `SHOWDOWN` 前再调用一次 `collectBetsFromStreet` 以确保最后一街进入池中（阶段一 12.5）。
  - 结算阶段：`tableStatus='SETTLING'`，计算 deltas，更新 `seats[*].stack`，合成 `lastHandResult` 并随 `TABLE_STATE` 一并广播。

---

### 8. UI 最小改动

- 新增交互控件
  - 会话：显示/复制 `sessionId`（用于演示重连）。
  - 生命周期：入座（seatId+buyIn）、离座、离开、增购（amount）。
- 渲染
  - `tableStatus`、`handId`、`seats[*].stack/isSittingOut`、`TABLE_STATE.lastHandResult` 摘要（文本列表）。
- 启用态
  - 根据 `tableStatus` 与是否在局、是否有座位、是否到你行动，控制按钮可用性。

---

### 9. 测试计划

- 单元测试
  - `playerRegistry`：买入区间、入座/离座状态迁移、增购上限、满座拒绝。
  - `session`：新建/恢复/宽限到期路径；多用户并发握手唯一性。
  - `lifecycle`：仅局间允许的守卫；成功与拒绝分支；错误码。
  - `Game`：`startNewHand/endHand/resetForNextHand` 对下注/分池无副作用；`pendingRebuys` 应用正确。
- 集成测试
  - 入座→开局→断线→重连→继续到摊牌，`PRIVATE_STATE` 恢复正确。
  - 三人：一人局间增购→下一局以新 `stack` 入局；多层边池/结算正确。
  - 满座时加入进入旁观（可选）→局间入座成功。
- 必须覆盖（对齐阶段一第 9/12/14 章）
  - “仅局间允许”守卫
  - 宽限期重连恢复
  - `HAND_RESULT` 与 `TABLE_STATE` 一致性

---

### 10. 任务拆分与排期（4–6 人日）

1) 会话与断线重连（0.5–1d）
   - 新增 `session.js`；扩展 `server.js` 握手/重连；错误码与日志。
2) 席位/筹码与规则守卫（1–1.5d）
   - 扩展 `playerRegistry.js`；新增 `lifecycle.js`；完善 `protocol.js`。
3) 手局边界钩子（0.5d）
   - `Game.js`/`GameState.js` 新字段与 `startNewHand/endHand/resetForNextHand`。
4) UI 最小能力（0.5–1d）
   - 新控件与渲染；禁用态逻辑；结算摘要。
5) 测试与回归（1–2d）
   - 单测/集成测试补齐；阶段一回归用例保持通过。

---

### 11. 风险与缓解

- 行为侵入风险：生命周期逻辑隔离到 `server/lifecycle.js`，`game/*` 仅处理牌局内逻辑。
- 断线阻塞：阶段二不实现超时弃牌；演示中避免长时间卡住；预留后续“软超时”开关。
- 单文件超长：新增文件承载生命周期与会话；控制每文件 < 200 行。
- 状态不一致：将结算并入 `TABLE_STATE.lastHandResult` 原子化广播；新局开始前后统一通过全量 `TABLE_STATE` 快照对齐。

---

### 12. 交付物

- 可运行的端到端演示（含生命周期与断线重连）。
- `test` 单元+集成测试通过（含新增生命周期与重连用例）。
- 更新 `README.md`：启动与阶段二说明；重申“单文件 <200 行”原则。

---

### 13. 接口草案（摘要）

-- 客户端命令（C→S）
```json
{"type":"HELLO","payload":{"sessionToken":"optional"}}
```
```json
{"type":"TAKE_SEAT","payload":{"seatId":1,"buyIn":60}}
```
```json
{"type":"ADD_ON","payload":{"amount":20}}
```

- 服务端事件（S→C）
```json
{"type":"SESSION_ACCEPTED","payload":{"sessionToken":"jwt","playerId":"p1"}}
```
```json
{"type":"TABLE_STATE","data":{"tableStatus":"WAITING","handId":42,"seats":[...],"lastHandResult":{"pots":[...],"deltasByPlayer":{"p1":120,"p2":-120}}}}
```

- 规则一致性（与 `docs/texas_holdem_rules.md` 对齐）
  - 买入/增购区间：`minBB ≤ buyIn ≤ maxBB`、`stack + addOn ≤ maxBuyIn`。
  - 非完整加注/重开规则沿用阶段一；本阶段不修改牌局内规则，仅在局间变更资金。

---

以上计划完全对齐阶段一的工程与规则原则，确保在不破坏既有引擎与测试基础上，增量实现“玩家生命周期 + 断线重连 + 结算播报 + 局间增购”。完成后可直接进入阶段三的“持久化与回放”。


