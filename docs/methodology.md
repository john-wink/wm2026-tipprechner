# Methodik

## Modell-Pipeline

Das Tool implementiert die folgende Vorhersage-Pipeline pro Spiel:

```
Buchmacher-Quoten (1X2)
  ↓ Vig-Removal (multiplikativ-normalisiert)
1X2-Wahrscheinlichkeiten (P(H), P(D), P(A))
  ↓ Lambda-Schätzung (numerisch via Gradient Descent)
Erwartete Tore (λ_home, λ_away)
  ↓ Unabhängige Poisson + Dixon-Coles-Korrektur
Score-Matrix P(X=i, Y=j) für 8×8
  ↓ Erwartungswert-Maximierung über Kicktipp-Punkte
Optimaler Tipp (a, b) + erwartete Punkte
```

## Modell-Annahmen und Quellen

**1. Vig-Removal (multiplikative Normalisierung)**

Aus dem Bookmaker-Aggregator `the-odds-api.com` werden Dezimalquoten gezogen. Die implizite Marge (Vig) wird mit der einfachsten und am weitesten verbreiteten Methode entfernt:

$$
p_k = \frac{1/o_k}{\sum_j 1/o_j}
$$

Diese Methode setzt voraus, dass die Marge proportional zur Underlying-Wahrscheinlichkeit verteilt ist – eine starke Annahme. *Shin (1993)*[^1] schlug eine besser fundierte Alternative vor (Insider-Trading-Modell), die wir aus Komplexitätsgründen nicht implementiert haben. Limitation siehe `limitations.md`.

[^1]: Shin, H. S. (1993). "Measuring the Incidence of Insider Trading in a Market for State-Contingent Claims." *The Economic Journal*, 103(420), 1141–1153.

**2. Poisson-Modell für Tore**

Wir modellieren Tore eines Teams als unabhängige Poisson-verteilte Größen mit Raten λ_home, λ_away:

$$
P(X = i, Y = j) = \frac{\lambda_H^i e^{-\lambda_H}}{i!} \cdot \frac{\lambda_A^j e^{-\lambda_A}}{j!}
$$

Begründet durch *Maher (1982)*[^2], der zeigte, dass die Poisson-Verteilung Tor-Anzahlen in Fußballspielen gut approximiert. Die Annahme der **Unabhängigkeit** ist jedoch problematisch — siehe `limitations.md`.

[^2]: Maher, M. J. (1982). "Modelling Association Football Scores." *Statistica Neerlandica*, 36(3), 109–118.

**3. Dixon-Coles-Korrektur**

*Dixon & Coles (1997)*[^3] zeigten, dass das reine Poisson-Modell die Wahrscheinlichkeit niedriger Endstände (0:0, 1:0, 0:1, 1:1) systematisch unter- bzw. überschätzt. Sie schlagen eine Korrektur via Faktor τ(i, j) vor:

$$
P^*(X=i, Y=j) = P(X=i, Y=j) \cdot \tau(i, j; \lambda_H, \lambda_A, \rho)
$$

mit:
- τ(0,0) = 1 − λ_H · λ_A · ρ
- τ(0,1) = 1 + λ_H · ρ
- τ(1,0) = 1 + λ_A · ρ
- τ(1,1) = 1 − ρ
- τ(i,j) = 1 sonst

Wir verwenden den Default ρ = −0.1, der in der Literatur für moderne Daten gängig ist. Die Sensitivitätsanalyse (`sensitivity.json`) zeigt jedoch, dass für die WM 2022 ρ = +0.05 bessere Brier-Scores liefert.

[^3]: Dixon, M. J., & Coles, S. G. (1997). "Modelling Association Football Scores and Inefficiencies in the Football Betting Market." *Journal of the Royal Statistical Society: Series C (Applied Statistics)*, 46(2), 265–280.

**4. Lambda-Schätzung**

Gegeben (P(H), P(D), P(A)) suchen wir (λ_H, λ_A) so dass das Poisson-Modell diese 1X2-Wahrscheinlichkeiten erzeugt. Da P(H), P(D), P(A) drei Werte sind und (λ_H, λ_A) zwei, ist das System überbestimmt — wir minimieren die quadratische Fehlerfunktion:

$$
\text{err}(\lambda_H, \lambda_A) = (P_H^{\text{model}} - P_H)^2 + (P_D^{\text{model}} - P_D)^2 + (P_A^{\text{model}} - P_A)^2
$$

per Gradient Descent (40 Iterationen, adaptive Schrittweite, Initialisierung via grober Grid-Suche 14×14).

