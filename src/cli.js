#!/usr/bin/env node
import path from 'path';
import readline from 'readline';
import fs from 'fs';
import os from 'os';

import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { collectProjectFiles } from './utils/collector.js';
import { runReviewAgent } from './agent/agent.js';
import { generateReport } from './reporters/reporter.js';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const VERSION = _require('../package.json').version;

// ─── Paths ────────────────────────────────────────────────────────────────────
const SAVED_KEY_PATH = path.join(os.homedir(), '.devauditai', 'config.json');
const ENV_FILE_PATH  = path.join(process.cwd(), '.env');

// ─── Models ───────────────────────────────────────────────────────────────────
const MODELS = [
  {
    id:    'gemini-2.5-flash-lite',
    name:  'Gemini 2.5 Flash Lite',
    tag:   'RECOMMENDED',
    rpm:   '10 req/min',
    rpd:   '20 req/day',
    tpm:   '250K tokens/min',
    desc:  'Fastest response. Good quality. Best balance for daily use.',
    note:  'Best overall choice — fast and reliable',
    color: chalk.green,
  },
  {
    id:    'gemini-2.5-flash',
    name:  'Gemini 2.5 Flash',
    tag:   'BEST QUALITY',
    rpm:   '5 req/min',
    rpd:   '20 req/day',
    tpm:   '250K tokens/min',
    desc:  'Most intelligent model. Deepest and most detailed review.',
    note:  'Use when quality matters more than speed',
    color: chalk.magenta,
  },
];

// ─── Phases ───────────────────────────────────────────────────────────────────
const PHASES = [
  {
    id:    'seo',
    name:  'SEO',
    desc:  'Metadata, titles, canonical URLs, semantic HTML, sitemap',
    note:  'Improve search engine visibility and rankings',
    color: chalk.cyan,
  },
  {
    id:    'performance',
    name:  'Performance',
    desc:  'Image optimization, bundle size, lazy loading, caching',
    note:  'Improve page speed and Core Web Vitals',
    color: chalk.yellow,
  },
  {
    id:    'security',
    name:  'Security',
    desc:  'API security, secrets exposure, XSS, CSRF, headers',
    note:  'Protect your application from vulnerabilities',
    color: chalk.red,
  },
  {
    id:    'accessibility',
    name:  'Accessibility',
    desc:  'ARIA attributes, keyboard nav, screen reader support',
    note:  'Make your app usable for everyone — WCAG compliance',
    color: chalk.green,
  },
  {
    id:    'code-quality',
    name:  'Code Quality',
    desc:  'TypeScript, React hooks, error handling, best practices',
    note:  'Keep your codebase clean and maintainable',
    color: chalk.magenta,
  },
];

// ─── Output formats ───────────────────────────────────────────────────────────
const OUTPUTS = [
  {
    id:    'console',
    name:  'Console only',
    desc:  'Print report to terminal',
    color: chalk.cyan,
  },
  {
    id:    'md',
    name:  'Markdown file',
    desc:  'Save as review-report.md in your project',
    color: chalk.green,
  },
  {
    id:    'both',
    name:  'Both',
    desc:  'Print to terminal + save review-report.md',
    color: chalk.yellow,
  },
];

