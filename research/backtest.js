#!/usr/bin/env node
/**
 * Backtest gegen WM 2022.
 *
 * Vergleicht das Tool-Modell (Poisson + Dixon-Coles) gegen drei Baselines auf 48 Gruppenspielen
 * der WM 2022. Metriken: Brier, RPS, Log-Loss, Accuracy. Tabelle wird auf stdout ausgegeben
 * und als JSON in research/results.json gespeichert.
 *
 * Run: node research/backtest.js
 */
const fs = require('fs');
const path = require('path');

const { WC2022_STRENGTH, WC2022_MATCHES } = require('./wc2022-data.js');
const { brierScore, rankedProbabilityScore, logLoss, accuracy, outcomeFix } = require('./metrics.js');
const {
  baselineUniform, baselineHomeAdv, baselineStrength,
  poissonOnlyPrediction, toolPrediction
} = require('./baselines.js');

// Lade das Hauptmodell (Sandbox-Style)
const ROOT = path.resolve(__dirname, '..');
const i18nCode = fs.readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8');
const appCode = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

const doc = {
  documentElement: { lang: 'en' },
  addEventListener: () => {},
  getElementById: (id) => ({ value: { ptsExact:'4', ptsDiff:'3', ptsTend:'2', maxGoals:'7', defaultAgg:'median', dixonColesRho: '-0.1' }[id] || '', checked: true, addEventListener: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} }, tagName: 'INPUT' }),
  querySelectorAll: () => [], querySelector: () => null
};
const win = { addEventListener: () => {}, scrollTo: () => {}, APP_LANG: 'en' };

const appFn = new Function(
  'window','document','navigator','localStorage','fetch','URL','URLSearchParams','Blob','confirm','alert','console','event','caches',
  i18nCode + '\n' + appCode + '\n;return { findLambdas, scoreMatrix, applyDixonColes };'
);
const app = appFn(win, doc, {language:'en',languages:['en']}, {getItem:()=>null,setItem:()=>{},removeItem:()=>{}}, ()=>Promise.reject(), null, null, null, ()=>true, ()=>{}, console, null, null);

const settings = { exact:4, diff:3, tend:2, maxGoals: 7 };

// Generiere Predictions für jede Methode auf allen 48 Spielen
function generatePredictions() {
  const outcomes = [];
  const preds = { uniform: [], homeAdv: [], strength: [], poissonOnly: [], toolFull: [] };

  for (const [home, away, hg, ag] of WC2022_MATCHES) {
    const sH = WC2022_STRENGTH[home];
    const sA = WC2022_STRENGTH[away];
    if (sH === undefined || sA === undefined) {
      console.warn(`Skipping ${home} vs ${away}: missing strength`);
      continue;
    }
    outcomes.push(outcomeFix(hg, ag));
    preds.uniform.push(baselineUniform());
    preds.homeAdv.push(baselineHomeAdv());
    preds.strength.push(baselineStrength(sH, sA));
    preds.poissonOnly.push(poissonOnlyPrediction(app, sH, sA, settings));
    preds.toolFull.push(toolPrediction(app, sH, sA, settings, -0.1));
  }
  return { preds, outcomes };
}

// Berechne alle Metriken
function evaluateAll(preds, outcomes) {
  const out = {};
  for (const [name, p] of Object.entries(preds)) {
    out[name] = {
      n: p.length,
      brier: brierScore(p, outcomes),
      rps: rankedProbabilityScore(p, outcomes),
      logLoss: logLoss(p, outcomes),
      accuracy: accuracy(p, outcomes)
    };
  }
  return out;
}

// Pretty-Print Tabelle
function printTable(results) {
  const fmt = (v) => v.toFixed(4);
  const cols = ['Brier ↓', 'RPS ↓', 'LogLoss ↓', 'Accuracy ↑'];
  const rows = [
    ['Uniform (Baseline 1)', 'uniform'],
    ['Home-Advantage (Baseline 2)', 'homeAdv'],
    ['Stärke-Bradley-Terry (Baseline 3)', 'strength'],
    ['Poisson-only (Modell)', 'poissonOnly'],
    ['Tool: Poisson + Dixon-Coles', 'toolFull']
  ];
  const W = 36;
  console.log('\n' + ' '.repeat(W) + cols.join('   '));
  console.log('─'.repeat(W + cols.join('   ').length));
  for (const [label, key] of rows) {
    const r = results[key];
    console.log(
      label.padEnd(W) +
      fmt(r.brier).padStart(8) + '   ' +
      fmt(r.rps).padStart(6) + '   ' +
      fmt(r.logLoss).padStart(8) + '   ' +
      fmt(r.accuracy).padStart(10)
    );
  }
  console.log('\nAlle Metriken: niedriger = besser außer Accuracy (höher = besser).');
  console.log(`N = ${results.toolFull.n} Spiele (WM 2022 Gruppenphase).`);
}

// Vergleich Tool vs. Baselines: relative Verbesserung
function printComparison(results) {
  console.log('\n── Verbesserung Tool vs. Baselines ──');
  const tool = results.toolFull;
  const baseline = results.uniform;
  const rel = (a, b) => (((a - b) / a) * 100).toFixed(1);
  console.log(`Brier (vs Uniform):   ${rel(baseline.brier, tool.brier)}% Verbesserung`);
  console.log(`RPS   (vs Uniform):   ${rel(baseline.rps,   tool.rps)}% Verbesserung`);
  console.log(`Brier (vs Home-Adv):  ${rel(results.homeAdv.brier, tool.brier)}% Verbesserung`);
  console.log(`Brier (vs Stärke):    ${rel(results.strength.brier, tool.brier)}% Verbesserung`);
  console.log(`Brier (vs Poisson-only): ${rel(results.poissonOnly.brier, tool.brier)}% Verbesserung`);
  console.log(`Δ Tool vs Poisson-only (Dixon-Coles-Effekt): ${(results.poissonOnly.brier - tool.brier).toFixed(5)}`);
}

console.log('═══════════════════════════════════════════════');
console.log('  WM 2022 Backtest – 48 Gruppenspiele');
console.log('═══════════════════════════════════════════════');

const { preds, outcomes } = generatePredictions();
const results = evaluateAll(preds, outcomes);
printTable(results);
printComparison(results);

// Persistieren als JSON für Reproduzierbarkeit
const outputPath = path.join(__dirname, 'results.json');
fs.writeFileSync(outputPath, JSON.stringify({
  date: new Date().toISOString(),
  dataset: 'WM 2022 Gruppenphase',
  nMatches: outcomes.length,
  results
}, null, 2));
console.log(`\n→ Ergebnisse gespeichert: ${path.relative(ROOT, outputPath)}`);
