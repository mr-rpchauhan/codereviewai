#!/usr/bin/env node
import path from 'path';
import readline from 'readline';
import fs from 'fs';
import os from 'os';

// ─── Load .env from current project directory (priority 1) ────────────────────
try { process.loadEnvFile(path.join(process.cwd(), '.env')); } catch {}

import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { collectProjectFiles } from './utils/collector.js';
import { runReviewAgent } from './agent/agent.js';
import { generateReport } from './reporters/reporter.js';

const VERSION = '1.0.0';

// ─── Global key storage path (used when key entered via terminal) ──────────────
const GLOBAL_KEY_PATH = path.join(os.homedir(), '.devauditai', 'config.json');

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

const VALID_AREAS   = ['code-quality', 'seo', 'performance', 'security', 'accessibility'];
const VALID_OUTPUTS = ['console', 'markdown', 'json', 'both', 'md'];
const VALID_MODELS  = MODELS.map(m => m.id);

// ─── Help ─────────────────────────────────────────────────────────────────────
const HELP = `
${chalk.bold.cyan('devauditai')} — AI-powered Code Review Agent

${chalk.bold('USAGE')}
  devauditai ${chalk.yellow('<path>')} [options]
  devauditai ${chalk.yellow('.')}              Review current directory

${chalk.bold('OPTIONS')}
  ${chalk.cyan('--model=<id>')}       Skip selector, use this model directly
  ${chalk.cyan('--focus=<areas>')}    Comma-separated areas (default: all)
  ${chalk.cyan('--output=<format>')}  Output format: console, markdown, json, both
  ${chalk.cyan('--set-key=<key>')}    Save a new Gemini API key globally
  ${chalk.cyan('--delete-key')}       Delete the saved global API key
  ${chalk.cyan('--version')}          Show version
  ${chalk.cyan('--help')}             Show this help

${chalk.bold('KEY PRIORITY')}
  1. ${chalk.yellow('.env')} file in your project folder
  2. ${chalk.yellow('Shell config')} (GEMINI_API_KEY env variable)
  3. ${chalk.yellow('Saved key')} at ~/.devauditai/config.json
  4. ${chalk.yellow('Terminal input')} — asked on first run, saved globally

${chalk.bold('EXAMPLES')}
  ${chalk.gray('$')} devauditai .
  ${chalk.gray('$')} devauditai . --output=markdown
  ${chalk.gray('$')} devauditai . --focus=seo,performance
  ${chalk.gray('$')} devauditai . --set-key=AIzaSy...
  ${chalk.gray('$')} devauditai . --delete-key
`;

// ─── Arg parser ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args  = argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const pos   = args.filter(a => !a.startsWith('--'));

  if (flags.includes('--help')    || flags.includes('-h')) return { help: true };
  if (flags.includes('--version') || flags.includes('-v')) return { version: true };
  if (flags.includes('--delete-key'))                      return { deleteKey: true };

  const setKeyFlag = flags.find(f => f.startsWith('--set-key='));
  if (setKeyFlag) return { setKey: setKeyFlag.split('=')[1] };

  const projectPath = path.resolve(pos[0] || '.');
  const outputRaw   = flags.find(f => f.startsWith('--output='))?.split('=')[1];
  const output      = outputRaw || 'console';
  if (outputRaw && !VALID_OUTPUTS.includes(output)) {
    console.error(chalk.red(`\n[!] Unknown --output "${output}". Valid: ${VALID_OUTPUTS.join(', ')}\n`));
    process.exit(1);
  }
  const focusRaw   = flags.find(f => f.startsWith('--focus='))?.split('=')[1];
  const focusAreas = focusRaw ? focusRaw.split(',').map(s => s.trim()) : [...VALID_AREAS];
  const invalid    = focusAreas.filter(a => !VALID_AREAS.includes(a));
  if (invalid.length) {
    console.error(chalk.red(`\n[!] Unknown --focus: ${invalid.join(', ')}\n`));
    process.exit(1);
  }
  const modelRaw = flags.find(f => f.startsWith('--model='))?.split('=')[1];
  if (modelRaw && !VALID_MODELS.includes(modelRaw)) {
    console.error(chalk.red(`\n[!] Unknown --model "${modelRaw}"\nValid: ${VALID_MODELS.join(', ')}\n`));
    process.exit(1);
  }
  return { projectPath, output, focusAreas, modelId: modelRaw || null };
}

// ─── Global key helpers ───────────────────────────────────────────────────────
function loadGlobalKey() {
  try {
    const data = JSON.parse(fs.readFileSync(GLOBAL_KEY_PATH, 'utf8'));
    return data.GEMINI_API_KEY || null;
  } catch { return null; }
}

