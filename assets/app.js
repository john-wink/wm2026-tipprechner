"use strict";

// ===== STAMMDATEN: WM 2026 GRUPPEN (Final Draw Dezember 2025) =====
// Team-Werte sind Keys aus TEAM_LABELS (i18n.js)
const GROUPS = {
  A: { teams: ['Mexiko', 'Suedafrika', 'Suedkorea', 'Tschechien'], flags: ['🇲🇽','🇿🇦','🇰🇷','🇨🇿'] },
  B: { teams: ['Kanada', 'Bosnien', 'Katar', 'Schweiz'], flags: ['🇨🇦','🇧🇦','🇶🇦','🇨🇭'] },
  C: { teams: ['Brasilien', 'Marokko', 'Haiti', 'Schottland'], flags: ['🇧🇷','🇲🇦','🇭🇹','🏴󠁧󠁢󠁳󠁣󠁴󠁿'] },
  D: { teams: ['USA', 'Paraguay', 'Australien', 'Tuerkei'], flags: ['🇺🇸','🇵🇾','🇦🇺','🇹🇷'] },
  E: { teams: ['Deutschland', 'Curacao', 'Elfenbeinkueste', 'Ecuador'], flags: ['🇩🇪','🇨🇼','🇨🇮','🇪🇨'] },
  F: { teams: ['Niederlande', 'Japan', 'Schweden', 'Tunesien'], flags: ['🇳🇱','🇯🇵','🇸🇪','🇹🇳'] },
  G: { teams: ['Belgien', 'Aegypten', 'Iran', 'Neuseeland'], flags: ['🇧🇪','🇪🇬','🇮🇷','🇳🇿'] },
  H: { teams: ['Spanien', 'KapVerde', 'SaudiArabien', 'Uruguay'], flags: ['🇪🇸','🇨🇻','🇸🇦','🇺🇾'] },
  I: { teams: ['Frankreich', 'Senegal', 'Irak', 'Norwegen'], flags: ['🇫🇷','🇸🇳','🇮🇶','🇳🇴'] },
  J: { teams: ['Argentinien', 'Algerien', 'Oesterreich', 'Jordanien'], flags: ['🇦🇷','🇩🇿','🇦🇹','🇯🇴'] },
  K: { teams: ['Portugal', 'DRKongo', 'Usbekistan', 'Kolumbien'], flags: ['🇵🇹','🇨🇩','🇺🇿','🇨🇴'] },
  L: { teams: ['England', 'Kroatien', 'Ghana', 'Panama'], flags: ['🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇭🇷','🇬🇭','🇵🇦'] }
};

// Extra-Aliase, die nicht in TEAM_LABELS stehen (für API-Matching)
const TEAM_ALIASES = {
  'Suedkorea': ['Korea Republic', 'Republic of Korea'],
  'Tschechien': ['Czechia'],
  'Bosnien': ['Bosnia', 'Bosnia-Herzegovina', 'Bosnia and Herzegovina'],
  'USA': ['United States', 'United States of America'],
  'Tuerkei': ['Türkiye', 'Turkiye'],
  'Elfenbeinkueste': ["Cote d'Ivoire", 'Cote dIvoire'],
  'Iran': ['IR Iran'],
  'KapVerde': ['Cabo Verde'],
  'DRKongo': ['Democratic Republic of the Congo', 'Congo DR']
};

function normalizeTeamName(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const NAME_INDEX = (() => {
  const idx = {};
  for (const [key, labels] of Object.entries(TEAM_LABELS)) {
    idx[normalizeTeamName(key)] = key;
    for (const lang of ['de','en','fr','es']) {
      if (labels[lang]) idx[normalizeTeamName(labels[lang])] = key;
    }
  }
  for (const [key, aliases] of Object.entries(TEAM_ALIASES)) {
    for (const a of aliases) idx[normalizeTeamName(a)] = key;
  }
  return idx;
})();

function findInternalTeam(apiName) { return NAME_INDEX[normalizeTeamName(apiName)] || null; }

const RR_ORDER = [[0,1],[2,3],[0,2],[3,1],[3,0],[1,2]];

let matchData = {};
function initMatches() {
  matchData = {};
  for (const g of Object.keys(GROUPS)) {
    RR_ORDER.forEach(([h, a], i) => {
      const id = `${g}-${i+1}`;
      matchData[id] = {
        id, group: g,
        home: GROUPS[g].teams[h], away: GROUPS[g].teams[a],
        homeFlag: GROUPS[g].flags[h], awayFlag: GROUPS[g].flags[a],
        homeIdx: h, awayIdx: a,
        oddH: null, oddD: null, oddA: null,
        bookmakerData: [],
        apiCommenceTime: null,
        aggOverride: null
      };
    });
  }
}
initMatches();

// ===== MATH ENGINE =====
function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = p * lambda / i;
  return p;
}
function scoreMatrix(lh, la, maxG) {
  const ph = [], pa = [];
  for (let i = 0; i <= maxG; i++) { ph.push(poissonPMF(i, lh)); pa.push(poissonPMF(i, la)); }
  const M = [];
  for (let i = 0; i <= maxG; i++) {
    const row = [];
    for (let j = 0; j <= maxG; j++) row.push(ph[i] * pa[j]);
    M.push(row);
  }
  return M;
}
function outcomesFromLambdas(lh, la) {
  const maxG = 12;
  const ph = [], pa = [];
  for (let i = 0; i <= maxG; i++) { ph.push(poissonPMF(i, lh)); pa.push(poissonPMF(i, la)); }
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= maxG; i++) for (let j = 0; j <= maxG; j++) {
    const p = ph[i] * pa[j];
    if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
  }
  return [pH, pD, pA];
}
function findLambdas(pH, pD, pA) {
  let best = { lh: 1.3, la: 1.3, err: Infinity };
  for (let lh = 0.15; lh <= 4.5; lh += 0.15) {
    for (let la = 0.15; la <= 4.5; la += 0.15) {
      const [h, d, a] = outcomesFromLambdas(lh, la);
      const err = (h-pH)**2 + (d-pD)**2 + (a-pA)**2;
      if (err < best.err) best = { lh, la, err };
    }
  }
  const step = 0.01;
  const lo_h = Math.max(0.05, best.lh - 0.2), hi_h = best.lh + 0.2;
  const lo_a = Math.max(0.05, best.la - 0.2), hi_a = best.la + 0.2;
  for (let lh = lo_h; lh <= hi_h; lh += step) {
    for (let la = lo_a; la <= hi_a; la += step) {
      const [h, d, a] = outcomesFromLambdas(lh, la);
      const err = (h-pH)**2 + (d-pD)**2 + (a-pA)**2;
      if (err < best.err) best = { lh, la, err };
    }
  }
  return [best.lh, best.la];
}
function oddsToProbs(oH, oD, oA) {
  if (!oH || !oD || !oA || oH <= 1 || oD <= 1 || oA <= 1) return null;
  const rH = 1/oH, rD = 1/oD, rA = 1/oA;
  const margin = rH + rD + rA;
  return { pH: rH/margin, pD: rD/margin, pA: rA/margin, vig: (margin - 1) * 100 };
}
function ktPoints(th, ta, ah, aa, rules) {
  if (th === ah && ta === aa) return rules.exact;
  const td = th - ta, ad = ah - aa;
  if (td !== 0 && td === ad) return rules.diff;
  if (Math.sign(td) === Math.sign(ad)) return rules.tend;
  return 0;
}
function bestKicktippTip(matrix, rules, maxTip) {
  let best = { h: 1, a: 0, ep: -1 };
  for (let th = 0; th <= maxTip; th++) for (let ta = 0; ta <= maxTip; ta++) {
    let ep = 0;
    for (let i = 0; i < matrix.length; i++) for (let j = 0; j < matrix[i].length; j++) {
      const pts = ktPoints(th, ta, i, j, rules);
      if (pts > 0) ep += matrix[i][j] * pts;
    }
    if (ep > best.ep) best = { h: th, a: ta, ep };
  }
  return best;
}
function topScores(matrix, n) {
  const arr = [];
  for (let i = 0; i < matrix.length; i++) for (let j = 0; j < matrix[i].length; j++) {
    arr.push({ score: `${i}:${j}`, p: matrix[i][j] });
  }
  arr.sort((a, b) => b.p - a.p);
  return arr.slice(0, n);
}

