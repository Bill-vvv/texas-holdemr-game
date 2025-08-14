# 德州扑克项目开发工作流程

## 项目概述
这是一个完整的在线德州扑克游戏系统，目前处于阶段1.5，基于GitHub Flow进行版本管理和团队协作。

## 分支管理策略

### 分支类型
- **`master`** - 主分支，始终保持稳定可部署的代码
- **`feat/功能名`** - 新功能开发分支
- **`fix/问题描述`** - Bug修复分支
- **`refactor/重构描述`** - 代码重构分支
- **`docs/文档更新`** - 文档更新分支

### 分支命名规范
```
feat/add-tournament-mode     # 新功能：添加锦标赛模式
fix/showdown-display-bug     # 修复：摊牌显示错误
refactor/pot-manager         # 重构：彩池管理器
docs/update-api-docs         # 文档：更新API文档
```

## 完整开发流程

### 步骤1：开始新工作
```bash
# 确保在最新的主分支上
git checkout master
git pull origin master

# 创建新的特性分支
git checkout -b feat/new-feature-name
```

### 步骤2：开发与提交
```bash
# 进行开发工作...
# 添加变更到暂存区
git add .

# 提交变更（遵循提交规范）
git commit -m "feat: add user authentication system"
```

### 步骤3：推送分支
```bash
# 首次推送使用-u建立跟踪关系
git push -u origin feat/new-feature-name

# 后续推送
git push
```

### 步骤4：创建Pull Request
1. 在GitHub上会看到提示创建PR
2. 点击"Create Pull Request"
3. 填写PR标题和描述
4. 分配审查者（如有团队）
5. 等待代码审查和CI检查

### 步骤5：合并与清理
```bash
# PR合并后，更新本地主分支
git checkout master
git pull origin master

# 删除本地特性分支
git branch -d feat/new-feature-name
```

## 提交规范

### 提交信息格式
```
<类型>: <简短描述>

<详细描述（可选）>

<相关Issue（可选）>
```

### 提交类型
- `feat`: 新功能
- `fix`: Bug修复
- `refactor`: 代码重构
- `docs`: 文档更新
- `style`: 代码格式调整
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

### 示例
```
feat: add tournament mode with buy-in levels

- Implement tournament structure
- Add blind level progression
- Support multiple tables

Closes #123
```

## Pull Request规范

### PR标题格式
```
[类型] 简短描述
```
例如：`[FEAT] Add tournament mode`

### PR描述模板
```markdown
## 变更描述
简要说明这个PR做了什么

## 变更类型
- [ ] 新功能
- [ ] Bug修复
- [ ] 重构
- [ ] 文档更新
- [ ] 其他

## 测试
- [ ] 已添加单元测试
- [ ] 已进行集成测试
- [ ] 已手动测试所有功能

## 相关Issue
Closes #123

## 截图（如有UI变更）
```

## 版本发布流程

### 语义化版本
- `MAJOR.MINOR.PATCH` (例如: 1.5.2)
- **MAJOR**: 不兼容的API修改
- **MINOR**: 向后兼容的功能性新增
- **PATCH**: 向后兼容的问题修正

### 发布步骤
1. 确保所有功能PR已合并到master
2. 更新版本号和CHANGELOG
3. 创建发布标签
4. 部署到生产环境

## 项目里程碑

### 当前状态：阶段1.5 ✅
- ✅ 基础游戏逻辑
- ✅ 多人实时对战
- ✅ 摊牌结果展示
- ✅ 整局结算统计

### 计划中的功能
- 🎯 **阶段2.0**: 锦标赛模式
- 🎯 **阶段2.1**: 用户账户系统
- 🎯 **阶段2.2**: 游戏历史记录
- 🎯 **阶段2.3**: 移动端优化

## 代码质量标准

### 代码审查要点
- [ ] 代码逻辑正确且高效
- [ ] 符合项目编码规范
- [ ] 有适当的注释和文档
- [ ] 包含必要的测试
- [ ] 没有安全漏洞
- [ ] 性能影响可接受

### 测试要求
- 新功能必须包含单元测试
- Bug修复必须包含回归测试
- 关键路径需要集成测试
- 测试覆盖率不低于80%

## 紧急修复流程

对于生产环境的紧急问题：

```bash
# 基于master创建热修复分支
git checkout master
git checkout -b hotfix/critical-bug-fix

# 进行修复
# ... 修复代码 ...

# 提交修复
git commit -m "hotfix: fix critical payment processing bug"

# 推送并创建紧急PR
git push -u origin hotfix/critical-bug-fix
```

## 开发环境管理

### 本地开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 运行测试
npm test

# 代码格式检查
npm run lint
```

### 环境变量
参考 `.env.example` 配置本地环境变量

## 团队协作规则

1. **永远不要直接推送到master分支**
2. **每个PR必须经过代码审查**
3. **保持分支简洁，及时删除已合并的分支**
4. **提交信息要清晰描述变更内容**
5. **大功能拆分为多个小PR，便于审查**

## 问题反馈

- 使用GitHub Issues报告Bug
- 使用GitHub Discussions进行功能讨论
- 紧急问题可直接联系项目维护者

---

遵循这个工作流程，我们可以确保代码质量，提高协作效率，并维持项目的长期健康发展。