// ─── Help ─────────────────────────────────────────────────────────────────────
const HELP = `
${chalk.bold.cyan('devauditai')} — AI-powered Code Review Agent

${chalk.bold('USAGE')}
  devauditai ${chalk.yellow('<path>')}              Review a specific directory
  devauditai ${chalk.yellow('.')}                   Review current directory

${chalk.bold('OPTIONS')}
  ${chalk.cyan('-h, --help')}                   Show this help
  ${chalk.cyan('-v, --version')}                Show version number

${chalk.bold('KEY COMMANDS')}
  ${chalk.cyan('-k, --set-saved-key=<key>')}   Save key to ~/.devauditai/config.json
  ${chalk.cyan('--del-saved')}                 Delete the saved key
  ${chalk.cyan('--shell-key=<key>')}           Add GEMINI_API_KEY to shell config (.zshrc/.bashrc) — Mac/Linux only
  ${chalk.cyan('--del-shell')}                 Remove GEMINI_API_KEY from shell config — Mac/Linux only
  ${chalk.cyan('--del-all')}                   Delete saved key + remove from shell config

${chalk.bold('EXAMPLES')}
  ${chalk.gray('$')} devauditai .
  ${chalk.gray('$')} devauditai /path/to/project
  ${chalk.gray('$')} devauditai . -k AIzaSy...
  ${chalk.gray('$')} devauditai . --set-saved-key=AIzaSy...
  ${chalk.gray('$')} devauditai . --del-all
  ${chalk.gray('$')} devauditai --version
  ${chalk.gray('$')} npx devauditai .
  ${chalk.gray('$')} npx devauditai . -k AIzaSy...
`;

// ─── Arg parser ───────────────────────────────────────────────────────────────
function normaliseArgs(argv) {
  const raw = argv.slice(2);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === '-h')  { out.push('--help');    continue; }
    if (a === '-v')  { out.push('--version'); continue; }
    if (a === '-k')  { out.push('--set-saved-key=' + (raw[++i] || '')); continue; }
    if (a.startsWith('-k=')) { out.push('--set-saved-key=' + a.slice(3)); continue; }
    out.push(a);
  }
  return out;
}

function parseArgs(argv) {
  const args  = normaliseArgs(argv);
  const flags = args.filter(a => a.startsWith('-'));
  const pos   = args.filter(a => !a.startsWith('-'));

  if (flags.includes('--help'))       return { help: true };
  if (flags.includes('--version'))    return { version: true };
  if (flags.includes('--del-saved'))  return { delSaved: true };
  if (flags.includes('--del-shell'))  return { delShell: true };
  if (flags.includes('--del-all'))    return { delAll: true };

  const setSavedKey = flags.find(f => f.startsWith('--set-saved-key='));
  if (setSavedKey) return { setSavedKey: setSavedKey.split('=')[1] };

  const setShellKey = flags.find(f => f.startsWith('--shell-key='));
  if (setShellKey) return { shellKey: setShellKey.split('=')[1] }; 

  const projectPath = path.resolve(pos[0] || '.');
  return { projectPath };
}

