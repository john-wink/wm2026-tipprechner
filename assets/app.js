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
      ${manualSection}
      ${bmHTML}
    </div>
  `;
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

// ===== API FETCH =====
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT_KEY = 'soccer_fifa_world_cup';

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
    const url = `${ODDS_API_BASE}/sports/${SPORT_KEY}/odds?apiKey=${encodeURIComponent(key)}&regions=${regions.join(',')}&markets=h2h&oddsFormat=decimal`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text(); let msg = `HTTP ${res.status}`;
      try { const j = JSON.parse(txt); if (j.message) msg = j.message; } catch(e){}
      throw new Error(msg);
    }
    const events = await res.json();
    const remaining = res.headers.get('x-requests-remaining');
    const stats = applyApiEvents(events);
    setApiStatus('ok', t('apiStatusLoaded', { matches: stats.matched, bms: stats.bookmakers }) + (remaining ? ` · ${remaining} credits` : ''));
    renderOverview(); renderGroups();
    saveState(true);
    toast(t('toastFetched', { n: stats.matched, bm: stats.bookmakers }));
  } catch (e) {
    setApiStatus('err', t('apiStatusError', { msg: e.message }));
    toast(t('toastApiError', { msg: e.message }), true);
  } finally {
    if (btn) btn.disabled = false;
  }
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
    renderOverview(); renderGroups();
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
    if (state.settings) {
      for (const [k, v] of Object.entries(state.settings)) {
        const el = document.getElementById(k);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      }
    }
    updateApiStatusFromKey();
    renderOverview(); renderGroups();
    toast(t('toastLoaded'));
  } catch (e) { toast(t('toastLoadFail', { msg: e.message }), true); }
}
function clearAll() {
  if (!confirm(t('confirmReset'))) return;
  initMatches();
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
  renderOverview(); renderGroups();
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
    el.addEventListener(evt, () => { renderOverview(); renderGroups(); saveState(true); });
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
      if (state.settings) for (const [k, v] of Object.entries(state.settings)) {
        const el = document.getElementById(k);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      }
    }
  } catch (e) {}
  updateApiStatusFromKey();
  renderOverview(); renderGroups();
});