function saveGlobalKey(key) {
  const dir = path.dirname(GLOBAL_KEY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(GLOBAL_KEY_PATH, JSON.stringify({ GEMINI_API_KEY: key }, null, 2), 'utf8');
}

function deleteGlobalKey() {
  try {
    if (fs.existsSync(GLOBAL_KEY_PATH)) {
      fs.unlinkSync(GLOBAL_KEY_PATH);
      return true;
    }
  } catch {}
  return false;
}

// ─── Resolve API key (priority order) ────────────────────────────────────────
function resolveApiKey() {
  // Priority 1 — .env file (already loaded above via process.loadEnvFile)
  if (process.env.GEMINI_API_KEY) {
    return { key: process.env.GEMINI_API_KEY, source: '.env file' };
  }

  // Priority 2 — Shell config (same env var, set via export in .zshrc/.bashrc)
  // Already covered above since process.env includes shell exports

  // Priority 3 — Saved global key
  const globalKey = loadGlobalKey();
  if (globalKey) {
    return { key: globalKey, source: `saved key (${GLOBAL_KEY_PATH})` };
  }

  return null;
}

// ─── Ask user for API key via terminal ───────────────────────────────────────
async function askForApiKey() {
  console.log(boxen(
    chalk.bold.yellow('GEMINI API KEY REQUIRED\n\n') +
    chalk.white('No API key found. You need a free Gemini API key to use this tool.\n\n') +
    chalk.bold('How to get a free key:\n') +
    chalk.gray('  1. Go to ') + chalk.cyan('https://aistudio.google.com/apikey') + '\n' +
    chalk.gray('  2. Sign in with your Google account\n') +
    chalk.gray('  3. Click "Create API key"\n') +
    chalk.gray('  4. Copy the key and paste it below\n\n') +
    chalk.gray('The key will be saved globally so you only need to do this once.'),
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
        saveGlobalKey(key);
        process.env.GEMINI_API_KEY = key;
        console.log(chalk.green(`\n  [+] Key saved to ${GLOBAL_KEY_PATH}`));
        console.log(chalk.gray('      To change it later: devauditai --set-key=YOUR_NEW_KEY'));
        console.log(chalk.gray('      To delete it:       devauditai --delete-key\n'));
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

// ─── Parse args ───────────────────────────────────────────────────────────────
const opts = parseArgs(process.argv);

if (opts.help)    { console.log(HELP); process.exit(0); }
if (opts.version) { console.log(`review v${VERSION}`); process.exit(0); }

// Handle --set-key
if (opts.setKey) {
  if (!opts.setKey.startsWith('AIza')) {
    console.error(chalk.red('\n[!] Invalid key. Gemini keys start with "AIza"\n'));
    process.exit(1);
  }
  saveGlobalKey(opts.setKey);
  console.log(chalk.green(`\n[+] API key saved to ${GLOBAL_KEY_PATH}\n`));
  process.exit(0);
}

// Handle --delete-key
if (opts.deleteKey) {
  const deleted = deleteGlobalKey();
  if (deleted) {
    console.log(chalk.green(`\n[+] Saved API key deleted from ${GLOBAL_KEY_PATH}\n`));
    console.log(chalk.gray('    The key in your .env or shell config is NOT affected.\n'));
  } else {
    console.log(chalk.yellow('\n[~] No saved key found — nothing to delete.\n'));
  }
  process.exit(0);
}

const { projectPath, output, focusAreas, modelId } = opts;

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(boxen(
  chalk.bold.cyan('devauditai') + chalk.gray(` v${VERSION}`) + '\n' +
  chalk.gray('AI-powered code review agent · Free'),
  { padding: 1, margin: { top: 1, bottom: 0, left: 1, right: 1 }, borderStyle: 'round', borderColor: 'cyan' }
));

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {

  // ── Step 1: Resolve API key ────────────────────────────────────────────────
  let apiKeyInfo = resolveApiKey();

  if (apiKeyInfo) {
    console.log(`\n  ${chalk.green('[+]')}  API key loaded from ${chalk.cyan(apiKeyInfo.source)}`);
    process.env.GEMINI_API_KEY = apiKeyInfo.key;
  } else {
    // No key found — ask user via terminal
    await askForApiKey();
  }

  // ── Step 2: Show project info ──────────────────────────────────────────────
  console.log('');
  console.log(`  ${chalk.bold('Path')}    ${chalk.yellow(projectPath)}`);
  console.log(`  ${chalk.bold('Focus')}   ${chalk.cyan(focusAreas.join(', '))}`);
  console.log(`  ${chalk.bold('Output')}  ${chalk.cyan(output)}`);
  console.log('');

  // ── Step 3: Select model ───────────────────────────────────────────────────
  let selectedModel;
  if (modelId) {
    selectedModel = MODELS.find(m => m.id === modelId);
    console.log(`  ${chalk.green('[+]')}  Using model: ${selectedModel.color.bold(selectedModel.name)}\n`);
  } else {
    selectedModel = await selectModel();
  }

  // ── Step 4: Scan project ───────────────────────────────────────────────────
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

  // ── Step 5: Run agent ──────────────────────────────────────────────────────
  console.log('');
  const result = await runReviewAgent(project, focusAreas, selectedModel.id);
  await generateReport(result, output, projectPath);
}

main().catch(err => {
  console.error(chalk.red('\n[!] Unexpected error: ') + err.message);
  process.exit(1);
});