function aggregateBookmakers(bd) {
  if (!bd || bd.length === 0) return { median: null, mean: null, pinnacle: null, n: 0 };
  const median = arr => { const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; };
  const mean = arr => arr.reduce((s,v)=>s+v,0)/arr.length;
  const norm = (h, d, a) => { const s = h+d+a; return s > 0 ? { pH: h/s, pD: d/s, pA: a/s, vig: 0 } : null; };
  const pHs = bd.map(b => b.pH), pDs = bd.map(b => b.pD), pAs = bd.map(b => b.pA);
  const pinn = bd.find(b => b.key === 'pinnacle');
  return {
    median: norm(median(pHs), median(pDs), median(pAs)),
    mean: norm(mean(pHs), mean(pDs), mean(pAs)),
    pinnacle: pinn ? { pH: pinn.pH, pD: pinn.pD, pA: pinn.pA, vig: pinn.vig } : null,
    n: bd.length
  };
}
function activeAggMethod(m) {
  if (m.aggOverride) return m.aggOverride;
  return document.getElementById('defaultAgg')?.value || 'median';
}
function methodLabel(method) {
  return t({ median: 'labelMedian', mean: 'labelMean', pinnacle: 'labelPinnacle', manual: 'labelManual' }[method] || 'labelMedian');
}
function getActiveProbs(m) {
  if (m.oddH && m.oddD && m.oddA) {
    const p = oddsToProbs(m.oddH, m.oddD, m.oddA);
    return { probs: p, source: 'manual', label: t('labelManual') };
  }
  if (m.bookmakerData && m.bookmakerData.length > 0) {
    const agg = aggregateBookmakers(m.bookmakerData);
    const method = activeAggMethod(m);
    let probs = method === 'pinnacle' ? agg.pinnacle : method === 'mean' ? agg.mean : agg.median;
    if (!probs && agg.median) probs = agg.median;
    if (probs) return { probs, source: method, label: methodLabel(method), agg };
  }
  return { probs: null, source: 'none', label: '–' };
}
function getSettings() {
  return {
    exact: parseFloat(document.getElementById('ptsExact').value) || 4,
    diff: parseFloat(document.getElementById('ptsDiff').value) || 3,
    tend: parseFloat(document.getElementById('ptsTend').value) || 2,
    maxGoals: parseInt(document.getElementById('maxGoals').value) || 7
  };
}
function computeMatch(m, settings) {
  const active = getActiveProbs(m);
  if (!active.probs) return null;
  const [lh, la] = findLambdas(active.probs.pH, active.probs.pD, active.probs.pA);
  const matrix = scoreMatrix(lh, la, settings.maxGoals);
  const rules = { exact: settings.exact, diff: settings.diff, tend: settings.tend };
  const tip = bestKicktippTip(matrix, rules, settings.maxGoals);
  const top = topScores(matrix, 10);
  return { probs: active.probs, lh, la, matrix, bestTip: tip, topScores: top,
           source: active.source, label: active.label, agg: active.agg };
}
function computeAllAggTips(m, settings) {
  if (!m.bookmakerData || m.bookmakerData.length === 0) return null;
  const agg = aggregateBookmakers(m.bookmakerData);
  const rules = { exact: settings.exact, diff: settings.diff, tend: settings.tend };
  const out = { n: agg.n };
  for (const method of ['median', 'mean', 'pinnacle']) {
    const probs = agg[method];
    if (!probs) { out[method] = null; continue; }
    const [lh, la] = findLambdas(probs.pH, probs.pD, probs.pA);
    const matrix = scoreMatrix(lh, la, settings.maxGoals);
    const tip = bestKicktippTip(matrix, rules, settings.maxGoals);
    out[method] = { probs, lh, la, tip };
  }
  return out;
}

// ===== RENDER: SPECIALS =====
function renderSpecials() {
  const root = document.getElementById('specialsContainer');
  if (!root) return;
  const settings = getSettings();
  const sections = [];

  // 0) FORECAST / Punkte-Erwartung
  sections.push(renderForecastSection(settings));
  // 1) WELTMEISTER (mit voller Sim falls möglich)
  sections.push(renderChampionSection(settings));
  // 2) HALBFINALISTEN (aus voller Sim oder Outright-Heuristik)
  sections.push(renderSemifinalistsSection(settings));
  // 3) GRUPPENSIEGER (Monte-Carlo)
  sections.push(renderGroupWinnersSection(settings));
  // 4) TOP-TORSCHÜTZE
  sections.push(renderTopScorerSection());

  root.innerHTML = sections.join('');
}

function renderForecastSection(settings) {
  const fc = computeOverallForecast(settings);
  if (fc.matchesWithTip === 0) {
    return wrapSection(t('sectionForecast'), `<p class="text-zinc-500 text-sm">${t('noGroupOddsYet')}</p>`);
  }
  return wrapSection(t('sectionForecast'),
    `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
       <div class="bg-zinc-950 border border-zinc-800 rounded-md p-3">
         <div class="text-[10px] uppercase tracking-wider text-zinc-500">${t('forecastExpected')}</div>
         <div class="font-mono text-2xl font-semibold text-emerald-400 mt-1">${fc.expected.toFixed(1)}</div>
         <div class="text-[11px] text-zinc-500">${t('forecastUnitPts')}</div>
       </div>
       <div class="bg-zinc-950 border border-zinc-800 rounded-md p-3">
         <div class="text-[10px] uppercase tracking-wider text-zinc-500">${t('forecastRange')}</div>
         <div class="font-mono text-lg font-semibold text-white mt-1">${fc.lowRange.toFixed(0)}&ndash;${fc.highRange.toFixed(0)}</div>
         <div class="text-[11px] text-zinc-500">±1σ</div>
       </div>
       <div class="bg-zinc-950 border border-zinc-800 rounded-md p-3">
         <div class="text-[10px] uppercase tracking-wider text-zinc-500">${t('forecastBestCase')}</div>
         <div class="font-mono text-lg font-semibold text-blue-400 mt-1">${fc.bestCase}</div>
         <div class="text-[11px] text-zinc-500">${fc.matchesWithTip} × ${settings.exact}</div>
       </div>
       <div class="bg-zinc-950 border border-zinc-800 rounded-md p-3">
         <div class="text-[10px] uppercase tracking-wider text-zinc-500">${t('forecastWorstCase')}</div>
         <div class="font-mono text-lg font-semibold text-zinc-500 mt-1">0</div>
         <div class="text-[11px] text-zinc-500">${t('forecastIfAllWrong')}</div>
       </div>
     </div>
     <div class="mt-3 flex gap-2 flex-wrap">
       <button onclick="sharePicks()" class="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-2 rounded-md font-medium min-h-[36px]">${t('shareBtn')}</button>
       <button onclick="runFullSimulation()" class="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-sm px-3 py-2 rounded-md font-medium min-h-[36px]">${t('runFullSim')}</button>
     </div>`
  );
}

function runFullSimulation() {
  const settings = getSettings();
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = t('simRunningShort'); }
  // Async-ish: setTimeout 0 für UI-Update
  setTimeout(() => {
    simulateFullTournament(settings, 1500);
    renderSpecials();
    if (btn) btn.disabled = false;
    toast(t('toastSimDone'));
  }, 30);
}

function renderChampionSection(settings) {
  // Bevorzuge volle Sim falls vorhanden, sonst Outright
  const fromSim = tournamentSimResult && tournamentSimResult.teams.length > 0;
  if (!fromSim && (!outrightData || !outrightData.teams.length)) {
    return wrapSection(t('specialChampion'), `<p class="text-zinc-500 text-sm">${t('noOutrightYet')}</p>`);
  }
  const list = fromSim
    ? tournamentSimResult.teams.map(t => ({ key: t.key, label: t.label, prob: t.champion })).filter(x => x.prob > 0).sort((a,b)=>b.prob-a.prob)
    : outrightData.teams;
  const top = list[0];
  const rest = list.slice(1, 8);
  const sourceLabel = fromSim ? t('sourceFromSim', { n: tournamentSimResult.nSims }) : t('sourceFromOutright');
  return wrapSection(t('specialChampion'),
    `<div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
       <div class="flex-1">
         <div class="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">${t('topPickShort')} <span class="text-zinc-600">· ${sourceLabel}</span></div>
         <div class="flex items-baseline gap-3 flex-wrap">
           <div class="text-2xl sm:text-3xl font-semibold text-emerald-400">${top.label}</div>
           <div class="font-mono text-base text-zinc-300">${(top.prob*100).toFixed(1)}%</div>
           ${renderMovementBadge(top.key)}
         </div>
       </div>
     </div>
     <details class="mt-3">
       <summary class="cursor-pointer text-xs text-blue-400 hover:text-blue-300">${t('showAlternatives')}</summary>
       <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
         ${rest.map(team => probRow(team)).join('')}
       </div>
     </details>`
  );
}

function renderMovementBadge(teamKey) {
  const mv = getMovement(teamKey);
  if (!mv || Math.abs(mv.delta) < 0.005) return '';
  const isUp = mv.delta > 0;
  const cls = isUp ? 'text-emerald-400' : 'text-red-400';
  const arrow = isUp ? '▲' : '▼';
  return `<span class="${cls} text-xs font-mono" title="${t('vsLast')}: ${(mv.previous*100).toFixed(1)}%">${arrow} ${Math.abs(mv.delta*100).toFixed(1)}%</span>`;
}

function renderSemifinalistsSection(settings) {
  // Bevorzuge volle Sim
  const fromSim = tournamentSimResult && tournamentSimResult.teams.length > 0;
  if (!fromSim && (!outrightData || !outrightData.teams.length)) {
    return wrapSection(t('specialSemifinalists'), `<p class="text-zinc-500 text-sm">${t('noOutrightYet')}</p>`);
  }
  const list = fromSim
    ? tournamentSimResult.teams.map(t => ({ key: t.key, label: t.label, prob: t.sf })).filter(x => x.prob > 0).sort((a,b)=>b.prob-a.prob)
    : outrightData.teams;
  const top4 = list.slice(0, 4);
  const note = fromSim ? t('sourceFromSim', { n: tournamentSimResult.nSims }) : t('semifinalistsNote');
  return wrapSection(t('specialSemifinalists'),
    `<div class="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">${t('topPickShort')}</div>
     <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
       ${top4.map((team, i) => `
         <div class="bg-emerald-500/10 border border-emerald-600 rounded-md p-3 text-center">
           <div class="text-xs text-emerald-400 font-semibold">#${i+1}</div>
           <div class="text-sm font-medium text-white mt-1 truncate" title="${team.label}">${team.label}</div>
           <div class="text-[11px] font-mono text-zinc-400 mt-0.5">${(team.prob*100).toFixed(1)}%</div>
         </div>
       `).join('')}
     </div>
     <p class="text-[11px] text-zinc-500 italic">${note}</p>`
  );
}

