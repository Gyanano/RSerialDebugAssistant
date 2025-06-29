# 🚀 Serial Debug Assistant

A modern, cross-platform serial debugging tool built with **Tauri** (Rust backend) and **React** (beautiful frontend GUI). A serial communication application with a modern user interface.

![](./assets/RSerialDebugAssistant.png)

## ✨ Features

### 🎨 **Beautiful Modern GUI**

- Dark theme with professional design
- Real-time communication logging
- Responsive layout with resizable panels
- Intuitive controls and status indicators

### 🔌 **Professional Serial Communication**

- **Smart Port Detection** - Only shows ports that actually exist
- **Full Configuration** - Baud rate, data bits, parity, stop bits, flow control(preview)
- **Dual Data Formats** - Send/receive as Text or Hexadecimal
- **Real-time Logging** - Live communication with timestamps and direction indicators
- **Data Export** - Save logs in TXT

### ⚡ **Advanced Features**

- **Connection Statistics** - Track bytes sent/received and connection time
- **Keyboard Shortcuts** - Ctrl+Enter to send, and more
- **Professional UI** - Like Arduino IDE, PuTTY, but modern and beautiful

## 🎯 Quick Start

### Prerequisites

- **Rust** - Install from [rustup.rs](https://rustup.rs/)
- **Node.js** - Install from [nodejs.org](https://nodejs.org/)
- **Git** - For cloning the repository

### 1. Clone and Setup

```bash
git clone https://github.com/Gyanano/RSerialDebugAssistant.git
cd RSerialDebugAssistant

# Install frontend dependencies
cd frontend
npm install
```

### 2. Development Mode

```bash
# Start the development server (with hot reload)
npm run dev

# In another terminal and navigate to the project's root directory
# Start Tauri dev mode
cargo tauri dev
```

### 3. Build for Production

```bash
# If you have not built frontend project, enter the /frontend and run the command below
# npm run build
# cd ..

# Build the complete application
cargo tauri build
```

The built application will be in `src-tauri/target/release/bundle/`

## 🎮 How to Use

### Basic Workflow

1. **Select Port** - Choose from available serial ports
2. **Configure** - Set baud rate, data bits, parity, etc.
3. **Connect** - Click connect to establish communication
4. **Send Data** - Use text or hex format to send data
5. **Monitor** - Watch real-time communication in the log viewer
6. **Export** - Save your communication logs for analysis

### Interface Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Serial Debug Assistant                                      │
├───────────────┬─────────────────────────────────────────────┤
│ Port Selector │                                             │
│               │         Log Viewer                          │
│ Configuration │     (Real-time Communication)               │
│   Panel       │                                             │
│               │                                             │
|               |─────────────────────────────────────────────┤
│               │            Send Panel                       │
│               │        [Text/Hex Input]                     │
├───────────────┴─────────────────────────────────────────────┤
│                    Status Bar                               │
└─────────────────────────────────────────────────────────────┘
```

### Example: Testing an Arduino

1. Connect Arduino to USB
2. Select the COM port (e.g., COM3)
3. Set baud rate to 115200
4. Click "Connect"
5. Send "Hello RSerial!😎" in text mode
6. Watch the response in the log viewer
7. Export logs for documentation

## 🛠️ Technical Details

### Architecture

- **Backend**: Rust with Tauri framework
  
  - Real serial port communication via `serialport` crate
  - Async/await with Tokio runtime
  - Type-safe API with Serde serialization

- **Frontend**: React with TypeScript
  
  - Modern React 18 with hooks
  - Tailwind CSS for beautiful styling
  - Lucide React icons for consistency
  - Vite for fast development and building

### Project Structure

```
📦 RSerialDebugAssistant/
├── 📁 src-tauri/                 # Rust backend
│   ├── 📁 src/
│   │   ├── 📄 main.rs            # Tauri app entry point
│   │   ├── 📄 serial_manager.rs  # Serial communication logic
│   │   └── 📄 types.rs           # Shared type definitions
│   ├── 📄 Cargo.toml             # Rust dependencies
│   ├── 📄 tauri.conf.json        # Tauri configuration
│   └── 📁 icons/                 # App icons
│
├── 📁 frontend/                  # React frontend
│   ├── 📁 src/
│   │   ├── 📁 components/        # React components
│   │   ├── 📄 App.tsx            # Main app component
│   │   ├── 📄 main.tsx           # The main scripts
│   │   ├── 📄 types.ts           # TypeScript types
│   │   └── 📄 styles.css         # Tailwind CSS
│   ├── 📄 package.json           # Node.js dependencies
│   ├── 📄 vite.config.ts         # Vite configuration
│   └── 📄 tailwind.config.js     # Tailwind configuration
│
├── 📄 README.md                  # This file
└── 📄 LICENSE                    # MIT license
```

## 🎨 Screenshots

### Main Interface

![](./assets/MainInterface.png)

### Port Selection

![](./assets/PortSelection.png)

### Real-time Communication

![](./assets/LogView.png)

### Configuration Panel

![](./assets/ConfigPanel.png)

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Amazing framework for desktop apps
- [React](https://reactjs.org/) - Powerful UI library
- [Rust](https://www.rust-lang.org/) - Systems programming language
- [serialport-rs](https://gitlab.com/susurrus/serialport-rs) - Rust serial port library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Lucide React](https://lucide.dev/) - Beautiful icon library

---