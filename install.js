#!/usr/bin/env node

/**
 * Universal installer for devauditai
 * Works on Mac, Linux, and Windows
 * All critical source files are embedded — zip corruption cannot break install
 */

import { spawnSync } from 'child_process';
import { existsSync, copyFileSync, writeFileSync, chmodSync } from 'fs';
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
const CORRECT_CLI = `#!/usr/bin/env node
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
const HELP = \`
\${chalk.bold.cyan('devauditai')} — AI-powered Code Review Agent

\${chalk.bold('USAGE')}
  devauditai \${chalk.yellow('<path>')} [options]
  devauditai \${chalk.yellow('.')}              Review current directory

\${chalk.bold('OPTIONS')}
  \${chalk.cyan('--model=<id>')}       Skip selector, use this model directly
  \${chalk.cyan('--focus=<areas>')}    Comma-separated areas (default: all)
  \${chalk.cyan('--output=<format>')}  Output format: console, markdown, json, both
  \${chalk.cyan('--set-key=<key>')}    Save a new Gemini API key globally
  \${chalk.cyan('--delete-key')}       Delete the saved global API key
  \${chalk.cyan('--version')}          Show version
  \${chalk.cyan('--help')}             Show this help

\${chalk.bold('KEY PRIORITY')}
  1. \${chalk.yellow('.env')} file in your project folder
  2. \${chalk.yellow('Shell config')} (GEMINI_API_KEY env variable)
  3. \${chalk.yellow('Saved key')} at ~/.devauditai/config.json
  4. \${chalk.yellow('Terminal input')} — asked on first run, saved globally

\${chalk.bold('EXAMPLES')}
  \${chalk.gray('$')} devauditai .
  \${chalk.gray('$')} devauditai . --output=markdown
  \${chalk.gray('$')} devauditai . --focus=seo,performance
  \${chalk.gray('$')} devauditai . --set-key=AIzaSy...
  \${chalk.gray('$')} devauditai . --delete-key
\`;

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
    console.error(chalk.red(\`\\n[!] Unknown --output "\${output}". Valid: \${VALID_OUTPUTS.join(', ')}\\n\`));
    process.exit(1);
  }
  const focusRaw   = flags.find(f => f.startsWith('--focus='))?.split('=')[1];
  const focusAreas = focusRaw ? focusRaw.split(',').map(s => s.trim()) : [...VALID_AREAS];
  const invalid    = focusAreas.filter(a => !VALID_AREAS.includes(a));
  if (invalid.length) {
    console.error(chalk.red(\`\\n[!] Unknown --focus: \${invalid.join(', ')}\\n\`));
    process.exit(1);
  }
  const modelRaw = flags.find(f => f.startsWith('--model='))?.split('=')[1];
  if (modelRaw && !VALID_MODELS.includes(modelRaw)) {
    console.error(chalk.red(\`\\n[!] Unknown --model "\${modelRaw}"\\nValid: \${VALID_MODELS.join(', ')}\\n\`));
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
    return { key: globalKey, source: \`saved key (\${GLOBAL_KEY_PATH})\` };
  }

  return null;
}

// ─── Ask user for API key via terminal ───────────────────────────────────────
async function askForApiKey() {
  console.log(boxen(
    chalk.bold.yellow('GEMINI API KEY REQUIRED\\n\\n') +
    chalk.white('No API key found. You need a free Gemini API key to use this tool.\\n\\n') +
    chalk.bold('How to get a free key:\\n') +
    chalk.gray('  1. Go to ') + chalk.cyan('https://aistudio.google.com/apikey') + '\\n' +
    chalk.gray('  2. Sign in with your Google account\\n') +
    chalk.gray('  3. Click "Create API key"\\n') +
    chalk.gray('  4. Copy the key and paste it below\\n\\n') +
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
        console.log(chalk.green(\`\\n  [+] Key saved to \${GLOBAL_KEY_PATH}\`));
        console.log(chalk.gray('      To change it later: devauditai --set-key=YOUR_NEW_KEY'));
        console.log(chalk.gray('      To delete it:       devauditai --delete-key\\n'));
        resolve(key);
      });
    };
    ask();
  });
}

// ─── Model selector ───────────────────────────────────────────────────────────
async function selectModel() {
  console.log('\\n');
  console.log(boxen(
    chalk.bold.white('SELECT A MODEL FOR THIS REVIEW\\n') +
    chalk.gray('All models are free. Numbers show your daily/minute limits.\\n\\n') +
    MODELS.map((m, i) =>
      \`  \${chalk.bold.white(\`\${i + 1}.\`)}  \${m.color.bold(m.name.padEnd(26))}  \${chalk.bgGray.white(\` \${m.tag} \`)}\\n\` +
      \`      \${chalk.white(m.desc)}\\n\` +
      \`      \${chalk.gray('RPM: ' + m.rpm)}  ·  \${chalk.gray('RPD: ' + m.rpd)}  ·  \${chalk.gray('TPM: ' + m.tpm)}\\n\` +
      \`      \${chalk.gray('Tip: ' + m.note)}\`
    ).join('\\n\\n'),
    { padding: { top: 1, bottom: 1, left: 2, right: 2 }, margin: { left: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'cyan', title: '  devauditai  Model Selector  ', titleAlignment: 'center' }
  ));

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => {
      rl.question(chalk.cyan(\`  Enter number (1-\${MODELS.length}): \`), (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= MODELS.length) {
          const selected = MODELS[num - 1];
          rl.close();
          console.log(\`\\n  \${chalk.green('[+]')}  Selected: \${selected.color.bold(selected.name)}\\n\`);
          resolve(selected);
        } else {
          console.log(chalk.red(\`  Invalid. Enter a number between 1 and \${MODELS.length}.\`));
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
if (opts.version) { console.log(\`review v\${VERSION}\`); process.exit(0); }

// Handle --set-key
if (opts.setKey) {
  if (!opts.setKey.startsWith('AIza')) {
    console.error(chalk.red('\\n[!] Invalid key. Gemini keys start with "AIza"\\n'));
    process.exit(1);
  }
  saveGlobalKey(opts.setKey);
  console.log(chalk.green(\`\\n[+] API key saved to \${GLOBAL_KEY_PATH}\\n\`));
  process.exit(0);
}

// Handle --delete-key
if (opts.deleteKey) {
  const deleted = deleteGlobalKey();
  if (deleted) {
    console.log(chalk.green(\`\\n[+] Saved API key deleted from \${GLOBAL_KEY_PATH}\\n\`));
    console.log(chalk.gray('    The key in your .env or shell config is NOT affected.\\n'));
  } else {
    console.log(chalk.yellow('\\n[~] No saved key found — nothing to delete.\\n'));
  }
  process.exit(0);
}

const { projectPath, output, focusAreas, modelId } = opts;

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(boxen(
  chalk.bold.cyan('devauditai') + chalk.gray(\` v\${VERSION}\`) + '\\n' +
  chalk.gray('AI-powered code review agent · Free'),
  { padding: 1, margin: { top: 1, bottom: 0, left: 1, right: 1 }, borderStyle: 'round', borderColor: 'cyan' }
));

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {

  // ── Step 1: Resolve API key ────────────────────────────────────────────────
  let apiKeyInfo = resolveApiKey();

  if (apiKeyInfo) {
    console.log(\`\\n  \${chalk.green('[+]')}  API key loaded from \${chalk.cyan(apiKeyInfo.source)}\`);
    process.env.GEMINI_API_KEY = apiKeyInfo.key;
  } else {
    // No key found — ask user via terminal
    await askForApiKey();
  }

  // ── Step 2: Show project info ──────────────────────────────────────────────
  console.log('');
  console.log(\`  \${chalk.bold('Path')}    \${chalk.yellow(projectPath)}\`);
  console.log(\`  \${chalk.bold('Focus')}   \${chalk.cyan(focusAreas.join(', '))}\`);
  console.log(\`  \${chalk.bold('Output')}  \${chalk.cyan(output)}\`);
  console.log('');

  // ── Step 3: Select model ───────────────────────────────────────────────────
  let selectedModel;
  if (modelId) {
    selectedModel = MODELS.find(m => m.id === modelId);
    console.log(\`  \${chalk.green('[+]')}  Using model: \${selectedModel.color.bold(selectedModel.name)}\\n\`);
  } else {
    selectedModel = await selectModel();
  }

  // ── Step 4: Scan project ───────────────────────────────────────────────────
  const spinner = ora('Scanning project files...').start();
  let project;
  try {
    project = await collectProjectFiles(projectPath);
    spinner.succeed(
      \`Scanned \${chalk.cyan(project.files.length)} files · \` +
      \`\${chalk.yellow(project.totalLines.toLocaleString())} lines · \` +
      \`Next.js \${chalk.green(project.meta.nextVersion)} \${chalk.gray('(' + project.meta.router + ')')}\`
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
  console.error(chalk.red('\\n[!] Unexpected error: ') + err.message);
  process.exit(1);
});
`;

