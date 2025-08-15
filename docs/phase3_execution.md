## 阶段三执行计划（持久化与回放）——手局开始快照 + 单会话追加日志 + 私有日志可选 + 明确恢复协议（KISS / YAGNI，单文件 <200 行）

本方案在现有阶段一/二的“全量 TABLE_STATE 广播 + 事件提示 + 会话/生命周期”基础上，增量实现持久化与回放，避免重构到完整事件溯源。核心策略：以“手局开始时的快照”为唯一检查点，以“会话级单一追加日志”为唯一数据源（公共），私有日志可选开启以实现100%保真回放。

### 1. 目标与验收

- 目标
  - 持久化：在每手开始时创建快照；动作与事件以会话级单一 `events.ndjson` 追加日志记录（公共）；可选 `private.ndjson` 存储私有发牌事件。
  - 回放：加载快照并顺序重放该手的事件流，恢复公共状态与结算；在管理员模式下可读取私有日志实现逐牌100%保真。
  - 恢复：服务崩溃或重启时，回滚到上一个完成手局之后的“等待状态”，保证一致性。
- 验收
  - 端到端跑通：若干手→结束整局→落地会话目录→公共回放一致；管理员模式下逐牌一致。
  - 重启恢复：总能恢复到上一个完成手局后的 `WAITING`；不会卡在中间态。
  - 保持“全量 TABLE_STATE 广播”策略不变；新增仅为持久化/回放内部实现。

### 2. 范围与非目标

- 范围
  - 文件型持久化（JSON/NDJSON 至 `data/`）；
  - 快照/事件记录器与最小回放引擎；
  - 启动时恢复；最小只读 Admin 端点/CLI。
- 非目标（延后）
  - 完整事件溯源重构与生产数据库（Redis/Mongo）；
  - 完整 UI 播放器（本阶段仅文本或最小 UI 支持）。

### 3. 架构总览

- 快照：仅在“手局开始后”保存会话快照（覆盖写），作为检查点/加速器。
- 事件：会话级 `events.ndjson` 追加所有公共动作/事件（单一数据源）。
- 私有事件（可选）：`private.ndjson` 记录 `DECK_SHUFFLED`、`HOLE_CARDS_DEALT` 等，仅管理员可读。
- 恢复：启动→加载最近快照→从日志重放→丢弃未完成尾部→进入 `WAITING`。

### 4. 数据与文件布局（会话级单日志）

- 目录结构
```
data/sessions/{sessionId}/
  ├─ session.json        # 会话元信息 + 最新快照（覆盖写）
  ├─ events.ndjson       # 公共事件/动作，持续追加（单一数据源）
  ├─ private.ndjson      # 可选：私有事件（完整发牌剧本），默认关闭
  └─ events.idx          # 可选：索引（handNumber → 文件偏移）提升回放/恢复速度
```
- `session.json`（快照）
```json
{
  "meta": { "version": 1, "savedAt": 1730000000000 },
  "session": { "id": "session_xxx", "startedAt": 1729990000000, "handsPlayed": 13 },
  "gameState": { /* GameStateSerializer.serialize() 输出（见 §6） */ }
}
```
- `events.ndjson`（每行一事件）
```json
{"seq":1,"t":1730000000100,"sessionId":"session_xxx","handNumber":14,"type":"HAND_STARTED","payload":{}}
{"seq":2,"t":1730000000200,"sessionId":"session_xxx","handNumber":14,"type":"PLAYER_ACTION","payload":{"playerId":"p1","action":"bet","amount":100}}
{"seq":3,"t":1730000000300,"sessionId":"session_xxx","handNumber":14,"type":"FLOP_DEALT","payload":{"cards":["Ah","Kd","7s"]}}
{"seq":9,"t":1730000000900,"sessionId":"session_xxx","handNumber":14,"type":"HAND_FINISHED","payload":{"pots":[...],"winners":["p1"]}}
```
- `private.ndjson`（可选）
```json
{"seq":1,"t":1730000000050,"type":"DECK_SHUFFLED","payload":{"orderedDeck":["As","Kh","..."]}}
{"seq":2,"t":1730000000150,"type":"HOLE_CARDS_DEALT","payload":{"playerId":"p1","cards":["Ah","Kd"]}}
```

