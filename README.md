# devauditai

AI-powered code review agent for web projects. Analyses your entire project — not just one file — and gives you a detailed report on code quality, SEO, performance, security, and accessibility.

Powered by **Google Gemini** (free tier) · Works on **Mac, Linux, Windows**

---

## Quick start (no install needed)

```bash
cd your-project
npx devauditai .
```

That's it. On first run it will ask for your free Gemini API key, save it, then run the review.

---

## Get a free Gemini API key

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. Click **"Create API key"**
4. Copy the key — paste it when devauditai asks

No credit card required.

---

## Usage

```bash
# Review current directory
devauditai .

# Review a specific path
devauditai /path/to/project

# Save markdown report
devauditai . --output=markdown

# Focus on specific areas
devauditai . --focus=seo,performance

# Use a specific model
devauditai . --model=gemini-2.5-flash

# Manage API key
devauditai . --set-key=AIzaSy...
devauditai . --delete-key
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
| `--output=console` | Print to terminal (default) |
| `--output=markdown` | Save `devauditai-report.md` |
| `--output=json` | Save `devauditai-report.json` |
| `--output=both` | Terminal + markdown file |
| `--focus=<areas>` | `code-quality, seo, performance, security, accessibility` |
| `--model=<id>` | `gemini-2.5-flash-lite`, `gemini-2.5-flash` |
| `--set-key=<key>` | Save a new API key globally |
| `--delete-key` | Delete the saved API key |

---

## Global install (for short command)

```bash
npm install -g devauditai
devauditai .
```

---

## Requirements

- Node.js 18+
- Free Gemini API key from https://aistudio.google.com/apikey

---

*Built with Gemini AI · Free to use*
