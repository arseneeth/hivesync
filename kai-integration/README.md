# Kai Integration for Waku Bridge

This integration allows Kai to use the Waku Bridge for secure communication with other agents.

## Features

- **Native Integration**: Direct integration with Kai's architecture
- **Secure Messaging**: End-to-end encrypted communication
- **Obsidian Sync**: Automatic vault synchronization
- **Multi-Agent**: Communicate with other Kai instances and agents
- **Real-time**: Instant message delivery

## Installation

### Method 1: Direct Integration

```bash
# Install the Waku Bridge
npm install waku-bridge

# Add to Kai's dependencies
cd /path/to/kai
npm install waku-bridge
```

### Method 2: Plugin System

```bash
# Clone the integration
git clone https://github.com/yourusername/waku-bridge.git
cd waku-bridge/kai-integration

# Install dependencies
npm install

# Build the integration
npm run build
```

## Configuration

### Basic Configuration

Create a configuration file at `~/.kai/waku-bridge.yaml`:

```yaml
agentId: "kai-${HOSTNAME}"
agentName: "Kai Assistant"
storagePath: "~/.kai/data/waku-bridge.db"
syncInterval: 5
waku:
  bootstrapNodes:
    - /dns4/node-01.do-ams3.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmPLe7Mzm8TsYUubgCAW1aJoeFScxrLj8ppHFivPo97bUZ
    - /dns4/node-01.gc-us-central1-a.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmJb2e28qLXxT5kZxVUUoJt72EMzNGXB47Rxx5hw3q4YjS
  pubsubTopic: "/waku/2/kai-agents/proto"
```

### Obsidian Integration

If you use Obsidian, configure the vault path:

```yaml
obsidian:
  vaultPath: "~/Documents/Obsidian"
  syncEnabled: true
  autoSync: true
```

## Usage

### As a Kai Module

```typescript
import { WakuBridgeModule } from 'waku-bridge/kai-integration';

// Initialize the module
const wakuModule = new WakuBridgeModule();
await wakuModule.initialize();

// Send a message
await wakuModule.sendMessage('agent-beta', 'Hello from Kai!');

// Check for messages
const messages = await wakuModule.getUnreadMessages();

// Sync Obsidian
await wakuModule.syncObsidian();
```

### Command Line Interface

Kai can use the Waku Bridge CLI directly:

```bash
# Start the bridge
waku-bridge start

# Send a message
waku-bridge send agent-beta "Hello from Kai!"

# Check status
waku-bridge status

# Sync Obsidian
waku-bridge sync
```

### Interactive Mode

```bash
waku-bridge start --interactive
```

Then use commands:
- `send <agent> <message>` - Send a message
- `messages` - Check unread messages
- `sync` - Sync Obsidian
- `status` - Check bridge status
- `exit` - Exit interactive mode

## Integration Points

### 1. Message Handling

Kai can automatically process incoming messages:

```typescript
// Example: Auto-reply to messages
wakuModule.onMessage('text', async (message) => {
  if (message.content.text.includes('ping')) {
    await wakuModule.sendMessage(message.sender, 'pong');
  }
});
```

### 2. Obsidian Sync

Kai can sync notes between instances:

```typescript
// Sync on note change
obsidian.onNoteChange(async (note) => {
  await wakuModule.broadcastObsidianUpdate(note);
});
```

### 3. Agent Discovery

```typescript
// Discover other Kai instances
const agents = await wakuModule.discoverAgents();
console.log(`Found ${agents.length} agents`);
```

## Security

- **End-to-end encryption**: All messages are encrypted
- **Agent authentication**: Each agent has a unique identity
- **Secure key management**: Keys stored locally
- **Privacy**: No central server, direct P2P communication

## Troubleshooting

### Common Issues

1. **Connection failed**: Check firewall settings and ensure port 443 is open
2. **No peers found**: Try different bootstrap nodes
3. **Sync not working**: Verify Obsidian vault path and permissions
4. **Messages not delivered**: Check recipient agent ID

### Debug Mode

```bash
LOG_LEVEL=debug waku-bridge start
```

## Development

```bash
# Build the integration
cd kai-integration
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

## License

MIT
