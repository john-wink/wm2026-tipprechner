# Design: Ergebnis-Historie & Prognose-Vergleich

Datum: 2026-07-04 · Status: vom Nutzer freigegeben (Variante A)

## Ziel

Vergangene Spiele mit echtem Ergebnis anzeigen und der damaligen Buchmacher-Prognose
gegenüberstellen, damit die Abweichung (in Kicktipp-Punkten) erkennbar ist.

## Kontext / Datenlage

- The Odds API (Free Tier): `/scores` liefert max. 3 Tage Historie; Historical-Endpoints
  sind gesperrt (401, geprüft am 04.07.2026). Alte Quoten sind nicht nachladbar.
- `applyApiEvents()` löschte bisher bei jedem Abruf alle `bookmakerData`/`koOddsIndex` —
  Prognosen gespielter Spiele gingen dadurch verloren.
- `resultData`/`koFixtures` persistieren in localStorage und akkumulieren.

## Entscheidungen (Nutzer)

1. **Backfill: ja** — fehlende Ergebnisse (72 Gruppenspiele + 7 Sechzehntelfinals vom
   28.–30.06.) werden per Web-Recherche (≥2 unabhängige Quellen, Cross-Check) ermittelt
   und statisch eingebettet.
2. **Darstellung: Badges + Auswertungs-Sektion.**

## Umsetzung (Variante A: alles in app.js)

1. **Quoten-Gedächtnis:** `applyApiEvents()` setzt `bookmakerData`/`koOddsIndex` nicht
   mehr pauschal zurück; nur Spiele im aktuellen Feed werden aktualisiert. Quoten
   verschwundener (= gespielter) Spiele bleiben als eingefrorene Prognose stehen.
2. **`STATIC_RESULTS`:** Konstante `[datumISO, heim, gast, hs, as]` (interne Team-Keys).
   `applyStaticResults()` merged beim Start nur fehlende Einträge in `resultData` +
   `koFixtures` (API-/lokale Daten haben Vorrang); statisch markierte Einträge
   (`static: true`) werden bei neuer App-Version aus der Konstante aufgefrischt.
3. **Badges** (`renderMatchCard`): „✓ 2:1" + Punkte des empfohlenen Tipps via
   `ktPoints()` (exakt/Differenz/Tendenz/daneben farbcodiert). Ohne Prognose nur Ergebnis.
4. **Auswertungs-Sektion** (Übersicht-Tab, einklappbar): Tabelle gespielter Spiele
   (Datum, Paarung, Prognose-Tipp, Ergebnis, Punkte) + Bilanz (Σ Punkte, Ø, Tendenz-
   Trefferquote). Bilanz zählt nur Spiele mit Prognose UND Ergebnis. i18n × 4 Sprachen.
5. **Tests:** Quoten-Einfrieren, Backfill-Merge-Semantik, Punkte-Bilanz.

## Nicht-Ziele

- Kein Nachladen historischer Quoten (Free Tier unmöglich).
- Keine Wahrscheinlichkeits-Abweichungsmetriken über Kicktipp-Punkte hinaus (YAGNI).
