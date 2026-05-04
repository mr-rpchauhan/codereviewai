import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';

// ─── Area config ───────────────────────────────────────────────────────────────
const AREA_CONFIG = {
  code_quality:  { label: 'Code Quality',  short: 'Code Quality',  tag: 'CODE' },
  seo:           { label: 'SEO',            short: 'SEO',           tag: 'SEO'  },
  performance:   { label: 'Performance',    short: 'Performance',   tag: 'PERF' },
  security:      { label: 'Security',       short: 'Security',      tag: 'SEC'  },
  accessibility: { label: 'Accessibility',  short: 'Accessibility', tag: 'A11Y' },
};

// ─── Severity config ───────────────────────────────────────────────────────────
const SEV = {
  critical:   { label: '[!] MUST FIX',   color: chalk.red.bold    },
  warning:    { label: '[~] SHOULD FIX', color: chalk.yellow.bold  },
  suggestion: { label: '[i] CONSIDER',   color: chalk.cyan.bold    },
};

function sev(s) { return SEV[s] || SEV.suggestion; }

// ─── Score helpers ─────────────────────────────────────────────────────────────
function scoreColor(n) {
  if (n >= 80) return chalk.bold.green(n);
  if (n >= 60) return chalk.bold.yellow(n);
  return chalk.bold.red(n);
}

function scoreBar(n, width = 20) {
  const filled = Math.round((n / 100) * width);
  const bar = '#'.repeat(filled) + '-'.repeat(width - filled);
  if (n >= 80) return chalk.green(bar);
  if (n >= 60) return chalk.yellow(bar);
  return chalk.red(bar);
}

function scoreStatus(n) {
  if (n >= 90) return chalk.bold.green('Excellent');
  if (n >= 80) return chalk.bold.green('Good');
  if (n >= 60) return chalk.bold.yellow('Fair');
  if (n >= 40) return chalk.bold.red('Poor');
  return chalk.bold.red('Critical');
}

function scoreStatusMd(n) {
  if (n >= 90) return 'Excellent';
  if (n >= 80) return 'Good';
  if (n >= 60) return 'Fair';
  if (n >= 40) return 'Poor';
  return 'Critical';
}

// ─── Line helpers ──────────────────────────────────────────────────────────────
const W = 62; // report width
function heavyLine() { return chalk.gray('━'.repeat(W)); }
function thinLine()  { return chalk.gray('─'.repeat(W)); }
function padRight(str, len) {
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - clean.length));
}

