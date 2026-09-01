# 为 RSerial Debug Assistant 做贡献

[English](CONTRIBUTING.md)

感谢你有兴趣参与贡献！本文档说明仓库的组织方式，以及新功能开发、修复和发版时应遵循的工作流程。

## 分支模型（git-flow）

本仓库使用标准 **git-flow** 分支结构（生产分支采用现代惯例的 `main`，取代传统的 `master`）：

| 分支 | git-flow 角色 | 用途 |
|------|---------------|------|
| `main` | *master*（生产） | 发版线。只有准备发布的代码才进入此分支。**禁止直接提交**——一律通过 Pull Request。 |
| `develop` | *develop* | 日常集成分支，也是 GitHub 默认分支。所有功能开发先合并到这里。 |
| `feature/<名称>` | feature 分支 | 新功能或改进，从 `develop` 拉出，通过 PR 合回 `develop`。 |
| `bugfix/<名称>` | bugfix 分支 | 非紧急修复，从 `develop` 拉出，通过 PR 合回 `develop`。 |
| `release/<x.y.z>` | release 分支 | 发版准备 / 版本号提升，从 `develop` 拉出，通过 PR 合入 `main`，再回合 `develop`。 |
| `hotfix/<x.y.z>` | hotfix 分支 | 紧急线上修复，从 `main` 拉出，通过 PR 合回 `main`，再回合 `develop`。 |

```
feature/* ──PR──► develop ──PR──► release/x.y.z ──PR──► main ──打 Tag Vx.y.z──► CI 构建安装包
bugfix/*  ──PR──► develop            │
hotfix/*  ──PR──► main ──打 Tag──► CI └─回合──► develop
                  └─回合──► develop
```

## 可选：git-flow CLI 配置

如果你使用 [`git-flow`](https://github.com/nvie/gitflow) 命令行工具，克隆后执行一次以下命令即可匹配本仓库的分支命名：

```bash
git config gitflow.branch.master main
git config gitflow.branch.develop develop
git config gitflow.prefix.feature feature/
git config gitflow.prefix.bugfix bugfix/
git config gitflow.prefix.release release/
git config gitflow.prefix.hotfix hotfix/
git config gitflow.prefix.support support/
git config gitflow.prefix.versiontag V
```

CLI 完全是可选的——直接用 `git checkout -b ...` 加 Pull Request 遵循的是完全相同的模型。

## 开发新功能

1. **Fork** 仓库并克隆你的 fork。
2. 确保本地 `develop` 是最新的：
   ```bash
   git checkout develop && git pull
   ```
3. **从 `develop`** 创建功能分支：
   ```bash
   git checkout -b feature/your-feature-name
   # 或使用 CLI：git flow feature start your-feature-name
   ```
4. 进行更改并在本地充分测试（见[本地开发](#本地开发)）。
5. 使用 [Conventional Commits](#提交信息) 规范提交。
6. 推送并打开**目标为 `develop` 的 Pull Request**（永远不要直接对 `main` 提 PR）。
7. 评审合并后删除功能分支。

## 提交信息

使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范，与现有提交历史保持一致：

```
feat(macos): add dual-platform release CI and serial port fixes
fix: handle serial port disconnection gracefully
docs: update usage guide
ci(macos): sign and notarize the GitHub dmg
```

常用类型：`feat`、`fix`、`docs`、`ci`、`refactor`、`test`、`chore`。

## 版本号

准备发版时，以下四个文件**必须**使用相同的 `x.y.z`：

- `version.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `frontend/package.json`

**不要**在 README 中手写版本号或更新日志——版本发布和变更说明由 CI 生成，发布在 [GitHub Releases](https://github.com/Gyanano/RSerialDebugAssistant/releases) 上。

## 发版流程（维护者）

完整说明（包括 CI 门禁条件和 macOS 签名）见 [.github/BRANCHING.md](.github/BRANCHING.md)。简要流程：

1. 从 `develop` 创建 `release/x.y.z` 分支，提升全部四个版本文件，提 PR 合入 `main`。
2. 在 `main` 的合并提交上打 Tag `Vx.y.z`（大写 V，与 `version.json` 一致）并推送。
3. CI 校验门禁（提交在 `main` 上 + `version.json` 有变更 + Tag 一致），然后构建 Windows `.exe` 和 macOS `.dmg`。
4. 将 `main` 回合到 `develop`。

## 紧急修复（Hotfix）

1. **从 `main`**（而不是 `develop`）拉出 `hotfix/x.y.z` 分支。
2. 修复问题，在全部四个文件中提升 **patch** 版本号，提 PR 合回 `main`。
3. 在 `main` 上打新的 Tag `Vx.y.z` 并推送——CI 自动发布。
4. 将 `main` 回合到 `develop`，确保修复不丢回开发线。

## 本地开发

前置条件：Node.js、Rust 工具链，以及 Tauri 2 的系统依赖。

```bash
# 终端 1 —— 前端开发服务器（端口 5173）
cd frontend && npm install && npm run dev

# 终端 2 —— Tauri 应用
npx @tauri-apps/cli@2 dev
```

提交前：

- Rust：在 `src-tauri/` 中运行 `cargo fmt` 和 `cargo clippy`。
- 前端：遵循现有 TypeScript / React 约定；优先使用 `frontend/src/components/ui/` 中已有的 shadcn 组件，不要手写原生元素。
- 在你的平台上测试；未测试的平台请在 PR 描述中说明。

## 报告问题

请[提交 Issue](https://github.com/Gyanano/RSerialDebugAssistant/issues)，附上清晰的标题、复现步骤、期望与实际行为，以及你的操作系统和应用版本。