### 5. 事件模型（最小必要集）

- 动作类：`PLAYER_ACTION { playerId, action, amount? }`
- 流程类：`HAND_STARTED`、`ROUND_CLOSED`、`STREET_ADVANCED`、`FLOP_DEALT`、`TURN_DEALT`、`RIVER_DEALT`、`SHOWDOWN_STARTED`、`POTS_DISTRIBUTED`、`HAND_FINISHED`、`GAME_ENDED`
- 字段规范
  - 公共事件格式：`{ seq, t, sessionId, handNumber, type, payload }`
  - 私有事件格式：`{ seq, t, type, payload }`（不暴露 sessionId/handNumber 给公共 API）

### 6. 快照策略（单一检查点）

- 时机：仅在“手局开始后”（`HAND_STARTED` 写入 events 后）保存会话快照。
- 内容：`meta` + `session` 摘要 + `gameState`。
- GameState 序列化要求（补齐/剔除）：
  - 包含：`gameId, street, phase, tableStatus, players[*]{id,name,chips,position,status,currentBet,totalBet,isDealer,isSmallBlind,isBigBlind,hasCards}, communityCards, pots, totalPot, currentTurn, amountToCall, buttonIndex, handNumber, isActionReopened, activePlayersCount, lastAggressorId, actionHistory, lastShowdownSummary, session{id,startedAt,handsPlayed}`
  - 剔除：`players[*].holeCards`（未揭示底牌）；任何临时对象引用。
- 不再在快照中存储 `lastHandResult`；结果从事件流推导，保证“单一数据源”。

### 7. 恢复协议（确定性）

- 启动时：
  - 定位最近会话目录 `data/sessions/{sessionId}/`
  - 读取 `session.json` → 加载快照（手局开始态）
  - 从 `events.ndjson` 流式读取“自该手开始至最近 `HAND_FINISHED`”的事件并重放
  - 忽略/丢弃 `HAND_FINISHED` 之后未闭合的尾段（视为崩溃中断）
  - 进入 `WAITING`，准备开始下一手
- 可选优化：使用 `events.idx` 快速定位手号区间偏移

### 8. 组件与依赖关系

- `src/server/persistence/storage/Storage.js`
  - 定义存储接口（append/save/read/list），零实现依赖
- `src/server/persistence/storage/FileStorage.js`
  - Node `fs/promises` 实现；`appendEvent` 使用 O_APPEND；覆盖写快照采用“临时文件+rename”
- `src/server/persistence/EventLogger.js`
  - 依赖 `Storage`；提供 `appendPublicEvent()`、可选 `rotateIndex()`；由 `server` 调用
- `src/server/persistence/PrivateEventLogger.js`（可选）
  - 依赖 `Storage`；在启用时记录 `DECK_SHUFFLED`、`HOLE_CARDS_DEALT`
- `src/server/persistence/SnapshotManager.js`
  - 依赖 `Storage`、`Game` 只读 getter；在 `HAND_STARTED` 后保存快照
- `src/game/replay/ScriptedDeck.js`
  - 受控牌堆，仅回放用；公共模式可不严格使用
- `src/game/replay/ReplayEngine.js`
  - 依赖 `Game`、`ScriptedDeck`、`Storage`（或文件）；支持公共/管理员两种回放模式

依赖图（摘要）：
- `server/server.js` → { `EventLogger`, `SnapshotManager` } → `Storage`
- `ReplayEngine` → { `Storage` | 文件 } + `Game` + `ScriptedDeck`

### 9. 服务端集成点（最小侵入）

- `handlePlayerAction(payload)`：
  - 先 `EventLogger.appendPublicEvent({type:'PLAYER_ACTION', ...})`
  - 调用 `game.applyAction()`；随后由 `handleGameEvents()` 记录产生的流程事件
