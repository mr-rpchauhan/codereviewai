import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';

const AREA_CONFIG = {
  code_quality:  { label: 'Code Quality',  short: 'Code Quality',  tag: 'CODE' },
  seo:           { label: 'SEO',            short: 'SEO',           tag: 'SEO'  },
  performance:   { label: 'Performance',    short: 'Performance',   tag: 'PERF' },
  security:      { label: 'Security',       short: 'Security',      tag: 'SEC'  },
  accessibility: { label: 'Accessibility',  short: 'Accessibility', tag: 'A11Y' },
};

const SEV = {
  critical:   { label: '[!] MUST FIX',   color: chalk.red.bold    },
  warning:    { label: '[~] SHOULD FIX', color: chalk.yellow.bold  },
  suggestion: { label: '[i] CONSIDER',   color: chalk.cyan.bold    },
};

function sev(s) { return SEV[s] || SEV.suggestion; }

function getGrade(n) {
  if (n >= 90) return { grade: 'A', label: 'Excellent', color: chalk.bold.green  };
  if (n >= 75) return { grade: 'B', label: 'Good',      color: chalk.bold.green  };
  if (n >= 50) return { grade: 'C', label: 'Fair',      color: chalk.bold.yellow };
  if (n >= 25) return { grade: 'D', label: 'Poor',      color: chalk.bold.red    };
  return              { grade: 'F', label: 'Critical',  color: chalk.bold.red    };
}

function gradeColor(n) {
  const { grade, label, color } = getGrade(n);
  return color(`${grade} — ${label}`);
}

function scoreBar(n, width = 20) {
  const filled = Math.round((n / 100) * width);
  const empty  = width - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  const { grade } = getGrade(n);
  if (grade === 'A' || grade === 'B') return chalk.green(bar);
  if (grade === 'C') return chalk.yellow(bar);
  return chalk.red(bar);
}

function scoreStatusMd(n) {
  const { grade, label } = getGrade(n);
  return `${grade} — ${label}`;
}

// Strip ANSI escape codes to get visible length
function visibleLength(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '').length;
}

// Pad a colored string to a target visible width
function padColored(coloredStr, targetWidth) {
  const visible = visibleLength(coloredStr);
  const pad = Math.max(0, targetWidth - visible);
  return coloredStr + ' '.repeat(pad);
}

const W = 62;
function heavyLine() { return chalk.gray('━'.repeat(W)); }
function thinLine()  { return chalk.gray('─'.repeat(W)); }

