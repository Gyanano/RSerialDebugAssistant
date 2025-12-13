# RSerial 调试助手

<div align="center">

<img src="./assets/RSerialDebugAssistant.png" width="30%" alt="RSerial 调试助手 Logo">

**一个专业级、跨平台的串行调试工具，基于 Tauri 2.0 + React 18 构建**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/tauri-2.0-purple.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/react-18.2-61dafb.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)

[✨ 功能特性](#-功能特性) | [📦 安装](#-安装) | [🚀 快速开始](#-快速开始) | [📋 使用指南](#-使用指南) | [🔧 开发](#-开发) | [❤️ 贡献](#-贡献)

**[English](./README.md) | [简体中文](./README.zh-CN.md)**

</div>

---

## 📖 项目介绍

**RSerial 调试助手**是一个专业级的串行通信调试工具，专为嵌入式系统工程师、IoT 开发者和硬件爱好者设计。它结合了 **Rust** 的强大性能和现代 **React** UI 的优雅设计，在 Windows、macOS 和 Linux 上提供无缝的跨平台体验。

无论您是调试 Arduino 项目、与工业传感器通讯、测试嵌入式设备，还是监控串行协议，本工具都能以直观的界面提供专业级的功能支持。

## ✨ 功能特性

### 🎨 用户界面
- **亮色/深色主题** - 支持自动和手动主题切换，采用现代风格设计
- **响应式布局** - 可调整大小的面板，保持布局偏好设置
- **实时日志显示** - 精确的时间戳和方向指示器的实时通信显示
- **多语言支持** - 支持英文和简体中文界面
- **特殊字符可视化** - 控制字符（CR、LF、ESC 等）的可视化表示
- **直观控制** - 受现代开发工具启发的专业 UI 设计

### 🔬 串行通讯
- **智能端口检测** - 自动检测可用的串行端口及设备信息
- **完整配置选项** - 波特率、数据位、奇偶校验、停止位、流量控制
- **双数据格式** - 支持文本（UTF-8/GBK）和十六进制格式的收发
- **连接统计信息** - 实时跟踪已发送/接收的字节数和连接时长
- **多种文本编码** - 支持 UTF-8 和 GBK 字符编码

### 🚀 高级功能
- **快速命令** - 创建命令列表，支持批量执行
  - 支持自定义行末尾（None、\r、\n、\r\n）
  - 支持二进制命令的十六进制格式
- **自动校验和** - 支持多种校验和算法：
  - XOR、ADD8、CRC8、CRC16、CCITT-CRC16
  - 可配置的校验和计算范围（开始/结束位置）
- **帧分段** - 智能数据帧分割，确保可靠通讯：
  - 超时模式：在空闲一段时间后发送帧
  - 分隔符模式：在特定字节序列处分割（CR、LF、CRLF、AnyNewline 或自定义分隔符）
  - 组合模式：同时使用超时和分隔符检测
- **数据记录** - 带有时间戳和方向跟踪的自动日志记录
- **数据导出** - 将通信日志保存为 TXT 格式，包含完整元数据
- **可配置设置** - 自定义日志目录、最大日志条目数、时区等

## 📦 安装

### 下载预编译二进制文件

从项目仓库下载最新版本：

| 平台 | 格式 | 说明 |
|------|------|------|
| Windows | `.msi` 或 `.exe` | 推荐使用安装程序格式 |

> **注意：** 预编译二进制文件可能需要在本地构建。请查看仓库获取最新的发布版本。

### 从源代码构建

#### 前置条件

- **Rust** 1.70+ - [从 rustup.rs 安装](https://rustup.rs/)
- **Node.js** 18+ - [从 nodejs.org 安装](https://nodejs.org/)
- **Git** - 用于克隆仓库

#### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/Gyanano/RSerialDebugAssistant.git
cd RSerialDebugAssistant

# 安装前端依赖
cd frontend
npm install
cd ..

# 构建应用（在 src-tauri/target/release/bundle/ 中生成安装程序）
cargo tauri build
```

编译后的应用程序二进制文件位置：
- **Windows**: `src-tauri/target/release/bundle/msi/`

## 🚀 快速开始

### 开发模式

准备两个终端窗口：

```bash
# 终端 1：启动前端开发服务器
cd frontend
npm run dev
```

```bash
# 终端 2：启动 Tauri 开发模式（从项目根目录运行）
cargo tauri dev
```

开发应用将自动启动，并启用热重载功能。

### 基本使用流程

1. **选择串行端口**
   - 点击左侧面板中的端口下拉菜单
   - 选择目标串行设备
   - 设备详情（VID、PID、制造商）会自动显示

2. **配置连接参数**
   - 设置**波特率**：9600、115200 等
   - 配置**数据位**：5、6、7 或 8
   - 选择**奇偶校验**：None、Odd、Even、Mark 或 Space
   - 选择**停止位**：1、1.5 或 2
   - 设置**流量控制**：None、Software (XON/XOFF) 或 Hardware (RTS/CTS)

3. **建立连接**
   - 点击"Connect"（连接）按钮
   - 在状态栏中观察连接状态

4. **发送数据**
   - 在发送面板中输入文本或十六进制值
   - 如需要可自动添加校验和
   - 点击"Send"（发送）按钮
   - 使用快速命令快速发送常用数据

5. **监控通讯**
   - 查看带有时间戳和方向指示器的实时日志
   - 日志支持文本或十六进制格式显示
   - 特殊字符会清晰显示

6. **保存和导出**
   - 启用记录自动记录所有通讯
   - 将日志导出为 TXT 格式，包含完整元数据
   - 在设置中自定义日志目录和最大条目数

## 📋 使用指南

### 面板详情

**左侧边栏：**
- 端口选择器 - 选择和检测串行端口
- 配置面板 - 设置串行参数（波特率、奇偶校验等）

**中央区域：**
- 日志查看器 - 显示接收和发送的数据，包含时间戳
- 发送面板/快速命令 - 使用高级选项组合和传输数据/保存和执行命令列表

**顶部栏：**
- 设置按钮以访问配置

**状态栏：**
- 连接状态和当前端口
- 连接持续时间计时器

### 高级功能指南

#### 📍 帧分段

配置传入数据如何分割成消息：

1. 打开**设置** → **高级设置** → **帧分段**
2. 选择分段模式：
   - **超时**：在空闲期后结束消息（10-1000ms）
   - **分隔符**：在特定字节序列处结束消息：
     - AnyNewline：CR、LF 或 CRLF
     - CR/LF/CRLF：特定行末尾
     - Custom：用户定义的分隔符
   - **组合**：同时使用超时和分隔符检测

#### ✅ 校验和计算

自动向传出数据附加校验和：

1. 在**发送面板**中选择校验算法：
   - **XOR**：所有字节的按位异或
   - **ADD8**：所有字节之和（8 位）
   - **CRC8/CRC16/CCITT-CRC16**：循环冗余校验变体
2. 配置：
   - **Start Index**（开始索引）：计算的起始字节
   - **End Index**（结束索引）：结束字节（负值从末尾计数）
3. 启用"Auto Append"（自动附加）为每条消息添加校验和

#### 🎯 快速命令

创建命令列表以快速执行：

1. 在**快速命令**面板中，点击"+ New List"（新建列表）
2. 添加命令，选项包括：
   - **Command Content**（命令内容）：文本或十六进制数据
   - **Format**（格式）：文本或十六进制
   - **Line Ending**（行末尾）：None、\r、\n 或 \r\n
3. 执行：
   - 单条：点击命令
   - 批量：选择多条命令，点击"Send Selected"（发送选中）

#### 🌍 国际化

- 打开**设置** → **区域设置** → **语言**
- 选择：English（英文）或 简体中文
- 配置时区以确保时间戳准确性

#### 📊 数据记录

- 在**设置** → **常规设置**中配置日志目录
- 自动记录创建两个文件：
  - `*.txt`：带有时间戳和方向的格式化日志
  - `*.bin`：原始二进制数据
- 最大日志条目数：可配置以防止内存溢出

#### 🎨 显示选项

- **主题**：亮色/深色
- **文本编码**：UTF-8 或 GBK 用于特殊字符
- **特殊字符**：可视化 CR、LF、TAB、ESC 等
  - 可在设置中按字符类型切换
- **日志格式**：选择文本或十六进制显示

## 🔧 开发

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **后端** | Rust | 1.70+ |
| **框架** | Tauri | 2.0 |
| **前端** | React | 18.2 |
| **语言** | TypeScript | 5.0+ |
| **样式** | Tailwind CSS | 3.3 |
| **构建工具** | Vite | 4.4+ |
| **串行 I/O** | serialport-rs | 4.4 |
| **图标** | Lucide React | 0.263+ |
| **异步运行时** | Tokio | 1.0 |
| **序列化** | Serde | 1.0 |

### 关键依赖

**Rust 后端** (`src-tauri/Cargo.toml`)：
- `tauri` - 跨平台框架
- `serialport` - 串行端口通讯
- `tokio` - 具有完整功能的异步运行时
- `serde` - 序列化/反序列化
- `chrono` - 时间戳处理
- `uuid` - 唯一标识符生成
- `encoding_rs` - 字符编码支持
- `rusqlite` - 轻量级数据库（捆绑）

**React 前端** (`frontend/package.json`)：
- `@tauri-apps/api` - Tauri IPC 通讯
- `@tauri-apps/plugin-dialog` - 文件对话框
- `@tauri-apps/plugin-shell` - Shell 命令
- `lucide-react` - 现代图标库
- `react` & `react-dom` - UI 框架

### 构建和开发命令

```bash
# 开发服务器（需要两个终端）
cd frontend && npm run dev          # 终端 1：前端开发服务器
cargo tauri dev                     # 终端 2：Tauri 热重载

# 生产构建
cargo tauri build                   # 创建安装程序二进制文件

# 仅前端
cd frontend
npm run build                       # Vite 生产构建

```

## ❤️ 贡献

欢迎贡献！帮助我们改进项目：

### 开发入门

1. **Fork** GitHub 上的仓库
2. **克隆**你的 fork 到本地：
   ```bash
   git clone https://github.com/YOUR_USERNAME/RSerialDebugAssistant.git
   cd RSerialDebugAssistant
   ```
3. **创建**特性分支：
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **做出**更改并充分测试
5. **提交**清晰的消息：
   ```bash
   git commit -m "feat: 添加功能描述"
   git commit -m "fix: 修复问题描述"
   ```
6. **推送**到 fork 并**打开 Pull Request**

### 开发指南

**Rust 后端：**
- 遵循 [Rust API 指南](https://rust-lang.github.io/api-guidelines/)
- 提交前使用 `cargo fmt` 和 `cargo clippy`
- 为新功能编写测试
- 使用文档注释记录公共 API

**React 前端：**
- 遵循 TypeScript 最佳实践
- 使用函数式组件和 hooks
- 保持组件专注且可重用
- 添加适当的类型注释（无 `any` 类型）
- 为不同主题和语言测试组件

**常规：**
- 编写清晰、描述性的提交消息
- 为新功能更新文档
- 如可能的话在多个平台上测试（Windows、macOS、Linux）
- 遵循现有代码风格和约定

### 贡献领域

- 🐛 **Bug 修复** - 报告和修复问题
- ✨ **新功能** - 建议增强
- 📝 **文档** - 改进指南和 API 文档
- 🌍 **翻译** - 添加新语言支持
- 🧪 **测试** - 改进测试覆盖率
- 📱 **平台支持** - 扩展操作系统兼容性

### 报告问题

发现 bug 或有功能请求？请 [打开 issue](https://github.com/Gyanano/RSerialDebugAssistant/issues)，包含：

**对于 Bug：**
- 清晰、简洁的标题
- 详细的问题描述
- 复现步骤
- 预期行为与实际行为
- 你的平台（Windows/macOS/Linux）和版本
- 应用程序版本
- 截图或日志（如适用）

**对于功能请求：**
- 清晰的所需功能描述
- 用途和好处
- 任何相关的示例或参考

## 📄 许可证

本项目采用 **MIT 许可证** - 详见 [LICENSE](LICENSE) 文件。

MIT 许可证允许你在适当署名的情况下自由使用、修改和分发本软件。

## 🙏 致谢

本项目站在以下开源项目的肩膀上：

- **[Tauri](https://tauri.app/)** - 使安全、轻量级的桌面应用成为可能的框架
- **[React](https://reactjs.org/)** - 具有优秀开发体验的现代 UI 库
- **[Rust](https://www.rust-lang.org/)** - 提供安全性和性能的系统编程语言
- **[serialport-rs](https://gitlab.com/susurrus/serialport-rs)** - 可靠的跨平台串行端口访问
- **[Tokio](https://tokio.rs/)** - 高效并发操作的异步运行时
- **[Serde](https://serde.rs/)** - 强大的序列化框架
- **[Tailwind CSS](https://tailwindcss.com/)** - 用于快速 UI 开发的工具优先 CSS 框架
- **[Lucide React](https://lucide.dev/)** - 美观、一致的图标库
- **[Vite](https://vitejs.dev/)** - 下一代构建工具，速度飞快

## 星标历史

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=Gyanano/RSerialDebugAssistant&type=Date)](https://star-history.com/#Gyanano/RSerialDebugAssistant&Date)

</div>

## 支持本项目

⭐ **如果你觉得本项目有帮助，请考虑在 GitHub 上给个 Star！**

<details>
<summary><b>版本历史</b></summary>

- **v1.2.1** - 添加检查更新功能，增强的日志查看器具有搜索和行号，以及改进的显示格式。
- **v1.2.0** - 添加帧分段和高级功能、国际化和时区支持。
- **v1.1.0** - 添加定期发送功能和快速命令发送功能。实现亮色/深色主题 UI。
- **v1.0.0** - 初始版本，包含核心串行调试功能。

</details>