- `handleGameEvents(events)`：
  - 逐条 `EventLogger.appendPublicEvent(event)`
  - 碰到 `HAND_STARTED` 后→触发 `SnapshotManager.saveSnapshot()`
  - `HAND_FINISHED` 仅落事件，不保存快照
- `server.startGame()` 成功后：
  - 生成并广播/记录 `HAND_STARTED`（保持 `Game` 无侵入）
- `GAME_ENDED`：落事件；`session.json` 可更新 `handsPlayed` 与元信息

### 10. 回放引擎（两种精度）

- 公共模式（默认）：`session.json` + `events.ndjson`，用 `ScriptedDeck` 或公共事件驱动；未揭示底牌保持不可见；对齐公共结论（pots、赢家、`lastShowdownSummary`）
- 管理员模式（可选）：额外读取 `private.ndjson`（锁定访问），以 `DECK_SHUFFLED`/`HOLE_CARDS_DEALT` 100%复原逐牌顺序

### 11. 安全与隐私

- 私有日志默认关闭：`PERSIST_PRIVATE=false`
- 任何公共 API 不暴露 `private.ndjson`
- 管理读取仅在本地或受控工具；可选加密/签名（延后）

### 12. 测试计划

- 单元测试
  - `FileStorage`：append/覆盖写/并发安全；异常回滚
  - `SnapshotManager`：`HAND_STARTED` 触发、快照结构与剔除策略正确
  - `EventLogger`：序号/时间戳/过滤 handNumber 正确；（可选）索引生成正确
  - `ReplayEngine`：公共模式结论一致；管理员模式牌面/顺序完全一致
  - `GameStateSerializer`：阶段二字段序列化/反序列化稳定，不泄露私有牌
- 集成测试
  - 打多手→结束→检查 `data/sessions/{sid}` 文件与核心字段
  - 服务重启→按恢复协议进入 `WAITING`；手数/结算一致
  - 回放整会话→逐手校验 pots/赢家/`lastShowdownSummary` 一致

### 13. 任务拆分与排期（3–5 人日）

1) 存储与布局（0.5–0.8d）：`Storage`/`FileStorage`（append+覆盖、目录结构）
2) 事件与快照接入（1–1.2d）：`EventLogger`、`SnapshotManager`；`HAND_STARTED` 时机挂钩
3) 私有日志（可选，0.4–0.6d）：`PrivateEventLogger`、配置开关
4) 回放引擎（0.8–1.2d）：公共模式必做；管理员模式支持私有日志
5) 恢复协议与端点（0.3–0.5d）：启动恢复；只读 admin 端点
6) 测试与文档（0.6–1d）：完善测试矩阵；更新 `README`/`docs`

### 14. 风险与缓解

- 回放不一致（公共信息不足）：管理员模式启用私有日志获得 100% 保真
- 文件增长：按会话滚动；可增量压缩归档（延后）；可选事件索引
- 启动恢复性能：先线性扫描，必要时启用 `events.idx`
- 侵入风险：所有接入点集中在 `server.js` 动作入口/事件回调/手局开始时机，`Game` 内核零改动

### 15. 接口与端点草案

- Storage 抽象
```ts
interface Storage {
  saveSnapshot(sessionId: string, data: object): Promise<void>; // 覆盖写 session.json
  appendPublicEvent(sessionId: string, evt: object): Promise<void>; // 追加 events.ndjson
  appendPrivateEvent?(sessionId: string, evt: object): Promise<void>; // 可选
  listSessions(): Promise<Array<{sessionId:string, startedAt:number, hands:number}>>;
  readSession(sessionId: string): Promise<object>;
  streamPublicEvents(sessionId: string, fromSeq?: number): AsyncIterable<object>;
}
```
- Admin（只读）
  - `GET /admin/sessions`：列出现有会话（不含私有）
  - `GET /admin/sessions/:id/meta`：返回 `session.json`
  - `GET /admin/sessions/:id/events?fromSeq=`：流式返回公共事件
  - 可选：`POST /admin/reload/latest`：开发环境从最近会话恢复

### 16. 配置开关（环境变量）

