# World Cup 2026 Prediction Optimizer

Multilingual web app that aggregates odds from 40+ bookmakers for the FIFA World Cup 2026 and computes the optimal Kicktipp pick via a Poisson model. Available in German, English, French, and Spanish.

- 100% client-side – API key and all data stay in the browser (localStorage)
- No database, no auth, no tracking
- Mobile-first UI built with TailwindCSS (Play CDN)
- Full SEO: per-language URLs, `hreflang`, JSON-LD, OpenGraph, sitemap, robots
- Vercel-ready – just `git push` and deploy

## Live URLs (after deploy)

- `https://<your-domain>/` – language picker (auto-redirect by browser locale)
- `https://<your-domain>/de/` – Deutsch
- `https://<your-domain>/en/` – English
- `https://<your-domain>/fr/` – Français
- `https://<your-domain>/es/` – Español

## Tech stack

- **HTML/CSS/JS** – no build step
- **TailwindCSS** via Play CDN (`cdn.tailwindcss.com`)
- **i18n.js** – translation dictionary for 4 languages + 48 team-name translations
- **app.js** – shared engine (math, render, fetch, storage)
- **The Odds API** – bookmaker odds (free tier: 500 credits/month)

## Project structure

```
/
├── index.html              # Root: language picker + auto-redirect
├── de/index.html           # German (SEO meta + lang switcher active state)
├── en/index.html           # English
├── fr/index.html           # French
├── es/index.html           # Spanish
├── assets/
│   ├── styles.css          # Minimal custom CSS (Tailwind covers the rest)
│   ├── i18n.js             # Translations: UI strings + team names per language
│   └── app.js              # Shared app engine
├── favicon.svg
├── og-image.svg            # 1200×630 OpenGraph card
├── robots.txt
├── sitemap.xml
├── vercel.json             # Headers, cache rules, redirects
└── README.md
```

## Deploy to Vercel (GitHub auto-deploy)

1. Create a new repo on [github.com/new](https://github.com/new), e.g. `wm2026-tipprechner`
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-user>/wm2026-tipprechner.git
   git push -u origin main
   ```
3. On [vercel.com/new](https://vercel.com/new), import the repo
4. Framework Preset: **Other** (static site)
5. Click **Deploy** – live in ~15 seconds
6. Every `git push` deploys automatically

### Custom domain

After deploy, add a custom domain in **Vercel → Project Settings → Domains**. Update these placeholder URLs in the source files:

- All four `*/index.html` head sections: `canonical`, `hreflang`, OpenGraph URLs, JSON-LD
- `sitemap.xml`: all `<loc>` entries
- `robots.txt`: `Sitemap:` line
- Root `index.html`: canonical + OpenGraph

A quick search/replace from `wm2026-tipprechner.vercel.app` to your real domain handles it. Then submit the sitemap to [Google Search Console](https://search.google.com/search-console).

## i18n: add or change strings

Translations live in `assets/i18n.js` in two objects:

- `I18N[lang][key]` – UI strings (with `{var}` interpolation)
- `TEAM_LABELS[teamKey][lang]` – team names per language

The HTML files use `data-i18n="key"` attributes which are filled at load time. The keys must exist in all four language objects – add missing keys as you go.

## Local development

Open any of the HTML files directly in the browser:

```bash
# Either open the file directly:
open de/index.html

# Or serve via a simple HTTP server (recommended for relative paths):
npx serve .
# or
python3 -m http.server 8000
```

For local dev, the assets work via the relative path `/assets/...` so a static server (Vercel, `serve`, `http.server`) is required to load them properly.

## API key

Free key at [the-odds-api.com](https://the-odds-api.com/#get-access) – 500 credits/month. Each `Quoten laden` click uses one credit per region (EU/UK/US/AU). The key is stored only in the user's browser (localStorage) – nothing leaves the device except the direct request to `api.the-odds-api.com`.

## Privacy

- No cookies (except localStorage for user settings)
- No analytics, no third-party trackers
- API key and all match data stay in the user's browser
- Vercel hosts only static HTML/CSS/JS – no backend, no database

## License

MIT
