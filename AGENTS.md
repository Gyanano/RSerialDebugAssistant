# RSerial Debug Assistant

Tauri 2 + React 18 串口调试工具。前端在 `frontend/`，Rust 在 `src-tauri/`。UI 用 shadcn（new-york / zinc），组件在 `frontend/src/components/ui/`。

发版流程、分支模型和 CI 门禁的完整说明在 `.github/BRANCHING.md`。改 CI、打 Tag、合 `main`（生产线）之前先读它。

## 本地运行（macOS）

本机通常没有 `cargo-tauri`。从仓库根目录：

```bash
cd frontend && npm install && npm run dev   # 终端 1，端口 5173
npx @tauri-apps/cli@2 dev                   # 终端 2
```

macOS 打包需要 `src-tauri/icons/` 里的 `icon.png` 和 `icon.icns`，不能只留 Windows 的 `icon.ico`。`tauri.conf.json` 的 `beforeBuildCommand` 会编前端；`beforeDevCommand` 没有配置，开发时要自己起 Vite。

## 串口（macOS）

- 同一设备会同时出现 `/dev/cu.*` 和 `/dev/tty.*`。列表里只保留 `cu`（`filter_macos_tty_duplicates`）。
- 隐藏系统虚拟口：`debug-console`、`Bluetooth-Incoming-Port`。
- USB 转串口排在前面。连接用 `/dev/cu.usbserial-*`，不要用 `tty.*`。
- POSIX 不支持 Mark/Space 校验和 1.5 停止位，后端会当成 None / 1。

快捷键：搜索用 ⌘F（Ctrl+F 也可）；发送占位符在 Mac 上显示 ⌘+Enter。

## UI

能用 `frontend/src/components/ui/` 里已有组件时，用 shadcn，不要手写原生 `<button>` / `<select>`。快捷命令列表下拉保持自定义（行内重命名）。日志区不要换成 `ScrollArea`，自动滚底依赖原生 `scrollTop`。

## 版本号

发版时下面四个必须相同：

- `version.json`（前端 `__APP_VERSION__` / `__APP_BUILD__` 的来源）
- `src-tauri/Cargo.toml`（应用内更新器用 `CARGO_PKG_VERSION`）
- `src-tauri/tauri.conf.json`
- `frontend/package.json`

历史 Tag 是 `Vx.y.z`（大写 V）。更新器按 `v` / `V` 都能解析。

应用内更新：Windows 认 NSIS `.exe`（不签名），macOS 认已公证的 `.dmg`。

macOS CI 用 Developer ID Application 签名 + App Store Connect API 公证。凭证在仓库 Actions Secrets 里（`APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_TEAM_ID`、`APPLE_API_ISSUER`、`APPLE_API_KEY`、`APPLE_API_KEY_P8`）。Windows job 不注入这些变量。本地 `tauri.conf.json` 的 `bundle.macOS.signingIdentity` 是 `-`（ad-hoc），CI 里 `APPLE_SIGNING_IDENTITY` 会覆盖它。

## 发版门禁（三条件都要满足）

双端安装包（Windows NSIS `.exe` + macOS Apple Silicon `.dmg`）只在推送版本 Tag 时启动，并由 `scripts/ci-release-gate.sh` 再检查：

1. 该 Tag 的 commit 在 `origin/main`（生产线）上（合进了 main，不是只在 `develop`）
2. `version.json` 相对上一个版本 Tag 有变更
3. Tag 为 `Vx.y.z` / `vx.y.z`，且与 `version.json` 一致

缺一则不编译。工作流：`.github/workflows/release.yml`。

不要在 README 里手写版本号或版本历史。最新版本用 GitHub Release 徽章显示，变更说明由 CI 根据两次 Tag 之间的提交生成，写在 GitHub Releases 上。

分支（标准 git-flow）：`main` = 生产发版线，不要直接往 `main` 上提交；`develop` = 日常开发（GitHub 默认分支）。`feature/*`、`bugfix/*`、`release/x.y.z` 从 `develop` 拉，`hotfix/x.y.z` 从 `main` 拉。

## git-flow 常用流程

注意：把分支**推送**到远端不会删除本地分支；删除发生在"完成"时（PR 合并后，或 `git flow feature finish`）。远端分支要单独删（GitHub 合并 PR 后点 Delete branch，或 `git push origin --delete <branch>`）。

### feature / bugfix（日常开发，从 develop 拉）

```bash
git checkout develop && git pull
git checkout -b feature/xxx            # bugfix 同理：bugfix/xxx
# …开发、提交（Conventional Commits）…
git push -u origin feature/xxx         # 推送不删本地分支
# 开 PR 合入 develop，合并后清理：
git checkout develop && git pull
git branch -d feature/xxx
git push origin --delete feature/xxx   # 或在 GitHub 上点 Delete branch
```

本地只有小改动、不走 PR 时，可以直接 `--no-ff` 合回 develop 再删分支（仓库里 `1da5a4f` 就是例子）。

### release/x.y.z（发版，从 develop 拉）

```bash
git checkout develop && git pull
git checkout -b release/1.4.0
# 提升 version.json / Cargo.toml / tauri.conf.json / frontend/package.json 到同一版本
git push -u origin release/1.4.0       # 开 PR 合入 main
git checkout main && git pull
git tag V1.4.0 && git push origin V1.4.0   # 推 Tag 触发 CI 构建
git checkout develop && git merge --no-ff main   # 回合 develop
git push origin develop
git branch -d release/1.4.0 && git push origin --delete release/1.4.0
```

### hotfix/x.y.z（紧急修复，从 main 拉）

```bash
git checkout main && git pull
git checkout -b hotfix/1.3.2
# 修复 + 提升四个文件的 patch 版本
git push -u origin hotfix/1.3.2        # 开 PR 合入 main
git checkout main && git pull
git tag V1.3.2 && git push origin V1.3.2
git checkout develop && git merge --no-ff main   # 修复回合 develop
git push origin develop
git branch -d hotfix/1.3.2 && git push origin --delete hotfix/1.3.2
```

### 同步与清理

```bash
git fetch --prune                      # 清理远端已删除分支的本地跟踪
git checkout develop && git pull       # 日常开工前保持 develop 最新
```

第一次启用 CI：先把含 workflow 的 commit 推到 `develop`，再从该 commit 建并推送 `main`（生产线）；GitHub Actions 权限设为 Read and write。已有 Tag（如 `V1.3.1`）不会自动重编。
