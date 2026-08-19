# RSerial Debug Assistant

Tauri 2 + React 18 串口调试工具。前端在 `frontend/`，Rust 在 `src-tauri/`。UI 用 shadcn（new-york / zinc），组件在 `frontend/src/components/ui/`。

发版流程、分支模型和 CI 门禁的完整说明在 `.github/BRANCHING.md`。改 CI、打 Tag、合 `release` 之前先读它。

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

应用内更新：Windows 认 NSIS `.exe`，macOS 认 `.dmg`。

## 发版门禁（三条件都要满足）

双端安装包（Windows NSIS `.exe` + macOS Apple Silicon `.dmg`）只在推送版本 Tag 时启动，并由 `scripts/ci-release-gate.sh` 再检查：

1. 该 Tag 的 commit 在 `origin/release` 上（合进了 release，不是只在 `main`）
2. `version.json` 相对上一个版本 Tag 有变更
3. Tag 为 `Vx.y.z` / `vx.y.z`，且与 `version.json` 一致

缺一则不编译。工作流：`.github/workflows/release.yml`。

分支：`main` = 日常开发；`release` = 发版线，不要直接往 `release` 上提交。`feature/*` 从 `main` 拉，`hotfix/*` 从 `release` 拉。

第一次启用 CI：先把含 workflow 的 commit 推到 `main`，再从该 commit 建并推送 `release`；GitHub Actions 权限设为 Read and write。已有 Tag（如 `V1.3.1`）不会自动重编。