// ─── .env key helper ──────────────────────────────────────────────────────────
function readEnvFileKey() {
  try {
    const content = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    const match   = content.match(/^GEMINI_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
}

// ─── Saved key helpers ────────────────────────────────────────────────────────
function loadSavedKey() {
  try {
    const data = JSON.parse(fs.readFileSync(SAVED_KEY_PATH, 'utf8'));
    return data.GEMINI_API_KEY || null;
  } catch { return null; }
}

function saveSavedKey(key) {
  const dir = path.dirname(SAVED_KEY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SAVED_KEY_PATH, JSON.stringify({ GEMINI_API_KEY: key }, null, 2), 'utf8');
}

function deleteSavedKey() {
  try {
    if (fs.existsSync(SAVED_KEY_PATH)) { fs.unlinkSync(SAVED_KEY_PATH); return true; }
  } catch {}
  return false;
}

// ─── Shell config helpers ─────────────────────────────────────────────────────
function detectShellConfig() {
  const shell = process.env.SHELL || '';
  const home  = os.homedir();
  if (shell.includes('zsh'))  return path.join(home, '.zshrc');
  if (shell.includes('bash')) return path.join(home, '.bashrc');
  const zshrc  = path.join(home, '.zshrc');
  const bashrc = path.join(home, '.bashrc');
  if (fs.existsSync(zshrc))  return zshrc;
  if (fs.existsSync(bashrc)) return bashrc;
  return zshrc;
}

function readShellKey() {
  try {
    const file    = detectShellConfig();
    const content = fs.readFileSync(file, 'utf8');
    const match   = content.match(/^export GEMINI_API_KEY=(.+)$/m);
    return match ? { key: match[1].trim().replace(/['"]/g, ''), file } : null;
  } catch { return null; }
}

function writeShellKey(key) {
  const file  = detectShellConfig();
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch {}
  const line  = `export GEMINI_API_KEY=${key}`;
  if (/^export GEMINI_API_KEY=.*/m.test(content)) {
    content = content.replace(/^export GEMINI_API_KEY=.*/m, line);
  } else {
    content = content ? content.trimEnd() + `\n${line}\n` : `${line}\n`;
  }
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function deleteShellKey() {
  const file = detectShellConfig();
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (!/^export GEMINI_API_KEY=.*/m.test(content)) return { deleted: false, file };
    fs.writeFileSync(file, content.replace(/^export GEMINI_API_KEY=.*\n?/m, ''), 'utf8');
    return { deleted: true, file };
  } catch { return { deleted: false, file }; }
}

// ─── Resolve API key ──────────────────────────────────────────────────────────
function resolveApiKey() {
  const envFileKey = readEnvFileKey();
  if (envFileKey) {
    process.env.GEMINI_API_KEY = envFileKey;
    return { key: envFileKey, source: `.env file (${ENV_FILE_PATH})` };
  }
  const savedKey = loadSavedKey();
  if (savedKey) {
    process.env.GEMINI_API_KEY = savedKey;
    return { key: savedKey, source: `saved key (${SAVED_KEY_PATH})` };
  }
  const shellInfo = readShellKey();
  if (shellInfo) {
    process.env.GEMINI_API_KEY = shellInfo.key;
    return { key: shellInfo.key, source: `shell export (${shellInfo.file})` };
  }
  if (process.env.GEMINI_API_KEY) {
    return { key: process.env.GEMINI_API_KEY, source: 'shell export (current session)' };
  }
  return null;
}

// ─── Ask user for API key ─────────────────────────────────────────────────────
async function askForApiKey() {
  console.log(boxen(
    chalk.bold.yellow('GEMINI API KEY REQUIRED\n\n') +
    chalk.white('No API key found. You need a free Gemini API key to use this tool.\n\n') +
    chalk.bold('How to get a free key:\n') +
    chalk.gray('  1. Go to ') + chalk.cyan('https://aistudio.google.com/apikey') + '\n' +
    chalk.gray('  2. Sign in with your Google account\n') +
    chalk.gray('  3. Click "Create API key"\n') +
    chalk.gray('  4. Copy the key and paste it below\n\n') +
    chalk.gray('The key will be saved so you only need to do this once.'),
    {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      margin: { left: 1, bottom: 1 },
      borderStyle: 'round',
      borderColor: 'yellow',
      title: '  [!]  Setup Required  ',
      titleAlignment: 'center',
    }
  ));

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => {
      rl.question(chalk.yellow('  Paste your Gemini API key: '), (answer) => {
        const key = answer.trim();
        if (!key || !key.startsWith('AIza')) {
          console.log(chalk.red('  [!] Invalid key. Gemini keys start with "AIza". Try again.'));
          ask();
          return;
        }
        rl.close();
        saveSavedKey(key);
        process.env.GEMINI_API_KEY = key;
        console.log(chalk.green(`\n  [+] Key saved to ${SAVED_KEY_PATH}\n`));
        resolve(key);
      });
    };
    ask();
  });
}

// ─── Model selector ───────────────────────────────────────────────────────────
async function selectModel() {
  console.log('\n');
  console.log(boxen(
    chalk.bold.white('SELECT A MODEL FOR THIS REVIEW\n') +
    chalk.gray('All models are free. Numbers show your daily/minute limits.\n\n') +
    MODELS.map((m, i) =>
      `  ${chalk.bold.white(`${i + 1}.`)}  ${m.color.bold(m.name.padEnd(26))}  ${chalk.bgGray.white(` ${m.tag} `)}\n` +
      `      ${chalk.white(m.desc)}\n` +
      `      ${chalk.gray('RPM: ' + m.rpm)}  ·  ${chalk.gray('RPD: ' + m.rpd)}  ·  ${chalk.gray('TPM: ' + m.tpm)}\n` +
      `      ${chalk.gray('Tip: ' + m.note)}`
    ).join('\n\n'),
    { padding: { top: 1, bottom: 1, left: 2, right: 2 }, margin: { left: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'cyan', title: '  devauditai  Model Selector  ', titleAlignment: 'center' }
  ));

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => {
      rl.question(chalk.cyan(`  Enter number (1-${MODELS.length}): `), (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= MODELS.length) {
          const selected = MODELS[num - 1];
          rl.close();
          console.log(`\n  ${chalk.green('[+]')}  Selected: ${selected.color.bold(selected.name)}\n`);
          resolve(selected);
        } else {
          console.log(chalk.red(`  Invalid. Enter a number between 1 and ${MODELS.length}.`));
          ask();
        }
      });
    };
    ask();
  });
}

// ─── Phase selector ───────────────────────────────────────────────────────────
async function selectPhase() {
  console.log('\n');
  console.log(boxen(
    chalk.bold.white('SELECT A PHASE TO ANALYSE\n') +
    chalk.gray('Each phase checks a specific aspect of your Next.js project.\n\n') +
    PHASES.map((p, i) =>
      `  ${chalk.bold.white(`${i + 1}.`)}  ${p.color.bold(p.name.padEnd(20))}\n` +
      `      ${chalk.white(p.desc)}\n` +
      `      ${chalk.gray('→ ' + p.note)}`
    ).join('\n\n'),
    { padding: { top: 1, bottom: 1, left: 2, right: 2 }, margin: { left: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'yellow', title: '  devauditai  Phase Selector  ', titleAlignment: 'center' }
  ));

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => {
      rl.question(chalk.yellow(`  Enter number (1-${PHASES.length}): `), (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= PHASES.length) {
          const selected = PHASES[num - 1];
          rl.close();
          console.log(`\n  ${chalk.green('[+]')}  Selected: ${selected.color.bold(selected.name)}\n`);
          resolve(selected);
        } else {
          console.log(chalk.red(`  Invalid. Enter a number between 1 and ${PHASES.length}.`));
          ask();
        }
      });
    };
    ask();
  });
}