// ─── Console reporter ──────────────────────────────────────────────────────────
function printConsoleReport(result) {
  const { summary, areas, top_priorities, quick_wins, _meta } = result;
  const projectName = path.basename(process.cwd());
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  console.log('\n');

  // ── Header ─────────────────────────────────────────────────────────────────
  console.log(chalk.bold.white('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.bold.white('║') + chalk.bold.cyan('              Next.js Project Health Report'.padEnd(W)) + chalk.bold.white('║'));
  console.log(chalk.bold.white('║') + chalk.gray(`         ${projectName}  ·  ${date}`.padEnd(W)) + chalk.bold.white('║'));
  console.log(chalk.bold.white('╚' + '═'.repeat(W) + '╝'));

  console.log('');

  // ── Overall score ──────────────────────────────────────────────────────────
  console.log(`  ${chalk.bold('Overall Score')}    ${scoreColor(summary.overall_score)} ${chalk.gray('/ 100')}`);
  console.log(`  ${scoreBar(summary.overall_score, 32)}`);
  console.log(`  ${chalk.bold('Status')}           ${scoreStatus(summary.overall_score)}`);
  console.log('');
  console.log(
    `  ${chalk.red.bold(`[!] ${summary.critical_issues} Must Fix`)}` +
    `      ${chalk.yellow.bold(`[~] ${summary.warnings} Should Fix`)}` +
    `      ${chalk.cyan.bold(`[i] ${summary.suggestions} Consider`)}`
  );

  console.log('\n');

  // ── Score breakdown table ──────────────────────────────────────────────────
  console.log(chalk.bold.white('┌' + '─'.repeat(W) + '┐'));
  console.log(chalk.bold.white('│') + chalk.bold.white('  SCORE BREAKDOWN'.padEnd(W)) + chalk.bold.white('│'));
  console.log(chalk.bold.white('├──────────────────────────┬──────────┬──────────────────────┬───────────┤'));
  console.log(chalk.bold.white('│') + chalk.gray('  Area                    │  Score   │ Health Bar           │ Status    ') + chalk.bold.white('│'));
  console.log(chalk.bold.white('├──────────────────────────┼──────────┼──────────────────────┼───────────┤'));

  for (const [key, cfg] of Object.entries(AREA_CONFIG)) {
    const area = areas?.[key];
    if (!area) continue;
    const areaCol   = ('  ' + cfg.short).padEnd(26);
    const scoreCol  = (`  ${area.score}/100`).padEnd(10);
    const barCol    = ' ' + scoreBar(area.score, 20) + ' ';
    const statusStr = area.score >= 90 ? 'Excellent'
      : area.score >= 80 ? 'Good'
      : area.score >= 60 ? 'Fair'
      : area.score >= 40 ? 'Poor'
      : 'Critical';
    const statusCol = ' ' + scoreStatus(area.score) + ' '.repeat(Math.max(0, 10 - statusStr.length));
    console.log(
      chalk.white('│') + chalk.white(areaCol) +
      chalk.white('│') + scoreColor(area.score) + '        ' +
      chalk.white('│') + barCol +
      chalk.white('│') + statusCol +
      chalk.white('│')
    );
  }

  console.log(chalk.bold.white('└──────────────────────────┴──────────┴──────────────────────┴───────────┘'));
  console.log('');

  // ── Issues per area ────────────────────────────────────────────────────────
  for (const [key, cfg] of Object.entries(AREA_CONFIG)) {
    const area = areas?.[key];
    if (!area?.issues?.length) continue;

    console.log('\n');
    console.log(heavyLine());
    console.log(
      chalk.bold.white(`  [${cfg.tag}]  ${cfg.label}`) +
      chalk.gray(`          Score: `) + scoreColor(area.score) + chalk.gray(' / 100')
    );
    console.log(heavyLine());
    console.log('');

    area.issues.forEach((issue, idx) => {
      const s = sev(issue.severity);

      // Issue number + severity — right aligned
      const leftPart  = chalk.bold.white(`  Issue ${idx + 1} of ${area.issues.length}`);
      const rightPart = s.color(s.label);
      const leftClean = `  Issue ${idx + 1} of ${area.issues.length}`;
      const rightClean = s.label;
      const spaces    = ' '.repeat(Math.max(1, W - leftClean.length - rightClean.length));
      console.log(leftPart + spaces + rightPart);
      console.log(thinLine());

      // Title
      console.log(`  ${chalk.bold('Title')}      ${chalk.white(issue.title)}`);

      // File
      if (issue.file) {
        console.log(`  ${chalk.bold('File')}       ${chalk.cyan(issue.file)}`);
      }

      console.log('');

      // Problem
      console.log(`  ${chalk.bold.white('Problem')}`);
      const descWords = issue.description.split(' ');
      let line = '  ';
      descWords.forEach(word => {
        if ((line + word).length > W - 2) {
          console.log(line);
          line = '  ' + word + ' ';
        } else {
          line += word + ' ';
        }
      });
      if (line.trim()) console.log(line);

      // If you fix this
      if (issue.pros?.length) {
        console.log('');
        console.log(`  ${chalk.bold.green('If You Fix This')}`);
        issue.pros.forEach(p => console.log(`    ${chalk.green('+')}  ${p}`));
      }

      // If you ignore this
      if (issue.cons?.length) {
        console.log('');
        console.log(`  ${chalk.bold.red('If You Ignore This')}`);
        issue.cons.forEach(c => console.log(`    ${chalk.red('-')}  ${c}`));
      }

      // How to fix
      if (issue.fix) {
        console.log('');
        console.log(`  ${chalk.bold.cyan('How To Fix')}`);
        issue.fix.split('\n').forEach(fl => {
          console.log(`    ${chalk.cyan(fl)}`);
        });
      }

      console.log('');
      console.log(thinLine());
      console.log('');
    });
  }

  // ── Fix these first ────────────────────────────────────────────────────────
  if (top_priorities?.length) {
    console.log('');
    console.log(chalk.bold.white('┌' + '─'.repeat(W) + '┐'));
    console.log(chalk.bold.white('│') + chalk.bold.red('  [!]  FIX THESE FIRST'.padEnd(W)) + chalk.bold.white('│'));
    console.log(chalk.bold.white('│') + chalk.gray('  Highest impact on your project right now'.padEnd(W)) + chalk.bold.white('│'));
    console.log(chalk.bold.white('├' + '─'.repeat(W) + '┤'));
    top_priorities.forEach((p, i) => {
      const prefix = `  ${i + 1}.  `;
      const maxLen = W - prefix.length;
      const words = p.split(' ');
      let line = prefix;
      words.forEach(word => {
        if ((line + word).length > W - 1) {
          console.log(chalk.bold.white('│') + chalk.white(line.padEnd(W)) + chalk.bold.white('│'));
          line = ' '.repeat(prefix.length) + word + ' ';
        } else {
          line += word + ' ';
        }
      });
      if (line.trim()) console.log(chalk.bold.white('│') + chalk.white(line.trimEnd().padEnd(W)) + chalk.bold.white('│'));
    });
    console.log(chalk.bold.white('└' + '─'.repeat(W) + '┘'));
    console.log('');
  }

  // ── Easy wins ──────────────────────────────────────────────────────────────
  if (quick_wins?.length) {
    console.log(chalk.bold.white('┌' + '─'.repeat(W) + '┐'));
    console.log(chalk.bold.white('│') + chalk.bold.green('  [+]  EASY WINS'.padEnd(W)) + chalk.bold.white('│'));
    console.log(chalk.bold.white('│') + chalk.gray('  Small changes, immediate improvements'.padEnd(W)) + chalk.bold.white('│'));
    console.log(chalk.bold.white('├' + '─'.repeat(W) + '┤'));
    quick_wins.forEach((w, i) => {
      const prefix = `  ${i + 1}.  `;
      const words = w.split(' ');
      let line = prefix;
      words.forEach(word => {
        if ((line + word).length > W - 1) {
          console.log(chalk.bold.white('│') + chalk.white(line.padEnd(W)) + chalk.bold.white('│'));
          line = ' '.repeat(prefix.length) + word + ' ';
        } else {
          line += word + ' ';
        }
      });
      if (line.trim()) console.log(chalk.bold.white('│') + chalk.white(line.trimEnd().padEnd(W)) + chalk.bold.white('│'));
    });
    console.log(chalk.bold.white('└' + '─'.repeat(W) + '┘'));
    console.log('');
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  console.log(chalk.gray(
    `  Analysed by Next.js Review Agent  ·  ` +
    `Model: ${_meta?.model || 'gemini'}  ·  ` +
    `${_meta?.toolCalls || '?'} tool calls  ·  ` +
    `${_meta?.steps || '?'} reasoning steps\n`
  ));
}

// ─── Markdown reporter ─────────────────────────────────────────────────────────
function buildMarkdownReport(result, projectPath) {
  const { summary, areas, top_priorities, quick_wins, _meta } = result;
  const projectName = path.basename(projectPath);
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sevLabel = {
    critical:   '[!] Must Fix',
    warning:    '[~] Should Fix',
    suggestion: '[i] Consider',
  };

  let md = `# Next.js Project Health Report

| | |
|---|---|
| **Project** | ${projectName} |
| **Path** | \`${projectPath}\` |
| **Date** | ${date} |
| **Model** | ${_meta?.model || 'gemini'} |
| **Analysis** | ${_meta?.toolCalls} tool calls · ${_meta?.steps} reasoning steps |

---

## Overall Score: ${summary.overall_score} / 100

**Status:** ${scoreStatusMd(summary.overall_score)}

| Priority | Count |
|----------|-------|
| [!] Must Fix | ${summary.critical_issues} |
| [~] Should Fix | ${summary.warnings} |
| [i] Consider | ${summary.suggestions} |

> _"${summary.verdict}"_

---

## Score Breakdown

| Area | Score | Health | Status |
|------|-------|--------|--------|
${Object.entries(AREA_CONFIG).map(([key, cfg]) => {
  const area = areas?.[key];
  if (!area) return '';
  const bar = '#'.repeat(Math.round(area.score / 5)) + '-'.repeat(20 - Math.round(area.score / 5));
  return `| **${cfg.label}** | ${area.score} / 100 | \`${bar}\` | ${scoreStatusMd(area.score)} |`;
}).filter(Boolean).join('\n')}

---

## Fix These First

> Highest impact on your project right now.

${(top_priorities || []).map((p, i) => `**${i + 1}.** ${p}`).join('\n\n')}

---

## Easy Wins

> Small changes, immediate improvements.

${(quick_wins || []).map((w, i) => `**${i + 1}.** ${w}`).join('\n\n')}

---

## Detailed Findings

${Object.entries(AREA_CONFIG).map(([key, cfg]) => {
  const area = areas?.[key];
  if (!area?.issues?.length) return '';

  return `---

## [${cfg.tag}] ${cfg.label} — ${area.score}/100 — ${scoreStatusMd(area.score)}

${area.issues.map((issue, idx) => {
  const sLabel = sevLabel[issue.severity] || '[i] Consider';
  return `### Issue ${idx + 1}: ${issue.title}

| | |
|---|---|
| **Priority** | ${sLabel} |
${issue.file ? `| **File** | \`${issue.file}\` |` : ''}

#### Problem

${issue.description}

${issue.pros?.length ? `#### If You Fix This

${issue.pros.map(p => `- ${p}`).join('\n')}

` : ''}${issue.cons?.length ? `#### If You Ignore This

${issue.cons.map(c => `- ${c}`).join('\n')}

` : ''}${issue.fix ? `#### How To Fix

\`\`\`
${issue.fix}
\`\`\`

` : ''}`;
}).join('\n---\n\n')}`;
}).filter(Boolean).join('\n\n')}

---

_Generated by Next.js Review Agent · ${date}_
`;

  return md;
}

// ─── Main export ───────────────────────────────────────────────────────────────
export async function generateReport(result, outputMode, projectPath) {
  printConsoleReport(result);

  if (outputMode === 'markdown' || outputMode === 'both' || outputMode === 'md') {
    const md = buildMarkdownReport(result, projectPath);
    const outPath = path.join(projectPath, 'review-report.md');
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(chalk.green(`\n  Report saved  `) + chalk.cyan(outPath) + '\n');
  }

  if (outputMode === 'json') {
    const outPath = path.join(projectPath, 'review-report.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(chalk.green(`\n  Report saved  `) + chalk.cyan(outPath) + '\n');
  }
}
