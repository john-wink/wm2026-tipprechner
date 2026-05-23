# Architektur

## Überblick

```
┌────────────────────────────────────────────────────────────┐
│  Browser (User)                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /de/index.html (oder /en/, /fr/, /es/)              │  │
│  │   ↓ lädt                                             │  │
│  │  /assets/tailwind.css   (pre-compiled, ~19 KB)       │  │
│  │  /assets/styles.css      (custom, ~1 KB)             │  │
│  │  /assets/i18n.js         (UI strings + team labels)  │  │
│  │  /assets/app.js          (engine + rendering)        │  │
│  │   ↓ registriert                                      │  │
│  │  /sw.js                  (Service Worker, PWA)       │  │
│  │   ↓ cacht                                            │  │
│  │  Alles oben + manifest.webmanifest + icons           │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                               │
│                            ↓ fetch                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  the-odds-api.com (extern, kein SW-Caching)          │  │
│  │   - soccer_fifa_world_cup  (1X2-Quoten)              │  │
│  │   - soccer_fifa_world_cup_winner (Outright)          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  localStorage:                                             │
│   - wm2026-kicktipp-optimizer-v3  (alle User-Daten)        │
│   - wm2026-snapshots              (Outright-Verlauf)       │
│                                                            │
└────────────────────────────────────────────────────────────┘
                            │
                            ↓ git push
┌────────────────────────────────────────────────────────────┐
│  Vercel (statisches Hosting, kein Backend)                 │
│   - vercel.json: Cache-Headers, Security-Headers           │
│   - 4 Sprach-Pfade + Root-Redirect                         │
└────────────────────────────────────────────────────────────┘
```

## Schichten-Modell in `app.js`

```
┌─────────────────────────────────────────┐
│ Init / Event-Wiring                     │
├─────────────────────────────────────────┤
│ Render-Layer                            │
│  renderOverview, renderGroups,          │
│  renderSpecials, renderMatchCard, ...   │
├─────────────────────────────────────────┤
│ API-Layer                               │
│  fetchAllOdds, applyApiEvents,          │
│  applyOutrightEvents                    │
├─────────────────────────────────────────┤
│ Aggregation-Layer                       │
│  aggregateBookmakers (median/mean/      │
│  pinnacle), getActiveProbs              │
├─────────────────────────────────────────┤
│ Simulations-Layer                       │
│  simulateGroupWinners (Monte-Carlo),    │
│  simulateFullTournament (FIFA-Bracket)  │
├─────────────────────────────────────────┤
│ Math-Layer                              │
│  poissonPMF, findLambdas (Gradient),    │
│  scoreMatrix, applyDixonColes,          │
│  bestKicktippTip, mulberry32 (PRNG)     │
└─────────────────────────────────────────┘
```

## Architecture Decision Records

### ADR-001: Vanilla statt Framework

**Entscheidung:** HTML/CSS/JS ohne React/Svelte/Vue.

**Kontext:** Single-Purpose-Tool, Single-User-Workload, kein Backend-State.

**Begründung:**
- Keine Build-Pipeline notwendig (außer Tailwind-Compile, der ein Einzeiler ist).
- Keine npm-Dependency-Wartung.
- Ein einziger Entwickler — keine Komponenten-Wiederverwendung erforderlich.
- Single-File-`app.js` reicht für den Umfang aus.

**Konsequenz:** Code-Modularität leidet ab ~3000 Zeilen. Ein späterer Refactor auf SvelteKit wäre eine valide Investition wenn das Tool wachsen sollte.

### ADR-002: Tailwind pre-compiled statt Play-CDN

**Entscheidung:** Lokales `assets/tailwind.css` per `npx tailwindcss --content "..." --minify`.

**Begründung:** Tailwind dokumentiert explizit, dass Play-CDN nicht für Production gedacht ist. Pre-compiled bringt von ~70 KB JS auf ~19 KB CSS herunter, kein FOUC.

**Konsequenz:** Workflow-Schritt: Bei JS/HTML-Klassen-Änderung muss `assets/tailwind.css` neu gebaut werden. Dokumentiert in README.

### ADR-003: Asset-Versioning via Query-String

**Entscheidung:** `/assets/app.js?v=v2026.05.23.3` statt Content-Hashing.