const CORRECT_AGENT = `import chalk from 'chalk';
import ora from 'ora';
import { TOOL_DEFINITIONS, executeTool } from '../tools/tools.js';

async function geminiChat(url, messages, tools, systemInstruction) {
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    tools,
    generation_config: { temperature: 0.2, max_output_tokens: 65536 },
    contents: messages,
  };
  const MAX_RETRIES = 6;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const errBody = await res.json().catch(() => ({}));
    const msg  = errBody?.error?.message || res.statusText;
    const code = res.status;
    if ((code === 503 || code === 429) && attempt < MAX_RETRIES) {
      const isTokenLimit = msg.includes('token') || msg.includes('quota');
      const base = isTokenLimit ? 60 : 15;
      const wait = base * attempt;
      process.stdout.write(chalk.yellow(\`\\n  [~] Rate limited (\${code}), waiting \${wait}s before retry... (\${attempt}/\${MAX_RETRIES})\\n\`));
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error(\`Gemini API \${code}: \${msg}\`);
  }
  throw new Error(\`Gemini API failed after \${MAX_RETRIES} retries. Please try again in a few minutes.\`);
}

async function sleep(ms) { await new Promise(r => setTimeout(r, ms)); }

function toGeminiTools(defs) {
  return [{ functionDeclarations: defs.map(t => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
}

const PHASE_COLORS = { think: chalk.magenta, act: chalk.cyan, observe: chalk.green, final: chalk.yellow };
const PHASE_ICONS  = { think: '[THINK]', act: '[ACT]', observe: '[OBSERVE]', final: '[FINAL]' };
function log(phase, msg) {
  const color = PHASE_COLORS[phase] || chalk.white;
  const icon  = PHASE_ICONS[phase]  || '•';
  console.log(color(\`\\n\${icon} \`) + chalk.gray(msg));
}

function buildSystemPrompt(project, focusAreas) {
  const { meta, files } = project;
  const filePaths = files.map(f => f.path).join('\\n  ');
  return \`You are an expert Next.js code reviewer and senior software architect.
You have deep knowledge of Next.js 13/14/15 (App Router & Pages Router), React best practices,
web performance, SEO, accessibility (WCAG 2.1), and security (OWASP Top 10).

PROJECT CONTEXT:
- Next.js version: \${meta.nextVersion}
- Router: \${meta.router}
- TypeScript: \${meta.typescript}
- Tailwind: \${meta.tailwind}
- Prisma: \${meta.prisma}
- Auth library: \${meta.auth}
- Total dependencies: \${meta.totalDeps}
- Total files scanned: \${files.length}

FILES IN PROJECT:
  \${filePaths}

REVIEW AREAS REQUESTED: \${focusAreas.join(', ')}

YOUR JOB:
Use the available analysis tools in a ReAct loop. For each focus area:
1. THINK about which files are most relevant to that area
2. ACT by calling the appropriate tool with the most relevant file paths
3. OBSERVE the tool result and extract real issues
4. Repeat for each focus area
5. Synthesise everything into a structured final report

After calling all relevant tools, produce a comprehensive JSON report in this exact format:
{
  "summary": { "overall_score": 72, "critical_issues": 3, "warnings": 8, "suggestions": 12, "verdict": "one sentence overall verdict" },
  "areas": {
    "code_quality":  { "score": 80, "issues": [] },
    "seo":           { "score": 45, "issues": [] },
    "performance":   { "score": 60, "issues": [] },
    "security":      { "score": 90, "issues": [] },
    "accessibility": { "score": 55, "issues": [] }
  },
  "top_priorities": ["3-5 most important things to fix first"],
  "quick_wins":     ["3-5 easy fixes that have high impact"]
}
Each issue must follow this exact shape:
{
  "severity": "critical|warning|suggestion",
  "title": "Short clear title",
  "file": "relative/path/to/file.tsx",
  "description": "What the problem is and why it matters",
  "pros": ["Benefit 1 if you fix this", "Benefit 2 if you fix this"],
  "cons": ["Limitation 1 if you do NOT fix this", "Limitation 2 if you do NOT fix this"],
  "fix": "Exact code snippet or clear step-by-step instructions to fix it"
}
pros = real benefits if fixed: performance gain, SEO boost, better UX, security improvement.
cons = real consequences if ignored: slower site, security risk, poor ranking, bad UX.
fix  = be specific with real code snippets when possible.
Output ONLY the final JSON — no markdown fences, no preamble.\`;
}

export async function runReviewAgent(project, focusAreas, modelId = 'gemini-2.0-flash') {
  const systemPrompt = buildSystemPrompt(project, focusAreas);
  const apiKey       = process.env.GEMINI_API_KEY;
  const geminiTools  = toGeminiTools(TOOL_DEFINITIONS);
  const messages     = [];
  const MODEL_URL    = \`https://generativelanguage.googleapis.com/v1beta/models/\${modelId}:generateContent?key=\${apiKey}\`;

  messages.push({
    role: 'user',
    parts: [{ text: \`Please review my Next.js project.\\nFocus areas: \${focusAreas.join(', ')}.\\nTotal files available: \${project.files.length}\\nTotal lines: \${project.totalLines.toLocaleString()}\\n\\nStart with your analysis. Use all the tools you need. Be thorough.\` }],
  });

  console.log(\`\\n── ReAct Loop Starting (\${modelId}) ───────\\n\`);

  let stepCount = 0, toolCallCount = 0;
  const MAX_STEPS = 20;

  while (stepCount < MAX_STEPS) {
    stepCount++;
    const spinner = ora({ text: \`Agent reasoning... (step \${stepCount})\`, color: 'cyan' }).start();
    let data;
    try {
      if (stepCount > 1) await sleep(5000);
      data = await geminiChat(MODEL_URL, messages, geminiTools, systemPrompt);
    } catch (err) {
      spinner.fail('Gemini API error: ' + err.message);
      throw err;
    }
    spinner.stop();

    const candidate     = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates.');
    const parts         = candidate.content?.parts || [];
    const textParts     = parts.filter(p => p.text);
    const funcCallParts = parts.filter(p => p.functionCall);
    messages.push({ role: 'model', parts });

    if (funcCallParts.length === 0) {
      const finalText = textParts.map(p => p.text).join('');
      log('final', \`Report complete after \${toolCallCount} tool calls, \${stepCount} steps\`);
      return parseAgentOutput(finalText, toolCallCount, stepCount, modelId);
    }

    for (const part of textParts) {
      log('think', part.text.slice(0, 120).replace(/\\n/g, ' ') + (part.text.length > 120 ? '...' : ''));
    }

    const responseParts = [];
    for (const part of funcCallParts) {
      const { name, args } = part.functionCall;
      toolCallCount++;
      log('act', \`\${name}() -> files: [\${(args.files || []).slice(0, 4).join(', ')}\${(args.files || []).length > 4 ? '...' : ''}]\`);
      const toolResult = executeTool(name, args, project);
      log('observe', toolResult.slice(0, 100).replace(/\\n/g, ' ') + '...');
      responseParts.push({ functionResponse: { name, response: { result: toolResult } } });
    }
    messages.push({ role: 'user', parts: responseParts });
  }
  throw new Error('Agent exceeded maximum steps without producing a report.');
}

function parseAgentOutput(text, toolCalls, steps, modelId) {
  const clean = text.replace(/\`\`\`json|\`\`\`/g, '').trim();
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Agent did not return valid JSON.\\n\\nRaw:\\n' + text.slice(0, 500));
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return { ...parsed, _meta: { toolCalls, steps, model: modelId } };
  } catch (err) {
    throw new Error('Failed to parse agent JSON: ' + err.message);
  }
}
`;

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

