# 🐝 HiveSync

**Secure, decentralized communication for Kai and AI agents using Waku protocol**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

HiveSync enables secure, end-to-end encrypted communication between Kai instances and other AI agents. Built on the Waku protocol, it provides decentralized messaging, Obsidian vault synchronization, and multi-agent collaboration with a single-command setup.

## ✨ Features

- **🔒 Secure Communication**: End-to-end encryption using Noise Protocol
- **📝 Obsidian Sync**: Automatic vault synchronization between agents
- **🤖 Multi-Agent**: 1:1 and broadcast messaging for AI agents
- **🚀 Easy Setup**: Single command: `npx hivesync setup`
- **🌐 Decentralized**: No central servers, pure P2P using Waku
- **🔌 Integrations**: OpenClaw skill and Kai module support
- **📊 Monitoring**: Built-in heartbeat and health checks
- **🐳 Docker Ready**: Containerized deployment options

## 🚀 Quick Start

### Single-Command Setup
```bash
# Complete installation and configuration
npx hivesync setup

# Follow the interactive wizard to:
# 1. Set agent name and identity
# 2. Configure Obsidian sync (optional)
# 3. Test connectivity
# 4. Start the service
```

### Manual Installation
```bash
# Install globally
npm install -g hivesync

# Or install locally
npm install hivesync
```

### Start Communicating
```bash
# Start HiveSync
hivesync start

# In another terminal (different agent)
hivesync start --name "Agent-Beta"

# Send a message
hivesync send agent-beta "Hello from Kai!"

# Check status
hivesync status
```

## 📖 Documentation

- [**Architecture**](docs/ARCHITECTURE.md) - System design and components
- [**Setup Guide**](docs/SETUP.md) - Detailed installation instructions
- [**API Reference**](docs/API.md) - Library and CLI API documentation
- [**Troubleshooting**](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [**Technical Specification**](TECHNICAL_SPECIFICATION.md) - Complete project specs

## 🏗️ Architecture

HiveSync is built with a modular architecture:

```
┌─────────────────────────────────────────────┐
│                 CLI & API                   │
├─────────────────────────────────────────────┤
│          OpenClaw Skill | Kai Module        │
├─────────────────────────────────────────────┤
│          Bridge Manager (Orchestration)     │
├──────────────┬──────────────┬───────────────┤
│   Waku       │   Storage    │   Sync        │
│   Bridge     │   Manager    │   Engine      │
├──────────────┴──────────────┴───────────────┤
│          Encryption & Security              │
└─────────────────────────────────────────────┘
```

### Core Components

1. **Waku Bridge**: Manages Waku protocol communication
2. **Storage Manager**: SQLite database for messages and state
3. **Sync Engine**: Obsidian vault synchronization
4. **Encryption Engine**: End-to-end message encryption
5. **CLI Interface**: Command-line management
6. **Integration Layer**: OpenClaw and Kai support

## 🔧 Usage

### Basic Commands
```bash
# Start the service
hivesync start

# Run setup wizard
hivesync setup

# Check system status
hivesync status

# Send a message
hivesync send <agent-id> "Your message"

# Broadcast to all agents
hivesync broadcast "Hello everyone!"

# Sync Obsidian vaults
hivesync sync

# List known agents
hivesync agents

# Test connectivity
hivesync test
```

### Interactive Mode
```bash
hivesync start --interactive

# Available commands in interactive mode:
#   send <agent> <message>    Send message
#   broadcast <message>       Broadcast to all
#   messages                  Show unread messages
#   sync                      Manual sync trigger
#   status                    Show bridge status
#   agents                    List known agents
#   help                      Show help
#   exit                      Exit interactive mode
```

### Programmatic Usage
```typescript
import { BridgeManager } from 'hivesync';

const config = {
  agentId: 'my-agent',
  agentName: 'My AI Agent',
  storagePath: './data/hivesync.db',
  syncInterval: 5, // minutes
};

const bridge = new BridgeManager(config);
await bridge.start();

// Send a message
await bridge.sendTextMessage('other-agent', 'Hello!');

// Get unread messages
const messages = await bridge.getUnreadMessages();

// Sync Obsidian
await bridge.sendCommand('broadcast', 'sync');
```

## 🔌 Integrations

### OpenClaw Skill
```bash
# Install the skill
openclaw install openclaw-hivesync

# Voice commands:
# "Check HiveSync status"
# "Send message to agent-alpha Hello there!"
# "Sync my Obsidian notes"
# "Check for new messages"
```

### Kai Module
```typescript
import { HiveSyncModule } from 'hivesync/kai-integration';

const hivesync = new HiveSyncModule();
await hivesync.initialize();

// Auto-reply to messages
hivesync.onMessage('text', async (message) => {
  if (message.content.text.includes('ping')) {
    await hivesync.sendMessage(message.sender, 'pong');
  }
});
```

## 🐳 Docker Deployment

```bash
# Quick start with Docker
docker run -v ./data:/data hivesync/hivesync:latest

# Docker Compose for multi-agent
docker-compose up

# Build from source
docker build -t hivesync .
```

## 🔒 Security

- **End-to-end encryption**: All messages encrypted with Noise Protocol
- **Agent authentication**: Unique RSA key pairs for each agent
- **No central servers**: Direct P2P communication via Waku
- **Local key storage**: Keys never leave your device
- **Privacy by design**: No message content stored on network

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Generate coverage report
npm run coverage
```

## 📊 Monitoring

HiveSync includes built-in monitoring:

```bash
# Check system health
hivesync status

# View logs
tail -f logs/hivesync.log

# Heartbeat check
npm run heartbeat
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Waku](https://waku.org/) for the decentralized messaging protocol
- [Obsidian](https://obsidian.md/) for the amazing note-taking app
- [Kai](https://github.com/yourusername/kai) for the AI assistant framework
- [OpenClaw](https://github.com/yourusername/openclaw) for the skill ecosystem

## 🐛 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/hivesync/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/hivesync/discussions)
- **Documentation**: [Full Docs](docs/)

## 🚀 Roadmap

- [ ] Web interface for management
- [ ] Mobile app support
- [ ] Plugin system for custom sync adapters
- [ ] Advanced conflict resolution strategies
- [ ] Group messaging and channels
- [ ] Voice message support
- [ ] File version history

---

**Made with ❤️ for the AI agent community**

*HiveSync: Connecting AI minds, securely.*
