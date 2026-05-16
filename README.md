# devauditai

AI-powered code review agent for Next.js projects. Analyses your entire project and gives you a detailed report on code quality, SEO, performance, security, and accessibility.

Powered by **Google Gemini** (free tier) · Works on **Mac, Linux, Windows**

---

## Quick start (no install needed)

```bash
cd your-project
npx devauditai .
```

On first run it will ask for your free Gemini API key, save it globally, then guide you through the review. You won't be asked for the key again.

---

## Get a free Gemini API key

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. Click **"Create API key"**
4. Copy the key — paste it when devauditai asks

No credit card required.

---

## Global install (optional — for shorter command)

```bash
npm install -g devauditai
devauditai .
```

---

## How it works

Every run is fully interactive — just follow the prompts:

```
devauditai .

  [+] API key loaded

  ┌─ Step 1: Select Model ───────────────────────────────┐
  │  1. Gemini 2.5 Flash Lite   RECOMMENDED              │
  │     Fastest · 10 req/min · 20 req/day                │
  │                                                       │
  │  2. Gemini 2.5 Flash        BEST QUALITY             │
  │     Deepest review · 5 req/min · 20 req/day          │
  └───────────────────────────────────────────────────────┘
  Enter number (1-2): 1

  ┌─ Step 2: Select Phase ───────────────────────────────┐
  │  1. SEO           Metadata, titles, canonical URLs   │
  │  2. Performance   Images, bundle size, caching       │
  │  3. Security      API security, secrets, headers     │
  │  4. Accessibility ARIA, keyboard nav, screen readers │
  │  5. Code Quality  TypeScript, hooks, error handling  │
  └───────────────────────────────────────────────────────┘
  Enter number (1-5): 1

  ┌─ Step 3: Select Output ──────────────────────────────┐
  │  1. Console only    Print report to terminal         │
  │  2. Markdown file   Save as review-report.md         │
  │  3. Both            Console + markdown file          │
  └───────────────────────────────────────────────────────┘
  Enter number (1-3): 2

  → Scanning project...
  → Analysing SEO...
  → Report saved to review-report.md ✓
```

---

## What it checks

| Phase | What it looks for |
|---|---|
| **SEO** | Missing metadata, canonical URLs, og:image, robots.txt, sitemap, alt text, heading hierarchy |
| **Performance** | Unoptimized images, large bundles, N+1 fetches, missing Suspense, caching |
| **Security** | Exposed secrets, missing auth, XSS risks, insecure headers, mixed content |
| **Accessibility** | Missing aria-labels, keyboard navigation, focus management, color contrast |
| **Code Quality** | Unused vars, missing error handling, hooks violations, TypeScript issues |

---

## Models

| Model | Tag | Speed | RPM | RPD |
|---|---|---|---|---|
| `Gemini 2.5 Flash Lite` | ⭐ RECOMMENDED | Fastest | 10/min | 20/day |
| `Gemini 2.5 Flash` | BEST QUALITY | Detailed | 5/min | 20/day |

Both models are **free** to use.

---

## CLI options

```bash
devauditai .                        # Review current directory
devauditai /path/to/project         # Review specific directory
devauditai --help                   # Show help
devauditai --version                # Show version
```

---

## API Key management

On first run devauditai will prompt you for your key and save it automatically.

### Key priority (checked in this order on every run)

| Priority | Source | How to set |
|---|---|---|
| 1 | `.env` file in your project | Add `GEMINI_API_KEY=your_key` to `.env` |
| 2 | Saved key (`~/.devauditai/config.json`) | `devauditai . -k YOUR_KEY` |
| 3 | Shell config (`.zshrc` / `.bashrc`) | `devauditai . --shell-key=YOUR_KEY` |

### Key commands

```bash
# Save key globally (works on Mac, Linux, Windows)
devauditai . -k AIzaSy...
devauditai . --set-saved-key=AIzaSy...

# Add key to shell config — Mac/Linux only
devauditai . --shell-key=AIzaSy...

# Delete saved key
devauditai . --del-saved

# Remove key from shell config — Mac/Linux only
devauditai . --del-shell

# Delete everything (saved key + shell config)
devauditai . --del-all
```

> **Note:** `.env` file is never auto-removed — delete `GEMINI_API_KEY` from it manually if needed.

> **Windows users:** `--shell-key` and `--del-shell` commands are not supported on Windows. Use `-k` to save your key globally instead.

### Using with npx

```bash
npx devauditai .
npx devauditai . -k AIzaSy...
npx devauditai . --del-all
npx devauditai --version
```

---

## Requirements

- Node.js 18+
- Free Gemini API key from https://aistudio.google.com/apikey

---

*Built with Gemini AI · Free to use*