function renderGroupWinnersSection(settings) {
  const cards = Object.keys(GROUPS).map(g => {
    const sim = simulateGroupWinners(g, settings, 5000);
    if (!sim) {
      return `<div class="bg-zinc-900 border border-zinc-800 rounded-md p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-semibold">${t('groupName')} ${g}</span>
          <span class="text-[10px] text-zinc-500">${t('noGroupOddsYet')}</span>
        </div>
      </div>`;
    }
    const teams = GROUPS[g].teams.map((tKey, i) => ({
      key: tKey,
      label: teamLabel(tKey),
      flag: GROUPS[g].flags[i],
      prob: sim.winProbs[i]
    })).sort((a, b) => b.prob - a.prob);
    const top = teams[0];
    const rest = teams.slice(1);
    return `
      <div class="bg-zinc-900 border border-emerald-600/40 rounded-md p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-semibold">${t('groupName')} ${g}</span>
          <span class="text-[10px] text-zinc-500 font-mono">${(top.prob*100).toFixed(0)}%</span>
        </div>
        <div class="text-base font-semibold text-emerald-400 truncate" title="${top.label}">${top.flag} ${top.label}</div>
        <details class="mt-2">
          <summary class="cursor-pointer text-[11px] text-blue-400 hover:text-blue-300">${t('showAlternatives')}</summary>
          <div class="mt-2 space-y-1">
            ${rest.map(team => `<div class="flex justify-between text-xs">
              <span class="text-zinc-400 truncate">${team.flag} ${team.label}</span>
              <span class="text-zinc-500 font-mono">${(team.prob*100).toFixed(0)}%</span>
            </div>`).join('')}
          </div>
        </details>
      </div>
    `;
  }).join('');
  return wrapSection(t('specialGroupWinners'),
    `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">${cards}</div>`
  );
}

function renderTopScorerSection() {
  const override = topScorerOverride;
  let pickKey, pickLabel, pickProb;
  if (override) {
    pickKey = override; pickLabel = teamLabel(override); pickProb = null;
  } else if (outrightData && outrightData.teams.length > 0) {
    pickKey = outrightData.teams[0].key;
    pickLabel = outrightData.teams[0].label;
    pickProb = outrightData.teams[0].prob;
  } else {
    return wrapSection(t('specialTopScorer'),
      `<p class="text-zinc-500 text-sm mb-3">${t('noOutrightYet')}</p>
       ${renderTopScorerOverrideInput()}`);
  }
  const probStr = pickProb !== null ? ` <span class="text-zinc-400 font-mono text-sm">${(pickProb*100).toFixed(1)}%</span>` : ` <span class="text-zinc-500 text-xs">(${t('manualOverride')})</span>`;
  return wrapSection(t('specialTopScorer'),
    `<div class="mb-3">
       <div class="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">${t('topPickShort')}</div>
       <div class="text-2xl sm:text-3xl font-semibold text-emerald-400">${pickLabel}${probStr}</div>
     </div>
     <p class="text-[11px] text-zinc-500 italic mb-3">${t('topScorerNote')}</p>
     ${renderTopScorerOverrideInput()}`
  );
}

function renderTopScorerOverrideInput() {
  const allTeams = Object.keys(TEAM_LABELS).sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)));
  return `
    <label class="block text-[11px] text-zinc-500 mb-1">${t('manualOverride')}</label>
    <select onchange="setTopScorerOverride(this.value)" class="bg-zinc-950 border border-zinc-800 text-white rounded-md px-3 py-2 text-base sm:text-sm w-full max-w-xs focus:outline-none focus:border-emerald-500">
      <option value="">—</option>
      ${allTeams.map(k => `<option value="${k}" ${k === topScorerOverride ? 'selected' : ''}>${teamLabel(k)}</option>`).join('')}
    </select>
  `;
}

function setTopScorerOverride(val) {
  topScorerOverride = val || '';
  renderSpecials();
  saveState(true);
}

function wrapSection(title, body) {
  return `
    <section class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-5 mb-4">
      <h3 class="text-base font-semibold text-white mb-3">${title}</h3>
      ${body}
    </section>
  `;
}

function probRow(team) {
  return `<div class="flex justify-between items-center bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5">
    <span class="text-sm text-zinc-200 truncate" title="${team.label}">${team.label}</span>
    <span class="text-xs font-mono text-zinc-400 ml-2">${(team.prob*100).toFixed(1)}%</span>
  </div>`;
}

// ===== TABS =====
function switchTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('text-white', isActive);
    b.classList.toggle('text-zinc-400', !isActive);
    b.classList.toggle('border-emerald-500', isActive);
    b.classList.toggle('border-transparent', !isActive);
  });
  document.querySelectorAll('[data-tab-content]').forEach(c => {
    c.classList.toggle('hidden', c.dataset.tabContent !== tab);
  });
  if (tab === 'overview') renderOverview();
  if (tab === 'groups') renderGroups();
  if (tab === 'specials') renderSpecials();
  // scroll to top of content
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== EXPAND STATE =====
let expandedId = null;
function toggleExpand(id) {
  expandedId = expandedId === id ? null : id;
  renderOverview(); renderGroups();
}
function clearExpanded() {
  expandedId = null;
  renderOverview(); renderGroups();
}

// ===== SORT STATE =====
let sortField = 'date', sortDir = 'asc';
function sortBy(field) {
  if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortField = field; sortDir = 'asc'; }
  renderOverview();
}

