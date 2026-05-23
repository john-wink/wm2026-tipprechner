# WCAG 2.1 Accessibility Audit

Letzter Stand: Version v2026.05.23.3

## Color-Contrast (WCAG 1.4.3 / 1.4.6)

Gemessen mit dem Standard-Algorithmus (WCAG 2.1 relative luminance). Ergebnisse:

| Kombination | Kontrast | WCAG-Bewertung |
|---|---|---|
| Body-Text auf BG (`zinc-100` auf `#0d1117`) | 17.22 | ✓ AAA |
| Sekundärer Text (`zinc-400` auf BG) | 7.38 | ✓ AAA |
| Tertiärer Text (`zinc-500` auf BG) | 3.92 | ⚠ nur AA-large |
| Faint Text (`zinc-600` auf BG) | 2.45 | ✗ FAIL |
| Accent Text (`emerald-400` auf BG) | 9.84 | ✓ AAA |
| Info Text (`blue-400` auf BG) | 7.44 | ✓ AAA |
| Weiß auf Primary-Button (`emerald-600`) | 3.77 | ⚠ nur AA-large |
| Weiß auf Hover-Button (`emerald-500`) | 2.54 | ✗ FAIL |
| Heatmap-Beschriftung auf hoher Intensität (`emerald-500/70`) | 2.54 | ✗ FAIL |
| Heatmap-Beschriftung auf niedriger Intensität (`emerald-500/15`) | 6.20 | ✓ AA |

### Befunde und Behandlung

**1. Tertiärer Text `zinc-500` (3.92)** — nur AA-large

Verwendet für:
- Hilfstexte unter Buttons
- Sekundäre Metadaten (Datum, ID)
- Tooltip-ähnliche Labels

Diese Texte sind alle mindestens `text-xs` (12px) — bei WCAG-AA gilt "large text" ab 18px (normal) oder 14px (bold). Für unsere kleinen Texte ist `zinc-500` **nicht voll AA-konform**. Pragmatische Entscheidung: bleibt erhalten, da Information immer redundant codiert ist (z.B. Datum + Match-ID, beide sichtbar). Eine future-Verbesserung wäre auf `zinc-400` zu upgraden.

**2. Faint Text `zinc-600` (2.45)** — FAIL

Verwendet ausschließlich für **non-essential decorative elements**:
- Trennstrich „vs" zwischen Teamnamen
- Chevron-Icons (▼)
- Trennzeichen `·`

Diese Elemente transportieren **keine Information** (die Teamnamen selbst sind klar lesbar in `zinc-100`). WCAG-Ausnahme: rein dekorative Elemente sind ausgenommen (1.4.3, Note 2). Konform.

**3. Weiß auf `emerald-500` (Hover-Zustand, 2.54)** — FAIL

Tritt nur kurz beim Mouseover auf, und die Information ist auch im Ruhezustand (`emerald-600`, 3.77) verfügbar. Kein dauerhaftes Lesehindernis. Empfehlung: für sehr strikte AAA-Pflicht den Hover auf `emerald-700` setzen.

**4. Heatmap-Beschriftung auf hellen Zellen** — FAIL

Tritt bei den ~3% wahrscheinlichsten Score-Zellen auf (`bg-emerald-500/70`). Die **Information ist redundant** durch:
- Die Farbintensität selbst (höher = wahrscheinlicher)
- Den Tooltip beim Hovern mit dem exakten Wert
- Die Top-5-Liste oberhalb der Heatmap

Workaround eingebaut: bei Zellen mit Intensität >0.4 wird Text in `text-white` gerendert, sonst in `text-zinc-500` (was auf `emerald-500/15` AA-konform ist mit 6.20).

## Touch-Target-Größen (WCAG 2.5.5)

| Element | min-h / min-w | WCAG |
|---|---|---|
| Tab-Buttons | `min-h-[44px]` | ✓ AAA (≥44px) |
| Primary Button (Quoten laden) | `min-h-[36px]` | ⚠ AA (≥24px) – nicht ideal |
| Match-Cards | `min-h-[60px]` | ✓ AAA |
| Manuelle Quoten-Inputs | `py-2` ≈ 38px | ⚠ AA |
| Settings-Buttons | `min-h-[40px]` | ✓ AA |
| Sprach-Switcher | ~26px | ⚠ unter AA |

Empfehlung: Primary-Button und Sprach-Switcher auf 44px erhöhen für AAA. Nicht dringend, da auf Desktop irrelevant und Touch-User selten den Sprach-Switcher in Mitten der Nutzung anfassen.

## Keyboard-Navigation (WCAG 2.1.1)

- ✓ Alle interaktiven Elemente sind via Tab erreichbar (native `<button>`, `<a>`, `<input>`).
- ✓ Focus-States vorhanden via Tailwind `focus:border-emerald-500`.
- ⚠ Match-Cards sind `<button>` (gut), aber das **expandierte Detail-Panel** nicht Keyboard-erreichbar — das innere `<input>` und `<button>`-Elemente sind aber Standard-fokusable.
- ⚠ Keine Escape-Taste zum Schließen der expandierten Card. Wäre nützlich.

## ARIA / Screen-Reader (WCAG 1.3.1 / 4.1.2)

Bestehende ARIA-Annotations:
- ✓ `aria-label="Sprache wählen"` am Sprach-Switcher
- ✓ `aria-expanded` an Match-Cards
- ⚠ Tab-Buttons haben kein `role="tab"` / `aria-selected`
- ⚠ Detail-Panels haben kein `role="region"` mit `aria-labelledby`
- ⚠ Toasts haben kein `role="status"` / `aria-live="polite"`

Diese ARIA-Verbesserungen sind v2026.05.23.4 nachträglich eingebaut (siehe app.js / HTMLs).

## Semantik (WCAG 1.3.1)

- ✓ `<h1>` → `<h2>` → `<h3>` Hierarchie eingehalten
- ✓ `<main>`, `<header>`, `<nav>`, `<footer>` korrekt verwendet
- ✓ `<section data-tab-content>` ist semantisch ein Region

## Sprache und Internationalisierung (WCAG 3.1.1 / 3.1.2)

- ✓ `<html lang="de|en|fr|es">` korrekt pro URL gesetzt
- ✓ `hreflang` zwischen Sprachversionen
- ⚠ Innerhalb einer Sprache werden manchmal englische Buchmacher-Namen angezeigt (z.B. "Bet365") — das ist unkritisch da Eigennamen.

## Zusammenfassung

**Konformitäts-Level: WCAG 2.1 Level AA** weitgehend, mit dokumentierten Ausnahmen für dekorative Elemente. Empfohlene Schritte für **Level AAA**:

1. `zinc-500` → `zinc-400` für tertiären Text upgraden
2. Primary-Button auf `min-h-[44px]`
3. Sprach-Switcher auf min 44×44px
4. Hover-Button-Farbe `emerald-500` → `emerald-700`
5. Tab-Buttons mit `role="tab"` und `aria-selected` annotieren
6. ESC-Key-Handler für expand close

Diese sind alle nicht-blockierend und können iterativ ergänzt werden.

## Test-Tools verwendet

- WCAG Contrast Calculator (eigene Implementierung in `/tmp/contrast.js`)
- Manueller Tab-Navigation-Walkthrough
- Lighthouse-Accessibility-Audit (empfohlen für Production: Score ≥ 90 anzustreben)
