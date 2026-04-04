# OpenClaw Waku Bridge Skill

This skill enables OpenClaw to communicate with other agents using the Waku Bridge.

## Features

- **Secure Communication**: End-to-end encrypted messaging between agents
- **Obsidian Sync**: Automatic synchronization of Obsidian vaults
- **Multi-Agent**: Communicate with multiple agents simultaneously
- **Real-time**: Instant message delivery over Waku network

## Installation

```bash
# Install the skill
openclaw install openclaw-waku-bridge

# Or install from local development
cd /path/to/waku-bridge/openclaw-skill
npm install
npm run build
```

## Configuration

1. Run the setup wizard:
```bash
waku-bridge setup
```

2. Update OpenClaw configuration to include the skill:
```yaml
skills:
  - name: waku-bridge
    enabled: true
    config:
      agentId: "your-agent-id"
      storagePath: "/path/to/storage.db"
```

## Usage Examples

### Voice/Text Commands

- "Check Waku bridge status"
- "Send message to agent-alpha Hello there!"
- "Sync my Obsidian notes"
- "Check for new messages"
- "List connected agents"

### API Usage

```typescript
import { createSkill } from 'openclaw-waku-bridge';

const skill = createSkill();
await skill.initialize();

// The skill will automatically handle commands via OpenClaw
```

## Integration with Waku Bridge

This skill uses the main Waku Bridge library to provide:
- Message routing and delivery
- Obsidian vault synchronization
- Agent discovery and management
- Secure encryption

## Development

```bash
# Build the skill
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## License

MIT
