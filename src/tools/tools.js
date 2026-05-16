// ─── File relevance filter per area ──────────────────────────────────────────
// Strict per-area filters — only files genuinely relevant to each area
const FILE_FILTERS = {
  // SEO: only page files, head components, config files, sitemap/robots
  analyse_seo: f => {
    const lower = f.toLowerCase();
    return (
      /pages[\/]|app[\/]/.test(f) ||                           // all page files
      /layout.|_document.|_app./.test(f) ||                   // layout/document/app
      /seohead|seo-head|metadata|sitemap|robots/.test(lower) ||  // SEO-specific components
      f === 'robots.txt' || f === 'sitemap.xml' || f === 'manifest.json' ||
      f.startsWith('next.config')
    );
  },

  // Performance: page files, components with images/data fetching, config
  analyse_performance: f => {
    const lower = f.toLowerCase();
    return (
      /pages[\/]/.test(f) ||
      /components[\/]layout[\/]/.test(f) ||
      /components[\/]sections[\/]/.test(f) ||
      /loading.|suspense./.test(lower) ||
      f.startsWith('next.config') || f === 'package.json'
    );
  },

  // Security: ONLY API routes, middleware, auth, env, config
  analyse_security: f => {
    const lower = f.toLowerCase();
    return (
      /pages[\/]api[\/]|app[\/]api[\/]/.test(f) ||           // API routes only
      /middleware.|auth.|server./.test(lower) ||              // middleware/auth/server
      f.startsWith('.env') || f.startsWith('next.config')       // env and config
    );
  },

  // Accessibility: UI components, pages, CSS — NOT utility/lib files
  analyse_accessibility: f => {
    const lower = f.toLowerCase();
    return (
      /components[\/]/.test(f) ||                               // all components
      /pages[\/]/.test(f) ||                                    // page files
      /app[\/]/.test(f) ||                                      // app dir files
      f.endsWith('.css') || f.endsWith('.scss')                  // stylesheets
    );
  },

  // Code quality: ALL TypeScript/JavaScript source files
  analyse_code_quality: f =>
    f.endsWith('.ts') || f.endsWith('.tsx') ||
    f.endsWith('.js') || f.endsWith('.jsx'),

  // Architecture: config files + folder structure files
  analyse_architecture: f => {
    const lower = f.toLowerCase();
    return (
      f === 'package.json' || f === 'tsconfig.json' ||
      f.startsWith('next.config') || f.startsWith('.env') ||
      f.startsWith('tailwind.config') ||
      /middleware./.test(lower) ||
      /pages[\/]|app[\/]|components[\/]|lib[\/]|utils[\/]|hooks[\/]|store[\/]|context[\/]/.test(f) ||
      f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')
    );
  },
};

// Config files always included in every area
const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'robots.txt',
  'sitemap.xml', 'manifest.json',
]);

function isConfig(path) {
  return CONFIG_FILES.has(path) ||
    path.startsWith('next.config') ||
    path.startsWith('.env') ||
    path.startsWith('tailwind.config');
}


// ─── Export area files for chunked analysis ───────────────────────────────────
export function getAreaFiles(toolName, project) {
  const filterFn = FILE_FILTERS[toolName];

  const CONFIG_PATHS = new Set([
    'package.json', 'tsconfig.json', 'robots.txt',
    'sitemap.xml', 'manifest.json',
  ]);

  const allFiles = (project.files || []).filter(f => f && typeof f.path === 'string');

  const isConfig = f =>
    CONFIG_PATHS.has(f.path) ||
    f.path.startsWith('next.config') ||
    f.path.startsWith('.env') ||
    f.path.startsWith('tailwind.config');

  const configFiles   = allFiles.filter(f => isConfig(f));
  const relevantFiles = filterFn
    ? allFiles.filter(f => filterFn(f.path) && !isConfig(f))
    : allFiles.filter(f => !isConfig(f));

  return [
    ...new Map(
      [...configFiles, ...relevantFiles].map(f => [f.path, f])
    ).values(),
  ];
}