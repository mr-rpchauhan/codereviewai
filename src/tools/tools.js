// ─── Tool Definitions (sent to Claude as function schemas) ────────────────────
export const TOOL_DEFINITIONS = [
  {
    name: 'analyse_code_quality',
    description: `Analyse JavaScript/TypeScript code quality across the project.
Checks: unused variables, dead code, overly complex functions, missing error handling,
improper use of any/unknown types, console.logs left in, hardcoded values, 
component prop types, hooks violations (missing deps arrays, hooks in conditions),
large components that should be split, missing loading/error states.`,
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Relative file paths to focus on for this analysis',
        },
        focus: {
          type: 'string',
          description: 'Specific sub-area to focus on (e.g. "hooks", "types", "error-handling")',
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'analyse_seo',
    description: `Analyse SEO across the Next.js project.
Checks: missing metadata exports (generateMetadata / <Head>), missing title/description,
missing og:image / twitter cards, missing canonical URLs, no robots.txt or sitemap.xml,
missing alt text on images, non-semantic HTML, missing structured data (JSON-LD),
dynamic routes missing generateStaticParams, missing lang attribute on <html>.`,
    input_schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['files'],
    },
  },
  {
    name: 'analyse_performance',
    description: `Analyse performance across the Next.js project.
Checks: missing next/image (using raw <img>), missing next/font, large client components
that could be server components, missing React.memo/useMemo/useCallback where needed,
N+1 fetch patterns, missing loading.tsx / Suspense boundaries, unoptimised imports
(importing whole lodash/moment), missing dynamic() imports for heavy components,
missing ISR (revalidate), no caching headers on API routes, large bundle contributors.`,
    input_schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['files'],
    },
  },
  {
    name: 'analyse_security',
    description: `Analyse security across the Next.js project.
Checks: exposed secrets or API keys in code, missing input validation/sanitisation,
SQL injection risks, XSS vulnerabilities, missing CSRF protection, insecure API routes
(no auth checks), exposed internal APIs, unsafe dangerouslySetInnerHTML, missing
security headers (CSP, HSTS, X-Frame-Options) in next.config, open redirects,
missing rate limiting, insecure cookie settings, .env values accidentally committed.`,
    input_schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['files'],
    },
  },
  {
    name: 'analyse_accessibility',
    description: `Analyse accessibility (a11y) across the Next.js project.
Checks: missing aria-label on interactive elements, missing role attributes, 
buttons without visible text (icon-only buttons), links without descriptive text,
forms without labels, missing focus management on modals/drawers, insufficient
colour contrast (CSS), keyboard navigation issues, missing skip-to-content links,
no aria-live regions for dynamic content, images missing alt text.`,
    input_schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['files'],
    },
  },
  {
    name: 'analyse_architecture',
    description: `Analyse overall project architecture and structure.
Checks: folder structure consistency, separation of concerns, shared component patterns,
data fetching patterns (server vs client), API route organisation, missing barrel exports,
circular dependencies, improper use of Context vs state management, Next.js config
optimisations, environment variable handling, middleware usage.`,
    input_schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['files'],
    },
  },
];

// ─── Tool Executor ─────────────────────────────────────────────────────────────
// In this agent the tools are resolved by Claude itself using real file content.
// The executor packages up the requested files' content and returns it so Claude
// can reason over the actual source — no external linter needed.
export function executeTool(toolName, input, project) {
  const requestedPaths = input.files || project.files.map(f => f.path);

  // Gather content of requested files
  const fileContents = requestedPaths
    .map(p => project.files.find(f => f.path === p))
    .filter(Boolean)
    .slice(0, 20) // cap per tool call
    .map(f => `=== ${f.path} (${f.lines} lines) ===\n${f.content}`)
    .join('\n\n');

  const toolLabel = toolName.replace('analyse_', '').replace('_', ' ');

  return `[${toolLabel.toUpperCase()} TOOL RESULT]
Files analysed: ${requestedPaths.slice(0, 20).join(', ')}
Project meta: ${JSON.stringify(project.meta)}

File contents:
${fileContents || '(no matching files found)'}

Now perform a thorough ${toolLabel} analysis on the above files. 
Be specific: mention exact file paths and line-level details where possible.`;
}