// ─── Output selector ──────────────────────────────────────────────────────────
async function selectOutput() {
  console.log('\n');
  console.log(boxen(
    chalk.bold.white('SELECT OUTPUT FORMAT\n') +
    chalk.gray('How would you like to receive your report?\n\n') +
    OUTPUTS.map((o, i) =>
      `  ${chalk.bold.white(`${i + 1}.`)}  ${o.color.bold(o.name.padEnd(20))}\n` +
      `      ${chalk.white(o.desc)}`
    ).join('\n\n'),
    { padding: { top: 1, bottom: 1, left: 2, right: 2 }, margin: { left: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'green', title: '  devauditai  Output Selector  ', titleAlignment: 'center' }
  ));

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => {
      rl.question(chalk.green(`  Enter number (1-${OUTPUTS.length}): `), (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= OUTPUTS.length) {
          const selected = OUTPUTS[num - 1];
          rl.close();
          console.log(`\n  ${chalk.green('[+]')}  Output: ${selected.color.bold(selected.name)}\n`);
          resolve(selected);
        } else {
          console.log(chalk.red(`  Invalid. Enter a number between 1 and ${OUTPUTS.length}.`));
          ask();
        }
      });
    };
    ask();
  });
}

// ─── Validate key format ──────────────────────────────────────────────────────
function validateKey(key, flag) {
  if (!key || !key.startsWith('AIza')) {
    console.error(chalk.red(`\n[!] Invalid key for ${flag}. Gemini keys start with "AIza"\n`));
    process.exit(1);
  }
}

// ─── Parse args & handle commands ────────────────────────────────────────────
const opts = parseArgs(process.argv);

if (opts.help)    { console.log(HELP); process.exit(0); }
if (opts.version) { console.log(`devauditai v${VERSION}`); process.exit(0); }

