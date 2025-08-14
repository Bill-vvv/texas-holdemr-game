# Claude Code GitHub工作流程执行指南

> **注意：此文档仅供项目维护者使用，指导Claude Code执行GitHub工作流程**

## 📋 文档用途
本文档为Claude Code提供详细的GitHub工作流程指导，确保在代码协作过程中严格遵循GitHub Flow最佳实践。

## 🎯 使用方法
当需要Claude遵循标准GitHub流程时，引用此文档：
```
"请按照 docs/claude-workflow-guide.md 中的指导执行这个开发任务"
```

---

## 🔄 标准工作流程

### 1. 开始任何开发工作前
```bash
# 必须先检查并切换到master分支
git checkout master
git pull origin master

# 确认工作目录干净
git status
```

### 2. 创建功能分支
```bash
# 根据任务类型创建相应分支
git checkout -b feat/feature-name        # 新功能
git checkout -b fix/bug-description      # Bug修复  
git checkout -b refactor/component-name  # 代码重构
git checkout -b docs/update-readme       # 文档更新
git checkout -b chore/update-deps        # 依赖更新
```

### 3. 开发过程中的提交
```bash
# 完成一个逻辑单元后立即提交
git add .
git commit -m "<type>: <description>"

# 示例：
git commit -m "feat: add user login validation"
git commit -m "fix: resolve memory leak in game loop"
git commit -m "refactor: extract card evaluation logic"
```

### 4. 推送到远程仓库
```bash
# 第一次推送该分支
git push -u origin feat/feature-name

# 后续推送
git push
```

### 5. 完成开发后
- 指导用户在GitHub上创建Pull Request
- 不要直接合并到master
- 等待代码审查完成

### 6. PR合并后的清理
```bash
# 回到master分支
git checkout master
git pull origin master

# 删除已完成的功能分支
git branch -d feat/feature-name
```

---

## 📝 提交信息规范

### 格式标准
```
<type>: <subject>

<body>

<footer>
```

### 类型(type)定义
- **feat**: 新功能
- **fix**: Bug修复
- **refactor**: 代码重构（不改变功能）
- **docs**: 文档更新
- **style**: 代码格式调整（不影响逻辑）
- **test**: 测试相关
- **chore**: 构建过程或辅助工具变动

### 提交信息示例
```
feat: add tournament mode with buy-in management

- Implement tournament structure creation
- Add automatic blind level progression  
- Support multiple table management
- Include player elimination tracking

Closes #45
```

```
fix: resolve showdown result display bug

The showdown summary was not updating correctly when 
multiple players had the same hand rank.

Fixes #67
```

---

## 🌿 分支管理详细规则

### 分支命名规范
```
# 功能开发
feat/add-user-profile
feat/implement-chat-system
feat/tournament-bracket

# Bug修复
fix/payment-processing-error
fix/ui-responsive-issues
fix/memory-leak-game-loop

# 重构
refactor/database-connection
refactor/authentication-module
refactor/ui-components

# 文档
docs/api-documentation
docs/deployment-guide
docs/user-manual

# 维护
chore/update-dependencies
chore/improve-build-process
```

### 分支生命周期
1. **创建**: 从最新的master分支创建
2. **开发**: 在分支上进行所有开发工作
3. **推送**: 定期推送到远程仓库
4. **审查**: 通过PR进行代码审查
5. **合并**: 审查通过后合并到master
6. **删除**: 合并后立即删除分支

---

## 🔧 Claude执行指令模板

### 新功能开发指令
当用户要求开发新功能时：
```bash
# 1. 准备工作
git checkout master
git pull origin master

# 2. 创建功能分支
git checkout -b feat/[具体功能名称]

# 3. 进行开发
# [执行具体的开发任务]

# 4. 提交变更
git add .
git commit -m "feat: [详细描述新功能]"

# 5. 推送分支
git push -u origin feat/[具体功能名称]

# 6. 提示用户创建PR
```

### Bug修复指令
当需要修复问题时：
```bash
# 1. 准备工作
git checkout master
git pull origin master

# 2. 创建修复分支
git checkout -b fix/[bug描述]

# 3. 修复问题
# [执行具体的修复工作]

# 4. 提交修复
git add .
git commit -m "fix: [详细描述修复内容]"

# 5. 推送分支
git push -u origin fix/[bug描述]

# 6. 提示用户创建PR
```

