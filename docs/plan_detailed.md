## 德州扑克产品迭代细化计划（基于 KISS / YAGNI）

本计划在 `plan_draft.md` 的基础上进行细化与可执行化，严格遵循 KISS 与 YAGNI 原则，先实现"必要即可"的稳定能力，再逐步演进。特别开发原则：任何单个源文件不得超过 200 行，一旦逼近阈值必须拆分为更小模块。

## 🎯 当前进度状态

**✅ 已完成模块:**
- `Deck.js` - 牌堆管理 (84行)
- `HandEvaluator.js` - 牌力评估 (151行) 
- `GameState.js` - 游戏状态管理 (196行)
- `GameStateSerializer.js` - 状态序列化 (62行)
- `TableRules.js` - 桌面规则配置 (198行)
- `TableRulesValidator.js` - 规则验证 (114行)
- 完整单元测试覆盖 (50个测试用例)
- 完整模块文档 (`src/game/core/claude.md`, `src/game/claude.md`)

**🚧 进行中:** 第三个迭代 - 回合管理模块

---

### 一、总体目标与阶段划分

- 阶段一：完整“一轮”游戏（Game Loop MVP），覆盖双人/三人、All-in、边池、增购（仅局间）等边界；最简 UI 与多人机制。
- 阶段二：完整“一局”能力（玩家生命周期与结算），重连/新加入/离座/离开、最终结算。
- 阶段三：持久化（先文件快照，后可插拔 Redis/Mongo）。
- 阶段四：UI 优化（美观、优雅、响应式、动画）。
- 阶段五：生产部署（PM2、Nginx、HTTPS、CI/CD）。

---

### 二、通用开发原则（必须遵循）

- 仅实现必要功能，避免“或许将来会用到”的设计。
- 单一职责优先，模块边界清晰，避免巨石模块。
- 单文件上限：< 200 行；达上限必须拆分。
- 服务端为唯一数据真相；客户端仅渲染与事件上报。
- 核心逻辑可测试：牌堆、牌力、动作校验、边池算法需单测覆盖。

---

### 三、第一阶段（Game Loop MVP）

#### 3.1 概要

实现从发牌到摊牌/弃牌结束的完整一轮流程。服务端维持状态机；客户端最简渲染并发送动作；通过全量状态广播降低复杂度。支持 2–3 人桌，All-in/边池正确，增购仅允许在两轮之间。

#### 3.2 技术栈

- 后端：Node.js LTS（18+），Socket.IO（或 ws），可选 Express 提供静态页与健康检查。
- 前端：原生 HTML + CSS + 少量 Vanilla JS；Socket.IO 客户端（或原生 WebSocket）。
- 牌力评估：第三方库封装（如 `pokersolver` 或 `poker-evaluator`，择一）。
- 日志：`pino`（或先行 console，必要时替换）。

#### 3.3 目录结构（建议）

```text
project/
  src/
    server/
      server.js                # HTTP/WS 启动、连接/广播
      playerRegistry.js        # 玩家与 socket 映射、座位/筹码初始化
      protocol.js              # 轻量消息约定与校验
    game/
      Game.js                  # 聚合根：状态编排与对外接口
      GameState.js             # 纯数据结构与选择器（派生数据）
      TurnManager.js           # 行动顺序/回合闭合/街道推进
      BlindsManager.js         # 按人数处理按钮/小盲/大盲与 heads-up 特例
      actions/
        ActionValidator.js     # 动作合法性校验
        ActionApplier.js       # 原子状态变更（无 I/O）
      pot/
        PotManager.js          # 主池/边池拆分、分配资格
      core/
        Deck.js                # 52 张牌、洗牌、发牌
        HandEvaluator.js       # 第三方牌力库的统一封装
      rules/
        TableRules.js          # 盲注、最小加注、局间增购等规则
    ui/
      public/
        index.html             # 最简界面
        client.js              # 连接、渲染、动作上报
  test/
    unit/
      deck.test.js
      handEvaluator.test.js
      potManager.test.js
      actionValidator.test.js
    integration/
      headsup_allin_flow.test.js
  package.json
  README.md
```

#### 3.4 组件职责与依赖关系

- `server/server.js`
  - 职责：启动 HTTP/WS；转发客户端动作给 `game/Game`; 广播全量状态；必要的静态文件托管。
  - 依赖：`server/playerRegistry.js`, `server/protocol.js`, `game/Game.js`。

