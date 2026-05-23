// Standard-Metriken zur Evaluation probabilistischer Prognosen
// Referenzen:
//   Brier (1950): "Verification of Forecasts Expressed in Terms of Probability"
//   Epstein (1969): "A Scoring System for Probability Forecasts of Ranked Categories" (RPS)
//   Constantinou & Fenton (2012): "Solving the problem of inadequate scoring rules for assessing
//     probabilistic football forecast models"

// Ein Prediction-Objekt: {pH, pD, pA} (sollte sich zu 1 summieren)
// Ein Outcome ist 'H' | 'D' | 'A'

function outcome(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'H';
  if (homeGoals < awayGoals) return 'D' === 'D' && homeGoals === awayGoals ? 'D' : 'A';
  return 'D';
}
function outcomeFix(h, a) {
  if (h > a) return 'H';
  if (h < a) return 'A';
  return 'D';
}

// Brier-Score: BS = (1/N) Σ Σ_k (p_k - o_k)²   mit o_k = 1 wenn outcome=k sonst 0
function brierScore(preds, outcomes) {
  let s = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i], o = outcomes[i];
    const oH = o === 'H' ? 1 : 0;
    const oD = o === 'D' ? 1 : 0;
    const oA = o === 'A' ? 1 : 0;
    s += (p.pH - oH)**2 + (p.pD - oD)**2 + (p.pA - oA)**2;
  }
  return s / preds.length;
}

// RPS (Ranked Probability Score): Bei geordneten Kategorien H/D/A
// RPS = (1/(K-1)) Σ_k (Σ_j≤k p_j - Σ_j≤k o_j)²   mit K=3 Kategorien
// Niedriger = besser. Beachtet die Ordnung (Heim-Niederlage ist "näher" an Remis als an Heimsieg)
function rankedProbabilityScore(preds, outcomes) {
  let s = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i], o = outcomes[i];
    // Kumulative Wkt: F1 = p_H, F2 = p_H + p_D, F3 = 1
    // Outcome kumulative: H → [1,1,1], D → [0,1,1], A → [0,0,1]
    const oH = o === 'H' ? 1 : 0;
    const oD = o === 'D' ? 1 : 0;
    const F1p = p.pH, F2p = p.pH + p.pD;
    const F1o = oH, F2o = oH + oD;
    s += ((F1p - F1o)**2 + (F2p - F2o)**2) / 2;
  }
  return s / preds.length;
}

// Log-Loss: -1/N Σ log(p_observed)
// Niedriger = besser. Bestraft sehr selbstsichere falsche Vorhersagen extrem.
function logLoss(preds, outcomes) {
  let s = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i], o = outcomes[i];
    let prob = o === 'H' ? p.pH : o === 'D' ? p.pD : p.pA;
    prob = Math.max(1e-9, prob); // Stabilität
    s += Math.log(prob);
  }
  return -s / preds.length;
}

// Accuracy: Anteil korrekt vorhergesagter Top-Picks
function accuracy(preds, outcomes) {
  let correct = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i];
    const argmax = (p.pH >= p.pD && p.pH >= p.pA) ? 'H'
                 : (p.pD >= p.pA) ? 'D' : 'A';
    if (argmax === outcomes[i]) correct++;
  }
  return correct / preds.length;
}

if (typeof module !== 'undefined') {
  module.exports = { brierScore, rankedProbabilityScore, logLoss, accuracy, outcomeFix };
}