- `PERSIST_ENABLED=true`
- `PERSIST_PRIVATE=false`（默认）
- `DATA_DIR=./data/sessions`
- `EVENT_INDEX_ENABLED=false`（默认）

### 17. 200 行约束与一致性声明

- 新增每个源文件严格 <200 行；必要时继续拆分子模块。
- 不改变阶段一/二外部行为与消息结构；仅新增持久化/回放内部能力。
- 保持“全量 TABLE_STATE 广播 + 私有单播不泄露”策略；公共快照不含未揭示底牌。

---

- 变更要点回顾
  - 快照仅在“手局开始”保存；从事件推导结果，确立单一数据源。
  - 会话级单一追加日志（公共）；私有日志可选开启实现 100% 保真。
  - 明确恢复协议：加载快照→重放至最近 `HAND_FINISHED`→丢弃尾部→进入 `WAITING`。
  - 最小侵入接入 `server.js`；`Game` 内核不变；测试与端点覆盖一致性。

### 18. Git工作流与提交策略

#### 18.1 分支管理策略

- **功能分支命名规范**：
  - `phase3-storage-foundation` - 存储基础层 ✅已完成
  - `phase3-event-logging` - 事件记录器
  - `phase3-snapshot-manager` - 快照管理器  
  - `phase3-replay-engine` - 回放引擎
  - `phase3-server-integration` - 服务端集成
  - `phase3-complete` - 最终集成分支

- **分支生命周期**：
  1. 从最新master创建功能分支
  2. 完成功能开发和测试
  3. 提交到功能分支并推送
  4. 合并到master（通过PR或直接merge）
  5. 删除功能分支

#### 18.2 Commit时机与规范

##### 阶段性Commit指导
每个开发步骤应当在以下时机进行commit：

1. **存储基础层** ✅已完成 (commit: c27dd16)
   ```bash
   # 单个功能完成后立即commit
   git add .
   git commit -m "阶段三第一步：实现存储抽象层和文件系统持久化"
   ```

2. **事件记录器开发**
   ```bash
   # EventLogger实现完成后
   git add src/server/persistence/EventLogger.js
   git commit -m "实现EventLogger - 公共事件记录器"
   
   # PrivateEventLogger实现完成后  
   git add src/server/persistence/PrivateEventLogger.js
   git commit -m "实现PrivateEventLogger - 私有事件记录器"
   
   # 功能测试完成后
   git add test/
   git commit -m "添加EventLogger功能测试和文档"
   ```

3. **快照管理器开发**
   ```bash
   # SnapshotManager实现完成后
   git add src/server/persistence/SnapshotManager.js
   git commit -m "实现SnapshotManager - 手局开始快照管理"
   
   # 集成测试通过后
   git commit -m "SnapshotManager集成测试通过"
   ```

4. **回放引擎开发**
   ```bash
   # ScriptedDeck实现完成后
   git add src/game/replay/ScriptedDeck.js
   git commit -m "实现ScriptedDeck - 可控发牌回放"
   
   # ReplayEngine实现完成后
   git add src/game/replay/ReplayEngine.js
   git commit -m "实现ReplayEngine - 双模式回放引擎"
   
   # 端到端回放测试通过后
   git commit -m "回放引擎端到端测试通过"
   ```

5. **服务端集成**
   ```bash
   # server.js最小侵入集成后
   git add src/server/server.js
   git commit -m "server.js集成持久化钩子"
   
   # 恢复协议实现后
   git commit -m "实现启动时状态恢复协议"
   
   # 完整集成测试后
   git commit -m "持久化系统服务端集成完成"
   ```

