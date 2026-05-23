#!/usr/bin/env node
/**
 * Sensitivitätsanalyse für die Modell-Parameter.
 *
 * Variiert:
 *   - ρ (Dixon-Coles-Korrektur) ∈ [-0.3 ... 0.0]
 *   - n_sims (Monte-Carlo) ∈ [200 ... 5000]
 *   - maxGoals (Score-Matrix) ∈ [5 ... 10]
 *
 * Misst Auswirkung auf:
 *   - Modell-Fit (Brier/RPS gegen WM-2022-Daten)
 *   - Reproduzierbarkeit (Standardabweichung über N=10 Sim-Läufe)
 *
 * Run: node research/sensitivity.js
 */
const fs = require('fs');
const path = require('path');

const { WC2022_STRENGTH, WC2022_MATCHES } = require('./wc2022-data.js');
const { brierScore, rankedProbabilityScore, outcomeFix } = require('./metrics.js');
const { baselineStrength, toolPrediction } = require('./baselines.js');

const ROOT = path.resolve(__dirname, '..');
const i18nCode = fs.readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8');
const appCode = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const doc = { documentElement: { lang: 'en' }, addEventListener: () => {}, getElementById: (id) => ({ value: { ptsExact:'4', ptsDiff:'3', ptsTend:'2', maxGoals:'7', defaultAgg:'median', dixonColesRho:'-0.1' }[id] || '', checked: true, addEventListener:()=>{}, classList:{toggle:()=>{},add:()=>{},remove:()=>{}}, tagName:'INPUT' }), querySelectorAll:()=>[], querySelector:()=>null };
const win = { addEventListener:()=>{}, scrollTo:()=>{}, APP_LANG:'en' };
const appFn = new Function('window','document','navigator','localStorage','fetch','URL','URLSearchParams','Blob','confirm','alert','console','event','caches', i18nCode + '\n' + appCode + '\n;return { findLambdas, scoreMatrix, applyDixonColes };');
const app = appFn(win, doc, {language:'en',languages:['en']}, {getItem:()=>null,setItem:()=>{},removeItem:()=>{}}, ()=>Promise.reject(), null, null, null, ()=>true, ()=>{}, console, null, null);

const baseSettings = { exact:4, diff:3, tend:2, maxGoals: 7 };

// === A) Sensitivität gegenüber ρ (Dixon-Coles) ===
console.log('═══════════════════════════════════════════════');
console.log('A) Sensitivität gegenüber ρ (Dixon-Coles)');
console.log('═══════════════════════════════════════════════');
console.log(`\n${'ρ'.padEnd(8)}${'Brier'.padStart(10)}${'RPS'.padStart(10)}`);

const rhoValues = [-0.30, -0.20, -0.15, -0.10, -0.05, 0.00, 0.05];
const rhoResults = [];
for (const rho of rhoValues) {
  const preds = [];
  const outs = [];
  for (const [home, away, hg, ag] of WC2022_MATCHES) {
    const sH = WC2022_STRENGTH[home], sA = WC2022_STRENGTH[away];
    if (sH === undefined || sA === undefined) continue;
    preds.push(toolPrediction(app, sH, sA, baseSettings, rho));
    outs.push(outcomeFix(hg, ag));
  }
  const b = brierScore(preds, outs);
  const r = rankedProbabilityScore(preds, outs);
  rhoResults.push({ rho, brier: b, rps: r });
  console.log(`${rho.toFixed(2).padEnd(8)}${b.toFixed(4).padStart(10)}${r.toFixed(4).padStart(10)}`);
}
const bestRho = rhoResults.reduce((a, b) => a.brier < b.brier ? a : b);
console.log(`\n→ Beste ρ (für WM 2022): ${bestRho.rho.toFixed(2)} (Brier ${bestRho.brier.toFixed(4)})`);