- `server/playerRegistry.js`
  - 职责：分配/回收座位；初始化/维护玩家筹码；维护 `playerId ↔ socketId`。
  - 依赖：无业务深依赖；供 `server/server.js` 使用。

- `server/protocol.js`
  - 职责：统一消息类型、字段校验（轻量），避免魔法字符串。
  - 依赖：无；供服务端与客户端共同遵循的约定。

- `game/Game.js`
  - 职责：聚合根；持有并协调 `TurnManager`, `BlindsManager`, `ActionValidator`, `ActionApplier`, `PotManager`, `Deck`, `HandEvaluator`；对外暴露只读选择器与 `applyAction`。
  - 依赖：`game/*` 子模块与 `rules/TableRules`。

- `game/GameState.js`
  - 职责：集中存放可序列化的状态；提供派生只读视图（公共/私有）。
  - 依赖：无（纯数据结构）。

- `game/TurnManager.js`
  - 职责：确定当前行动玩家；判断回合是否闭合；街道推进。
  - 依赖：`GameState`。

- `game/BlindsManager.js`
  - 职责：设置按钮位、小/大盲；双人局翻牌前/后先后手规则。
  - 依赖：`GameState`, `TableRules`。

- `game/actions/ActionValidator.js`
  - 职责：校验 `check/bet/call/raise/fold/all-in` 合法性（最小加注、是否到你、资金是否足够等）。
  - 依赖：`GameState`, `TableRules`。

- `game/actions/ActionApplier.js`
  - 职责：以最小原子变更安全更新状态（下注额、当前注、彩池归集、行动玩家推进钩子）。
  - 依赖：`GameState`, `PotManager`, `TurnManager`（通过注入避免环依赖）。

- `game/pot/PotManager.js`
  - 职责：根据各玩家投入与 all-in 金额切分主池与多级边池；在摊牌时按评分与资格分配。
  - 依赖：`GameState`, `HandEvaluator`（在分配阶段）。

- `game/core/Deck.js`
  - 职责：洗牌（Fisher–Yates）、发手牌与公共牌。
  - 依赖：无。

- `game/core/HandEvaluator.js`
  - 职责：封装第三方库，统一 `evaluate(holeCards, board)` 接口；返回可比较评分。
  - 依赖：第三方评估库。

- `game/rules/TableRules.js`
  - 职责：桌面参数（盲注大小、最小加注步长、局间增购开关与上限）。
  - 依赖：无。

- `ui/public/index.html`/`client.js`
  - 职责：渲染公共牌、玩家区、总池与日志；提供动作按钮；通过 WS 发送动作；接收状态全量更新。
  - 依赖：`server/protocol.js` 规定的消息结构（约定）。

依赖图（摘要）：

```text
ui/client.js → server/server.js → game/Game.js → {TurnManager, BlindsManager, ActionValidator, ActionApplier, PotManager, Deck, HandEvaluator, TableRules}
```

#### 3.5 通信协议（全量状态广播）

- 客户端→服务端（示例）：

```json
{"type":"playerAction","payload":{"action":"bet","amount":100}}
```

- 服务端→客户端（公共状态）：

```json
{"type":"gameState","data":{"players":[...],"community":[...],"pots":[...],"currentTurn":"playerId","street":"FLOP"}}
```

- 服务端→客户端（私有状态，按需单播）：

```json
{"type":"privateState","data":{"holeCards":["Ah","Kd"]}}
```

说明：采用“全量状态广播”以降低增量补丁复杂度（KISS）。

#### 3.6 状态机与流程

1) 初始化：`BlindsManager` 放置按钮/盲注；`Deck` 洗牌并发两张手牌；`street = PRE_FLOP`。
2) 回合循环：`TurnManager` 指定 `currentTurn` → 客户端动作 → `ActionValidator` 校验 → `ActionApplier` 更新状态 → `server` 广播。
3) 回合闭合：若下注量一致且无人继续行动，或除一人外全弃牌，则推进到下一街。
4) 摊牌：`HandEvaluator` 计算评分；`PotManager` 按池资格与评分分配筹码。
5) 轮次结束：清理临时字段；按钮右移；进入下一轮（不含玩家加入/离开，留待阶段二）。

#### 3.7 边界情况处理

- 双人局（Heads-up）
  - 翻牌前：按钮位（同时为小盲）先行动；
  - 翻牌后：按钮位后行动；`TurnManager` 内部有模式切换。
