import chalk from 'chalk';
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
      process.stdout.write(chalk.yellow(`\n  [~] Rate limited (${code}), waiting ${wait}s before retry... (${attempt}/${MAX_RETRIES})\n`));
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error(`Gemini API ${code}: ${msg}`);
  }
  throw new Error(`Gemini API failed after ${MAX_RETRIES} retries. Please try again in a few minutes.`);
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
  console.log(color(`\n${icon} `) + chalk.gray(msg));
}

function buildSystemPrompt(project, focusAreas) {
  const { meta, files } = project;
  const filePaths = files.map(f => f.path).join('\n  ');
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
- Total dependencies: ${meta.totalDeps}
- Total files scanned: ${files.length}

FILES IN PROJECT:
  ${filePaths}

REVIEW AREAS REQUESTED: ${focusAreas.join(', ')}

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
Output ONLY the final JSON — no markdown fences, no preamble.`;
}

export async function runReviewAgent(project, focusAreas, modelId = 'gemini-2.0-flash') {
  const systemPrompt = buildSystemPrompt(project, focusAreas);
  const apiKey       = process.env.GEMINI_API_KEY;
  const geminiTools  = toGeminiTools(TOOL_DEFINITIONS);
  const messages     = [];
  const MODEL_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  messages.push({
    role: 'user',
    parts: [{ text: `Please review my Next.js project.\nFocus areas: ${focusAreas.join(', ')}.\nTotal files available: ${project.files.length}\nTotal lines: ${project.totalLines.toLocaleString()}\n\nStart with your analysis. Use all the tools you need. Be thorough.` }],
  });

  console.log(`\n── ReAct Loop Starting (${modelId}) ───────\n`);

  let stepCount = 0, toolCallCount = 0;
  const MAX_STEPS = 20;

  while (stepCount < MAX_STEPS) {
    stepCount++;
    const spinner = ora({ text: `Agent reasoning... (step ${stepCount})`, color: 'cyan' }).start();
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
      log('final', `Report complete after ${toolCallCount} tool calls, ${stepCount} steps`);
      return parseAgentOutput(finalText, toolCallCount, stepCount, modelId);
    }

    for (const part of textParts) {
      log('think', part.text.slice(0, 120).replace(/\n/g, ' ') + (part.text.length > 120 ? '...' : ''));
    }

    const responseParts = [];
    for (const part of funcCallParts) {
      const { name, args } = part.functionCall;
      toolCallCount++;
      log('act', `${name}() -> files: [${(args.files || []).slice(0, 4).join(', ')}${(args.files || []).length > 4 ? '...' : ''}]`);
      const toolResult = executeTool(name, args, project);
      log('observe', toolResult.slice(0, 100).replace(/\n/g, ' ') + '...');
      responseParts.push({ functionResponse: { name, response: { result: toolResult } } });
    }
    messages.push({ role: 'user', parts: responseParts });
  }
  throw new Error('Agent exceeded maximum steps without producing a report.');
}

function parseAgentOutput(text, toolCalls, steps, modelId) {
  const clean = text.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Agent did not return valid JSON.\n\nRaw:\n' + text.slice(0, 500));
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return { ...parsed, _meta: { toolCalls, steps, model: modelId } };
  } catch (err) {
    throw new Error('Failed to parse agent JSON: ' + err.message);
  }
}