##### Commit消息规范
```bash
# 格式：<类型>: <简短描述>
#
# 详细说明：
# - 功能特点
# - 技术实现要点  
# - 验收标准
#
# 🤖 Generated with Claude Code
# Co-Authored-By: Claude <noreply@anthropic.com>

# 示例：
git commit -m "feat: 实现EventLogger - 公共事件记录器

✅ 完成功能：
- 支持会话级事件追加记录
- 自动序号生成和时间戳
- 错误处理和重试机制

📏 代码质量：
- 严格遵循<200行限制 (156行)
- 完整单元测试覆盖
- 详细文档和使用示例

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### 18.3 Push策略

##### 功能分支Push时机
- **即时推送**：每次commit后立即push到功能分支
  ```bash
  git push origin phase3-event-logging
  ```

- **保护原则**：绝不直接push到master，始终通过功能分支
  ```bash
  # ❌ 禁止
  git push origin master
  
  # ✅ 正确
  git push origin phase3-feature-name
  ```

##### Master合并条件
只有满足以下**所有条件**时，才能合并到master：

1. **功能完整性**
   - [ ] 所有计划功能已实现
   - [ ] 单元测试100%通过
   - [ ] 集成测试验证通过
   - [ ] 文档完整且准确

2. **代码质量**
   - [ ] 所有文件严格遵循<200行限制
   - [ ] 代码风格一致，遵循KISS/YAGNI原则
   - [ ] 无明显的代码异味或技术债务
   - [ ] 错误处理完善

3. **向后兼容**
   - [ ] 不破坏现有阶段1.0/1.5功能
   - [ ] 现有API接口保持不变
   - [ ] 现有测试仍然通过
   - [ ] 客户端无需修改

4. **验收测试**
   - [ ] 端到端游戏流程正常
   - [ ] 持久化功能工作正常
   - [ ] 恢复协议验证通过
   - [ ] 性能无明显退化

##### 最终Push到Master
```bash
# 确保功能分支最新
git checkout phase3-complete
git pull origin phase3-complete

# 切换到master并合并
git checkout master  
git pull origin master
git merge phase3-complete

# 最终验证后推送
npm test                    # 运行所有测试
npm start                   # 确保服务正常启动
git push origin master

# 清理功能分支
git branch -d phase3-complete
git push origin --delete phase3-complete
```

#### 18.4 阶段性里程碑

| 里程碑 | 分支 | 验收标准 | 预计时间 |
|--------|------|----------|----------|
| 存储基础 | phase3-storage-foundation | Storage接口+FileStorage实现+测试 | ✅ 已完成 |
| 事件记录 | phase3-event-logging | EventLogger+PrivateEventLogger+集成 | 1天 |
| 快照管理 | phase3-snapshot-manager | SnapshotManager+时机控制+测试 | 0.8天 |
| 回放引擎 | phase3-replay-engine | ReplayEngine+ScriptedDeck+双模式 | 1.2天 |
| 服务集成 | phase3-server-integration | server.js集成+恢复协议+端到端 | 1天 |
| 最终验收 | phase3-complete | 完整功能+文档+测试+性能验证 | 0.5天 |

#### 18.5 风险控制

##### 回滚策略
```bash
# 如果功能分支出现问题，立即回滚到安全点
git reset --hard <last-good-commit>
git push --force origin feature-branch

# 如果master出现问题，创建hotfix分支修复
git checkout master
git checkout -b hotfix-phase3-critical
# 修复问题后合并回master
```

##### 备份策略
- 重要里程碑后创建标签：
  ```bash
  git tag v1.5.1-phase3-storage-foundation
  git push origin v1.5.1-phase3-storage-foundation
  ```

- 定期备份功能分支：
  ```bash
  git checkout phase3-current-work
  git checkout -b backup/phase3-$(date +%Y%m%d)
  git push origin backup/phase3-$(date +%Y%m%d)
  ```

#### 18.6 协作规范

- **代码审查**（如适用）：
  - 每个功能完成后进行自我审查
  - 关键功能请其他开发者审查
  - 重点检查：功能正确性、代码质量、测试覆盖

- **文档同步**：
  - 代码更改必须同步更新相关CLAUDE.md
  - 新功能必须包含使用示例
  - API变更必须更新接口文档

- **测试优先**：
  - 功能实现前先写测试用例
  - 每次commit前运行相关测试
  - 新功能必须包含完整测试覆盖

通过这套完整的Git工作流策略，确保阶段三开发过程的可控性、可追溯性和高质量交付。