- 三人局：标准按钮/小盲/大盲；顺时针行动。
- All-in 与边池：
  - `ActionValidator` 允许不足最小加注的 all-in；
  - `PotManager` 以投入金额阈值切分多级边池；每个池记录参与者集合；
  - 摊牌时仅参与对应池的玩家比牌与分配。
- 增购筹码（Rebuy/Add-on）：
  - 仅在轮次之间允许（由 `TableRules` 控制）；进行中严禁增购以避免规则复杂化。

#### 3.8 日志与错误

- 服务端：非法动作→单播错误消息；广播关键事件（下注/加注/弃牌/街道推进）。
- 客户端：错误 toast/日志区域；断开/重连提示（第一阶段可简化为刷新）。

#### 3.9 测试与验收

- 单元测试：
  - `Deck`：发牌数量正确、洗牌基本均匀性。
  - `HandEvaluator`：同花顺/葫芦/三条/两对/高牌相对排序正确。
  - `PotManager`：多名玩家不同 all-in 金额形成多层边池的切分与分配正确。
  - `ActionValidator`：最小加注、是否到你、资金不足、check/bet/raise/fold/all-in 规则。
- 集成测试：
  - 双人预设盲注→一方 all-in→摊牌分配；
  - 三人一人短筹 all-in→其余继续下注形成边池→摊牌分配；
  - Preflop 直接弃牌导致轮次提前结束。
- 验收标准：
  - 2–3 人完整一轮稳定运行；All-in/边池/增购边界符合规则；
  - 单测覆盖核心模块，集成测试通过；
  - 任一源文件 < 200 行，代码结构清晰。

#### 3.10 任务拆分与排期（5–8 人日）

1) 骨架与基础联通（0.5d）：`server.js` + `index.html` + `client.js` 雏形，WS 通。
2) **✅ 牌堆与牌力（0.5–1d）**：`Deck`/`HandEvaluator` 封装与单测。**[已完成]**
3) 行动与盲注（1d）：`TurnManager`/`BlindsManager`，含 heads-up 特例与基本单测。
4) 动作规则（1–1.5d）：`ActionValidator` + `ActionApplier`，广播与日志。
5) 边池分配（1–1.5d）：`PotManager` 多级边池，单测覆盖典型场景。
6) 最简 UI（0.5–1d）：渲染、动作发送、日志。
7) 集成测试与稳定性（0.5–1d）：三条关键路径跑通，回归。

风险与缓解：
- 边池算法复杂→先覆盖最常见 all-in 阶梯场景，使用表驱动测试；
- 行动闭合判定易错→`TurnManager` 明确“本街最大注额”“已跟注至平”等标志位；
- 单文件超长→预设目录结构与职责划分，严格执行 200 行限制。

---

### 四、阶段二（玩家生命周期与结算）——要点细化

- 重连：`playerId + sessionId` 关联，断线标记与 60s 宽限重连；新 socket 绑定原玩家并下发最新状态。
- 新加入：维护等待队列，仅在两轮之间入座；筹码与座位初始化。
- 退出/离座：
  - 离座：保留座位与筹码，自动弃牌；
  - 离开：移除并（阶段二）进行简单结算（本地日志/事件）。
- 结算：局终点打印/记录玩家盈利/亏损，为阶段三持久化做接口预留。

---

### 五、阶段三（持久化）——要点细化

- `Storage` 抽象：
  - `saveGame(gameState)` / `loadGame()`；
  - 实现一：JSON 文件快照（局终点/关键节点写入）；
  - 实现二：Redis（SET 整体 JSON，选用 TTL/快照策略）；
  - 实现三：MongoDB（如需更丰富结构）。
- 策略：避免高频 I/O，仅在安全点写入；读取在服务启动时恢复。

---

### 六、阶段四（UI 优化）——要点细化

- 资源：高质量卡面/筹码/桌布；
- 布局：Flex/Grid，自适应多尺寸；
- 动画：发牌、下注、筹码移动；回合高亮与提示音；
- 框架择机：若 Vanilla JS 维护成本上升，考虑引入 Svelte/Vue，保持组件拆分与 <200 行限制。

---

### 七、阶段五（生产部署）——要点细化

- 运行：PM2 守护、日志轮转；环境变量（.env）。
- 反代：Nginx 80/443 → Node 3000；Let’s Encrypt 一键 HTTPS。
- CI/CD：GitHub Actions push 到 main 触发部署脚本（拉取、安装、重启）。

---

### 八、第一阶段交付物清单