**5. Kicktipp-Optimierung**

Für jeden möglichen Tipp (a, b) ∈ {0..7}² berechnen wir den Erwartungswert der Punkte:

$$
EV(a, b) = \sum_{i=0}^{7} \sum_{j=0}^{7} P(X=i, Y=j) \cdot \text{points}(a, b, i, j)
$$

mit Kicktipp-Regeln: 4 Punkte exakt, 3 Punkte Tordifferenz (kein Remis), 2 Punkte Tendenz (inkl. Remis). Argmax liefert den optimalen Tipp.

**6. Monte-Carlo-Simulation (Gruppensieger & Turnier)**

Über N Iterationen wird jedes Spiel basierend auf seiner Score-Matrix gesampelt. Die FIFA-Tabellenregeln (Punkte → Tordifferenz → Tore) sortieren danach. Das KO-Bracket folgt der offiziellen 2026-Struktur (siehe `architecture.md`). KO-Spiele werden via Bradley-Terry-Modell entschieden:

$$
P(A \text{ schlägt } B) = \frac{s_A}{s_A + s_B}
$$

mit Stärken s aus den Outright-Weltmeister-Quoten abgeleitet.

## Validierung

### Backtest gegen WM 2022 (48 Gruppenspiele)

| Modell | Brier ↓ | RPS ↓ | LogLoss ↓ | Accuracy ↑ |
|---|---|---|---|---|
| Uniform (Baseline 1) | 0.6667 | 0.2431 | 1.0986 | 39.6% |
| Home-Advantage (Baseline 2) | 0.6670 | 0.2491 | 1.0984 | 39.6% |
| Stärke-Bradley-Terry (Baseline 3) | 0.7054 | 0.2683 | 1.2239 | 39.6% |
| Poisson-only | 0.7054 | 0.2683 | 1.2239 | 39.6% |
| **Tool: Poisson + Dixon-Coles** | **0.7079** | **0.2687** | **1.2428** | **39.6%** |

**Ehrliche Interpretation:** Das selbstsichere Modell schneidet auf der WM 2022 **schlechter ab als die Uniform-Baseline**. Das hat mehrere Gründe:

1. **Kleine Stichprobe** (N=48) mit vielen Überraschungen (Argentinien 1:2 Saudi-Arabien, Marokko, Japan 2:1 Spanien, etc.) — die Verlustfunktionen bestrafen selbstsichere falsche Vorhersagen exponentiell.
2. **Stärke-Approximation** statt echter historischer Buchmacher-Quoten — die Stärken sind ad hoc aus Outright kalibriert, nicht aus Spiel-spezifischen 1X2-Quoten.
3. **Dixon-Coles ρ = -0.1** ist nicht für WM-Daten optimiert. Die Sensitivitätsanalyse zeigt, dass ρ = +0.05 hier besser wäre.

Eine valide Schlussfolgerung wäre: *das Tool ist im Sinne eines Hilfsmittels zur Tippspiel-Optimierung nützlich, aber NICHT ein "schärferes" Vorhersage-Modell als die einfachen Baselines bei einem einzelnen Turnier.* Mehrere Turniere als Stichprobe würden für eine belastbare Aussage benötigt.

### Sensitivitätsanalyse

Variation der Schlüsselparameter zeigt:

- **ρ ∈ [-0.30, +0.05]**: Brier verbessert sich monoton mit steigendem ρ. Best für WM 2022: ρ=+0.05. Das Lehrbuch-Standard -0.1 ist also für unsere Daten nicht optimal. Ein adaptives ρ pro Turnier wäre eine valide Weiterentwicklung.
- **maxGoals**: 7 reicht (Σ Matrix = 99.99%). Höhere Werte bringen vernachlässigbare Verbesserung.
- **Reproduzierbarkeit**: Mit Seeded Random (mulberry32) sind alle Monte-Carlo-Läufe deterministisch identisch. Ohne Seed: σ ≈ 0.005 auf Champion-Wkt bei N=1500 Iterationen.

Volle Ergebnisse: `research/results.json`, `research/sensitivity.json`.

## Reproduzierbarkeit

Sämtliche Monte-Carlo-Komponenten nutzen einen seedbaren PRNG (mulberry32). Aufrufkonvention:

```javascript
setRngSeed(42);
const result = simulateFullTournament(settings, 1500);
// → bei gleichem Seed und Input garantiert identische Ergebnisse
```

Backtest und Sensitivitätsanalyse können via `node research/backtest.js` und `node research/sensitivity.js` jederzeit reproduziert werden.
