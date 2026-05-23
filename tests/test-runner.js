#!/usr/bin/env node
/**
 * Minimaler Test-Runner ohne Dependencies.
 * Lädt assets/i18n.js + assets/app.js in einer Sandbox, dann führt /tests/*.test.js aus.
 *
 * Run: node tests/test-runner.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const i18nCode = fs.readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8');
const appCode = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

// ===== Mock-DOM =====
const win = { addEventListener: () => {}, scrollTo: () => {}, APP_LANG: 'en' };
const settingsDefaults = {
  ptsExact:'4', ptsDiff:'3', ptsTend:'2', maxGoals:'7', defaultAgg:'median',
  dixonColesRho: '-0.1'
};
const doc = {
  documentElement: { lang: 'en' },
  addEventListener: () => {},
  getElementById: (id) => ({
    value: settingsDefaults[id] || '',
    checked: true,
    addEventListener: () => {},
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    tagName: 'INPUT'
  }),
  querySelectorAll: () => [],
  querySelector: () => null
};

// Sandbox-Wrapper: Lädt i18n + app und gibt eine Referenz auf alle Top-Level-Funktionen zurück
function loadApp() {
  const exportList = [
    'I18N','TEAM_LABELS','t','teamLabel',
    'GROUPS','TEAM_NAME_MAP','TEAM_ALIASES','findInternalTeam','RR_ORDER',
    'matchData','initMatches',
    'poissonPMF','scoreMatrix','outcomesFromLambdas','findLambdas',
    'oddsToProbs','ktPoints','bestKicktippTip','topScores',
    'aggregateBookmakers',
    'mulberry32','setRngSeed','rand',
    'applyDixonColes','dixonColesTau',
    'computeMatch','simulateGroupWinners','simulateFullTournament',
    'simulateGroupOncePlace','simulateKnockout','sampleScore',
    'applyOutrightEvents','applyApiEvents',
    'FIFA_2026_R32','FIFA_2026_R16_PAIRS','buildBracket'
  ];
  const exportExpr = exportList.map(n => `${n}: typeof ${n}!=='undefined' ? ${n} : undefined`).join(',\n');
  const fn = new Function(
    'window','document','navigator','localStorage','fetch','URL','URLSearchParams','Blob','confirm','alert','console','event','caches',
    i18nCode + '\n' + appCode + `\n;return { ${exportExpr} };`
  );
  return fn(
    win, doc, { language: 'en', languages: ['en'] },
    { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    () => Promise.reject(new Error('no network in tests')),
    null, null, null,
    () => true, () => {}, console, null, null
  );
}

// ===== Test-Framework =====
const tests = [];
const stats = { passed: 0, failed: 0, errors: [] };

function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`Expected ${b}, got ${a}${msg ? ' — ' + msg : ''}`); }
function assertClose(a, b, eps, msg) {
  if (Math.abs(a - b) > (eps || 1e-6))
    throw new Error(`Expected ${b} ± ${eps}, got ${a}${msg ? ' — ' + msg : ''}`);
}
function assertThrows(fn, msg) {
  try { fn(); } catch (e) { return; }
  throw new Error('Expected throw' + (msg ? ' — ' + msg : ''));
}

// Test files importieren
const testDir = __dirname;
const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();
for (const f of testFiles) {
  const code = fs.readFileSync(path.join(testDir, f), 'utf8');
  const ctx = { test, assert, assertEq, assertClose, assertThrows, loadApp, Math, Object, Array, console };
  const wrapped = new Function(...Object.keys(ctx), code);
  wrapped(...Object.values(ctx));
}

// Run
console.log(`Running ${tests.length} tests…\n`);
for (const t of tests) {
  try {
    t.fn();
    stats.passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${t.name}`);
  } catch (e) {
    stats.failed++;
    stats.errors.push({ name: t.name, msg: e.message });
    console.log(`  \x1b[31m✗\x1b[0m ${t.name}`);
    console.log(`    ${e.message}`);
  }
}
console.log(`\n${stats.passed} passed, ${stats.failed} failed.`);
process.exit(stats.failed === 0 ? 0 : 1);
