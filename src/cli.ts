#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import { BridgeManager } from './core/bridge-manager';
import { setupInteractiveMode } from './utils/interactive';
import { loadConfig, saveConfig } from './utils/config';
import { logger } from './utils/logger';
import { runSetupWizard } from './setup-wizard';

const program = new Command();

// ASCII Art Banner
console.log(
  chalk.blue(
    figlet.textSync('Waku Bridge', {
      font: 'Standard',
      horizontalLayout: 'default',
      verticalLayout: 'default',
    })
  )
);

console.log(
  boxen(
    chalk.green('Secure decentralized communication for Kai and agents\n') +
      chalk.yellow('🔗 End-to-end encrypted • 📝 Obsidian sync • 🤖 Multi-agent'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'blue',
    }
  )
);

program
  .name('hivesync')
  .description('Secure Waku-based communication bridge for Kai and agents')
  .version('1.0.0');

program
  .command('start')
  .description('Start the Waku bridge')
  .option('-c, --config <path>', 'Configuration file path', './config/hivesync.yaml')
  .option('-d, --daemon', 'Run as daemon in background')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      logger.info('Starting Waku Bridge...');
      
      const config = await loadConfig(options.config);
      
      const bridge = new BridgeManager(config);
      const started = await bridge.start();
      
      if (!started) {
        logger.error('Failed to start bridge');
        process.exit(1);
      }
      
      logger.success(`Bridge started successfully! Agent ID: ${config.agentId}`);
      
      if (options.daemon) {
        logger.info('Running in daemon mode...');
        // Keep process alive
        process.on('SIGINT', async () => {
          logger.info('Shutting down...');
          await bridge.stop();
          process.exit(0);
        });
      } else {
        await setupInteractiveMode(bridge);
      }
    } catch (error) {
      logger.error('Failed to start bridge:', error);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Run setup wizard for initial configuration')
  .action(async () => {
    await runSetupWizard();
  });

program
  .command('status')
  .description('Check bridge status')
  .action(async () => {
    try {
      const config = await loadConfig();
      const bridge = new BridgeManager(config);
      const status = bridge.getStatus();
      
      console.log(chalk.cyan('\n=== Bridge Status ===\n'));
      console.log(chalk.white(`Agent: ${status.agentName} (${status.agentId})`));
      console.log(chalk.white(`Running: ${status.running ? '✅' : '❌'}`));
      console.log(chalk.white(`Waku Connected: ${status.waku.connected ? '✅' : '❌'}`));
      console.log(chalk.white(`Peers: ${status.waku.peers}`));
      console.log(chalk.white(`Obsidian Sync: ${status.obsidianSync ? '✅' : '❌'}`));
    } catch (error) {
      logger.error('Failed to get status:', error);
    }
  });

program
  .command('send <recipient> <message>')
  .description('Send a message to another agent')
  .action(async (recipient, message) => {
    try {
      const config = await loadConfig();
      const bridge = new BridgeManager(config);
      await bridge.start();
      
      const msgId = await bridge.sendTextMessage(recipient, message);
      logger.success(`Message sent! ID: ${msgId}`);
      
      await bridge.stop();
    } catch (error) {
      logger.error('Failed to send message:', error);
    }
  });

program
  .command('sync')
  .description('Initiate manual sync with all agents')
  .action(async () => {
    try {
      const config = await loadConfig();
      const bridge = new BridgeManager(config);
      await bridge.start();
      
      await bridge.sendCommand('broadcast', 'sync');
      logger.success('Sync command sent to all agents');
      
      await bridge.stop();
    } catch (error) {
      logger.error('Failed to sync:', error);
    }
  });

program
  .command('agents')
  .description('List known agents')
  .action(async () => {
    try {
      const config = await loadConfig();
      const bridge = new BridgeManager(config);
      await bridge.start();
      
      // This would require adding a method to get agents
      // For now, we'll just show a placeholder
      console.log(chalk.cyan('\n=== Known Agents ===\n'));
      console.log(chalk.yellow('Feature coming soon!'));
      
      await bridge.stop();
    } catch (error) {
      logger.error('Failed to list agents:', error);
    }
  });

program
  .command('test')
  .description('Run connectivity test')
  .action(async () => {
    console.log(chalk.cyan('\n=== Connectivity Test ===\n'));
    
    // Test Waku connectivity
    console.log(chalk.white('1. Testing Waku network...'));
    try {
      const config = await loadConfig();
      const bridge = new BridgeManager(config);
      const started = await bridge.start();
      
      if (started) {
        const status = bridge.getStatus();
        console.log(chalk.green(`   ✅ Connected to Waku network`));
        console.log(chalk.white(`   Peer ID: ${status.waku.peerId}`));
        console.log(chalk.white(`   Active peers: ${status.waku.peers}`));
      } else {
        console.log(chalk.red('   ❌ Failed to connect to Waku network'));
      }
      
      await bridge.stop();
    } catch (error) {
      console.log(chalk.red(`   ❌ Error: ${error.message}`));
    }
    
    console.log(chalk.white('\n2. Testing local storage...'));
    try {
      // Test SQLite
      const sqlite3 = require('sqlite3');
      const db = new sqlite3.Database(':memory:');
      db.run('CREATE TABLE test (id INTEGER PRIMARY KEY)');
      db.close();
      console.log(chalk.green('   ✅ Local storage working'));
    } catch (error) {
      console.log(chalk.red(`   ❌ Error: ${error.message}`));
    }
    
    console.log(chalk.white('\n3. Testing encryption...'));
    try {
      const crypto = require('crypto');
      const keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      console.log(chalk.green('   ✅ Encryption working'));
    } catch (error) {
      console.log(chalk.red(`   ❌ Error: ${error.message}`));
    }
    
    console.log(chalk.cyan('\n=== Test Complete ===\n'));
  });

program.parse(process.argv);

// Show help if no arguments
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
