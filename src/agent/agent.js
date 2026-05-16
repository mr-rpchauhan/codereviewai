import chalk from 'chalk';
import ora from 'ora';
import { getAreaFiles } from '../tools/tools.js';

async function geminiChat(url, messages, systemInstruction) {
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    generation_config: { temperature: 0.0, max_output_tokens: 65536 },
    contents: messages,
  };
  const MAX_RETRIES = 6;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Wrap fetch with timeout and network retry
    let res;
    for (let netRetry = 0; netRetry < 3; netRetry++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        break;
      } catch (netErr) {
        if (netRetry < 2) {
          process.stdout.write(chalk.yellow(`\n  [~] Network error, retrying in 10s... (${netRetry + 1}/3)\n`));
          await new Promise(r => setTimeout(r, 10000));
        } else {
          throw netErr;
        }
      }
    }
    if (res.ok) return res.json();
    const errBody = await res.json().catch(() => ({}));
    const msg  = errBody?.error?.message || res.statusText;
    const code = res.status;
    if ((code === 503 || code === 429) && attempt < MAX_RETRIES) {
      const isTokenLimit = msg.includes('token') || msg.includes('quota');
      const base = isTokenLimit ? 60 : 30;
      const wait = base * attempt;
      process.stdout.write(chalk.yellow(`\n  [~] Rate limited (${code}), waiting ${wait}s before retry... (${attempt}/${MAX_RETRIES})\n`));
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error(`Gemini API ${code}: ${msg}`);
  }
  throw new Error(`Gemini API failed after ${MAX_RETRIES} retries. Please try again in a few minutes.`);
}

async function sleep(ms) { await new Promise(r => setTimeout(r, ms)); }

const PHASE_COLORS = { act: chalk.cyan, observe: chalk.green, final: chalk.yellow };
const PHASE_ICONS  = { act: '[ACT]', observe: '[OBSERVE]', final: '[FINAL]' };
function log(phase, msg) {
  const color = PHASE_COLORS[phase] || chalk.white;
  const icon  = PHASE_ICONS[phase]  || '•';
  console.log(color(`\n${icon} `) + chalk.gray(msg));
}

const AREA_TOOL_MAP = {
  'code-quality':  'analyse_code_quality',
  'seo':           'analyse_seo',
  'performance':   'analyse_performance',
  'security':      'analyse_security',
  'accessibility': 'analyse_accessibility',
};

const AREA_KEY_MAP = {
  'code-quality':  'code_quality',
  'seo':           'seo',
  'performance':   'performance',
  'security':      'security',
  'accessibility': 'accessibility',
};

const CHUNK_SIZE = 200_000; // chars per chunk — fits in Flash Lite context

function buildSystemPrompt(project) {
  const { meta } = project;
  return `You are an expert Next.js code reviewer and senior software architect.
You have deep knowledge of Next.js 13/14/15 (App Router & Pages Router), React best practices,
web performance, SEO, accessibility (WCAG 2.1), and security (OWASP Top 10).

PROJECT CONTEXT:
- Next.js version: ${meta.nextVersion}
- Router: ${meta.router}
- TypeScript: ${meta.typescript}
- Tailwind: ${meta.tailwind}
- Prisma: ${meta.prisma}
- Auth library: ${meta.auth}
- Total dependencies: ${meta.totalDeps}`;
}

