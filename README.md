# RSerial Debug Assistant

<div align="center">

<img src="./assets/RSerialDebugAssistant.png" width="30%" alt="RSerial Debug Assistant Logo">

**A professional-grade, cross-platform serial debugging tool built with Tauri 2.0 + React 18**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/tauri-2.0-purple.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/react-18.2-61dafb.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)

[✨ Features](#-features) | [📦 Installation](#-installation) | [🚀 Quick Start](#-quick-start) | [📋 Usage Guide](#-usage-guide) | [🔧 Development](#-development) | [❤️ Contributing](#%EF%B8%8F-contributing)

**[English](./README.md) | [简体中文](./README.zh-CN.md)**

</div>

---

## 📖 About

**RSerial Debug Assistant** is a professional-grade serial communication debugging tool designed for embedded systems engineers, IoT developers, and hardware enthusiasts. Combining the power of **Rust** with the elegance of modern **React** UI, it provides a seamless cross-platform experience for Windows, macOS, and Linux.

Whether you're debugging Arduino projects, communicating with industrial sensors, testing embedded devices, or monitoring serial protocols, this tool delivers professional features with an intuitive interface.

## ✨ Features

### 🎨 User Interface
- **Light/Dark Theme** - Automatic and manual theme switching with modern-style design
- **Modern UI Components** - Built with shadcn UI for consistent, elegant styling
- **Responsive Layout** - Resizable panels with persistent layout preferences
- **Real-time Logging** - Live communication display with precise timestamps and direction indicators
- **Log Search & Navigation** - Search through logs with keyboard shortcuts (Ctrl+F), match highlighting, and navigation
- **Line Numbers** - Optional line number display for easier log reference
- **Smart Auto-scroll** - Intelligent scroll control that pauses on user interaction and resumes at bottom
- **Toast Notifications** - Non-intrusive toast messages for status updates and errors
- **Multi-language Support** - English and Chinese (Simplified) interface
- **Special Character Visualization** - Visual representation of control characters (CR, LF, ESC, etc.)
- **Intuitive Controls** - Professional UI inspired by modern development tools

### 🔬 Serial Communication
- **Smart Port Detection** - Auto-detection of available serial ports with device information
- **Full Configuration** - Baud rate, data bits, parity, stop bits, flow control options
- **Dual Data Formats** - Send and receive as Text (UTF-8/GBK) or Hexadecimal
- **Connection Statistics** - Real-time tracking of bytes sent/received and connection duration
- **Multiple Text Encodings** - Support for UTF-8 and GBK character encoding

### 🚀 Advanced Features
- **Auto-Update** - In-app update checker with GitHub Release integration
  - Check for new versions with download progress display
  - One-click install for seamless upgrades
- **Quick Commands** - Create command lists with batch execution capability
  - Custom command names for easy identification
  - Support for custom line endings (None, \r, \n, \r\n)
  - Hex format support for binary commands
  - Hex/Text format conversion toggle
- **Automatic Checksum** - Built-in support for multiple checksum algorithms:
  - XOR, ADD8, CRC8, CRC16, CCITT-CRC16
  - Configurable start/end positions for checksum calculation
- **Frame Segmentation** - Intelligent data framing for reliable communication:
  - Timeout-based: Emit frames after idle period
  - Delimiter-based: Split on line endings (CR, LF, CRLF, AnyNewline) or custom delimiters
  - Combined mode: Use both timeout and delimiter detection
- **Data Recording** - Automatic logging with timestamp and direction tracking
- **Data Export** - Save communication logs in TXT format with full metadata
- **Configurable Settings** - Customize log directory, max log entries, timezone, and more

## 📦 Installation

### Download Pre-built Binaries

Download the latest release from the project repository:

| Platform | Format | Notes |
|----------|--------|-------|
| Windows  | `.msi` or `.exe` | Recommended installer format |

> **Note:** Pre-built binaries may need to be built locally. Check the repository for the latest release builds.

### Build from Source

#### Prerequisites

- **Rust** 1.70+ - [Install from rustup.rs](https://rustup.rs/)
- **Node.js** 18+ - [Install from nodejs.org](https://nodejs.org/)
- **Git** - For cloning the repository

#### Build Steps

```bash
# Clone the repository
git clone https://github.com/Gyanano/RSerialDebugAssistant.git
cd RSerialDebugAssistant

# Install frontend dependencies
cd frontend
npm install
cd ..

# Build the application (creates installers in src-tauri/target/release/bundle/)
cargo tauri build
```

The compiled application binaries will be located in:
- **Windows**: `src-tauri/target/release/bundle/msi/`

## 🚀 Quick Start

### Development Mode

Set up two terminal windows:

```bash
# Terminal 1: Start frontend development server
cd frontend
npm run dev
```

```bash
# Terminal 2: Start Tauri development mode (from project root)
cargo tauri dev
```

The development app will launch automatically with hot-reload enabled.

### Basic Usage Workflow

1. **Select Serial Port** 
   - Click the port dropdown in the left panel
   - Choose your target serial device
   - Device details (VID, PID, manufacturer) display automatically

2. **Configure Connection Parameters**
   - Set **Baud Rate**: 9600, 115200, etc.
   - Configure **Data Bits**: 5, 6, 7, or 8
   - Select **Parity**: None, Odd, Even, Mark, or Space
   - Choose **Stop Bits**: 1, 1.5, or 2
   - Set **Flow Control**: None, Software (XON/XOFF), or Hardware (RTS/CTS)

3. **Establish Connection**
   - Click the "Connect" button
   - Observe connection status in the status bar

4. **Send Data**
   - Enter text or hex values in the send panel
   - Add checksum automatically if needed
   - Click "Send" button
   - Use Quick Commands for frequently sent data

5. **Monitor Communication**
   - View live logs with timestamps and direction indicators
   - Logs display in text or hexadecimal format
   - Special characters are visualized for clarity

6. **Save and Export**
   - Enable recording to automatically log all communication
   - Export logs in TXT format with full metadata
   - Customize log directory and maximum entries in Settings

## 📋 Usage Guide

### Panel Details

**Left Sidebar:**
- Port Selector - Choose and detect serial ports
- Configuration - Set serial parameters (baud rate, parity, etc.)

**Central Area:**
- Log Viewer - Display received and sent data with timestamps
- Send Panel/Quick Commands - Compose and transmit data with advanced options/Save and execute command lists

**Top Bar:**
- Settings button to access configuration

**Status Bar:**
- Connection status and current port
- Connection duration timer

### Advanced Features Guide

#### 📍 Frame Segmentation

Configure how incoming data is split into messages:

1. Open **Settings** → **Advanced Settings** → **Frame Segmentation**
2. Choose segmentation mode:
   - **Timeout**: Messages end after idle period (10-1000ms)
   - **Delimiter**: Messages end on specific byte sequence:
     - AnyNewline: CR, LF, or CRLF
     - CR/LF/CRLF: Specific line ending
     - Custom: User-defined delimiter
   - **Combined**: Both timeout and delimiter detection

#### ✅ Checksum Calculation

Automatically append checksums to outgoing data:

1. In **Send Panel** and select algorithm:
   - **XOR**: Bitwise XOR of all bytes
   - **ADD8**: Sum of all bytes (8-bit)
   - **CRC8/CRC16/CCITT-CRC16**: Cyclic redundancy check variants
2. Configure:
   - **Start Index**: Beginning byte for calculation
   - **End Index**: Ending byte (negative values count from end)
3. Enable "Auto Append" to add checksum to every message

#### 🎯 Quick Commands

Create command lists for rapid execution:

1. In **Quick Commands** panel, click "+ New List"
2. Add commands with options:
   - **Command Content**: Text or hex data
   - **Format**: Text or Hex
   - **Line Ending**: None, \r, \n, or \r\n
3. Execute:
   - Single: Click the command
   - Batch: Select multiple commands, click "Send Selected"

#### 🌍 Internationalization

- Open **Settings** → **Regional Settings** → **Language**
- Choose: English or 简体中文 (Simplified Chinese)
- Timezone configuration for timestamp accuracy

#### 📊 Data Recording

- Configure log directory in **Settings** → **General Settings**
- Automatic recording creates two files:
  - `*.txt`: Formatted logs with timestamps and direction
  - `*.bin`: Raw binary data
- Maximum log entries: Configurable to prevent memory overflow

#### 🎨 Display Options

- **Theme**: Light/Dark
- **Text Encoding**: UTF-8 or GBK for special characters
- **Special Characters**: Visualize CR, LF, TAB, ESC, etc.
  - Can be toggled per character type in Settings
- **Log Format**: Choose text or hexadecimal display

## 🔧 Development

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|----------|
| **Backend** | Rust | 1.70+ |
| **Framework** | Tauri | 2.0 |
| **Frontend** | React | 18.2 |
| **Language** | TypeScript | 5.0+ |
| **Styling** | Tailwind CSS | 3.3 |
| **Build Tool** | Vite | 4.4+ |
| **Serial I/O** | serialport-rs | 4.4 |
| **Icons** | Lucide React | 0.263+ |
| **Async Runtime** | Tokio | 1.0 |
| **Serialization** | Serde | 1.0 |

### Key Dependencies

**Rust Backend** (`src-tauri/Cargo.toml`):
- `tauri` - Cross-platform framework
- `serialport` - Serial port communication
- `tokio` - Async runtime with full features
- `serde` - Serialization/deserialization
- `chrono` - Timestamp handling
- `uuid` - Unique identifier generation
- `encoding_rs` - Character encoding support
- `rusqlite` - Lightweight database (bundled)

**React Frontend** (`frontend/package.json`):
- `@tauri-apps/api` - Tauri IPC communication
- `@tauri-apps/plugin-dialog` - File dialogs
- `@tauri-apps/plugin-shell` - Shell commands
- `lucide-react` - Modern icon library
- `react` & `react-dom` - UI framework

### Building and Development Commands

```bash
# Development server (requires two terminals)
cd frontend && npm run dev          # Terminal 1: Frontend dev server
cargo run tauri dev                     # Terminal 2: Tauri with live reload

# Production build
cargo tauri build                   # Creates installer binaries

# Frontend only
cd frontend
npm run build                       # Vite production build

```

## 🗺️ Roadmap

We are actively working on new features to make RSerial Debug Assistant even more powerful:

### 📦 Data Parsing & Packaging (Planned)
- **Protocol Parser** - Define custom data frame structures with header, payload, and checksum
- **Protocol Templates** - Built-in support for common protocols (Modbus RTU/ASCII, custom frames)
- **Data Field Extraction** - Parse received data into named fields for analysis
- **Auto-Response** - Configure automatic replies based on received data patterns

### 📊 Real-time Data Visualization (Planned)
- **Waveform Plotter** - Real-time plotting of parsed numeric values
- **Multi-channel Display** - Monitor multiple data fields simultaneously
- **Data Recording & Playback** - Record sessions and replay for analysis
- **Export Charts** - Save plots as images or CSV data

### 🔧 Advanced Tools (Planned)
- **Data Triggers & Alerts** - Set up notifications based on data patterns or thresholds
- **Virtual Serial Port** - Create virtual COM port pairs for testing

> Have a feature request? [Open an issue](https://github.com/Gyanano/RSerialDebugAssistant/issues) to let us know!

## ❤️ Contributing

Contributions are welcome! Help us improve the project:

### Getting Started with Development

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/RSerialDebugAssistant.git
   cd RSerialDebugAssistant
   ```
3. **Create** a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make** your changes and test thoroughly
5. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add feature description"
   git commit -m "fix: resolve issue description"
   ```
6. **Push** to your fork and **open a Pull Request**

### Development Guidelines

**Rust Backend:**
- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Use `cargo fmt` and `cargo clippy` before committing
- Write tests for new functionality
- Document public APIs with doc comments

**React Frontend:**
- Follow TypeScript best practices
- Use functional components with hooks
- Keep components focused and reusable
- Add proper type annotations (no `any` types)
- Test components for different themes and languages

**General:**
- Write clear, descriptive commit messages
- Update documentation for new features
- Test on multiple platforms (Windows, macOS, Linux) if possible
- Follow existing code style and conventions

### Areas for Contribution

- 🐛 **Bug Fixes** - Report and fix issues
- ✨ **New Features** - Suggest enhancements
- 📝 **Documentation** - Improve guides and API docs
- 🌍 **Translations** - Add new language support
- 🧪 **Testing** - Improve test coverage
- 📱 **Platform Support** - Extend OS compatibility

### Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/Gyanano/RSerialDebugAssistant/issues) with:

**For Bugs:**
- Clear, concise title
- Detailed description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Your platform (Windows/macOS/Linux) and version
- Application version
- Screenshots or logs if applicable

**For Feature Requests:**
- Clear description of desired functionality
- Use cases and benefits
- Any relevant examples or references

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

MIT License grants you freedom to use, modify, and distribute this software with proper attribution.

## 🙏 Acknowledgments

This project stands on the shoulders of amazing open-source projects:

- **[Tauri](https://tauri.app/)** - The framework making secure, lightweight desktop apps possible
- **[React](https://reactjs.org/)** - Modern UI library with excellent developer experience
- **[Rust](https://www.rust-lang.org/)** - Systems language providing safety and performance
- **[serialport-rs](https://gitlab.com/susurrus/serialport-rs)** - Reliable cross-platform serial port access
- **[Tokio](https://tokio.rs/)** - Asynchronous runtime for efficient concurrent operations
- **[Serde](https://serde.rs/)** - Robust serialization framework
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS for rapid UI development
- **[Lucide React](https://lucide.dev/)** - Beautiful, consistent icon library
- **[Vite](https://vitejs.dev/)** - Next-generation build tool with blazing speed

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=Gyanano/RSerialDebugAssistant&type=Date)](https://star-history.com/#Gyanano/RSerialDebugAssistant&Date)

</div>

## Support the Project

⭐ **If you find this project helpful, please consider giving it a star on GitHub!**

<details>
<summary><b>Version History</b></summary>

- **v1.3.0** - Auto-update feature, enhanced log viewer with search/line numbers, quick command improvements, modern UI components (shadcn).
- **v1.2.0** - Frame segmentation, internationalization, timezone support, and advanced configuration options.
- **v1.1.0** - Periodic sending, quick command lists, light/dark theme UI.
- **v1.0.0** - Initial release with core serial debugging functionality.

</details>

