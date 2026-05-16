#!/usr/bin/env node

/**
 * Universal installer for devauditai
 * Works on Mac, Linux, and Windows
 * All critical source files are embedded — zip corruption cannot break install
 */

import { spawnSync } from 'child_process';
import { existsSync, copyFileSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = os.platform() === 'win32';

// ─── Colors ───────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
function log(color, msg) { process.stdout.write(color + msg + c.reset + '\n'); }
function info(msg)    { log(c.cyan,   '  ' + msg); }
function success(msg) { log(c.green,  '  [+] ' + msg); }
function warn(msg)    { log(c.yellow, '  [~] ' + msg); }
function error(msg)   { log(c.red,    '  [!] ' + msg); }
function bold(msg)    { log(c.bold,   msg); }
function run(cmd, opts = {}) { return spawnSync(cmd, { shell: true, stdio: 'pipe', ...opts }); }

// ─── Embedded source files ─────────────────────────────────────────────────────
const CORRECT_CLI   = readFileSync(join(__dirname, 'src', 'cli.js'), 'utf8');
const CORRECT_AGENT = readFileSync(join(__dirname, 'src', 'agent', 'agent.js'), 'utf8');

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log('');
bold(c.cyan + '  devauditai — Universal Installer' + c.reset);
log(c.cyan, '  ────────────────────────────────────────────');
console.log('');
info(`Platform: ${os.platform()} (${os.arch()})`);
info(`Node:     ${process.version}`);
info(`Location: ${__dirname}`);
console.log('');

// ─── Step 0: Clean up old installs ────────────────────────────────────────────
bold('  Step 0  Cleaning up old installations...');

const oldBinaries = [
  '/usr/local/bin/review',
  '/usr/bin/review',
  '/usr/local/bin/devauditai',
  '/usr/bin/devauditai',
];

const oldPackages = ['nextjs-review-agent', 'devauditai'];

if (!isWindows) {
  for (const bin of oldBinaries) {
    run(`sudo rm -f "${bin}" 2>/dev/null || rm -f "${bin}" 2>/dev/null`);
  }
  const nvmBin = run(`dirname "$(which npm)" 2>/dev/null`).stdout?.toString().trim();
  if (nvmBin) {
    run(`rm -f "${nvmBin}/review" 2>/dev/null`);
    run(`rm -f "${nvmBin}/devauditai" 2>/dev/null`);
  }
} else {
  const winBin = run(`npm bin -g 2>/dev/null`).stdout?.toString().trim();
  if (winBin) {
    run(`del /f "${winBin}\\review.cmd" 2>nul`);
    run(`del /f "${winBin}\\devauditai.cmd" 2>nul`);
  }
}

for (const pkg of oldPackages) {
  const npmFull = isWindows ? 'npm.cmd' : (run(`which npm`).stdout?.toString().trim() || 'npm');
  if (!isWindows) {
    run(`sudo "${npmFull}" uninstall -g ${pkg} 2>/dev/null || "${npmFull}" uninstall -g ${pkg} 2>/dev/null`);
  } else {
    run(`npm.cmd uninstall -g ${pkg} 2>nul`);
  }
}

success('Old installations cleaned up');

// ─── Step 1: Write correct source files ───────────────────────────────────────
bold('  Step 1  Writing correct source files...');

const cliPath   = join(__dirname, 'src', 'cli.js');
const agentPath = join(__dirname, 'src', 'agent', 'agent.js');

writeFileSync(cliPath,   CORRECT_CLI,   'utf8');
writeFileSync(agentPath, CORRECT_AGENT, 'utf8');

if (!isWindows) {
  chmodSync(cliPath,   '755');
  chmodSync(agentPath, '755');
}
success('cli.js and agent.js written correctly');

// ─── Step 2: Find npm ─────────────────────────────────────────────────────────
console.log('');
bold('  Step 2  Finding npm...');
const npmCmd   = isWindows ? 'npm.cmd' : 'npm';
const npmCheck = run(`${npmCmd} --version`);
if (npmCheck.status !== 0) {
  error('npm not found. Please install Node.js from https://nodejs.org');
  process.exit(1);
}
success(`npm v${npmCheck.stdout.toString().trim()} found`);

// ─── Step 3: Install dependencies ─────────────────────────────────────────────
console.log('');
bold('  Step 3  Installing dependencies...');
const depInstall = run(`${npmCmd} install --silent`, { cwd: __dirname, stdio: 'inherit' });
if (depInstall.status !== 0) { error('npm install failed'); process.exit(1); }
success('Dependencies installed');

// ─── Step 4: Find global npm root ─────────────────────────────────────────────
console.log('');
bold('  Step 4  Finding global install path...');
const globalRoot = run(`${npmCmd} root -g`).stdout?.toString().trim();
if (!globalRoot) { error('Could not determine global npm root'); process.exit(1); }
const globalDir = join(globalRoot, 'devauditai');
info(`Global root: ${globalRoot}`);

// ─── Step 5: Install globally ─────────────────────────────────────────────────
console.log('');
bold('  Step 5  Installing globally...');

const npmFullPath = isWindows ? npmCmd : (run(`which ${npmCmd}`).stdout?.toString().trim() || npmCmd);
const userOwned   = !isWindows && (
  npmFullPath.includes(os.homedir()) ||
  npmFullPath.includes('.nvm')       ||
  npmFullPath.includes('.volta')     ||
  npmFullPath.includes('.fnm')       ||
  npmFullPath.includes('/.local/')
);

if (userOwned || isWindows) {
  info('User/nvm install detected — no sudo needed');
  const gi = spawnSync(`"${npmFullPath}" install -g "${__dirname}"`, { shell: true, stdio: 'inherit' });
  if (gi.status !== 0) { error('Global install failed'); process.exit(1); }
} else {
  warn('This may ask for your password...');
  const gi = spawnSync(`sudo "${npmFullPath}" install -g "${__dirname}"`, { shell: true, stdio: 'inherit' });
  if (gi.status !== 0) { error('Global install failed'); process.exit(1); }
}
success('Globally installed');

// ─── Step 6: Sync ALL files to global location ────────────────────────────────
console.log('');
bold('  Step 6  Syncing all files to global install...');

if (existsSync(globalDir)) {
  const globalCli   = join(globalDir, 'src', 'cli.js');
  const globalAgent = join(globalDir, 'src', 'agent', 'agent.js');

  // Always overwrite — no condition check, always syncs latest
  writeFileSync(globalCli,   CORRECT_CLI,   'utf8');
  writeFileSync(globalAgent, CORRECT_AGENT, 'utf8');
  if (!isWindows) {
    chmodSync(globalCli,   '755');
    chmodSync(globalAgent, '755');
  }
  info('cli.js synced');
  info('agent.js synced');

  // Sync all other source files
  const others = [
    'src/reporters/reporter.js',
    'src/tools/tools.js',
    'src/utils/collector.js',
  ];
  for (const f of others) {
    try {
      copyFileSync(join(__dirname, f), join(globalDir, f));
      info(`${f} synced`);
    } catch {}
  }
  success('All files synced to global install');
} else {
  warn('Global dir not found — skipping sync');
}

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log('');
bold(c.green + '  Setup complete!' + c.reset);
console.log('');
info('Go to your project and run:');
log(c.cyan + c.bold, '    devauditai .');
console.log('');