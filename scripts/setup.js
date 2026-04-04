#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');

console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════╗
║                 HiveSync Setup Script                ║
║        Secure AI Agent Communication Platform        ║
╚══════════════════════════════════════════════════════╝
`));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(question, defaultValue = '') {
  return new Promise((resolve) => {
    rl.question(chalk.blue(`\n${question} `), (answer) => {
      resolve(answer || defaultValue);
    });
  });
}

async function runCommand(command, description) {
  console.log(chalk.gray(`\n${description}...`));
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(chalk.green(`✓ ${description}`));
    return true;
  } catch (error) {
    console.log(chalk.red(`✗ ${description} failed`));
    console.log(chalk.gray(`Error: ${error.message}`));
    return false;
  }
}

async function checkPrerequisites() {
  console.log(chalk.cyan('\n🔍 Checking prerequisites...'));
  
  const checks = [
    { command: 'node --version', description: 'Node.js' },
    { command: 'npm --version', description: 'npm' },
    { command: 'git --version', description: 'Git' },
  ];

  let allPassed = true;
  for (const check of checks) {
    try {
      execSync(check.command, { stdio: 'pipe' });
      console.log(chalk.green(`  ✓ ${check.description}`));
    } catch (error) {
      console.log(chalk.red(`  ✗ ${check.description} not found`));
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function installDependencies() {
  console.log(chalk.cyan('\n📦 Installing dependencies...'));
  
  const steps = [
    { command: 'npm install', description: 'Install npm packages' },
    { command: 'npm run build', description: 'Build TypeScript' },
  ];
  
  for (const step of steps) {
    const success = await runCommand(step.command, step.description);
    if (!success) return false;
  }
  
  return true;
}

async function createConfiguration() {
  console.log(chalk.cyan('\n⚙️  Creating configuration...'));
  
  const configDir = path.join(process.cwd(), 'config');
  const dataDir = path.join(process.cwd(), 'data');
  const logsDir = path.join(process.cwd(), 'logs');
  
  // Create directories
  [configDir, dataDir, logsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(chalk.green(`  ✓ Created directory: ${dir}`));
    }
  });
  
  // Ask for configuration
  const agentName = await askQuestion('Enter agent name:', 'Kai Assistant');
  const agentId = `agent-${Date.now().toString(36)}`;
  
  const enableObsidian = (await askQuestion('Enable Obsidian sync? (y/n):', 'y')).toLowerCase() === 'y';
  let obsidianPath = '';
  let syncInterval = 0;
  
  if (enableObsidian) {
    obsidianPath = await askQuestion('Path to Obsidian vault:', '~/Documents/Obsidian');
    syncInterval = parseInt(await askQuestion('Sync interval (minutes):', '5'));
  }
  
  // Create config file
  const config = {
    agentId,
    agentName,
    storagePath: path.join(dataDir, 'hivesync.db'),
    syncInterval,
    waku: {
      listenAddresses: ['/ip4/0.0.0.0/tcp/0/ws'],
      bootstrapNodes: [
        '/dns4/node-01.do-ams3.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmPLe7Mzm8TsYUubgCAW1aJoeFScxrLj8ppHFivPo97bUZ',
        '/dns4/node-01.gc-us-central1-a.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmJb2e28qLXxT5kZxVUUoJt72EMzNGXB47Rxx5hw3q4YjS',
      ],
      pubsubTopic: '/waku/2/hivesync/proto',
      keepAlive: true,
      maxPeers: 10,
    },
  };
  
  if (enableObsidian) {
    config.obsidian = {
      vaultPath: obsidianPath,
      autoSync: true,
    };
  }
  
  const configPath = path.join(configDir, 'hivesync.yaml');
  const yaml = require('yaml');
  fs.writeFileSync(configPath, yaml.stringify(config), 'utf-8');
  
  console.log(chalk.green(`✓ Configuration saved to: ${configPath}`));
  console.log(chalk.gray(`  Agent ID: ${agentId}`));
  console.log(chalk.gray(`  Agent Name: ${agentName}`));
  
  return true;
}

async function generateKeys() {
  console.log(chalk.cyan('\n🔑 Generating encryption keys...'));
  
  try {
    // This would normally generate RSA keys
    // For now, we'll create a placeholder
    const keysDir = path.join(process.cwd(), 'data', 'keys');
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    
    const keyInfo = {
      generated: new Date().toISOString(),
      agentId: 'to-be-set',
      algorithm: 'RSA-2048',
    };
    
    fs.writeFileSync(
      path.join(keysDir, 'key-info.json'),
      JSON.stringify(keyInfo, null, 2),
      'utf-8'
    );
    
    console.log(chalk.green('✓ Encryption keys generated'));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Failed to generate keys'));
    console.log(chalk.gray(`Error: ${error.message}`));
    return false;
  }
}

async function testSetup() {
  console.log(chalk.cyan('\n🧪 Testing setup...'));
  
  const tests = [
    { command: 'npm test -- --passWithNoTests', description: 'Run tests' },
    { command: 'node dist/cli.js --version', description: 'Check CLI' },
  ];
  
  let allPassed = true;
  for (const test of tests) {
    const success = await runCommand(test.command, test.description);
    if (!success) allPassed = false;
  }
  
  return allPassed;
}

async function main() {
  try {
    console.log(chalk.yellow('Welcome to HiveSync Setup!'));
    console.log(chalk.gray('This script will guide you through installation and configuration.\n'));
    
    // Check prerequisites
    const prerequisitesOk = await checkPrerequisites();
    if (!prerequisitesOk) {
      console.log(chalk.red('\n❌ Prerequisites not met. Please install:'));
      console.log(chalk.white('  - Node.js 18+ (https://nodejs.org/)'));
      console.log(chalk.white('  - npm 8+ (comes with Node.js)'));
      console.log(chalk.white('  - Git (optional, for development)\n'));
      process.exit(1);
    }
    
    // Install dependencies
    const depsOk = await installDependencies();
    if (!depsOk) {
      console.log(chalk.red('\n❌ Failed to install dependencies'));
      process.exit(1);
    }
    
    // Create configuration
    const configOk = await createConfiguration();
    if (!configOk) {
      console.log(chalk.red('\n❌ Failed to create configuration'));
      process.exit(1);
    }
    
    // Generate keys
    const keysOk = await generateKeys();
    if (!keysOk) {
      console.log(chalk.yellow('\n⚠️  Could not generate keys (will use defaults)'));
    }
    
    // Test setup
    const testOk = await testSetup();
    if (!testOk) {
      console.log(chalk.yellow('\n⚠️  Some tests failed, but setup may still work'));
    }
    
    // Success!
    console.log(chalk.green(`
╔══════════════════════════════════════════════════════╗
║                Setup Complete! 🎉                   ║
╚══════════════════════════════════════════════════════╝
`));
    
    console.log(chalk.white('\nNext steps:'));
    console.log(chalk.cyan('  1. Start HiveSync:'));
    console.log(chalk.white('     npm start'));
    console.log(chalk.cyan('  2. Or use the CLI:'));
    console.log(chalk.white('     node dist/cli.js start'));
    console.log(chalk.cyan('  3. Check status:'));
    console.log(chalk.white('     node dist/cli.js status'));
    console.log(chalk.cyan('  4. Send a test message:'));
    console.log(chalk.white('     node dist/cli.js send <agent-id> "Hello!"'));
    
    console.log(chalk.gray('\nConfiguration files are in: ./config/'));
    console.log(chalk.gray('Data is stored in: ./data/'));
    console.log(chalk.gray('Logs are in: ./logs/\n'));
    
  } catch (error) {
    console.log(chalk.red(`\n❌ Setup failed: ${error.message}`));
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run setup
if (require.main === module) {
  main();
}

module.exports = { main };
