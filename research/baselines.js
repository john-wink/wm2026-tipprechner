// Baseline-Modelle zum Vergleich gegen das Tool

// 1) Uninformiert: gleichverteilt
function baselineUniform() {
  return { pH: 1/3, pD: 1/3, pA: 1/3 };
}

// 2) Home-Advantage: typische Liga-Verteilung (Empirie ~46/27/27)
function baselineHomeAdv() {
  return { pH: 0.46, pD: 0.27, pA: 0.27 };
}

// 3) Stärke-basiert (Bradley-Terry-ähnlich, keine Poisson)
// P(H) = (s_h + λ_home) / (s_h + s_a + λ_home + draw_const)
// Heim-Vorteil als additive Konstante
function baselineStrength(strH, strA, homeAdv = 0.02, drawBase = 0.27) {
  const sH = strH + homeAdv;
  const sA = strA;
  const total = sH + sA;
  const pNonDraw = 1 - drawBase;
  return {
    pH: pNonDraw * sH / total,
    pD: drawBase,
    pA: pNonDraw * sA / total
  };
}

// 4) Tool-Modell ohne Dixon-Coles (reines Poisson)
// Wir nutzen die Stärke um eine Quote zu approximieren, dann das volle Pipeline.
function poissonOnlyPrediction(app, strH, strA, settings) {
  // Stärke → 1X2-Wkt → λ via findLambdas → P(H/D/A) aus Score-Matrix
  const probs1X2 = baselineStrength(strH, strA);
  const [lh, la] = app.findLambdas(probs1X2.pH, probs1X2.pD, probs1X2.pA);
  const M = app.scoreMatrix(lh, la, settings.maxGoals);
  // Aggregiere Matrix zu P(H/D/A)
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) {
    if (i > j) pH += M[i][j];
    else if (i === j) pD += M[i][j];
    else pA += M[i][j];
  }
  // Re-normalisieren (Matrix-Trunkierung könnte minimal abweichen)
  const sum = pH + pD + pA;
  return { pH: pH/sum, pD: pD/sum, pA: pA/sum };
}

// 5) Vollständiges Tool-Modell: Poisson + Dixon-Coles
function toolPrediction(app, strH, strA, settings, rho = -0.1) {
  const probs1X2 = baselineStrength(strH, strA);
  const [lh, la] = app.findLambdas(probs1X2.pH, probs1X2.pD, probs1X2.pA);
  let M = app.scoreMatrix(lh, la, settings.maxGoals);
  M = app.applyDixonColes(M, lh, la, rho);
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) {
    if (i > j) pH += M[i][j];
    else if (i === j) pD += M[i][j];
    else pA += M[i][j];
  }
  const sum = pH + pD + pA;
  return { pH: pH/sum, pD: pD/sum, pA: pA/sum };
}

if (typeof module !== 'undefined') {
  module.exports = {
    baselineUniform, baselineHomeAdv, baselineStrength,
    poissonOnlyPrediction, toolPrediction
  };
}