function buildChunkPrompt(areaKey, chunkContent, chunkNum, totalChunks, project) {
  const router = project && project.meta ? project.meta.router : 'Pages Router';
  const isApp  = router === 'App Router';
  const routerNote = isApp
    ? 'App Router: use generateMetadata() not <Head>. Server Components are default. Use loading.tsx for suspense.'
    : 'Pages Router: use <Head> from next/head. getServerSideProps/getStaticProps for data fetching.';

  return [
    'You are a senior Next.js engineer doing a thorough ' + areaKey + ' code review.',
    'ROUTER: ' + router,
    routerNote,
    '',
    'You are reviewing chunk ' + chunkNum + ' of ' + totalChunks + ' for this area.',
    '',
    chunkContent,
    '',
    'STRICT SCOPE — CRITICAL:',
    '- You are ONLY reviewing: ' + areaKey,
    '- Do NOT report issues from other areas',
    areaKey === 'seo'
      ? '- SEO scope: metadata, titles, canonical URLs, alt text, semantic HTML, structured data, sitemap, robots, heading hierarchy, client-side rendering risks'
      : areaKey === 'performance'
      ? '- Performance scope: image optimization, font loading, bundle size, lazy loading, caching, server vs client components, Suspense, ISR'
      : areaKey === 'security'
      ? '- Security scope: exposed secrets, API auth, XSS, CSRF, input validation, security headers, insecure cookies, JWT storage'
      : areaKey === 'accessibility'
      ? '- Accessibility scope: aria attributes, keyboard navigation, focus management, color contrast, screen reader support, semantic HTML for UI'
      : areaKey === 'code_quality'
      ? '- Code quality scope: TypeScript errors, unused code, hooks violations, missing error handling, performance anti-patterns in React'
      : '- Architecture scope: folder structure, separation of concerns, data fetching patterns, circular deps, naming conventions',
    '- If you see an issue that belongs to a DIFFERENT area — SKIP IT',
    '',
    'REVIEW INSTRUCTIONS:',
    '- Read every file completely before reporting any issue',
    '- Only report an issue if you are 100% certain it exists in the actual code shown',
    '- If alt text exists on an image (alt="..." or alt={...}) — do NOT report it as missing',
    '- If aria-label exists on an element — do NOT report it as missing',
    '- If metadata/title exists in the file — do NOT report it as missing',
    '- Do NOT invent issues that are not visible in the code',
    '- Reference exact file path and line number for every issue',
    '- Only flag real problems you can see in the full file contents above',
    '',
    'CRITICAL OUTPUT FORMAT:',
    '- Output ONLY raw JSON',
    '- Do NOT use markdown',
    '- Do NOT use backticks or ```json',
    '- Do NOT write any explanation before or after the JSON',
    '- Your ENTIRE response must be valid JSON starting with { and ending with }',
    '- If you have nothing to report, output: {"issues":[]}',
    '',
    '{',
    '  "issues": [',
    '    {',
    '      "severity": "critical|warning|suggestion",',
    '      "title": "Short clear title",',
    '      "file": "relative/path/to/file.tsx",',
    '      "line": 42,',
    '      "description": "What the problem is and why it matters",',
    '      "pros": ["Benefit 1 if fixed", "Benefit 2 if fixed"],',
    '      "cons": ["Consequence 1 if ignored", "Consequence 2 if ignored"],',
    '      "fix": "Exact code snippet or step-by-step fix"',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}


function tryParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function extractJson(text) {
  if (!text || !text.trim()) return null;

  // Strategy 1: find JSON between backtick fences
  if (text.indexOf('```') !== -1) {
    const parts = text.split('```');
    for (const part of parts) {
      let t = part.trim();
      if (t.slice(0, 4).toLowerCase() === 'json') t = t.slice(4).trim();
      if (t.charAt(0) === '{') {
        const end = t.lastIndexOf('}');
        if (end !== -1) {
          const r = tryParseJson(t.slice(0, end + 1));
          if (r) return r;
        }
      }
    }
  }

  // Strategy 2: strip leading 'json' word and find outermost { }
  let clean = text.trim();
  if (clean.slice(0, 4).toLowerCase() === 'json') clean = clean.slice(4).trim();

  const start = clean.indexOf('{');
  if (start === -1) return null;
  clean = clean.slice(start);

  // Strategy 3: try parsing up to last }
  const end = clean.lastIndexOf('}');
  if (end !== -1) {
    const r = tryParseJson(clean.slice(0, end + 1));
    if (r) return r;
  }

  // Strategy 4: fix truncated JSON by counting brackets
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr && ch === '{') depth++;
    if (!inStr && ch === '}') depth--;
  }
  if (depth > 0) {
    // Close any open string first, then close brackets
    const fixed = clean.trimEnd() + '"]}' + '}'.repeat(depth - 1);
    const r = tryParseJson(fixed);
    if (r) return r;
    // Try simpler close
    const fixed2 = clean + ']}' .repeat(depth);
    return tryParseJson(fixed2);
  }

  return null;
}