### 重构指令
进行代码重构时：
```bash
# 1. 准备工作
git checkout master
git pull origin master

# 2. 创建重构分支
git checkout -b refactor/[重构目标]

# 3. 执行重构
# [保持功能不变，改进代码结构]

# 4. 提交重构
git add .
git commit -m "refactor: [详细描述重构内容]"

# 5. 推送分支
git push -u origin refactor/[重构目标]

# 6. 提示用户创建PR
```

---

## 🚨 特殊情况处理

### 紧急修复(Hotfix)
对于生产环境的紧急问题：
```bash
# 基于master创建热修复分支
git checkout master
git pull origin master
git checkout -b hotfix/critical-[问题描述]

# 进行紧急修复
# [快速修复关键问题]

# 提交修复
git add .
git commit -m "hotfix: [紧急修复描述]"

# 立即推送
git push -u origin hotfix/critical-[问题描述]

# 通知用户立即创建和审查PR
```

### 多人协作冲突
当遇到合并冲突时：
```bash
# 更新本地master
git checkout master
git pull origin master

# 回到功能分支
git checkout feat/feature-name

# 合并最新master
git merge master

# 解决冲突后提交
git add .
git commit -m "resolve merge conflicts with master"
git push
```

---

## 📋 代码质量检查清单

### 提交前必检项
- [ ] 代码功能正确无误
- [ ] 遵循项目编码规范
- [ ] 移除所有调试代码
- [ ] 确保没有硬编码敏感信息
- [ ] 添加必要的错误处理
- [ ] 更新相关文档
- [ ] 确保测试通过

### PR创建前检查
- [ ] 分支名称符合规范
- [ ] 提交信息清晰准确
- [ ] 功能完整可测试
- [ ] 没有明显的性能问题
- [ ] 考虑了向后兼容性

---

## 🎯 常见开发场景

### 场景1: 添加新游戏功能
```
用户需求: "添加锦标赛模式"

Claude执行流程:
1. git checkout master && git pull origin master
2. git checkout -b feat/tournament-mode  
3. [开发锦标赛相关功能]
4. git add . && git commit -m "feat: add tournament mode with blind progression"
5. git push -u origin feat/tournament-mode
6. 指导用户创建PR
```

### 场景2: 修复UI问题
```
用户报告: "移动端显示有问题"

Claude执行流程:
1. git checkout master && git pull origin master
2. git checkout -b fix/mobile-ui-issues
3. [修复移动端适配问题]
4. git add . && git commit -m "fix: resolve mobile responsive layout issues"
5. git push -u origin fix/mobile-ui-issues
6. 指导用户创建PR
```

### 场景3: 性能优化
```
用户需求: "优化游戏性能"

Claude执行流程:
1. git checkout master && git pull origin master
2. git checkout -b refactor/optimize-game-performance
3. [进行性能优化重构]
4. git add . && git commit -m "refactor: optimize game loop and memory usage"
5. git push -u origin refactor/optimize-game-performance
6. 指导用户创建PR
```

---

## 💡 关键原则提醒

### 永远遵循的规则
1. **绝不直接修改master分支**
2. **每个功能使用独立分支**
3. **提交信息必须清晰描述变更**
4. **推送前确保代码质量**
5. **完成后及时清理分支**

### 沟通要点
- 明确告知用户当前在哪个分支工作
- 解释为什么使用特定的分支名称
- 指导用户如何创建和管理PR
- 提醒用户何时可以安全删除分支

---

## 📚 快速参考

### 常用Git命令
```bash
# 查看状态
git status
git branch -a

# 分支操作
git checkout master
git checkout -b feat/new-feature
git branch -d feat/old-feature

# 提交操作
git add .
git commit -m "feat: description"
git push -u origin branch-name

# 同步操作
git pull origin master
git merge master
```

### 应急命令
```bash
# 撤销最后一次提交（保留变更）
git reset --soft HEAD~1

# 撤销最后一次提交（丢弃变更）
git reset --hard HEAD~1

# 查看提交历史
git log --oneline -10
```

---

**重要提醒**: 严格按照此指南执行每一个开发任务，确保代码库的整洁和项目的稳定性。遇到不确定的情况时，优先选择更保守和安全的做法。