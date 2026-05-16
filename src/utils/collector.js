import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const INCLUDE_PATTERNS = [
  '**/*.{js,jsx,ts,tsx}',
  '**/next.config.{js,mjs,ts}',
  '**/package.json',
  '**/*.{css,scss,module.css}',
  '**/middleware.{js,ts}',
  '**/.env',
  '**/.env.example',
  '**/.env.local',
  '**/robots.txt',
  '**/sitemap.xml',
  '**/manifest.json',
  '**/tailwind.config.{js,ts,mjs}',
  '**/tsconfig.json',
];

const EXCLUDE_DIRS = [
  'node_modules', '.next', '.git', 'dist', 'build',
  'out', 'coverage', '.turbo', '.vercel', '__pycache__',
];

const MAX_FILE_BYTES = 50_000; // skip minified or generated files
const MAX_TOTAL_CHARS = 800_000; // collect everything — tool executor manages per-area budgets // high limit — compression in tools.js handles token budget

export async function collectProjectFiles(projectPath) {
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Path not found: ${projectPath}`);
  }

  const ignorePatterns = EXCLUDE_DIRS.map(d => `**/${d}/**`);
  const allFiles = [];

  for (const pattern of INCLUDE_PATTERNS) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      ignore: ignorePatterns,
      absolute: true,
      nodir: true,
    });
    allFiles.push(...matches);
  }

  // Deduplicate
  const unique = [...new Set(allFiles)];

  // Read files, respect budget
  const files = [];
  let totalChars = 0;
  let totalLines = 0;

  // Prioritise important files first
  const priority = (f) => {
    if (f.includes('next.config')) return 0;
    if (f.includes('middleware')) return 1;
    if (f.includes('layout.') || f.includes('_document.')) return 2;
    if (f.includes('package.json') && !f.includes('node_modules')) return 3;
    if (f.includes('/app/') || f.includes('/pages/')) return 4;
    if (f.includes('/components/')) return 5;
    if (f.includes('/lib/') || f.includes('/utils/')) return 6;
    return 7;
  };

  unique.sort((a, b) => priority(a) - priority(b));

  for (const absPath of unique) {
    try {
      const stat = fs.statSync(absPath);
      if (stat.size > MAX_FILE_BYTES) continue;

      const content = fs.readFileSync(absPath, 'utf8');
      if (totalChars + content.length > MAX_TOTAL_CHARS) break;

      const relPath = path.relative(projectPath, absPath);
      const lines = content.split('\n').length;

      files.push({ path: relPath, content, lines, size: stat.size });
      totalChars += content.length;
      totalLines += lines;
    } catch {
      // skip unreadable files
    }
  }

  // Detect project metadata
  const meta = detectProjectMeta(projectPath, files);

  return { files, totalLines, totalChars, meta, projectPath };
}

function detectProjectMeta(projectPath, files) {
  const pkgFile = files.find(f => f.path === 'package.json');
  let deps = {}, devDeps = {}, nextVersion = 'unknown', appRouter = false, srcDir = false;

  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      deps = pkg.dependencies || {};
      devDeps = pkg.devDependencies || {};
      nextVersion = deps['next'] || devDeps['next'] || 'unknown';
    } catch {}
  }

  appRouter  = files.some(f => f.path.includes('/app/'));
  srcDir     = files.some(f => f.path.startsWith('src/'));
  const hasTS = files.some(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));
  const hasTailwind = !!deps['tailwindcss'] || !!devDeps['tailwindcss'];
  const hasPrisma = !!deps['prisma'] || !!deps['@prisma/client'];
  const hasAuth = !!(deps['next-auth'] || deps['@clerk/nextjs'] || deps['@auth0/nextjs-auth0']);

  return {
    nextVersion,
    router: appRouter ? 'App Router' : 'Pages Router',
    srcDir,
    typescript: hasTS,
    tailwind: hasTailwind,
    prisma: hasPrisma,
    auth: hasAuth,
    totalDeps: Object.keys(deps).length,
  };
}