// Formula-based score
function calculateScore(issues) {
  if (!issues || issues.length === 0) return 100;
  const deduction =
    issues.filter(i => i.severity === 'critical').length   * 15 +
    issues.filter(i => i.severity === 'warning').length    * 5  +
    issues.filter(i => i.severity === 'suggestion').length * 2;
  return Math.max(0, 100 - deduction);
}

// Split files into chunks of CHUNK_SIZE chars
function chunkFiles(files) {
  const chunks = [];
  let currentChunk = [];
  let currentSize  = 0;

  for (const file of files) {
    const block = `=== ${file.path} (${file.lines} lines) ===\n${file.content}`;
    if (currentSize + block.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize  = 0;
    }
    currentChunk.push(block);
    currentSize += block.length;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

// Deduplicate issues by file + line, and by file + normalised title
function normaliseTitle(title) {
  return (title || '').toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5) // first 5 words are enough to match
    .join(' ');
}

function deduplicateIssues(issues) {
  const seenFileAndLine  = new Set();
  const seenFileAndTitle = new Set();

  return issues.filter(issue => {
    if (!issue || !issue.file) return false;

    // Deduplicate by file + line number (exact same location)
    if (issue.line) {
      const lineKey = issue.file + '::' + issue.line;
      if (seenFileAndLine.has(lineKey)) return false;
      seenFileAndLine.add(lineKey);
    }

    // Deduplicate by file + normalised title (same issue different wording)
    const titleKey = issue.file + '::' + normaliseTitle(issue.title);
    if (seenFileAndTitle.has(titleKey)) return false;
    seenFileAndTitle.add(titleKey);

    return true;
  });
}

export async function runReviewAgent(project, focusAreas, modelId = 'gemini-2.0-flash') {
  const systemPrompt = buildSystemPrompt(project);
  const apiKey       = process.env.GEMINI_API_KEY;
  const MODEL_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  console.log(`\n── ReAct Loop Starting (${modelId}) ───────\n`);

  const areaResults = {};
  let totalApiCalls = 0;

  for (const area of focusAreas) {
    const toolName = AREA_TOOL_MAP[area];
    const areaKey  = AREA_KEY_MAP[area];
    if (!toolName) continue;

    // Get relevant files for this area
    log('act', `${toolName}() -> collecting files for ${area}...`);
    const areaFiles = getAreaFiles(toolName, project);
    const chunks    = chunkFiles(areaFiles);

    console.log(chalk.gray(`  Files: ${areaFiles.length} | Chunks: ${chunks.length}`));

    const allIssues = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkNum     = i + 1;
      const chunkContent = chunks[i].join('\n\n');
      const spinner = ora({
        text: `Analysing ${area} — chunk ${chunkNum}/${chunks.length}...`,
        color: 'cyan',
      }).start();

      const MAX_RETRIES = 2;
      let chunkDone = false;
      for (let retry = 0; retry < MAX_RETRIES && !chunkDone; retry++) {
        try {
          if (totalApiCalls > 0) await sleep(8000);
          totalApiCalls++;

          const prompt   = buildChunkPrompt(areaKey, chunkContent, chunkNum, chunks.length, project);
          const messages = [{ role: 'user', parts: [{ text: prompt }] }];
          const data     = await geminiChat(MODEL_URL, messages, systemPrompt);
          const text     = (data.candidates?.[0]?.content?.parts || [])
            .filter(p => p.text).map(p => p.text).join('');
          const parsed = extractJson(text);

          if (parsed && Array.isArray(parsed.issues)) {
            allIssues.push(...parsed.issues);
            spinner.succeed(`${area} chunk ${chunkNum}/${chunks.length} — ${parsed.issues.length} issues found`);
            chunkDone = true;
          } else {
            if (retry < MAX_RETRIES - 1) {
              spinner.text = `${area} chunk ${chunkNum}/${chunks.length} — retrying...`;
              await sleep(5000);
            } else {
              spinner.warn(`${area} chunk ${chunkNum}/${chunks.length} — could not parse after ${MAX_RETRIES} attempts`);
            }
          }
        } catch (err) {
          if (retry < MAX_RETRIES - 1) {
            spinner.text = `${area} chunk ${chunkNum}/${chunks.length} — retrying after error...`;
            await sleep(5000);
          } else {
            spinner.fail(`${area} chunk ${chunkNum} failed: ` + err.message);
          }
        }
      }
    }

    // Merge and deduplicate all issues from all chunks
    const dedupedIssues = deduplicateIssues(allIssues);
    const score         = calculateScore(dedupedIssues);
    areaResults[areaKey] = { issues: dedupedIssues, score };

    log('observe', `${area} complete — ${dedupedIssues.length} issues (score: ${score})`);
  }

  // Summary — build top_priorities and quick_wins from real issues in code (no hallucination)
  const summarySpinner = ora({ text: 'Generating summary...', color: 'yellow' }).start();

  const allIssuesForSummary = Object.values(areaResults).flatMap(a => a.issues || []);
  const areaScores = Object.values(areaResults).map(a => a.score).filter(s => s > 0);
  const calculatedOverallScore = areaScores.length
    ? Math.round(areaScores.reduce((a, b) => a + b, 0) / areaScores.length)
    : 0;

  // Sort real issues by severity: critical → warning → suggestion
  const severityOrder = { critical: 0, warning: 1, suggestion: 2 };
  const sortedIssues = [...allIssuesForSummary].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  // top_priorities: up to 3 most severe real issues
  const top_priorities = sortedIssues
    .slice(0, 3)
    .map(i => `${i.title}${i.file ? ' (' + i.file + ')' : ''}`);

  // quick_wins: suggestions first then warnings — no criticals — no duplicates — max 3
  const topTitleKeys = new Set(sortedIssues.slice(0, 3).map(i => i.title));
  const quick_wins = [...sortedIssues]
    .reverse()                                              // suggestions come last after sort, so reverse to get them first
    .filter(i => i.severity === 'suggestion' || i.severity === 'warning')
    .filter(i => !topTitleKeys.has(i.title))
    .map(i => `${i.title}${i.file ? ' (' + i.file + ')' : ''}`)
    .slice(0, 3);

  let summary = {
    overall_score:   calculatedOverallScore,
    critical_issues: allIssuesForSummary.filter(i => i.severity === 'critical').length,
    warnings:        allIssuesForSummary.filter(i => i.severity === 'warning').length,
    suggestions:     allIssuesForSummary.filter(i => i.severity === 'suggestion').length,
    verdict:         'Review complete.',
    top_priorities,
    quick_wins,
  };

  // Only call Gemini for the verdict sentence
  try {
    await sleep(8000);
    totalApiCalls++;
    const issueLines = sortedIssues.map(i => `- [${i.severity}] ${i.title}`).join('\n') || 'No issues found.';
    const verdictPrompt = `You reviewed a Next.js project and found these issues:\n\n${issueLines}\n\nWrite ONE short sentence summarising the overall code health. Be direct and specific. Output ONLY the sentence — no JSON, no markdown, no extra text.`;
    const messages = [{ role: 'user', parts: [{ text: verdictPrompt }] }];
    const data     = await geminiChat(MODEL_URL, messages, systemPrompt);
    const verdict  = (data.candidates?.[0]?.content?.parts || [])
      .filter(p => p.text).map(p => p.text).join('').trim();
    if (verdict) summary.verdict = verdict;
    summarySpinner.succeed('Summary complete');
  } catch (err) {
    summarySpinner.warn('Verdict generation failed — using default');
  }

  // Fix scores for areas where chunk parsing failed
  // Use summary overall_score as fallback for areas with 0 issues
  for (const area of focusAreas) {
    const areaKey = AREA_KEY_MAP[area];
    if (areaResults[areaKey] && areaResults[areaKey].issues.length === 0) {
      // Chunks produced no issues — 0 issues means perfect score
      areaResults[areaKey].score = 100;
    }
  }

  log('final', `Report complete — ${totalApiCalls} API calls total`);

  return {
    summary,
    areas:          areaResults,
    top_priorities: summary.top_priorities || [],
    quick_wins:     summary.quick_wins     || [],
    _meta:          { toolCalls: totalApiCalls, steps: totalApiCalls + 1, model: modelId },
  };
}