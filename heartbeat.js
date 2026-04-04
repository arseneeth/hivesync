#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class ProjectHeartbeat {
  constructor() {
    this.projectRoot = __dirname;
  }

  checkFileExists(filePath) {
    const fullPath = path.join(this.projectRoot, filePath);
    return fs.existsSync(fullPath);
  }

  checkDirectoryStructure() {
    const requiredDirs = [
      'src',
      'src/core',
      'src/storage',
      'src/sync',
      'src/utils',
      'tests',
      'tests/unit',
      'tests/integration',
      'tests/e2e',
      'docs',
      'examples',
      'openclaw-skill',
      'kai-integration',
      'scripts'
    ];

    const results = [];
    for (const dir of requiredDirs) {
      const fullPath = path.join(this.projectRoot, dir);
      const exists = fs.existsSync(fullPath);
      results.push({
        directory: dir,
        exists
      });
    }
    
    return results;
  }

  checkPackageJson() {
    const packagePath = path.join(this.projectRoot, 'package.json');
    if (!fs.existsSync(packagePath)) {
      return { valid: false, errors: ['package.json not found'] };
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      
      const errors = [];
      
      if (!pkg.name || pkg.name !== 'hivesync') {
        errors.push(`Package name should be 'hivesync', got '${pkg.name}'`);
      }
      
      if (!pkg.version) {
        errors.push('Missing version');
      }
      
      return {
        valid: errors.length === 0,
        errors,
        name: pkg.name,
        version: pkg.version
      };
    } catch (error) {
      return { valid: false, errors: [`Failed to parse package.json: ${error.message}`] };
    }
  }

  runAllChecks() {
    console.log('\n🔍 HiveSync Project Heartbeat Check\n');
    console.log('Checking project completeness...\n');
    
    // Check directory structure
    console.log('📁 Directory Structure:');
    const dirResults = this.checkDirectoryStructure();
    let dirErrors = 0;
    dirResults.forEach(result => {
      if (result.exists) {
        console.log(`  ✓ ${result.directory}`);
      } else {
        console.log(`  ✗ ${result.directory} (missing)`);
        dirErrors++;
      }
    });
    
    // Check package.json
    console.log('\n📦 Package Configuration:');
    const pkgResult = this.checkPackageJson();
    if (pkgResult.valid) {
      console.log(`  ✓ package.json (${pkgResult.name}@${pkgResult.version})`);
    } else {
      console.log('  ✗ package.json');
      pkgResult.errors.forEach(error => {
        console.log(`    ${error}`);
      });
    }
    
    // Check core files
    console.log('\n📄 Core Files:');
    const coreFiles = [
      'src/types/index.ts',
      'src/core/hivesync-bridge.ts',
      'src/core/bridge-manager.ts',
      'src/storage/storage-manager.ts',
      'src/sync/obsidian-sync.ts',
      'src/utils/logger.ts',
      'src/utils/config.ts',
      'src/utils/interactive.ts',
      'src/cli.ts',
      'src/setup-wizard.ts',
      'src/index.ts'
    ];
    
    let coreFileErrors = 0;
    coreFiles.forEach(file => {
      if (this.checkFileExists(file)) {
        console.log(`  ✓ ${file}`);
      } else {
        console.log(`  ✗ ${file} (missing)`);
        coreFileErrors++;
      }
    });
    
    // Check test files
    console.log('\n🧪 Test Files:');
    const testFiles = [
      'tests/unit/core.test.ts',
      'tests/unit/storage.test.ts',
      'tests/integration/communication.test.ts',
      'tests/e2e/multi-agent.test.ts'
    ];
    
    let testFileErrors = 0;
    testFiles.forEach(file => {
      if (this.checkFileExists(file)) {
        console.log(`  ✓ ${file}`);
      } else {
        console.log(`  ✗ ${file} (missing)`);
        testFileErrors++;
      }
    });
    
    // Check documentation
    console.log('\n📚 Documentation:');
    const docs = [
      'README.md',
      'TECHNICAL_SPECIFICATION.md',
      'docs/ARCHITECTURE.md',
      'docs/SETUP.md'
    ];
    
    let docErrors = 0;
    docs.forEach(doc => {
      if (this.checkFileExists(doc)) {
        console.log(`  ✓ ${doc}`);
      } else {
        console.log(`  ✗ ${doc} (missing)`);
        docErrors++;
      }
    });
    
    // Summary
    console.log('\n📊 Summary:');
    const totalChecks = dirResults.length + 1 + coreFiles.length + testFiles.length + docs.length;
    const passedChecks = totalChecks - dirErrors - (pkgResult.valid ? 0 : 1) - coreFileErrors - testFileErrors - docErrors;
    const percentage = Math.round((passedChecks / totalChecks) * 100);
    
    console.log(`  Total checks: ${totalChecks}`);
    console.log(`  Passed: ${passedChecks}`);
    console.log(`  Failed: ${totalChecks - passedChecks}`);
    console.log(`  Completion: ${percentage}%`);
    
    if (percentage === 100) {
      console.log('\n🎉 Project is complete and ready!');
      return true;
    } else if (percentage >= 80) {
      console.log('\n⚠️ Project is mostly complete, some components missing.');
      console.log('\nMissing components:');
      
      // List missing items
      if (dirErrors > 0) {
        dirResults.filter(r => !r.exists).forEach(r => {
          console.log(`  - Directory: ${r.directory}`);
        });
      }
      if (!pkgResult.valid) {
        pkgResult.errors.forEach(error => {
          console.log(`  - Package error: ${error}`);
        });
      }
      
      return false;
    } else {
      console.log('\n❌ Project is incomplete, significant work needed.');
      return false;
    }
  }
}

// Run heartbeat check
const heartbeat = new ProjectHeartbeat();
const isComplete = heartbeat.runAllChecks();

// Export for testing
module.exports = ProjectHeartbeat;
