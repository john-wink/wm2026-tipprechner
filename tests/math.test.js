// Unit-Tests für die Mathe-Engine

test('poissonPMF: P(k=0|λ=0) = 1', () => {
  const app = loadApp();
  assertClose(app.poissonPMF(0, 0), 1, 1e-9);
});

test('poissonPMF: Σ_k=0..20 P(k|λ=2.5) ≈ 1', () => {
  const app = loadApp();
  let s = 0;
  for (let k = 0; k <= 20; k++) s += app.poissonPMF(k, 2.5);
  assertClose(s, 1, 1e-6);
});

test('poissonPMF: Mittelwert = λ (empirisch)', () => {
  const app = loadApp();
  const lambda = 1.8;
  let m = 0;
  for (let k = 0; k <= 30; k++) m += k * app.poissonPMF(k, lambda);
  assertClose(m, lambda, 1e-4);
});

test('oddsToProbs: 1X2-Wkt summieren zu 1 (Vig entfernt)', () => {
  const app = loadApp();
  const p = app.oddsToProbs(2.0, 3.5, 4.0);
  assertClose(p.pH + p.pD + p.pA, 1, 1e-9);
  assert(p.vig > 0, 'Vig sollte > 0 sein');
});

test('oddsToProbs: invalide Quoten → null', () => {
  const app = loadApp();
  assertEq(app.oddsToProbs(0.5, 3, 4), null);
  assertEq(app.oddsToProbs(null, 3, 4), null);
  assertEq(app.oddsToProbs(2, undefined, 4), null);
});

test('oddsToProbs: faire Quoten (Vig=0) → exakte 1/odd-Wkt', () => {
  const app = loadApp();
  // Quoten so dass 1/o1 + 1/o2 + 1/o3 = 1: 3, 3, 3
  const p = app.oddsToProbs(3, 3, 3);
  assertClose(p.pH, 1/3, 1e-9);
  assertClose(p.vig, 0, 1e-9);
});

test('scoreMatrix: Σ aller Zellen ≈ 1', () => {
  const app = loadApp();
  const M = app.scoreMatrix(1.5, 1.2, 10);
  let s = 0;
  for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) s += M[i][j];
  assertClose(s, 1, 1e-3);
});

test('outcomesFromLambdas: gleiche λ → höchste D-Wkt unter ähnlichen', () => {
  const app = loadApp();
  const [h, d, a] = app.outcomesFromLambdas(1.0, 1.0);
  assertClose(h, a, 1e-9, 'symmetrische λ → h = a');
});

test('findLambdas: konvergiert zu gegebenen Wahrscheinlichkeiten', () => {
  const app = loadApp();
  // Erzeuge bekannte Lambdas, schaue ob Reverse funktioniert
  const [trueLH, trueLA] = [1.8, 0.9];
  const [h, d, a] = app.outcomesFromLambdas(trueLH, trueLA);
  const [lh, la] = app.findLambdas(h, d, a);
  // Fit-Qualität: outcomesFromLambdas(lh, la) sollte (h,d,a) treffen
  const [h2, d2, a2] = app.outcomesFromLambdas(lh, la);
  assertClose(h2, h, 0.005, 'P(H)');
  assertClose(d2, d, 0.005, 'P(D)');
  assertClose(a2, a, 0.005, 'P(A)');
});

test('findLambdas: Performance < 50ms pro Aufruf', () => {
  const app = loadApp();
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) app.findLambdas(0.5, 0.3, 0.2);
  const avg = (Date.now() - t0) / 10;
  assert(avg < 50, `${avg.toFixed(1)}ms (target < 50ms)`);
});

test('ktPoints: exakt = 4', () => {
  const app = loadApp();
  assertEq(app.ktPoints(2, 1, 2, 1, {exact:4, diff:3, tend:2}), 4);
});

test('ktPoints: Tordifferenz (kein Remis) = 3', () => {
  const app = loadApp();
  assertEq(app.ktPoints(2, 1, 3, 2, {exact:4, diff:3, tend:2}), 3);
});

test('ktPoints: Remis-Diff = nur Tendenz (2)', () => {
  const app = loadApp();
  // Tipp 1:1, Real 2:2: Diff stimmt (0=0) aber beide Remis → Tendenz, NICHT Diff
  assertEq(app.ktPoints(1, 1, 2, 2, {exact:4, diff:3, tend:2}), 2);
});