// ===== RENDER: ÜBERSICHT (Card-Layout, mobile-first) =====
function renderOverview() {
  const settings = getSettings();
  const filter = (document.getElementById('filterInput')?.value || '').toLowerCase().trim();

  const items = Object.values(matchData).map(m => ({ m, r: computeMatch(m, settings) }))
    .filter(({m}) => {
      if (!filter) return true;
      const homeName = teamLabel(m.home).toLowerCase();
      const awayName = teamLabel(m.away).toLowerCase();
      return homeName.includes(filter)
        || awayName.includes(filter)
        || m.group.toLowerCase() === filter
        || `${t('groupName').toLowerCase()} ${m.group.toLowerCase()}` === filter
        || m.id.toLowerCase() === filter;
    });

  const cmp = (a, b) => {
    let va, vb;
    switch (sortField) {
      case 'date':
        va = a.m.apiCommenceTime || `9999-${a.m.id}`;
        vb = b.m.apiCommenceTime || `9999-${b.m.id}`;
        break;
      case 'group': va = a.m.id; vb = b.m.id; break;
      case 'teams': va = teamLabel(a.m.home); vb = teamLabel(b.m.home); break;
      case 'tip':
        va = a.r?.bestTip ? a.r.bestTip.h*10 + a.r.bestTip.a : -1;
        vb = b.r?.bestTip ? b.r.bestTip.h*10 + b.r.bestTip.a : -1;
        break;
      case 'ep': va = a.r?.bestTip?.ep ?? -1; vb = b.r?.bestTip?.ep ?? -1; break;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  };
  items.sort(cmp);

  const withData = items.filter(({r}) => r).length;
  const cntEl = document.getElementById('cntOverview');
  if (cntEl) cntEl.textContent = items.length;
  const badgeEl = document.getElementById('overviewBadge');
  if (badgeEl) badgeEl.textContent = t('overviewBadge', { withData, total: items.length });

  const list = document.getElementById('matchList');
  if (!list) return;
  if (items.length === 0) {
    list.innerHTML = `<div class="text-center py-12 text-zinc-500 text-sm">${t('noFilterResults')}</div>`;
    return;
  }
  list.innerHTML = items.map(({m, r}) => renderMatchCard(m, r, settings)).join('');
}

function renderMatchCard(m, r, settings, opts = {}) {
  const compact = !!opts.compact;
  const isExpanded = expandedId === m.id;
  const date = m.apiCommenceTime
    ? new Date(m.apiCommenceTime).toLocaleDateString(window.APP_LANG, { day:'2-digit', month:'2-digit', weekday:'short' })
    : '–';
  const tipHTML = r
    ? `<div class="font-mono font-semibold text-emerald-400 text-base sm:text-lg">${r.bestTip.h}:${r.bestTip.a}</div>
       <div class="text-xs text-zinc-500 font-mono">EV ${r.bestTip.ep.toFixed(2)}</div>`
    : `<div class="text-zinc-600 text-sm">—</div>`;

  const source = r ? `${r.label}${(m.bookmakerData?.length) ? ' · ' + t('bmCountShort', { n: m.bookmakerData.length }) : ''}`
    : `<span class="text-zinc-600">${t('noOddsShort')}</span>`;

  const expandedHTML = isExpanded ? renderDetailPanel(m, r, settings, compact) : '';

  return `
    <div class="bg-zinc-900 border ${isExpanded ? 'border-emerald-600' : 'border-zinc-800'} rounded-lg mb-2 overflow-hidden transition-colors">
      <button class="w-full text-left ${compact ? 'p-2.5' : 'p-3 sm:p-4'} hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors min-h-[60px]"
              onclick="toggleExpand('${m.id}')" aria-expanded="${isExpanded}">
        <div class="flex items-center gap-2 sm:gap-3">
          <div class="text-xs text-zinc-500 ${compact ? 'w-14' : 'w-16 sm:w-20'} flex-shrink-0">
            <div>${date}</div>
            <div class="text-[10px] mt-0.5">${m.id}</div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 text-sm ${compact ? '' : 'sm:text-base'} font-medium">
              <span class="truncate"><span class="mr-1">${m.homeFlag}</span>${teamLabel(m.home)}</span>
            </div>
            <div class="flex items-center gap-2 text-sm ${compact ? '' : 'sm:text-base'} font-medium mt-0.5">
              <span class="truncate"><span class="mr-1">${m.awayFlag}</span>${teamLabel(m.away)}</span>
            </div>
            <div class="text-[11px] text-zinc-500 mt-1.5 truncate">${source}</div>
          </div>
          <div class="text-right flex-shrink-0">
            ${tipHTML}
          </div>
          <div class="text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''} flex-shrink-0">⌄</div>
        </div>
      </button>
      ${expandedHTML}
    </div>
  `;
}

function renderDetailPanel(m, r, settings, compact = false) {
  // Padding & Spacing je nach Modus
  const pad = compact ? 'p-3' : 'p-4 sm:p-5';
  const gridCls = compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5';

  if (!r) {
    return `
      <div class="border-t border-zinc-800 ${pad} detail-panel-enter">
        <h4 class="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">${t('detailNoOdds')}</h4>
        <p class="text-sm text-zinc-400 mb-3">${t('detailNoOddsHelp')}</p>
        ${renderManualOddsInput(m, compact)}
      </div>
    `;
  }
  const pH = (r.probs.pH * 100).toFixed(0);
  const pD = (r.probs.pD * 100).toFixed(0);
  const pA = (r.probs.pA * 100).toFixed(0);
  const allTips = computeAllAggTips(m, settings);

  // Aggregations-Karten
  let aggHTML = '';
  if (allTips && allTips.n > 0) {
    const cardFor = (method, label) => {
      const data = allTips[method];
      if (!data) return `<div class="bg-zinc-900 border border-zinc-800 rounded-md p-2 opacity-40">
        <div class="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">${label}</div>
        <div class="font-mono font-bold text-base mt-0.5">–</div>
        <div class="text-[10px] text-zinc-500">n/a</div>
      </div>`;
      const isActive = r.source === method;
      const cls = isActive ? 'bg-emerald-500/10 border-emerald-600' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700';
      const xg = `${data.lh.toFixed(1)}:${data.la.toFixed(1)}`;
      return `<button class="${cls} border rounded-md p-2 text-left transition-colors min-h-[64px] w-full" onclick="event.stopPropagation();setAggOverride('${m.id}','${method}')">
        <div class="text-[10px] uppercase tracking-wide ${isActive ? 'text-emerald-400' : 'text-zinc-500'} font-semibold truncate">${label}</div>
        <div class="font-mono font-bold ${compact ? 'text-base' : 'text-lg'} mt-0.5 text-white">${data.tip.h}:${data.tip.a}</div>
        <div class="text-[10px] text-zinc-500 mt-0.5 font-mono truncate">EV ${data.tip.ep.toFixed(2)} · ${xg}</div>
      </button>`;
    };
    const headlineKey = compact ? 'detailAggCompare' : 'detailAggCompare';
    // Bei compact: kürzere Headline
    const headline = compact
      ? `${t('labelMedian')} · ${t('labelMean')} · ${t('labelPinnacle')} <span class="text-zinc-600">· ${allTips.n} BM</span>`
      : t('detailAggCompare', { n: allTips.n });
    aggHTML = `
      <div>
        <h4 class="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">${headline}</h4>
        <div class="grid grid-cols-3 gap-1.5">
          ${cardFor('median', t('labelMedian'))}
          ${cardFor('mean', t('labelMean'))}
          ${cardFor('pinnacle', t('labelPinnacle'))}
        </div>
      </div>
    `;
  }

  const topHTML = r.topScores.slice(0, 5).map((s, i) =>
    `<div class="${i === 0 ? 'bg-emerald-500/10 border-emerald-600' : 'bg-zinc-900 border-zinc-800'} border rounded text-center px-1.5 py-1.5">
      <div class="font-mono font-semibold ${i === 0 ? 'text-emerald-400' : 'text-zinc-200'} text-sm">${s.score}</div>
      <div class="text-[10px] text-zinc-500">${(s.p*100).toFixed(1)}%</div>
    </div>`).join('');

  // Heatmap der Score-Matrix (8x8 oder 6x6 bei compact)
  const heatmapSize = compact ? 6 : 8;
  const heatmapHTML = renderHeatmap(r.matrix, r.bestTip, heatmapSize);

  let bmHTML = '';
  if (m.bookmakerData && m.bookmakerData.length > 0) {
    bmHTML = `
      <div>
        <h4 class="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
          ${compact ? `BM <span class="text-zinc-600">${m.bookmakerData.length}</span>` : t('detailBookmakers', { n: m.bookmakerData.length })}
        </h4>
        <div class="bm-scroll flex flex-wrap gap-1 ${compact ? 'max-h-14' : 'max-h-20'} overflow-y-auto">
          ${m.bookmakerData.map(b => {
            const cls = b.key === 'pinnacle' ? 'bg-blue-500/10 text-blue-400 border-blue-500' : 'bg-zinc-900 text-zinc-400 border-zinc-800';
            return `<span class="${cls} border rounded-full px-2 py-0.5 text-[10px]" title="${b.oH}/${b.oD}/${b.oA}">${b.title}</span>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Wahrscheinlichkeiten + xG kombiniert (kompakter)
  const probSection = `
    <div>
      <h4 class="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">${t('detailProbHeading')}</h4>
      <div class="flex justify-between text-[10px] text-zinc-400 mb-1 gap-1">
        <span class="truncate">${m.homeFlag} ${pH}%</span>
        <span class="flex-shrink-0">⊝ ${pD}%</span>
        <span class="truncate text-right">${pA}% ${m.awayFlag}</span>
      </div>
      <div class="flex h-7 rounded-md overflow-hidden bg-zinc-900 border border-zinc-800">
        <div class="bg-emerald-600 flex items-center justify-center text-[11px] font-mono font-semibold text-white" style="width:${pH}%">${pH}%</div>
        <div class="bg-zinc-600 flex items-center justify-center text-[11px] font-mono font-semibold text-white" style="width:${pD}%">${pD}%</div>
        <div class="bg-blue-500 flex items-center justify-center text-[11px] font-mono font-semibold text-white" style="width:${pA}%">${pA}%</div>
      </div>
      <div class="mt-2 flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 gap-2">
        <span class="text-[11px] text-zinc-500 flex-shrink-0">${t('detailXG')}</span>
        <span class="font-mono whitespace-nowrap">
          <span class="text-emerald-400 font-semibold text-sm sm:text-base">${r.lh.toFixed(2)}</span>
          <span class="text-zinc-600 mx-1">:</span>
          <span class="text-emerald-400 font-semibold text-sm sm:text-base">${r.la.toFixed(2)}</span>
        </span>
      </div>
    </div>
  `;

  const topSection = `
    <div>
      <h4 class="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">${compact ? 'Top 5' : t('detailTopScores')}</h4>
      <div class="grid grid-cols-5 gap-1.5">${topHTML}</div>
    </div>
  `;

  const heatmapSection = `
    <div>
      <h4 class="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">${t('detailHeatmap')}</h4>
      ${heatmapHTML}
    </div>
  `;

  const manualSection = `
    <div>
      <h4 class="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">${compact ? '1 · X · 2' : t('detailManualOdds')}</h4>
      ${renderManualOddsInput(m, compact)}
    </div>
  `;

  return `
    <div class="border-t border-zinc-800 ${pad} detail-panel-enter ${gridCls}">
      ${probSection}
      ${aggHTML}
      ${topSection}
      ${heatmapSection}
      ${manualSection}
      ${bmHTML}
    </div>
  `;
}

// ===== HEATMAP: 8x8 Score-Matrix mit Farbgradienten =====
function renderHeatmap(matrix, bestTip, size = 8) {
  const s = Math.min(size, matrix.length - 1);
  // Max-Wkt finden für Normierung
  let maxP = 0;
  for (let i = 0; i <= s; i++) for (let j = 0; j <= s; j++) if (matrix[i][j] > maxP) maxP = matrix[i][j];
  if (maxP <= 0) maxP = 0.01;

  // Header row
  let html = '<div class="overflow-x-auto"><table class="border-collapse text-[10px] font-mono mx-auto"><thead><tr><th class="text-zinc-500 px-1 py-0.5"></th>';
  for (let j = 0; j <= s; j++) html += `<th class="text-zinc-500 px-1.5 py-0.5 text-center font-medium">${j}</th>`;
  html += '</tr></thead><tbody>';

  for (let i = 0; i <= s; i++) {
    html += `<tr><th class="text-zinc-500 px-1.5 py-0.5 text-right font-medium">${i}</th>`;
    for (let j = 0; j <= s; j++) {
      const p = matrix[i][j];
      const intensity = Math.min(1, p / maxP); // 0..1
      const isTip = (i === bestTip.h && j === bestTip.a);
      const isMode = i === 0 && j === 0;
      // Diskrete Intensitäts-Stufen mit festen Tailwind-Klassen (für Tailwind-Scanner)
      let bgCls;
      if (intensity > 0.85) bgCls = 'bg-emerald-500/70';
      else if (intensity > 0.6) bgCls = 'bg-emerald-500/45';
      else if (intensity > 0.4) bgCls = 'bg-emerald-500/30';
      else if (intensity > 0.2) bgCls = 'bg-emerald-500/15';
      else if (intensity > 0.05) bgCls = 'bg-emerald-500/5';
      else bgCls = 'bg-zinc-900';
      const ring = isTip ? 'ring-2 ring-emerald-400 ring-inset' : '';
      const txt = (p*100) >= 1 ? (p*100).toFixed(0) : '·';
      const textCls = intensity > 0.4 ? 'text-white' : 'text-zinc-500';
      html += `<td class="${bgCls} ${ring} ${textCls} px-1.5 py-1 text-center" title="${i}:${j} = ${(p*100).toFixed(2)}%">${txt}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  html += '<p class="text-[10px] text-zinc-500 mt-1 text-center">Heim ↓ · Auswärts → · Werte in %</p></div>';
  return html;
}

// ===== BEST-CASE / WORST-CASE PUNKTESTAND =====
function computeOverallForecast(settings) {
  const rules = { exact: settings.exact, diff: settings.diff, tend: settings.tend };
  let expected = 0;
  let bestCase = 0;
  let totalMatchesWithTip = 0;
  let totalVariance = 0;
  for (const m of Object.values(matchData)) {
    const r = computeMatch(m, settings);
    if (!r) continue;
    totalMatchesWithTip++;
    expected += r.bestTip.ep;
    bestCase += rules.exact;
    // Varianz: Σ p_i * (points_i - EP)² über alle möglichen Ergebnisse
    let variance = 0;
    for (let i = 0; i < r.matrix.length; i++) for (let j = 0; j < r.matrix[i].length; j++) {
      const pts = ktPoints(r.bestTip.h, r.bestTip.a, i, j, rules);
      variance += r.matrix[i][j] * (pts - r.bestTip.ep) ** 2;
    }
    totalVariance += variance;
  }
  const stdDev = Math.sqrt(totalVariance);
  return {
    matchesWithTip: totalMatchesWithTip,
    expected: expected,
    bestCase: bestCase,
    worstCase: 0,
    stdDev,
    lowRange: Math.max(0, expected - stdDev),
    highRange: expected + stdDev
  };
}

// ===== QUOTEN-VERLAUF / SNAPSHOTS =====
const SNAPSHOTS_KEY = 'wm2026-snapshots';
const MAX_SNAPSHOTS = 10;

function saveSnapshot() {
  // Speichert aktuellen Stand (outright + group winner sims) als Snapshot
  try {
    const existing = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
    if (!outrightData) return;
    const snap = {
      ts: new Date().toISOString(),
      outright: outrightData.teams.slice(0, 20).map(t => ({ k: t.key, p: t.prob }))
    };
    existing.unshift(snap);
    while (existing.length > MAX_SNAPSHOTS) existing.pop();
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(existing));
  } catch (e) {}
}

function getMovement(teamKey) {
  // Vergleicht aktuelle Outright-Wkt mit dem Snapshot davor
  if (!outrightData) return null;
  try {
    const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
    if (snaps.length < 2) return null;
    const prev = snaps[1]; // index 0 ist der aktuelle (zuletzt gespeichert)
    const prevTeam = prev.outright.find(x => x.k === teamKey);
    const current = outrightData.teams.find(t => t.key === teamKey);
    if (!prevTeam || !current) return null;
    return { current: current.prob, previous: prevTeam.p, delta: current.prob - prevTeam.p, prevTs: prev.ts };
  } catch (e) { return null; }
}

// ===== SHARE API =====
async function sharePicks() {
  const settings = getSettings();
  const lines = [];
  lines.push(t('shareHeader'));
  lines.push('');
  for (const m of Object.values(matchData)) {
    const r = computeMatch(m, settings);
    if (!r) continue;
    const date = m.apiCommenceTime ? new Date(m.apiCommenceTime).toLocaleDateString(window.APP_LANG, { day:'2-digit', month:'2-digit' }) : '–';
    lines.push(`${date} ${teamLabel(m.home)} – ${teamLabel(m.away)}: ${r.bestTip.h}:${r.bestTip.a}  (EV ${r.bestTip.ep.toFixed(2)})`);
  }
  if (outrightData && outrightData.teams.length > 0) {
    lines.push('');
    lines.push(t('shareChampionLine', { team: outrightData.teams[0].label, p: (outrightData.teams[0].prob*100).toFixed(1) }));
  }
  lines.push('');
  lines.push(location.origin + '/' + window.APP_LANG + '/');

  const text = lines.join('\n');
  const shareData = { title: t('brandTitle'), text };

  try {
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
      toast(t('toastShared'));
      return;
    }
  } catch (e) { /* fallthrough zu Clipboard */ }
  try {
    await navigator.clipboard.writeText(text);
    toast(t('toastCopied'));
  } catch (e) {
    toast(t('toastShareFail'), true);
  }
}

function renderManualOddsInput(m, compact = false) {
  // Bei compact: kleinere Inputs, immer in einer Zeile, kein Wrap
  const inputCls = compact
    ? "bg-zinc-950 text-white border border-zinc-800 rounded-md px-1.5 py-1.5 text-sm font-mono flex-1 min-w-0 text-center focus:outline-none focus:border-emerald-500"
    : "bg-zinc-950 text-white border border-zinc-800 rounded-md px-3 py-2 text-base font-mono w-20 sm:w-24 text-center focus:outline-none focus:border-emerald-500";
  const wrapCls = compact
    ? "grid grid-cols-[12px,1fr,12px,1fr,12px,1fr] gap-1.5 items-center"
    : "flex gap-2 items-center flex-wrap";
  return `
    <div class="${wrapCls}" onclick="event.stopPropagation()">
      <span class="text-xs text-zinc-500 font-semibold text-center">1</span>
      <input type="number" inputmode="decimal" step="0.01" min="1.01" placeholder="1.85" value="${m.oddH ?? ''}" oninput="updateOdds('${m.id}','oddH',this.value)" class="${inputCls}">
      <span class="text-xs text-zinc-500 font-semibold text-center">X</span>
      <input type="number" inputmode="decimal" step="0.01" min="1.01" placeholder="3.40" value="${m.oddD ?? ''}" oninput="updateOdds('${m.id}','oddD',this.value)" class="${inputCls}">
      <span class="text-xs text-zinc-500 font-semibold text-center">2</span>
      <input type="number" inputmode="decimal" step="0.01" min="1.01" placeholder="4.20" value="${m.oddA ?? ''}" oninput="updateOdds('${m.id}','oddA',this.value)" class="${inputCls}">
      ${(m.oddH || m.oddD || m.oddA) ? `<button class="${compact ? 'col-span-6 mt-1' : ''} text-xs text-zinc-400 hover:text-red-400 px-2 py-1 min-h-[32px]" onclick="clearManualOdds('${m.id}')">${t('delete')}</button>` : ''}
    </div>
  `;
}

function clearManualOdds(id) {
  matchData[id].oddH = matchData[id].oddD = matchData[id].oddA = null;
  renderOverview(); renderGroups();
  saveState(true);
}

// ===== RENDER: GRUPPEN =====
function renderGroups() {
  const settings = getSettings();
  const grid = document.getElementById('groupsGrid');
  if (!grid) return;
  grid.innerHTML = Object.keys(GROUPS).map(g => renderGroupCard(g, settings)).join('');
}

function computeStandings(g, settings) {
  const teams = GROUPS[g].teams;
  const flags = GROUPS[g].flags;
  const st = teams.map((t, i) => ({ team: t, flag: flags[i], idx: i, pts: 0, gf: 0, ga: 0 }));
  const matches = Object.values(matchData).filter(m => m.group === g);
  for (const m of matches) {
    const r = computeMatch(m, settings);
    if (!r) continue;
    st[m.homeIdx].pts += 3 * r.probs.pH + r.probs.pD;
    st[m.awayIdx].pts += 3 * r.probs.pA + r.probs.pD;
    st[m.homeIdx].gf += r.lh; st[m.homeIdx].ga += r.la;
    st[m.awayIdx].gf += r.la; st[m.awayIdx].ga += r.lh;
  }
  for (const s of st) s.gd = s.gf - s.ga;
  st.sort((a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return st;
}

function renderGroupCard(g, settings) {
  const st = computeStandings(g, settings);
  const haveData = Object.values(matchData).filter(m => m.group === g)
    .some(m => computeMatch(m, settings) !== null);
  const stRows = st.map((s, i) => {
    const indicator = i === 0 ? 'text-emerald-400' : i === 1 ? 'text-blue-400' : i === 2 ? 'text-amber-400' : 'text-zinc-600';
    return `<tr class="border-b border-zinc-800 last:border-0">
      <td class="py-1.5 px-1 ${indicator} font-semibold">${i+1}</td>
      <td class="py-1.5 px-2 text-white"><span class="mr-1">${s.flag}</span>${teamLabel(s.team)}</td>
      <td class="py-1.5 px-1 text-right text-zinc-400 font-mono text-xs">${s.pts.toFixed(1)}</td>
      <td class="py-1.5 px-1 text-right text-zinc-500 font-mono text-xs">${s.gf.toFixed(1)}:${s.ga.toFixed(1)}</td>
      <td class="py-1.5 px-1 text-right ${s.gd >= 0 ? 'text-zinc-300' : 'text-zinc-500'} font-mono text-xs">${(s.gd >= 0 ? '+' : '')}${s.gd.toFixed(1)}</td>
    </tr>`;
  }).join('');

  const matches = Object.values(matchData).filter(m => m.group === g);
  const matchCards = matches.map(m => renderMatchCard(m, computeMatch(m, settings), settings, { compact: true })).join('');

  return `
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
        <h3 class="font-semibold text-white">${t('groupName')} ${g}</h3>
        <span class="text-xs px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">${haveData ? t('withDataShort') : t('noOddsShort')}</span>
      </div>
      <div class="px-4 py-2 border-b border-zinc-800">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-[10px] uppercase text-zinc-500 tracking-wider">
              <th class="text-left py-1 px-1 font-medium">#</th>
              <th class="text-left py-1 px-2 font-medium">${t('colMatch').split(' ')[0]}</th>
              <th class="text-right py-1 px-1 font-medium">xPts</th>
              <th class="text-right py-1 px-1 font-medium">xG</th>
              <th class="text-right py-1 px-1 font-medium">±</th>
            </tr>
          </thead>
          <tbody>${stRows}</tbody>
        </table>
      </div>
      <div class="p-2">${matchCards}</div>
    </div>
  `;
}

// ===== SPECIALS: Outright-Daten & Monte-Carlo =====
// outrightData = { teams: [{key, label, prob}, ...] } — sortiert nach prob desc
let outrightData = null;
// Cache für simulierte Gruppen-Resultate (key = group letter)
let groupSimCache = {};
// Manueller Override für Top-Torschütze (Team-Key oder '')
let topScorerOverride = '';

function clearGroupSimCache() { groupSimCache = {}; }

// Sample (i,j) aus einer Score-Matrix gegen uniform random
function sampleScore(matrix) {
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      cum += matrix[i][j];
      if (r <= cum) return [i, j];
    }
  }
  // Falls die Matrix nicht ganz 1.0 summiert (numerische Reste), nimm letzte Zelle
  return [matrix.length - 1, matrix.length - 1];
}

// Monte-Carlo: Wer wird Gruppensieger? Liefert für jedes der 4 Teams die Wkt.
function simulateGroupWinners(g, settings, nSims = 10000) {
  // Cache
  const cacheKey = `${g}|${activeAggMethod({ aggOverride: null })}|${settings.exact}|${settings.diff}|${settings.tend}|${settings.maxGoals}`;
  if (groupSimCache[cacheKey]) return groupSimCache[cacheKey];

  const teams = GROUPS[g].teams;
  const matches = Object.values(matchData).filter(m => m.group === g);
  // Pre-compute Score-Matrizen aller Spiele
  const matchInfos = matches.map(m => {
    const r = computeMatch(m, settings);
    return r ? { homeIdx: m.homeIdx, awayIdx: m.awayIdx, matrix: r.matrix } : null;
  });
  // Wenn ein Spiel keine Daten hat, abbrechen
  if (matchInfos.some(mi => !mi)) {
    groupSimCache[cacheKey] = null;
    return null;
  }

  const winCount = [0, 0, 0, 0];
  const placeCount = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];

  for (let sim = 0; sim < nSims; sim++) {
    const st = [
      { idx: 0, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() },
      { idx: 1, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() },
      { idx: 2, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() },
      { idx: 3, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() }
    ];
    for (const mi of matchInfos) {
      const [hg, ag] = sampleScore(mi.matrix);
      st[mi.homeIdx].gf += hg; st[mi.homeIdx].ga += ag;
      st[mi.awayIdx].gf += ag; st[mi.awayIdx].ga += hg;
      if (hg > ag) st[mi.homeIdx].pts += 3;
      else if (hg < ag) st[mi.awayIdx].pts += 3;
      else { st[mi.homeIdx].pts += 1; st[mi.awayIdx].pts += 1; }
    }
    // Sortiere wie FIFA (Pts → GD → GF → Tiebreak)
    st.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.tiebreak - b.tiebreak);
    winCount[st[0].idx]++;
    for (let pos = 0; pos < 4; pos++) placeCount[pos][st[pos].idx]++;
  }

  const result = {
    winProbs: winCount.map(c => c / nSims),
    placeProbs: placeCount.map(row => row.map(c => c / nSims))
  };
  groupSimCache[cacheKey] = result;
  return result;
}

// Top-N nach Outright-Wkt (für Halbfinalisten und Top-Torschütze)
function getTopOutright(n = 4) {
  if (!outrightData || !outrightData.teams) return [];
  return outrightData.teams.slice(0, n);
}

// ===== VOLLE TURNIER-SIMULATION =====
// Wir simulieren Gruppe → R32 → R16 → QF → SF → F.
// Output: pro Team und Runde die Wahrscheinlichkeit dort zu sein.
let tournamentSimResult = null;

function getTeamStrength() {
  // Aus Outright-Wkt eine "Stärke" ableiten. Falls kein Outright vorhanden: Default.
  const s = {};
  if (outrightData && outrightData.teams) {
    for (const t of outrightData.teams) s[t.key] = Math.max(t.prob, 0.001);
  }
  // Defaults für nicht-gerankte Teams
  for (const g of Object.keys(GROUPS)) {
    for (const t of GROUPS[g].teams) {
      if (!(t in s)) s[t] = 0.005; // sehr schwach
    }
  }
  return s;
}

function simulateGroupOncePlace(g, settings, matrixCache) {
  const matches = Object.values(matchData).filter(m => m.group === g);
  const infos = matches.map(m => matrixCache[m.id]);
  if (infos.some(mi => !mi)) return null;
  const st = [
    { idx: 0, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() },
    { idx: 1, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() },
    { idx: 2, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() },
    { idx: 3, pts: 0, gf: 0, ga: 0, tiebreak: Math.random() }
  ];
  for (const mi of infos) {
    const [hg, ag] = sampleScore(mi.matrix);
    st[mi.homeIdx].gf += hg; st[mi.homeIdx].ga += ag;
    st[mi.awayIdx].gf += ag; st[mi.awayIdx].ga += hg;
    if (hg > ag) st[mi.homeIdx].pts += 3;
    else if (hg < ag) st[mi.awayIdx].pts += 3;
    else { st[mi.homeIdx].pts++; st[mi.awayIdx].pts++; }
  }
  st.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.tiebreak - b.tiebreak);
  return st.map(s => ({
    team: GROUPS[g].teams[s.idx], pts: s.pts, gd: s.gf - s.ga, gf: s.gf
  }));
}

// KO-Spiel: P(A gewinnt) basierend auf relativer Stärke (Bradley-Terry-Modell)
function simulateKnockout(teamA, teamB, strength) {
  const sA = strength[teamA] || 0.001;
  const sB = strength[teamB] || 0.001;
  const pA = sA / (sA + sB);
  return Math.random() < pA ? teamA : teamB;
}

// Vollständige Turnier-Simulation. Liefert für jedes Team die Wkt
// in jeder Runde (R16, R8 (QF), SF, F, Champion).
function simulateFullTournament(settings, nSims = 1500) {
  // Prüfe ob alle Gruppen Daten haben
  for (const g of Object.keys(GROUPS)) {
    const ms = Object.values(matchData).filter(m => m.group === g);
    for (const m of ms) {
      if (!computeMatch(m, settings)) return null; // Daten fehlen
    }
  }

  // Pre-compute Score-Matrizen für alle Gruppenspiele (nur einmal)
  const matrixCache = {};
  for (const m of Object.values(matchData)) {
    const r = computeMatch(m, settings);
    if (r) matrixCache[m.id] = { homeIdx: m.homeIdx, awayIdx: m.awayIdx, matrix: r.matrix };
  }

  const strength = getTeamStrength();
  const rounds = ['r16', 'qf', 'sf', 'final', 'champion'];
  const reached = {};
  for (const teamKey of Object.keys(TEAM_LABELS)) {
    reached[teamKey] = { r16: 0, qf: 0, sf: 0, final: 0, champion: 0 };
  }

  for (let sim = 0; sim < nSims; sim++) {
    // 1) Gruppen simulieren → 24 direkte Aufsteiger (12 × 1.+2.) + 12 Dritte
    const winners = []; // 12 Teams (1.)
    const runners = []; // 12 Teams (2.)
    const thirds = []; // 12 Teams (3.) inkl. Stats für Best-3rd-Wahl
    for (const g of Object.keys(GROUPS)) {
      const place = simulateGroupOncePlace(g, settings, matrixCache);
      if (!place) continue;
      winners.push(place[0].team);
      runners.push(place[1].team);
      thirds.push({ team: place[2].team, pts: place[2].pts, gd: place[2].gd, gf: place[2].gf, rnd: Math.random() });
    }

    // 2) Beste 8 Dritte auswählen (nach Pts, GD, GF, dann zufällig)
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.rnd - b.rnd);
    const best3rds = thirds.slice(0, 8).map(x => x.team);

    // 3) R32 = 32 Teams. Wir mischen sie pseudo-zufällig (keine echte Bracket-Logik)
    let bracket = [...winners, ...runners, ...best3rds];
    // Shuffle für Cross-Matchups (vereinfachtes Modell, da exaktes Bracket nicht modelliert wird)
    for (let i = bracket.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bracket[i], bracket[j]] = [bracket[j], bracket[i]];
    }

    // R32 → R16
    let next = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const w = simulateKnockout(bracket[i], bracket[i+1], strength);
      next.push(w);
    }
    for (const tm of next) if (reached[tm]) reached[tm].r16++;

    // R16 → QF
    let qfNext = [];
    for (let i = 0; i < next.length; i += 2) qfNext.push(simulateKnockout(next[i], next[i+1], strength));
    for (const tm of qfNext) if (reached[tm]) reached[tm].qf++;

    // QF → SF
    let sfNext = [];
    for (let i = 0; i < qfNext.length; i += 2) sfNext.push(simulateKnockout(qfNext[i], qfNext[i+1], strength));
    for (const tm of sfNext) if (reached[tm]) reached[tm].sf++;

    // SF → F
    let finalNext = [];
    for (let i = 0; i < sfNext.length; i += 2) finalNext.push(simulateKnockout(sfNext[i], sfNext[i+1], strength));
    for (const tm of finalNext) if (reached[tm]) reached[tm].final++;

    // Final → Champion
    const champion = simulateKnockout(finalNext[0], finalNext[1], strength);
    if (reached[champion]) reached[champion].champion++;
  }

  // In Wahrscheinlichkeiten konvertieren
  const teams = [];
  for (const teamKey of Object.keys(reached)) {
    const r = reached[teamKey];
    if (r.r16 === 0 && r.champion === 0) continue; // hat sich nie qualifiziert
    teams.push({
      key: teamKey,
      label: teamLabel(teamKey),
      r16: r.r16 / nSims,
      qf: r.qf / nSims,
      sf: r.sf / nSims,
      final: r.final / nSims,
      champion: r.champion / nSims
    });
  }
  teams.sort((a, b) => b.champion - a.champion);
  tournamentSimResult = { teams, nSims, simulatedAt: new Date().toISOString() };
  return tournamentSimResult;
}

// ===== API FETCH =====
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT_KEY = 'soccer_fifa_world_cup';
const SPORT_KEY_OUTRIGHT = 'soccer_fifa_world_cup_winner';

function getSelectedRegions() {
  const regions = [];
  ['Eu','Uk','Us','Au'].forEach(r => {
    if (document.getElementById('reg' + r).checked) regions.push(r.toLowerCase());
  });
  return regions;
}
function setApiStatus(state, text) {
  const el = document.getElementById('apiStatus');
  const t = document.getElementById('apiStatusText');
  if (!el || !t) return;
  // Reset class then add state-specific
  el.className = 'inline-flex items-center gap-2 text-xs text-zinc-400 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full';
  if (state === 'ok') el.classList.add('!border-emerald-700');
  else if (state === 'err') el.classList.add('!border-red-600');
  else if (state === 'busy') el.classList.add('!border-amber-500');
  // dot
  const dot = el.querySelector('.dot');
  if (dot) {
    dot.className = 'dot w-2 h-2 rounded-full bg-zinc-600';
    if (state === 'ok') dot.className = 'dot w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(63,185,80,0.2)]';
    else if (state === 'err') dot.className = 'dot w-2 h-2 rounded-full bg-red-500';
    else if (state === 'busy') dot.className = 'dot w-2 h-2 rounded-full bg-amber-500 animate-pulse-dot';
  }
  t.textContent = text;
}
async function fetchAllOdds() {
  const key = (document.getElementById('apiKey').value || '').trim();
  if (!key) {
    setApiStatus('err', t('apiStatusEmpty'));
    switchTab('settings');
    document.getElementById('apiKey').focus();
    return;
  }
  const regions = getSelectedRegions();
  if (regions.length === 0) {
    setApiStatus('err', '⚠');
    switchTab('settings');
    return;
  }
  const btn = document.getElementById('fetchBtn');
  if (btn) btn.disabled = true;
  setApiStatus('busy', t('apiStatusLoading', { n: regions.length, plural: regions.length > 1 ? 's' : '' }));

  try {
    // Beide Endpoints parallel: matches (h2h) + outright (Weltmeister)
    // Outright nur mit 1 Region (EU) um Credits zu sparen — Outright-Quoten unterscheiden sich kaum nach Region
    const matchUrl = `${ODDS_API_BASE}/sports/${SPORT_KEY}/odds?apiKey=${encodeURIComponent(key)}&regions=${regions.join(',')}&markets=h2h&oddsFormat=decimal`;
    const outRegion = regions.includes('eu') ? 'eu' : regions[0];
    const outrightUrl = `${ODDS_API_BASE}/sports/${SPORT_KEY_OUTRIGHT}/odds?apiKey=${encodeURIComponent(key)}&regions=${outRegion}&markets=outrights&oddsFormat=decimal`;

    const [matchRes, outrightRes] = await Promise.allSettled([fetch(matchUrl), fetch(outrightUrl)]);

    // === Matches ===
    let stats = { matched: 0, bookmakers: 0 };
    let remaining = null;
    if (matchRes.status === 'fulfilled' && matchRes.value.ok) {
      const events = await matchRes.value.json();
      remaining = matchRes.value.headers.get('x-requests-remaining');
      stats = applyApiEvents(events);
      clearGroupSimCache(); // Daten geändert → Simulation neu rechnen
    } else if (matchRes.status === 'fulfilled') {
      const txt = await matchRes.value.text(); let msg = `HTTP ${matchRes.value.status}`;
      try { const j = JSON.parse(txt); if (j.message) msg = j.message; } catch(e){}
      throw new Error(msg);
    } else {
      throw new Error(matchRes.reason?.message || 'Netzwerk-Fehler (Matches)');
    }

    // === Outright === (Fehler hier kein hartes Failure — Specials sind optional)
    let outrightCount = 0;
    if (outrightRes.status === 'fulfilled' && outrightRes.value.ok) {
      const outrightEvents = await outrightRes.value.json();
      outrightCount = applyOutrightEvents(outrightEvents);
      const remainingOut = outrightRes.value.headers.get('x-requests-remaining');
      if (remainingOut !== null) remaining = remainingOut;
    } else {
      console.warn('Outright odds could not be loaded — Specials werden ohne Outright-Daten dargestellt.');
    }

    setApiStatus('ok', t('apiStatusLoaded', { matches: stats.matched, bms: stats.bookmakers }) + (remaining ? ` · ${remaining} credits` : ''));
    renderOverview(); renderGroups(); renderSpecials();
    saveState(true);
    let msg = t('toastFetched', { n: stats.matched, bm: stats.bookmakers });
    if (outrightCount > 0) msg += ' · ' + t('outrightLoaded', { n: outrightCount });
    toast(msg);
  } catch (e) {
    setApiStatus('err', t('apiStatusError', { msg: e.message }));
    toast(t('toastApiError', { msg: e.message }), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Parse Outright-API Antwort und mappe auf interne Team-Keys
function applyOutrightEvents(events) {
  if (!Array.isArray(events) || events.length === 0) { outrightData = null; return 0; }
  // Outright kommt als 1+ Event mit markets.outrights mit outcomes (Teams)
  // Wir aggregieren über alle Buchmacher: pro Team Median der entwerteten Wkt
  const teamRawProbs = {}; // key → [prob, prob, ...] aus mehreren Buchmachern
  for (const ev of events) {
    for (const bm of (ev.bookmakers || [])) {
      const outright = (bm.markets || []).find(m => m.key === 'outrights');
      if (!outright || !outright.outcomes) continue;
      // Sum aller outcome-implicit-probs (= 1/odd) zum normalisieren
      const valid = outright.outcomes.filter(o => o.price && o.price > 1);
      if (valid.length === 0) continue;
      const totalRaw = valid.reduce((s, o) => s + 1/o.price, 0);
      if (totalRaw <= 0) continue;
      for (const o of valid) {
        const teamKey = findInternalTeam(o.name);
        if (!teamKey) continue;
        const prob = (1 / o.price) / totalRaw;
        if (!teamRawProbs[teamKey]) teamRawProbs[teamKey] = [];
        teamRawProbs[teamKey].push(prob);
      }
    }
  }
  const median = arr => { const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
  const teams = Object.entries(teamRawProbs).map(([key, probs]) => ({ key, label: teamLabel(key), prob: median(probs), nBms: probs.length }));
  // Re-normalisieren (Median-Summe ist nicht exakt 1)
  const sum = teams.reduce((s, t) => s + t.prob, 0);
  if (sum > 0) teams.forEach(t => t.prob = t.prob / sum);
  teams.sort((a, b) => b.prob - a.prob);
  outrightData = { teams, fetchedAt: new Date().toISOString() };
  saveSnapshot();
  return teams.length;
}
function applyApiEvents(events) {
  for (const m of Object.values(matchData)) m.bookmakerData = [];
  let matched = 0, totalBM = 0;
  for (const ev of events) {
    const hI = findInternalTeam(ev.home_team);
    const aI = findInternalTeam(ev.away_team);
    if (!hI || !aI) continue;
    const match = Object.values(matchData).find(m =>
      (m.home === hI && m.away === aI) || (m.home === aI && m.away === hI));
    if (!match) continue;
    const flipped = match.home !== hI;
    const bms = [];
    for (const bm of (ev.bookmakers || [])) {
      const h2h = (bm.markets || []).find(x => x.key === 'h2h');
      if (!h2h) continue;
      let oH = null, oD = null, oA = null;
      for (const o of (h2h.outcomes || [])) {
        if (o.name === 'Draw') oD = o.price;
        else if (o.name === ev.home_team) oH = o.price;
        else if (o.name === ev.away_team) oA = o.price;
      }
      if (oH && oD && oA && oH > 1 && oD > 1 && oA > 1) {
        const useH = flipped ? oA : oH, useA = flipped ? oH : oA;
        const p = oddsToProbs(useH, oD, useA);
        if (p) bms.push({ key: bm.key, title: bm.title, oH: useH, oD, oA: useA, pH: p.pH, pD: p.pD, pA: p.pA, vig: p.vig });
      }
    }
    if (bms.length > 0) {
      match.bookmakerData = bms;
      match.apiCommenceTime = ev.commence_time;
      matched++; totalBM += bms.length;
    }
  }
  return { matched, bookmakers: totalBM };
}

// ===== INTERAKTION =====
function updateOdds(id, field, value) {
  matchData[id][field] = value === '' ? null : parseFloat(value);
  scheduleRender();
}
let _renderTimer = null;
function scheduleRender() {
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => {
    clearGroupSimCache();
    renderOverview(); renderGroups(); renderSpecials();
    saveState(true);
  }, 250);
}
function setAggOverride(mid, method) {
  matchData[mid].aggOverride = matchData[mid].aggOverride === method ? null : method;
  renderOverview(); renderGroups();
  saveState(true);
}

// ===== STORAGE =====
const STORAGE_KEY = 'wm2026-kicktipp-optimizer-v3';
function saveState(silent) {
  const state = {
    matchData,
    outrightData,
    topScorerOverride,
    settings: {
      ptsExact: document.getElementById('ptsExact').value,
      ptsDiff: document.getElementById('ptsDiff').value,
      ptsTend: document.getElementById('ptsTend').value,
      maxGoals: document.getElementById('maxGoals').value,
      apiKey: document.getElementById('apiKey').value,
      defaultAgg: document.getElementById('defaultAgg').value,
      regEu: document.getElementById('regEu').checked,
      regUk: document.getElementById('regUk').checked,
      regUs: document.getElementById('regUs').checked,
      regAu: document.getElementById('regAu').checked
    },
    savedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!silent) toast(t('toastSaved'));
  } catch (e) { toast(t('toastSaveFail', { msg: e.message }), true); }
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { toast(t('toastNothingToLoad')); return; }
    const state = JSON.parse(raw);
    if (state.matchData) {
      for (const id of Object.keys(state.matchData)) {
        if (matchData[id]) {
          const src = state.matchData[id];
          matchData[id].oddH = src.oddH; matchData[id].oddD = src.oddD; matchData[id].oddA = src.oddA;
          matchData[id].bookmakerData = src.bookmakerData || [];
          matchData[id].apiCommenceTime = src.apiCommenceTime || null;
          matchData[id].aggOverride = src.aggOverride || null;
        }
      }
    }
    if (state.outrightData) outrightData = state.outrightData;
    if (state.topScorerOverride !== undefined) topScorerOverride = state.topScorerOverride || '';
    clearGroupSimCache();
    if (state.settings) {
      for (const [k, v] of Object.entries(state.settings)) {
        const el = document.getElementById(k);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      }
    }
    updateApiStatusFromKey();
    renderOverview(); renderGroups(); renderSpecials();
    toast(t('toastLoaded'));
  } catch (e) { toast(t('toastLoadFail', { msg: e.message }), true); }
}
function clearAll() {
  if (!confirm(t('confirmReset'))) return;
  initMatches();
  outrightData = null;
  topScorerOverride = '';
  clearGroupSimCache();
  document.getElementById('ptsExact').value = 4;
  document.getElementById('ptsDiff').value = 3;
  document.getElementById('ptsTend').value = 2;
  document.getElementById('maxGoals').value = 7;
  document.getElementById('apiKey').value = '';
  document.getElementById('defaultAgg').value = 'median';
  ['regEu','regUk','regUs','regAu'].forEach(id => document.getElementById(id).checked = true);
  localStorage.removeItem(STORAGE_KEY);
  expandedId = null;
  setApiStatus('', t('apiStatusEmpty'));
  renderOverview(); renderGroups(); renderSpecials();
  toast(t('toastReset'));
}
function exportCSV() {
  const settings = getSettings();
  const rows = [['Match-ID','Group','Date','Home','Away','Source','Bookmakers','P_H%','P_D%','P_A%','xG_H','xG_A','Top-Score','P_Top%','Tip','EV']];
  for (const m of Object.values(matchData)) {
    const r = computeMatch(m, settings);
    const date = m.apiCommenceTime ? m.apiCommenceTime.slice(0,10) : '';
    if (!r) rows.push([m.id, m.group, date, teamLabel(m.home), teamLabel(m.away), '', '', '','','','','','','','','']);
    else rows.push([
      m.id, m.group, date, teamLabel(m.home), teamLabel(m.away),
      r.label, m.bookmakerData?.length || 0,
      (r.probs.pH*100).toFixed(1), (r.probs.pD*100).toFixed(1), (r.probs.pA*100).toFixed(1),
      r.lh.toFixed(2), r.la.toFixed(2),
      r.topScores[0].score, (r.topScores[0].p*100).toFixed(1),
      `${r.bestTip.h}:${r.bestTip.a}`, r.bestTip.ep.toFixed(2)
    ]);
  }
  const csv = rows.map(r => r.map(c => {
    const s = String(c); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `wm2026-tips-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast(t('toastCsv'));
}
function updateApiStatusFromKey() {
  const key = (document.getElementById('apiKey').value || '').trim();
  let bmTotal = 0, withData = 0;
  for (const m of Object.values(matchData)) {
    if (m.bookmakerData?.length > 0) { withData++; bmTotal += m.bookmakerData.length; }
  }
  if (withData > 0) setApiStatus('ok', t('apiStatusLoaded', { matches: withData, bms: bmTotal }));
  else if (key) setApiStatus('', t('apiStatusKeySet'));
  else setApiStatus('', t('apiStatusEmpty'));
}
function toast(msg, isError) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `fixed bottom-4 right-4 left-4 sm:left-auto z-[200] bg-zinc-900 border ${isError ? 'border-red-500' : 'border-emerald-500'} text-white px-4 py-2.5 rounded-lg shadow-xl text-sm transition-all`;
  clearTimeout(window._toast);
  window._toast = setTimeout(() => {
    el.className = `fixed bottom-4 right-4 left-4 sm:left-auto z-[200] bg-zinc-900 border ${isError ? 'border-red-500' : 'border-emerald-500'} text-white px-4 py-2.5 rounded-lg shadow-xl text-sm opacity-0 pointer-events-none transition-all`;
  }, 2400);
}

// ===== I18N: Apply static translations to DOM =====
function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const html = el.dataset.i18nHtml;
    if (html !== undefined) el.innerHTML = t(key);
    else el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  applyStaticTranslations();

  ['ptsExact','ptsDiff','ptsTend','maxGoals','defaultAgg'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      clearGroupSimCache();
      renderOverview(); renderGroups(); renderSpecials();
      saveState(true);
    });
  });
  ['apiKey','regEu','regUk','regUs','regAu'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (id === 'apiKey') updateApiStatusFromKey();
      saveState(true);
    });
  });

  // Auto-load
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.matchData) for (const id of Object.keys(state.matchData)) {
        if (matchData[id]) {
          const src = state.matchData[id];
          matchData[id].oddH = src.oddH; matchData[id].oddD = src.oddD; matchData[id].oddA = src.oddA;
          matchData[id].bookmakerData = src.bookmakerData || [];
          matchData[id].apiCommenceTime = src.apiCommenceTime || null;
          matchData[id].aggOverride = src.aggOverride || null;
        }
      }
      if (state.outrightData) outrightData = state.outrightData;
      if (state.topScorerOverride !== undefined) topScorerOverride = state.topScorerOverride || '';
      if (state.settings) for (const [k, v] of Object.entries(state.settings)) {
        const el = document.getElementById(k);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      }
    }
  } catch (e) {}
  updateApiStatusFromKey();
  renderOverview(); renderGroups(); renderSpecials();

  // Service Worker registrieren (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