function printConsoleReport(result) {
  let { summary, areas, top_priorities, quick_wins, _meta } = result;

  for (const [key, area] of Object.entries(areas || {})) {
    if (area && area.issues && area.issues.length > 0 && area.score === 0) {
      const deduction =
        area.issues.filter(i => i.severity === 'critical').length   * 15 +
        area.issues.filter(i => i.severity === 'warning').length    * 5  +
        area.issues.filter(i => i.severity === 'suggestion').length * 2;
      area.score = Math.max(0, 100 - deduction);
    }
  }

  const areaScores = Object.values(areas || {}).map(a => a.score).filter(s => s > 0);
  if (areaScores.length > 0) {
    summary.overall_score = Math.round(areaScores.reduce((a, b) => a + b, 0) / areaScores.length);
  }

  const allIssues = Object.values(areas || {}).flatMap(a => a.issues || []);
  if (allIssues.length > 0) {
    summary.critical_issues = allIssues.filter(i => i.severity === 'critical').length;
    summary.warnings        = allIssues.filter(i => i.severity === 'warning').length;
    summary.suggestions     = allIssues.filter(i => i.severity === 'suggestion').length;
  }

  const projectName = path.basename(process.cwd());
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  console.log('\n');
  console.log(chalk.bold.white('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.bold.white('║') + chalk.bold.cyan('              Next.js Project Health Report'.padEnd(W)) + chalk.bold.white('║'));
  console.log(chalk.bold.white('║') + chalk.gray(`         ${projectName}  ·  ${date}`.padEnd(W)) + chalk.bold.white('║'));
  console.log(chalk.bold.white('╚' + '═'.repeat(W) + '╝'));
  console.log('');

  const overallGrade = getGrade(summary.overall_score);
  console.log(`  ${chalk.bold('Grade')}            ${overallGrade.color(overallGrade.grade + ' — ' + overallGrade.label)}`);
  console.log(`  ${scoreBar(summary.overall_score, 32)}`);
  console.log('');
  console.log(
    `  ${chalk.red.bold(`[!] ${summary.critical_issues} Must Fix`)}` +
    `      ${chalk.yellow.bold(`[~] ${summary.warnings} Should Fix`)}` +
    `      ${chalk.cyan.bold(`[i] ${summary.suggestions} Consider`)}`
  );
  console.log('\n');

  // Score breakdown
  // Column visible widths: area=26, bar=22, grade=15 → total inner = 65
  const TW = 65; // actual table width: 26 + 1(│) + 22 + 1(│) + 15
  console.log(chalk.bold.white('┌' + '─'.repeat(TW) + '┐'));
  console.log(chalk.bold.white('│') + chalk.bold.white('  SCORE BREAKDOWN'.padEnd(TW)) + chalk.bold.white('│'));
  console.log(chalk.bold.white('├──────────────────────────┬──────────────────────┬───────────────┤'));
  console.log(chalk.bold.white('│') + chalk.gray('  Area                    │ Health Bar           │ Grade         ') + chalk.bold.white('│'));
  console.log(chalk.bold.white('├──────────────────────────┼──────────────────────┼───────────────┤'));

  for (const [key, cfg] of Object.entries(AREA_CONFIG)) {
    const area = areas?.[key];
    if (!area) continue;

    // Col 1: area name — 26 visible chars
    const areaCol = ('  ' + cfg.short).padEnd(26);

    // Col 2: health bar — always exactly 22 visible chars (1 space + 20 bar + 1 space)
    const barWidth  = 20;
    const filled    = Math.round(area.score / 100 * barWidth);
    const empty     = barWidth - filled;
    const rawBar    = '█'.repeat(filled) + '░'.repeat(empty); // exactly 20 visible chars
    const { grade, label, color } = getGrade(area.score);
    const coloredBar = grade === 'A' || grade === 'B' ? chalk.green(rawBar)
                     : grade === 'C'                  ? chalk.yellow(rawBar)
                     :                                  chalk.red(rawBar);

    // Col 3: grade — 15 visible chars (1 space + label + padding)
    const gradeStr = `${grade} — ${label}`;           // e.g. "A — Excellent" = 13 chars
    const gradePad = ' '.repeat(Math.max(0, 14 - gradeStr.length));

    // Build row: use padColored so ANSI codes never affect column widths
    const row =
      '│' + padColored(chalk.white(areaCol), 26) +
      '│' + ' ' + coloredBar + ' ' +               // raw bar is exactly 20 visible chars
      '│' + padColored(' ' + color(gradeStr), 15) +
      '│';

    console.log(row);
  }

  console.log(chalk.bold.white('└──────────────────────────┴──────────────────────┴───────────────┘'));
  console.log('');

  for (const [key, cfg] of Object.entries(AREA_CONFIG)) {
    const area = areas?.[key];
    if (!area?.issues?.length) continue;
    console.log('\n');
    console.log(heavyLine());
    console.log(
      chalk.bold.white(`  [${cfg.tag}]  ${cfg.label}`) +
      chalk.gray(`          Grade: `) + gradeColor(area.score)
    );
    console.log(heavyLine());
    console.log('');
    area.issues.forEach((issue, idx) => {
      const s = sev(issue.severity);
      const leftPart   = chalk.bold.white(`  Issue ${idx + 1} of ${area.issues.length}`);
      const rightPart  = s.color(s.label);
      const leftClean  = `  Issue ${idx + 1} of ${area.issues.length}`;
      const rightClean = s.label;
      const spaces     = ' '.repeat(Math.max(1, W - leftClean.length - rightClean.length));
      console.log(leftPart + spaces + rightPart);
      console.log(thinLine());
      console.log(`  ${chalk.bold('Title')}      ${chalk.white(issue.title)}`);
      if (issue.file) console.log(`  ${chalk.bold('File')}       ${chalk.cyan(issue.file)}`);
      console.log('');
      console.log(`  ${chalk.bold.white('Problem')}`);
      const descWords = issue.description.split(' ');
      let line = '  ';
      descWords.forEach(word => {
        if ((line + word).length > W - 2) { console.log(line); line = '  ' + word + ' '; }
        else line += word + ' ';
      });
      if (line.trim()) console.log(line);
      if (issue.pros?.length) {
        console.log('');
        console.log(`  ${chalk.bold.green('If You Fix This')}`);
        issue.pros.forEach(p => console.log(`    ${chalk.green('+')}  ${p}`));
      }
      if (issue.cons?.length) {
        console.log('');
        console.log(`  ${chalk.bold.red('If You Ignore This')}`);
        issue.cons.forEach(c => console.log(`    ${chalk.red('-')}  ${c}`));
      }
      if (issue.fix) {
        console.log('');
        console.log(`  ${chalk.bold.cyan('How To Fix')}`);
        issue.fix.split('\n').forEach(fl => console.log(`    ${chalk.cyan(fl)}`));
      }
      console.log('');
      console.log(thinLine());
      console.log('');
    });
  }

  if (top_priorities?.length) {
    console.log('');
    console.log(chalk.bold.white('┌' + '─'.repeat(W) + '┐'));
    console.log(chalk.bold.white('│') + chalk.bold.red('  [!]  FIX THESE FIRST'.padEnd(W)) + chalk.bold.white('│'));
    console.log(chalk.bold.white('│') + chalk.gray('  Highest impact on your project right now'.padEnd(W)) + chalk.bold.white('│'));
    console.log(chalk.bold.white('├' + '─'.repeat(W) + '┤'));
    top_priorities.forEach((p, i) => {
      const prefix = `  ${i + 1}.  `;
      const words = p.split(' ');
      let line = prefix;
      words.forEach(word => {
        if ((line + word).length > W - 1) {
          console.log(chalk.bold.white('│') + chalk.white(line.padEnd(W)) + chalk.bold.white('│'));
          line = ' '.repeat(prefix.length) + word + ' ';
        } else line += word + ' ';
      });
      if (line.trim()) console.log(chalk.bold.white('│') + chalk.white(line.trimEnd().padEnd(W)) + chalk.bold.white('│'));
    });
    console.log(chalk.bold.white('└' + '─'.repeat(W) + '┘'));
    console.log('');
  }

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
        } else line += word + ' ';
      });
      if (line.trim()) console.log(chalk.bold.white('│') + chalk.white(line.trimEnd().padEnd(W)) + chalk.bold.white('│'));
    });
    console.log(chalk.bold.white('└' + '─'.repeat(W) + '┘'));
    console.log('');
  }

  console.log(chalk.gray(
    `  Analysed by Next.js Review Agent  ·  ` +
    `Model: ${_meta?.model || 'gemini'}  ·  ` +
    `${_meta?.toolCalls || '?'} tool calls  ·  ` +
    `${_meta?.steps || '?'} reasoning steps\n`
  ));
  console.log(
    chalk.gray('  ─────────────────────────────────────────────────────────────────') + '\n' +
    chalk.gray('  ℹ  AI-powered analysis gets smarter with each run.') + '\n' +
    chalk.gray('     Run the same phase again to discover additional insights.') + '\n' +
    chalk.gray('     Start with [!] Must Fix issues for the highest impact on your project.')
  );
}

