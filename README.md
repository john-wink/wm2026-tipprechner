# World Cup 2026 Prediction Optimizer

Multilingual web app that aggregates odds from 40+ bookmakers for the FIFA World Cup 2026 and computes the optimal Kicktipp pick via a Poisson model. Available in German, English, French, and Spanish.

- **100% client-side** – API key and all data stay in the browser (localStorage)
- **Installable PWA** – Service Worker for offline use, "Add to Home Screen" on iOS/Android
- **Mobile-first** UI with TailwindCSS (pre-compiled, no Play CDN)
- **Full SEO**: per-language URLs, `hreflang`, JSON-LD, OpenGraph, sitemap, robots
- **Vercel-ready** – just `git push` and deploy
- No database, no auth, no tracking

## Features

- Aggregates odds from 40+ bookmakers (Pinnacle, Bet365, William Hill, …) via The Odds API
- Removes bookmaker margin, finds optimal Kicktipp pick via expected-value maximization
- Three aggregation methods side-by-side: Median / Mean / Pinnacle
- **Specials tab**: Champion, semifinalists, group winners (Monte-Carlo), top scorer
- **Full tournament simulation** (Group → R32 → R16 → QF → SF → F) with consistent probabilities
- **Score-matrix heatmap** per match (8×8 grid, color-coded)
- **Points forecast**: expected total points + likely range (±1σ) + best-case
- **Snapshot history**: track odds movement between refreshes
- **Share API**: send picks via WhatsApp / clipboard with one click
- **Manual odds override** per match

## Live URLs (after deploy)

- `https://<your-domain>/` – language picker (auto-redirect by browser locale)
- `https://<your-domain>/de/` – Deutsch
- `https://<your-domain>/en/` – English
- `https://<your-domain>/fr/` – Français
- `https://<your-domain>/es/` – Español

## Tech stack

- **HTML/CSS/JS** – vanilla
- **TailwindCSS** pre-compiled (~19 KB minified) — see "Building Tailwind" below
- **i18n.js** – translation dictionary for 4 languages + 48 team-name translations
- **app.js** – shared engine (math, render, fetch, storage, Monte-Carlo, share)
- **sw.js** – Service Worker (cache-first for assets, network-only for API)
- **The Odds API** – bookmaker odds (free tier: 500 credits/month)

## Building Tailwind

The repo ships with a pre-built `assets/tailwind.css`. If you change classes in HTML or `app.js`, rebuild it:

```bash
npx tailwindcss@3 -i tailwind-input.css -o assets/tailwind.css --content "./**/*.html,./assets/app.js" --minify
```

Where `tailwind-input.css` contains:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

You can also set up GitHub Actions to auto-build on push — example workflow in `.github/workflows/`.

## Helper-Scripts in `scripts/`

| Script | Zweck |
|---|---|
| `bump.py` | Asset-Version synchron in allen HTMLs + sw.js setzen |
| `set-domain.py <url>` | Domain (canonical, sitemap, robots, OG, hreflang) überall ersetzen |
| `resolve-conflicts.py` | Git-Merge-Konflikte automatisch auflösen ("ours" behalten); mit `--check` nur prüfen |

## Updates ausspielen — Asset-Versioning

Damit User immer die neuesten Übersetzungen / JS-Änderungen bekommen (statt veralteten Browser-Cache zu sehen), nutzt das Projekt **versionierte Asset-URLs** wie `/assets/app.js?v=v2026.05.23.3`.

**Workflow nach jeder Code-Änderung:**

```bash
# 1) Optional: Tailwind neu bauen wenn du Klassen geändert hast
npx tailwindcss@3 -i tailwind-input.css -o assets/tailwind.css --content "./**/*.html,./assets/app.js" --minify

# 2) Version bumpen — patcht alle HTMLs und sw.js synchron
python3 scripts/bump.py

# 3) Commit und push
git add -A && git commit -m "Update content" && git push
```

Vercel deployed automatisch. Sobald ein User die Seite besucht:

1. Der Browser holt die neue HTML (Header `must-revalidate`, also kein Stale-Cache)
2. Die HTML referenziert `/assets/app.js?v=NEU` — der Browser muss diese neue URL holen
3. Der Service Worker sieht seine neue VERSION-Konstante → löscht den alten Cache → baut frischen Cache auf
4. Beim Controller-Wechsel reloaded die Seite einmal automatisch → User sieht die neuste Version

**Caching-Strategie der HTTP-Header (`vercel.json`):**
- HTMLs (`/`, `/de/`, `/en/`, …): `max-age=0, must-revalidate` → immer frisch
- `sw.js`: `max-age=0, must-revalidate` → Updates kommen sofort an
- `manifest.webmanifest`: 1 h Cache
- Versionierte Assets (`/assets/*`): 1 Jahr `immutable` → können forever gecacht werden, weil URL bei Änderung wechselt
- SVG/PNG-Bilder: 1 Woche

Das ist die Industrie-Standard-Caching-Strategie für Static Sites mit Versioning.

## Project structure

```
/
├── index.html              # Root: language picker + auto-redirect
├── de/ en/ fr/ es/         # Per-language HTML wrappers (SEO meta)
├── assets/
│   ├── app.js              # Shared engine (math, render, fetch, simulation)
│   ├── i18n.js             # Translations (4 langs + 48 team names)
│   ├── styles.css          # Minimal custom CSS
│   └── tailwind.css        # Pre-compiled Tailwind (~19 KB)
├── sw.js                   # Service Worker (PWA offline cache)
├── manifest.webmanifest    # PWA manifest
├── favicon.svg
├── icon-192.svg            # PWA icons
├── icon-512.svg
├── og-image.svg            # OpenGraph card (1200×630)
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

Use `python3 scripts/set-domain.py https://your-domain.com` to replace the canonical host across all HTMLs, sitemap, robots, OG-tags and JSON-LD in one go. Then `python3 scripts/bump.py` and `git push`. Finally submit the sitemap to [Google Search Console](https://search.google.com/search-console).

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