if (opts.setSavedKey) {
  validateKey(opts.setSavedKey, '--set-saved-key');
  saveSavedKey(opts.setSavedKey);
  console.log(chalk.green(`\n[+] API key saved to ${SAVED_KEY_PATH}\n`));
  process.exit(0);
}
if (opts.delSaved) {
  const deleted = deleteSavedKey();
  if (deleted) {
    console.log(chalk.green(`\n[+] Saved API key deleted from ${SAVED_KEY_PATH}\n`));
  } else {
    console.log(chalk.yellow('\n[~] No saved key found — nothing to delete.\n'));
  }
  process.exit(0);
}
if (opts.shellKey) {
  validateKey(opts.shellKey, '--shell-key');
  const file = writeShellKey(opts.shellKey);
  console.log(chalk.green(`\n[+] GEMINI_API_KEY added to ${file}\n`));
  process.exit(0);
}
if (opts.delShell) {
  const { deleted, file } = deleteShellKey();
  if (deleted) {
    console.log(chalk.green(`\n[+] GEMINI_API_KEY removed from ${file}\n`));
  } else {
    console.log(chalk.yellow(`\n[~] No GEMINI_API_KEY found in ${file} — nothing to delete.\n`));
  }
  process.exit(0);
}
if (opts.delAll) {
  const savedDeleted = deleteSavedKey();
  const { deleted: shellDeleted, file } = deleteShellKey();
  console.log('');
  if (savedDeleted) {
    console.log(chalk.green(`[+] Saved key deleted from ${SAVED_KEY_PATH}`));
  } else {
    console.log(chalk.gray(`[~] No saved key found at ${SAVED_KEY_PATH}`));
  }
  if (shellDeleted) {
    console.log(chalk.green(`[+] Shell key removed from ${file}`));
  } else {
    console.log(chalk.gray(`[~] No shell key found in ${file}`));
  }
  console.log(chalk.gray('\n    Note: .env file is NOT affected — remove manually if needed.\n'));
  process.exit(0);
}

const { projectPath } = opts;

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(boxen(
  chalk.bold.cyan('devauditai') + chalk.gray(` v${VERSION}`) + '\n' +
  chalk.gray('AI-powered code review agent · Free'),
  { padding: 1, margin: { top: 1, bottom: 0, left: 1, right: 1 }, borderStyle: 'round', borderColor: 'cyan' }
));

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {

  // Step 1: Resolve API key
  const apiKeyInfo = resolveApiKey();
  if (apiKeyInfo) {
    console.log(`\n  ${chalk.green('[+]')}  API key loaded from ${chalk.cyan(apiKeyInfo.source)}`);
  } else {
    await askForApiKey();
  }

  // Step 2: Show project info
  console.log('');
  console.log(`  ${chalk.bold('Path')}    ${chalk.yellow(projectPath)}`);
  console.log('');

  // Step 3: Select model
  const selectedModel = await selectModel();

  // Step 4: Select phase
  const selectedPhase = await selectPhase();

  // Step 5: Select output
  const selectedOutput = await selectOutput();

  // Step 6: Scan project
  const spinner = ora('Scanning project files...').start();
  let project;
  try {
    project = await collectProjectFiles(projectPath);
    spinner.succeed(
      `Scanned ${chalk.cyan(project.files.length)} files · ` +
      `${chalk.yellow(project.totalLines.toLocaleString())} lines · ` +
      `Next.js ${chalk.green(project.meta.nextVersion)} ${chalk.gray('(' + project.meta.router + ')')}`
    );
  } catch (err) {
    spinner.fail('Failed to scan project: ' + err.message);
    process.exit(1);
  }

  // Step 7: Run agent
  console.log('');
  const result = await runReviewAgent(project, [selectedPhase.id], selectedModel.id);
  await generateReport(result, selectedOutput.id, projectPath);
}

main().catch(err => {
  console.error(chalk.red('\n[!] Unexpected error: ') + err.message);
  process.exit(1);
});