function buildMarkdownReport(result, projectPath) {
  let { summary, areas, top_priorities, quick_wins, _meta } = result;

  for (const [key, area] of Object.entries(areas || {})) {
    if (area && area.issues && area.issues.length > 0 && area.score === 0) {
      const deduction =
        area.issues.filter(i => i.severity === 'critical').length   * 15 +
        area.issues.filter(i => i.severity === 'warning').length    * 5  +
        area.issues.filter(i => i.severity === 'suggestion').length * 2;
      area.score = Math.max(0, 100 - deduction);
    }
  }

  const areaScores2 = Object.values(areas || {}).map(a => a.score).filter(s => s > 0);
  if (areaScores2.length > 0) {
    summary.overall_score = Math.round(areaScores2.reduce((a, b) => a + b, 0) / areaScores2.length);
  }
  const allIssues2 = Object.values(areas || {}).flatMap(a => a.issues || []);
  if (allIssues2.length > 0) {
    summary.critical_issues = allIssues2.filter(i => i.severity === 'critical').length;
    summary.warnings        = allIssues2.filter(i => i.severity === 'warning').length;
    summary.suggestions     = allIssues2.filter(i => i.severity === 'suggestion').length;
  }

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

## Grade: ${scoreStatusMd(summary.overall_score)}

| Priority | Count |
|----------|-------|
| [!] Must Fix | ${summary.critical_issues} |
| [~] Should Fix | ${summary.warnings} |
| [i] Consider | ${summary.suggestions} |

> _"${summary.verdict}"_

---

## Score Breakdown

| Area | Health | Grade |
|------|--------|-------|
${Object.entries(AREA_CONFIG).map(([key, cfg]) => {
  const area = areas?.[key];
  if (!area) return '';
  const filled = Math.round(area.score / 5);
  const empty  = 20 - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  return `| **${cfg.label}** | ${bar} | ${scoreStatusMd(area.score)} |`;
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

## [${cfg.tag}] ${cfg.label} — Grade: ${scoreStatusMd(area.score)}

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

> **✨ Pro Tip**
> Run the same phase again to uncover additional insights — AI analysis gets deeper with each review.
> Start with **[!] Must Fix** issues for the highest impact on your project.
> Your grade improves as you fix issues and re-run the analysis.

_Generated by Next.js Review Agent · ${date}_
`;

  return md;
}

export async function generateReport(result, outputMode, projectPath) {
  if (outputMode === 'console' || outputMode === 'both') {
    printConsoleReport(result);
  }

  if (outputMode === 'md' || outputMode === 'markdown' || outputMode === 'both') {
    const md = buildMarkdownReport(result, projectPath);
    const areaName = Object.keys(result.areas || {})[0] || 'review';
    const now = new Date();
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const timestamp = String(now.getDate()).padStart(2, '0') + '-' +
      MONTHS[now.getMonth()] + '-' +
      now.getFullYear() + '_' +
      String(now.getHours()).padStart(2, '0') + 'h' +
      String(now.getMinutes()).padStart(2, '0') + 'm' +
      String(now.getSeconds()).padStart(2, '0') + 's';
    const outPath = path.join(projectPath, areaName.replace(/_/g, '-') + '-report_' + timestamp + '.md');
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(chalk.green(`\n  Report saved  `) + chalk.cyan(outPath) + '\n');
  }

  if (outputMode === 'json') {
    const outPath = path.join(projectPath, 'review-report.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(chalk.green(`\n  Report saved  `) + chalk.cyan(outPath) + '\n');
  }
}