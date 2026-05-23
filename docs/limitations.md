# Limitationen und Kritik

Kritische Reflexion der Modell- und Implementierungs-Annahmen.

## Mathematische Limitationen

### Unabhängige Poisson-Verteilung

Das Modell nimmt an, dass Heim- und Auswärtstore **unabhängig** Poisson-verteilt sind. Empirisch ist das nicht exakt korrekt:

- Tore innerhalb eines Spiels sind **korreliert** (Pacing, Hopfen-Effekte, Spielstand-abhängige Strategie-Anpassungen).
- *Karlis & Ntzoufras (2003)* zeigten, dass **bivariate Poisson** oder **Negativ-Binomial** Verteilungen besser passen.
- Wir haben das **nicht** implementiert — wäre ein valider Verbesserungsschritt.

### Dixon-Coles ρ ist gelernt für englische Liga

Das ρ=-0.1 stammt aus *Dixon & Coles (1997)* basierend auf englischen Premier-League-Daten der 1990er. Es ist nicht klar, dass dieser Wert auf WM-Daten (kürzere Turniere, internationale Teams, andere Spielstile) übertragbar ist. Unsere Sensitivitätsanalyse zeigt sogar, dass ρ=+0.05 auf WM 2022 besser performt — also der Korrekturfaktor in **die entgegengesetzte Richtung** wirken sollte.

**Bessere Lösung:** Maximum-Likelihood-Schätzung von ρ auf historischen WM-Daten. Mit unseren 48 Spielen ist die Schätzung aber instabil.

### Multiplikative Vig-Normalisierung

Der Standard-Ansatz unterstellt, dass die Bookmaker-Marge proportional zu den impliziten Wkt verteilt ist. *Shin (1993)* schlägt eine differenziertere Methode vor, die Insider-Informationen modelliert. Wir haben das nicht implementiert.

### Bradley-Terry-Modell für KO-Spiele

Unser Modell für Knockout-Phasen:

$$
P(A \text{ schlägt } B) = \frac{s_A}{s_A + s_B}
$$

ist eine **starke Vereinfachung**. Es ignoriert:

- **Heimvorteil** (relevant bei den drei Gastgeber-Nationen USA/Kanada/Mexiko)
- **Verlängerung und Elfmeterschießen** (~15-20% der KO-Spiele)
- **Form-Aktualisierung** während des Turniers
- **Match-spezifische Faktoren** (Verletzungen, Sperren, Wetter)

### Stärke-Approximation im Backtest

Im `research/wc2022-data.js` haben wir Team-Stärken **ad hoc kalibriert** anhand Pre-Tournament-Outright-Quoten. Das ist nicht das Gleiche wie echte historische 1X2-Quoten pro Spiel. Eine sauberere Validierung würde:

1. Echte Pre-Tournament 1X2-Quoten von Pinnacle / Bet365 für alle 48 Spiele aus Archiv beschaffen
2. Diese als Input ins Tool füttern
3. Gegen tatsächliche Ergebnisse messen

Das wurde aus Datenbeschaffungs-Gründen nicht gemacht — eine wichtige Limitation für eine veröffentlichungs-fähige Studie.

## Validierungs-Limitationen

### Kleine Stichprobe

48 Gruppenspiele ist statistisch **knapp**. Standardfehler für Brier-Score-Differenzen bei N=48 ist ~0.03 — die beobachteten Differenzen zwischen Tool und Baseline (~0.04) sind nicht signifikant. Für robuste Aussagen bräuchte es:

- Mindestens 5 vergangene Turniere (~250 Spiele)
- Idealerweise WM + EM + Copa América
- Pro Turnier separate ρ-Schätzung

### Survivorship Bias

Pre-Tournament-Quoten reflektieren auch die **Erwartung** der Buchmacher, die nicht immer richtig sind (siehe Saudi-Arabien-Sieg gegen Argentinien). Ein "perfektes" Modell hätte trotzdem schlechte Brier-Scores auf einzelnen Turnieren mit vielen Überraschungen.

### Keine Out-of-Sample-Validierung

Idealerweise würde man:
- ρ und Total-Goals-Parameter auf 80% der Daten *trainieren*
- Auf den 20% Hold-Out *testen*

Wir trainieren überhaupt nicht — ρ ist hardcoded. Eine MLE-Schätzung mit Cross-Validation wäre eine ehrliche Erweiterung.

## Implementierungs-Limitationen

### Globale State

`matchData`, `outrightData`, `expandedId`, `sortField`, `tournamentSimResult` sind alle global. Bei einem Refactor zu mehreren Instanzen oder Server-Side-Rendering müsste dieser State gekapselt werden (z.B. Klasse oder Module).

### Inline-onclick-Handler

Render-Funktionen erzeugen HTML-Strings mit `onclick="updateOdds(...)"`. Das funktioniert, ist aber:
- Schlecht testbar (jeder Click ist global gebunden)
- XSS-Vektor falls User-Daten in den HTML-String einfließen würden (aktuell tun sie das nicht)
- Eine modernere Lösung wären delegated Event-Listener oder ein Reactive Framework.

### Performance

`renderOverview()` und `renderGroups()` machen jeweils einen **vollständigen Re-Render** des kompletten Tab-Inhalts. Bei jedem Settings-Change wird alles neu generiert. Mit 72 Spielen ist das OK (~50ms), aber nicht elegant.

### Keine Caching-Strategie für Berechnungen

`computeMatch(m, settings)` wird bei jedem Render mehrmals pro Spiel aufgerufen (für Übersicht, für Gruppen, für Specials). Memoization würde 3-5× Speed-Up bringen.

### Test-Coverage

Aktuell ~50% der Math-Funktionen sind durch Tests abgedeckt. Render-Funktionen, API-Fetcher und Storage-Layer haben **keine** Tests. Für Produktiv-Code wären 80%+ Standard.

## Rechtliche / Ethische Limitationen

- **Wett-Bezug**: Das Tool nutzt Buchmacher-Quoten als Input. In Deutschland ist die Bewerbung von Glücksspielen reguliert. Ein Disclaimer in der UI fehlt.
- **Kein Impressum**: Bei kommerzieller Veröffentlichung in DE gesetzlich vorgeschrieben (§5 TMG).
- **API-ToS**: `the-odds-api.com` erlaubt die Verwendung; der API-Key ist im Klartext im localStorage und damit XSS-anfällig.

## Was wäre eine "gute Note 1,0"-Version?

1. **Validierung über 5+ Turniere** mit echten historischen 1X2-Quoten.
2. **MLE-geschätztes ρ pro Turnier-Typ** statt Hardcoded.
3. **Bivariate Poisson oder Skellam-Modell** statt unabhängige Marginals.
4. **Heimvorteil in KO-Phase** für Gastgeber-Nationen.
5. **Out-of-Sample-Cross-Validation** mit Bootstrap-Konfidenzintervallen.
6. **Verlängerung und Elfmeter** als Submodell.
7. **Bivariate Korrelationsstruktur** zwischen Spielen (Strafen → Müdigkeit → schwächeres nächstes Spiel).