**Kontext:** Browser-Cache und Service-Worker-Cache müssen invalidiert werden, wenn Inhalt sich ändert.

**Begründung:**
- Query-String-Versioning braucht keine Hash-Berechnung im Build.
- `scripts/bump.py` setzt überall die gleiche Version synchron.
- Versionierte URLs können `Cache-Control: immutable, max-age=1y` haben.

**Konsequenz:** Bei jeder Inhaltsänderung muss `bump.py` manuell laufen, sonst sehen User stale Cache.

### ADR-004: Client-Only (kein Backend, keine DB)

**Entscheidung:** API-Key und alle User-Daten in `localStorage`.

**Begründung:**
- DSGVO-Compliance trivial (keine personenbezogenen Daten gespeichert).
- Hosting kostenlos (Vercel Static).
- Keine Auth, kein Account-System nötig.

**Konsequenz:** Keine geräteübergreifende Synchronisation. User mit mehreren Geräten haben unterschiedliche Tipp-Verläufe.

### ADR-005: FIFA-Bracket statt Random-Shuffle (v2026.05.23.3+)

**Entscheidung:** KO-Phase nutzt die offizielle 2026-Bracket-Struktur statt zufälliges Mischen.

**Begründung:** Realistischere SF-/F-Wahrscheinlichkeiten, weil Teams nicht „nur Glück mit der Auslosung" haben. Cross-Group-Paarungen sind nach FIFA-Regel definiert.

**Konsequenz:** Halbfinal-/Final-Wahrscheinlichkeiten ändern sich gegenüber der vorherigen Version. Tests prüfen Konsistenz (Σ SF = 4.0 etc.).

### ADR-006: Seeded Random (mulberry32) statt `Math.random`

**Entscheidung:** Eigener PRNG mit fixierbarem Seed.

**Begründung:** Reproduzierbarkeit für Backtest und wissenschaftliche Analyse.

**Konsequenz:** Default `Math.random` bleibt, Seed nur für Tests und Forschung gesetzt.

### ADR-007: Dixon-Coles als Standard

**Entscheidung:** Score-Matrix wird mit ρ=−0.1 Dixon-Coles-korrigiert.

**Begründung:** Standardpraxis in der Sport-Forschung (Dixon & Coles 1997). Sensitivitätsanalyse zeigt, dass die Korrektur die Modell-Outputs marginal verändert; Hauptzweck ist methodische Korrektheit.

**Konsequenz:** Tests prüfen, dass Σ Matrix nach Korrektur ≈ 1 bleibt.

## Code-Struktur (Files)

```
/
├── index.html                      Sprach-Redirect-Landing
├── de/ en/ fr/ es/ index.html      Pro-Sprache-HTML mit SEO
├── assets/
│   ├── app.js                      Engine (~70 KB)
│   ├── i18n.js                     Translations (~32 KB)
│   ├── styles.css                  Custom CSS (~1 KB)
│   └── tailwind.css                Pre-compiled Tailwind (~19 KB)
├── sw.js                           Service Worker
├── manifest.webmanifest            PWA Manifest
├── favicon.svg, icon-192.svg, icon-512.svg, og-image.svg
├── robots.txt, sitemap.xml
├── vercel.json                     Headers + Routes
├── scripts/
│   └── bump.py                     Asset-Versioning-Tool
├── tests/
│   ├── test-runner.js              Mini-Test-Framework
│   ├── math.test.js                Mathe-Unit-Tests
│   ├── simulation.test.js          Sim-Konsistenz-Tests
│   └── i18n.test.js                Übersetzungs-Coverage
├── research/
│   ├── wc2022-data.js              Backtest-Daten
│   ├── metrics.js                  Brier/RPS/LogLoss
│   ├── baselines.js                Baseline-Modelle
│   ├── backtest.js                 Validierungs-Skript
│   ├── sensitivity.js              Sensitivitätsanalyse
│   └── results.json, sensitivity.json
└── docs/
    ├── architecture.md             (dieses Dokument)
    ├── methodology.md              Modell-Theorie + Quellen
    ├── limitations.md              Kritische Einschränkungen
    └── wcag-audit.md               Accessibility-Audit
```