- 可运行的最小端到端演示（本地）：打开 `ui/public/index.html` 连接本地服务，完成含 all-in 的一轮演示。
- `test/` 下核心单测与 1–2 个集成测试全部通过。
- `README.md` 含启动说明与“单文件 <200 行”开发原则声明。

---

### 九、架构与实现优化建议（在保持 KISS/YAGNI 前提下的演进路径）

以下建议不改变第一阶段的验收口径与实现简度，旨在为阶段二及之后的演进预留低成本升级路径。推荐在阶段二开始逐步引入，或以“兼容模式”增量启用。

#### 9.1 状态同步机制：从全量广播演进为事件广播

- 现状与问题：
  - 全量广播在 MVP 阶段简单可靠，但存在性能浪费、前端动画表达受限、问题定位粒度粗等长期痛点。
- 建议：
  - 引入事件广播（Event Broadcasting）作为“兼容扩展”。短期仍保留全量广播，服务端在 `applyAction/handleCommand` 返回事件列表，供后续切换使用。
  - 渐进切换：优先对高频/易动画化的操作（下注、加注、弃牌、街道推进、发公共牌）发事件，其他仍用全量状态。
- 事件示例（建议命名）：
  - `GAME_STARTED`, `DEAL_HOLE_CARDS[private]`, `DEAL_FLOP`, `DEAL_TURN`, `DEAL_RIVER`, `PLAYER_BET`, `PLAYER_CALL`, `PLAYER_RAISE`, `PLAYER_FOLD`, `TURN_CHANGED`, `STREET_ENDED`, `SHOWDOWN`, `POT_SETTLED`。
- 客户端策略：新增轻量事件处理器更新本地状态并触发动画；同时保留对 `gameState` 的兜底渲染（双轨期）。

#### 9.2 解耦动作处理：采用 Command/Handler 模式

- 问题：`ActionValidator` 与 `ActionApplier` 调用链紧耦合，扩大了单元测试与演进成本。
- 建议：
  - 将 `actions/` 重构为 `commands/` 与 `handlers/`：
    - `commands/BetCommand.js`、`commands/FoldCommand.js` 等只描述意图与参数。
    - `handlers/BetHandler.js`、`handlers/FoldHandler.js` 等封装校验与事件生成，产出事件数组，不直接改状态。
  - 好处：职责更纯，依赖更少，测试更聚焦；与事件广播天然契合。
- 验收：每类命令具备最小完备测试用例（合法/非法/边界）。

#### 9.3 强化聚合根 `Game.js`：由其自身应用事件

- 建议：确立单向数据流 `Command → Handler → Events → Game.applyEvent → New State`。
  - `Game.handleCommand(command)`：查找对应 `Handler`，执行后拿到 `events`。
  - `Game.applyEvent(event)`：由聚合根内部以纯函数方式更新 `GameState`；确保一致性与可追踪性。
  - 可选：在 `server/server.js` 中仅转发事件给客户端；保留定期/关键节点的全量 `gameState` 校验广播（心跳/快照）。
- 收益：更强的可测试性/可回放性；日志与问题定位清晰；降低跨模块耦合。

#### 9.4 通信协议细化与私有事件授权

- 事件粒度与载荷规范化：为每个事件定义稳定的 `payload` 字段与类型（数值单位、ID 形态、一致命名）。
- 私有事件（如 `DEAL_HOLE_CARDS`）：在事件对象上标记 `isPrivate=true` 与 `playerId`，服务端仅对目标 socket 下发。
- 安全性：客户端不应接收非自身私有数据；任何私有信息仅通过私有事件传递，不在公共 `gameState` 中出现。

#### 9.5 渐进式开关与回滚策略

- 增量开关：以配置项控制事件广播启用范围（仅下注类/仅发牌类/全部）。
- 回滚友好：随时可回退到“仅全量广播”的安全路径；事件与状态可并行存在一段时间。

#### 9.6 日志与可观测性（轻量）

- 以事件为主线记录：`[t][tableId][eventType] payload`；关键状态快照低频输出（如每街开始/结束）。
- 提供最小“重放”能力：通过事件序列重建状态（至少在测试环境启用），提高集成测试诊断效率。

#### 9.7 与 200 行限制的配合

- 上述改造天然促进文件拆分与职责收敛：
  - `handlers/*` 细分到每个动作；
  - `Game.js` 保持小而稳，主要负责分发与 apply；
  - `server` 与 `ui` 分别围绕事件进行瘦身。