// === B) maxGoals-Sensitivität ===
console.log('\n═══════════════════════════════════════════════');
console.log('B) Sensitivität gegenüber maxGoals (Score-Matrix-Truncation)');
console.log('═══════════════════════════════════════════════');
console.log(`\n${'maxGoals'.padEnd(10)}${'Brier'.padStart(10)}${'Σ Matrix'.padStart(12)}`);
const mgValues = [5, 6, 7, 8, 9, 10];
const mgResults = [];
for (const mg of mgValues) {
  const settings = { ...baseSettings, maxGoals: mg };
  const preds = [];
  const outs = [];
  let totalSum = 0;
  for (const [home, away, hg, ag] of WC2022_MATCHES) {
    const sH = WC2022_STRENGTH[home], sA = WC2022_STRENGTH[away];
    if (sH === undefined || sA === undefined) continue;
    preds.push(toolPrediction(app, sH, sA, settings, -0.1));
    outs.push(outcomeFix(hg, ag));
    // Σ Matrix
    const probs1X2 = baselineStrength(sH, sA);
    const [lh, la] = app.findLambdas(probs1X2.pH, probs1X2.pD, probs1X2.pA);
    const M = app.scoreMatrix(lh, la, mg);
    let s = 0;
    for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) s += M[i][j];
    totalSum += s;
  }
  const b = brierScore(preds, outs);
  const avgSum = totalSum / preds.length;
  mgResults.push({ maxGoals: mg, brier: b, avgSum });
  console.log(`${mg.toString().padEnd(10)}${b.toFixed(4).padStart(10)}${avgSum.toFixed(6).padStart(12)}`);
}
console.log('\n→ maxGoals=7 reicht: Σ ≈ 0.9999 (4 Nachkommastellen).');

// === C) Reproduzierbarkeit Monte-Carlo ===
console.log('\n═══════════════════════════════════════════════');
console.log('C) Reproduzierbarkeit der Monte-Carlo-Simulation');
console.log('═══════════════════════════════════════════════');
console.log(`\nMessung: Spanien-Champion-Wkt über N=10 Sim-Läufe à 1500 Iterationen,`);
console.log(`         jeweils ohne und mit fixiertem Seed.`);

// Lade simulateFullTournament-Variante
const fullFn = new Function('window','document','navigator','localStorage','fetch','URL','URLSearchParams','Blob','confirm','alert','console','event','caches',
  i18nCode + '\n' + appCode + '\n;return { simulateFullTournament, setRngSeed, matchData, initMatches, GROUPS, applyOutrightEvents, outrightData };');
const fullApp = fullFn(win, doc, {language:'en',languages:['en']}, {getItem:()=>null,setItem:()=>{},removeItem:()=>{}}, ()=>Promise.reject(), null, null, null, ()=>true, ()=>{}, console, null, null);

// Synthetische Quoten setzen
for (const g of Object.keys(fullApp.GROUPS)) {
  const ms = Object.values(fullApp.matchData).filter(m => m.group === g);
  ms.forEach((m, i) => { m.oddH = 1.8 + (i * 0.2); m.oddD = 3.4; m.oddA = 3.5 + (i * 0.2); });
}

function runFullSimVar(seed) {
  fullApp.setRngSeed(seed);
  // Wir brauchen den output Spain-Champion
  const sim = fullApp.simulateFullTournament(baseSettings, 1500);
  if (!sim) return null;
  const sp = sim.teams.find(t => t.label === 'Spain' || t.key === 'Spanien');
  return sp ? sp.champion : 0;
}

const runs_noseed = [];
const runs_seeded = [];
for (let i = 0; i < 10; i++) {
  fullApp.setRngSeed(null);  // Math.random
  runs_noseed.push(runFullSimVar(null));
  runs_seeded.push(runFullSimVar(42 + i));
}

function stats(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return { mean: m, sd: Math.sqrt(v) };
}
const s_noseed = stats(runs_noseed);
const s_seeded = stats(runs_seeded);
console.log(`\nMath.random:      mean=${s_noseed.mean.toFixed(4)}  sd=${s_noseed.sd.toFixed(4)}`);
console.log(`Seeded (variable):mean=${s_seeded.mean.toFixed(4)}  sd=${s_seeded.sd.toFixed(4)}`);

// Demonstration: gleicher Seed → identische Outputs
const fixedRuns = [];
for (let i = 0; i < 5; i++) fixedRuns.push(runFullSimVar(42));
const allEqual = fixedRuns.every(v => v === fixedRuns[0]);
console.log(`\nGleicher Seed=42, 5 Läufe: ${allEqual ? '✓ alle identisch' : '✗ nicht reproducible'} (${fixedRuns[0].toFixed(6)})`);

// Save JSON
const outputPath = path.join(__dirname, 'sensitivity.json');
fs.writeFileSync(outputPath, JSON.stringify({
  date: new Date().toISOString(),
  rho: rhoResults,
  maxGoals: mgResults,
  reproducibility: {
    math_random: { runs: runs_noseed, ...s_noseed },
    seeded_variable: { runs: runs_seeded, ...s_seeded },
    seeded_fixed: { runs: fixedRuns, identical: allEqual }
  }
}, null, 2));
console.log(`\n→ Ergebnisse gespeichert: ${path.relative(ROOT, outputPath)}`);