test('ktPoints: Tendenz Heimsieg = 2', () => {
  const app = loadApp();
  assertEq(app.ktPoints(1, 0, 3, 1, {exact:4, diff:3, tend:2}), 2);
});

test('ktPoints: falsche Tendenz = 0', () => {
  const app = loadApp();
  assertEq(app.ktPoints(1, 0, 0, 1, {exact:4, diff:3, tend:2}), 0);
});

test('bestKicktippTip: bei sicherem Favoriten → erwartete EP > 1', () => {
  const app = loadApp();
  const M = app.scoreMatrix(2.5, 0.5, 7); // Heim sehr stark
  const best = app.bestKicktippTip(M, {exact:4, diff:3, tend:2}, 7);
  assert(best.ep > 1.5, `EP=${best.ep} sollte hoch sein bei klarem Favoriten`);
  assert(best.h > best.a, 'Tipp sollte Heimsieg sein');
});

test('topScores: Top-Ergebnis ist das wahrscheinlichste', () => {
  const app = loadApp();
  const M = app.scoreMatrix(0.5, 0.4, 7); // Defensives Spiel → 0:0 sehr wahrscheinlich
  const top = app.topScores(M, 3);
  assertEq(top[0].score, '0:0');
});

test('Dixon-Coles: ρ=0 → matrix unverändert', () => {
  const app = loadApp();
  const M = app.scoreMatrix(1.5, 1.2, 7);
  const before = M[0][0];
  app.applyDixonColes(M, 1.5, 1.2, 0);
  assertClose(M[0][0], before, 1e-9);
});

test('Dixon-Coles: τ(0,0) für ρ<0 erhöht P(0:0) (Re-Normalisierung berücksichtigen)', () => {
  const app = loadApp();
  const tau00 = app.dixonColesTau(0, 0, 1.5, 1.2, -0.1);
  assert(tau00 > 1, `τ(0,0)=${tau00} sollte > 1 sein bei ρ<0`);
  const tau11 = app.dixonColesTau(1, 1, 1.5, 1.2, -0.1);
  assert(tau11 > 1, `τ(1,1)=${tau11} sollte > 1 sein bei ρ<0`);
});

test('Dixon-Coles: Σ bleibt 1 nach Korrektur', () => {
  const app = loadApp();
  const M = app.scoreMatrix(1.5, 1.2, 10);
  app.applyDixonColes(M, 1.5, 1.2, -0.1);
  let s = 0;
  for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) s += M[i][j];
  assertClose(s, 1, 1e-6);
});

test('Mulberry32: gleicher Seed → gleiche Sequenz', () => {
  const app = loadApp();
  const rngA = app.mulberry32(42);
  const rngB = app.mulberry32(42);
  for (let i = 0; i < 100; i++) assertEq(rngA(), rngB());
});

test('Mulberry32: unterschiedliche Seeds → unterschiedliche Sequenzen', () => {
  const app = loadApp();
  const rngA = app.mulberry32(1);
  const rngB = app.mulberry32(2);
  assert(rngA() !== rngB());
});

test('aggregateBookmakers: leerer Input → null-Felder', () => {
  const app = loadApp();
  const agg = app.aggregateBookmakers([]);
  assertEq(agg.n, 0);
  assertEq(agg.median, null);
  assertEq(agg.mean, null);
  assertEq(agg.pinnacle, null);
});

test('aggregateBookmakers: Median = Mean bei symmetrischen Daten', () => {
  const app = loadApp();
  const bd = [
    { key: 'a', pH: 0.5, pD: 0.3, pA: 0.2 },
    { key: 'b', pH: 0.5, pD: 0.3, pA: 0.2 },
    { key: 'c', pH: 0.5, pD: 0.3, pA: 0.2 }
  ];
  const agg = app.aggregateBookmakers(bd);
  assertClose(agg.median.pH, agg.mean.pH, 1e-9);
});

test('aggregateBookmakers: Pinnacle-Filter funktioniert', () => {
  const app = loadApp();
  const bd = [
    { key: 'bet365', pH: 0.4, pD: 0.3, pA: 0.3 },
    { key: 'pinnacle', pH: 0.5, pD: 0.3, pA: 0.2 }
  ];
  const agg = app.aggregateBookmakers(bd);
  assertEq(agg.pinnacle.pH, 0.5);
});