// Old binary paths to remove (Mac/Linux)
const oldBinaries = [
  '/usr/local/bin/review',
  '/usr/bin/review',
  '/usr/local/bin/devauditai',
  '/usr/bin/devauditai',
];

// Old package names to uninstall
const oldPackages = ['nextjs-review-agent', 'devauditai'];

if (!isWindows) {
  // Remove old binary files
  for (const bin of oldBinaries) {
    run(`sudo rm -f "${bin}" 2>/dev/null || rm -f "${bin}" 2>/dev/null`);
  }

  // Also remove from nvm bin if exists
  const nvmBin = run(`dirname "$(which npm)" 2>/dev/null`).stdout?.toString().trim();
  if (nvmBin) {
    run(`rm -f "${nvmBin}/review" 2>/dev/null`);
    run(`rm -f "${nvmBin}/devauditai" 2>/dev/null`);
  }
} else {
  // Windows — remove old cmd wrappers
  const winBin = run(`npm bin -g 2>/dev/null`).stdout?.toString().trim();
  if (winBin) {
    run(`del /f "${winBin}\\review.cmd" 2>nul`);
    run(`del /f "${winBin}\\devauditai.cmd" 2>nul`);
  }
}

// Uninstall old global packages silently
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

// ─── Step 6: Sync files to global location ────────────────────────────────────
console.log('');
bold('  Step 6  Ensuring correct files in global install...');

if (existsSync(globalDir)) {
  const globalCli   = join(globalDir, 'src', 'cli.js');
  const globalAgent = join(globalDir, 'src', 'agent', 'agent.js');

  if (globalCli !== cliPath) {
    writeFileSync(globalCli,   CORRECT_CLI,   'utf8');
    writeFileSync(globalAgent, CORRECT_AGENT, 'utf8');
    if (!isWindows) { chmodSync(globalCli, '755'); chmodSync(globalAgent, '755'); }
  }

  const others = [
    'src/reporters/reporter.js',
    'src/tools/tools.js',
    'src/utils/collector.js',
  ];
  for (const f of others) {
    try { copyFileSync(join(__dirname, f), join(globalDir, f)); } catch {}
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
