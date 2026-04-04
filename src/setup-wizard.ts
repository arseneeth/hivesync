import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BridgeConfig } from './types';
import { logger } from './utils/logger';

export async function runSetupWizard(): Promise<void> {
  console.log(chalk.cyan('\n=== Waku Bridge Setup Wizard ===\n'));
  console.log(chalk.gray('This wizard will help you configure your Waku Bridge.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'agentName',
      message: 'What is your agent name?',
      default: 'Kai Agent',
    },
    {
      type: 'input',
      name: 'agentId',
      message: 'Agent ID (leave blank to generate):',
      default: `agent-${uuidv4().substring(0, 8)}`,
    },
    {
      type: 'input',
      name: 'storagePath',
      message: 'Where should data be stored?',
      default: path.join(process.cwd(), 'data', 'hivesync.db'),
    },
    {
      type: 'confirm',
      name: 'enableObsidian',
      message: 'Enable Obsidian vault sync?',
      default: true,
    },
    {
      type: 'input',
      name: 'obsidianPath',
      message: 'Path to your Obsidian vault:',
      when: (answers) => answers.enableObsidian,
      default: path.join(process.cwd(), 'obsidian-vault'),
    },
    {
      type: 'number',
      name: 'syncInterval',
      message: 'Sync interval (minutes):',
      default: 5,
      when: (answers) => answers.enableObsidian,
    },
    {
      type: 'confirm',
      name: 'useCustomNodes',
      message: 'Use custom Waku bootstrap nodes?',
      default: false,
    },
    {
      type: 'editor',
      name: 'customNodes',
      message: 'Enter custom bootstrap nodes (one per line):',
      when: (answers) => answers.useCustomNodes,
      default: `/dns4/node-01.do-ams3.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmPLe7Mzm8TsYUubgCAW1aJoeFScxrLj8ppHFivPo97bUZ
/dns4/node-01.gc-us-central1-a.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmJb2e28qLXxT5kZxVUUoJt72EMzNGXB47Rxx5hw3q4YjS`,
    },
  ]);

  const spinner = ora('Creating configuration...').start();

  try {
    // Create config object
    const config: BridgeConfig = {
      agentId: answers.agentId,
      agentName: answers.agentName,
      storagePath: answers.storagePath,
      syncInterval: answers.enableObsidian ? answers.syncInterval : 0,
      waku: {
        listenAddresses: ['/ip4/0.0.0.0/tcp/0/ws'],
        bootstrapNodes: answers.useCustomNodes
          ? answers.customNodes.split('\n').filter((n: string) => n.trim())
          : [
              '/dns4/node-01.do-ams3.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmPLe7Mzm8TsYUubgCAW1aJoeFScxrLj8ppHFivPo97bUZ',
              '/dns4/node-01.gc-us-central1-a.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmJb2e28qLXxT5kZxVUUoJt72EMzNGXB47Rxx5hw3q4YjS',
            ],
        pubsubTopic: '/waku/2/default-waku/proto',
        keepAlive: true,
        maxPeers: 10,
      },
    };

    // Create directories
    const configDir = path.join(process.cwd(), 'config');
    const dataDir = path.dirname(answers.storagePath);
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Save config
    const configPath = path.join(configDir, 'hivesync.yaml');
    const yaml = require('yaml');
    const yamlStr = yaml.stringify(config);
    
    fs.writeFileSync(configPath, yamlStr, 'utf-8');

    // Create .env file if needed
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      const envContent = `# Waku Bridge Configuration
AGENT_ID=${answers.agentId}
AGENT_NAME="${answers.agentName}"
STORAGE_PATH=${answers.storagePath}
OBSIDIAN_PATH=${answers.enableObsidian ? answers.obsidianPath : ''}
SYNC_INTERVAL=${answers.enableObsidian ? answers.syncInterval : 0}
LOG_LEVEL=info
`;
      fs.writeFileSync(envPath, envContent, 'utf-8');
    }

    // Create example Obsidian vault if enabled
    if (answers.enableObsidian && !fs.existsSync(answers.obsidianPath)) {
      fs.mkdirSync(answers.obsidianPath, { recursive: true });
      
      // Create a sample note
      const sampleNote = `# Welcome to Obsidian Sync

This is a sample note that will be synced between your agents.

## Features
- Real-time synchronization
- End-to-end encryption
- Conflict resolution
- Version history

## Getting Started
1. Add more notes to this vault
2. Connect another agent
3. Watch them sync automatically!`;
      
      fs.writeFileSync(
        path.join(answers.obsidianPath, 'Welcome.md'),
        sampleNote,
        'utf-8'
      );
    }

    spinner.succeed('Configuration created successfully!');

    console.log(chalk.green('\n=== Setup Complete ===\n'));
    console.log(chalk.white(`Configuration saved to: ${configPath}`));
    console.log(chalk.white(`Agent ID: ${answers.agentId}`));
    console.log(chalk.white(`Agent Name: ${answers.agentName}`));
    console.log(chalk.white(`Storage: ${answers.storagePath}`));
    
    if (answers.enableObsidian) {
      console.log(chalk.white(`Obsidian Vault: ${answers.obsidianPath}`));
      console.log(chalk.white(`Sync Interval: ${answers.syncInterval} minutes`));
    }
    
    console.log(chalk.white(`Waku Nodes: ${config.waku.bootstrapNodes.length}`));
    
    console.log(chalk.cyan('\n=== Next Steps ===\n'));
    console.log(chalk.white('1. Start the bridge:'));
    console.log(chalk.yellow('   hivesync start\n'));
    
    console.log(chalk.white('2. Test connectivity:'));
    console.log(chalk.yellow('   hivesync test\n'));
    
    console.log(chalk.white('3. Send a test message:'));
    console.log(chalk.yellow('   hivesync send <agent-id> "Hello!"\n'));
    
    console.log(chalk.white('4. For help:'));
    console.log(chalk.yellow('   hivesync --help\n'));

    // Create setup completion marker
    const setupCompletePath = path.join(process.cwd(), '.setup-complete');
    fs.writeFileSync(setupCompletePath, new Date().toISOString(), 'utf-8');

  } catch (error) {
    spinner.fail('Failed to create configuration');
    logger.error('Setup error:', error);
    process.exit(1);
  }
}
