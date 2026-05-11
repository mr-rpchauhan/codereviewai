# devauditai

AI-powered code review agent for web projects. Analyses your entire project — not just one file — and gives you a detailed report on code quality, SEO, performance, security, and accessibility.

Powered by **Google Gemini** (free tier) · Works on **Mac, Linux, Windows**

---

## Quick start (no install needed)

```bash
cd your-project
npx devauditai .
```

On first run it will ask for your free Gemini API key, save it globally, then run the review. You won't be asked again.

---

## Get a free Gemini API key

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. Click **"Create API key"**
4. Copy the key — paste it when devauditai asks

No credit card required.

---

## Global install (for short command)

```bash
npm install -g devauditai
devauditai .
```

---

## Usage

```bash
# Review current directory
devauditai .

# Review a specific path
devauditai /path/to/project

# Save markdown report
devauditai . -o md

# Focus on specific areas
devauditai . -f seo,performance

# Use a specific model (skips the model selector)
devauditai . -m flash

# Combine options
devauditai . -m lite -o json -f seo,security
```

---

## What it checks

| Area | What it looks for |
|---|---|
| **Code Quality** | Unused vars, missing error handling, hooks violations, console.logs |
| **SEO** | Missing metadata, og:image, robots.txt, sitemap, alt text |
| **Performance** | Raw img tags, missing Suspense, N+1 fetches, large imports |
| **Security** | Exposed secrets, SQL injection, missing auth, XSS risks |
| **Accessibility** | Missing aria-labels, form labels, keyboard navigation |

---

## Options

| Option | Description |
|---|---|
| `-m, --model=<id>` | Model to use (skips the interactive selector) |
| `-f, --focus=<areas>` | Comma-separated areas to review (default: all) |
| `-o, --output=<fmt>` | Output format (default: console) |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

### Output formats

| Value | Description |
|---|---|
| `console` | Print to terminal (default) |
| `markdown` / `md` | Save `devauditai-report.md` |
| `json` | Save `devauditai-report.json` |
| `both` | Terminal + markdown file |

### Focus areas

```
code-quality, seo, performance, security, accessibility
```

---

## Models

devauditai shows an interactive model selector on each run. Pass `-m` to skip it.

| Model | Shortcut | Tag | RPM | RPD |
|---|---|---|---|---|
| `gemini-2.5-flash-lite` | `lite` or `flash-lite` | ⭐ RECOMMENDED | 10/min | 20/day |
| `gemini-2.5-flash` | `flash` | BEST QUALITY | 5/min | 20/day |

```bash
devauditai . -m lite    # fastest, recommended
devauditai . -m flash   # deepest review
```

All models are **free** to use.

---

## API Key

On first run devauditai will prompt you for your key and save it automatically. You can also manage it manually with the commands below.

### Key priority (checked in this order on every run)

| Priority | Source | How to set |
|---|---|---|
| 1 | `.env` file in your project | Add `GEMINI_API_KEY=your_key` to `.env` |
| 2 | Saved key (global) | `devauditai -k YOUR_KEY` |
| 3 | Shell export | `devauditai --shell-key=YOUR_KEY` |

The first key found is used. If none found → you are prompted once and the key is saved globally (priority 2).

### Saved key commands (global · `~/.devauditai/config.json`)

```bash
devauditai -k AIzaSy...    # save key globally
devauditai --del-saved     # delete saved key
```

### Shell key commands (auto-detects `.zshrc` / `.bashrc`)

```bash
devauditai --shell-key=AIzaSy...   # add export to shell config
devauditai --del-shell             # remove from shell config
```

> After `--shell-key`, run `source ~/.zshrc` (or open a new terminal) to apply.

### Remove all keys

```bash
devauditai --del-all    # deletes saved key + removes from shell config
```

> Note: `.env` file is never auto-removed — delete `GEMINI_API_KEY` from it manually if needed.

---

## Requirements

- Node.js 18+
- Free Gemini API key from https://aistudio.google.com/apikey

---

*Built with Gemini AI · Free to use*