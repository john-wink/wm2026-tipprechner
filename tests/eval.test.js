// Tests: Quoten-Einfrieren, statisches Ergebnis-Backfill, Auswertung (Prognose vs. Ergebnis)

const EVAL_SETTINGS = { exact: 4, diff: 3, tend: 2, maxGoals: 7 };

function oddsEvent(home, away, commence, oH, oD, oA) {
  return {
    home_team: home, away_team: away, commence_time: commence,
    bookmakers: [{ key: 'pinnacle', title: 'Pinnacle', markets: [{ key: 'h2h', outcomes: [
      { name: home, price: oH }, { name: 'Draw', price: oD }, { name: away, price: oA }
    ]}]}]
  };
}

test('Quoten-Einfrieren: Fetch ohne ein Spiel löscht dessen Quoten nicht mehr', () => {
  const app = loadApp();
  app.applyApiEvents([oddsEvent('Mexico', 'South Africa', '2026-06-11T20:00:00Z', 1.8, 3.6, 4.5)]);
  assertEq(app.matchData['A-1'].bookmakerData.length, 1, 'A-1 hat Quoten nach Fetch 1');
  // Fetch 2 enthält NUR ein anderes Spiel — A-1 ist aus dem Feed verschwunden (gespielt)
  app.applyApiEvents([oddsEvent('South Korea', 'Czechia', '2026-06-12T20:00:00Z', 2.2, 3.3, 3.4)]);
  assertEq(app.matchData['A-1'].bookmakerData.length, 1, 'A-1-Quoten bleiben eingefroren');
  assertEq(app.matchData['A-2'].bookmakerData.length, 1, 'A-2 bekommt neue Quoten');
});

test('Quoten-Einfrieren: K.-o.-Quoten (koOddsIndex) überleben Folge-Fetches', () => {
  const app = loadApp();
  app.applyApiEvents([oddsEvent('England', 'Morocco', '2026-07-05T20:00:00Z', 2.0, 3.4, 3.8)]);
  assert(app.findKoOdds('England', 'Marokko'), 'K.-o.-Quoten indexiert');
  app.applyApiEvents([oddsEvent('France', 'Brazil', '2026-07-09T20:00:00Z', 2.5, 3.2, 2.9)]);
  assert(app.findKoOdds('England', 'Marokko'), 'England–Marokko bleibt eingefroren');
});

test('applyStaticResults: füllt Lücke, API-Daten haben Vorrang', () => {
  const app = loadApp();
  app.STATIC_RESULTS.length = 0; // Tests isolieren: mitgelieferte Einträge ausblenden
  // API-Ergebnis vorhanden: Mexiko 0:0
  app.applyScoreEvents([{ commence_time: '2026-06-11T20:00:00Z', completed: true,
    home_team: 'Mexico', away_team: 'South Africa',
    scores: [{ name: 'Mexico', score: '0' }, { name: 'South Africa', score: '0' }] }]);
  app.STATIC_RESULTS.push(
    ['2026-06-11', 'Mexiko', 'Suedafrika', 3, 0],   // Konflikt: API gewinnt
    ['2026-06-12', 'Suedkorea', 'Tschechien', 2, 1] // Lücke: wird gefüllt
  );
  const n = app.applyStaticResults();
  assertEq(n, 1, 'nur die Lücke wird gefüllt');
  const r1 = app.findResult('Mexiko', 'Suedafrika');
  assertEq(r1.hs, 0, 'API-Ergebnis bleibt bestehen');
  const r2 = app.findResult('Suedkorea', 'Tschechien');
  assertEq(r2.hs, 2); assertEq(r2.as, 1);
});

test('applyStaticResults: statische Einträge werden aufgefrischt, Gruppenspiele nicht in koFixtures', () => {
  const app = loadApp();
  app.STATIC_RESULTS.length = 0;
  app.STATIC_RESULTS.push(['2026-06-12', 'Suedkorea', 'Tschechien', 2, 1]);
  app.applyStaticResults();
  // Neue App-Version korrigiert den statischen Eintrag → Refresh erlaubt
  app.STATIC_RESULTS.length = 0;
  app.STATIC_RESULTS.push(['2026-06-12', 'Suedkorea', 'Tschechien', 1, 1]);
  app.applyStaticResults();
  assertEq(app.findResult('Suedkorea', 'Tschechien').as, 1, 'statischer Eintrag aufgefrischt');
  assertEq(Object.keys(app.koFixtures).length, 0, 'Gruppenspiel erzeugt kein K.-o.-Fixture');
});

test('applyStaticResults: R32-Eintrag landet als Fixture im richtigen Rundenfenster', () => {
  const app = loadApp();
  app.STATIC_RESULTS.length = 0;
  app.STATIC_RESULTS.push(['2026-06-29', 'Frankreich', 'Deutschland', 2, 0]);
  app.applyStaticResults();
  const br = app.koFixturesByRound();
  assertEq(br.r32.length, 1, 'statisches R32-Spiel im Sechzehntelfinale');
  assertEq(br.r32[0].completed, true);
  assertEq(app.findResult('Frankreich', 'Deutschland', true).hs, 2);
});

test('collectEvalRows: Punkte des empfohlenen Tipps gegen echtes Ergebnis', () => {
  const app = loadApp();
  // Prognose: Mexiko klarer Favorit
  app.applyApiEvents([oddsEvent('Mexico', 'South Africa', '2026-06-11T20:00:00Z', 1.5, 4.0, 6.0)]);
  const tip = app.computeMatch(app.matchData['A-1'], EVAL_SETTINGS).bestTip;
  // Echtes Ergebnis: 2:0 für Mexiko
  app.applyScoreEvents([{ commence_time: '2026-06-11T20:00:00Z', completed: true,
    home_team: 'Mexico', away_team: 'South Africa',
    scores: [{ name: 'Mexico', score: '2' }, { name: 'South Africa', score: '0' }] }]);
  const rows = app.collectEvalRows(EVAL_SETTINGS);
  assertEq(rows.length, 1);
  assertEq(rows[0].pts, app.ktPoints(tip.h, tip.a, 2, 0, EVAL_SETTINGS), 'Punkte = ktPoints(Tipp, Ergebnis)');
  assert(rows[0].cat !== 'miss', 'Favoritensieg → Tendenz mindestens richtig');
});

test('collectEvalRows: Ergebnis ohne gespeicherte Prognose zählt nicht in die Bilanz', () => {
  const app = loadApp();
  app.applyScoreEvents([{ commence_time: '2026-06-13T20:00:00Z', completed: true,
    home_team: 'Canada', away_team: 'Qatar',
    scores: [{ name: 'Canada', score: '4' }, { name: 'Qatar', score: '1' }] }]);
  const rows = app.collectEvalRows(EVAL_SETTINGS);
  assertEq(rows.length, 1, 'Spiel wird gelistet');
  assertEq(rows[0].tip, null, 'aber ohne Prognose');
  assertEq(rows[0].pts, null, 'und ohne Punkte');
});

test('STATIC_RESULTS: mitgelieferte Daten sind vollständig und konsistent', () => {
  const app = loadApp();
  assertEq(app.STATIC_RESULTS.length, 79, '72 Gruppenspiele + 7 Sechzehntelfinals');
  const teamCount = {};
  let grp = 0, r32 = 0;
  for (const [date, h, a, hs, as] of app.STATIC_RESULTS) {
    assert(app.GROUPS[Object.keys(app.GROUPS).find(g => app.GROUPS[g].teams.includes(h))], 'Team-Key bekannt: ' + h);
    assert(Number.isInteger(hs) && Number.isInteger(as) && hs >= 0 && as >= 0, 'Score plausibel: ' + h);
    if (app.isKnockoutPairing(h, a)) r32++; else { grp++; teamCount[h] = (teamCount[h] || 0) + 1; teamCount[a] = (teamCount[a] || 0) + 1; }
  }
  assertEq(grp, 72); assertEq(r32, 7);
  assert(Object.values(teamCount).every(c => c === 3), 'jedes Team hat genau 3 Gruppenspiele');
  const n = app.applyStaticResults();
  assertEq(n, 79, 'alle 79 werden in leerem Zustand übernommen');
  assertEq(app.koFixturesByRound().r32.length, 7, 'die 7 Sechzehntelfinals liegen im R32-Fenster');
});

test('computeOverallForecast: gespielte Spiele fließen nicht in die Punkte-Prognose ein', () => {
  const app = loadApp();
  app.STATIC_RESULTS.length = 0;
  app.applyApiEvents([oddsEvent('Mexico', 'South Africa', '2026-06-11T20:00:00Z', 1.5, 4.0, 6.0)]);
  assertEq(app.computeOverallForecast(EVAL_SETTINGS).matchesWithTip, 1, 'offenes Spiel zählt');
  app.applyScoreEvents([{ commence_time: '2026-06-11T20:00:00Z', completed: true,
    home_team: 'Mexico', away_team: 'South Africa',
    scores: [{ name: 'Mexico', score: '2' }, { name: 'South Africa', score: '0' }] }]);
  assertEq(app.computeOverallForecast(EVAL_SETTINGS).matchesWithTip, 0, 'gespieltes Spiel zählt nicht mehr');
});

test('simulateGroupWinners: komplett gespielte Gruppe → echter Sieger mit P=1', () => {
  const app = loadApp();
  app.applyStaticResults(); // alle 72 Gruppenergebnisse
  const sim = app.simulateGroupWinners('A', EVAL_SETTINGS, 200);
  assert(sim !== null, 'Simulation läuft auch ohne Quoten (alle Spiele fix)');
  const mexIdx = app.GROUPS.A.teams.indexOf('Mexiko');
  assertEq(sim.winProbs[mexIdx], 1, 'Mexiko hat Gruppe A real gewonnen → P=1');
});

test('advancerFromFixtures: statischer Aufsteiger ohne API-Folgerunde', () => {
  const app = loadApp();
  app.applyStaticResults();
  assertEq(app.advancerFromFixtures('Deutschland', 'Paraguay'), 'Paraguay', 'aus adv-Feld, keine R16-Fixtures nötig');
  assertEq(app.advancerFromFixtures('Niederlande', 'Marokko'), 'Marokko');
});

test('applyStaticResults: vervollständigt unfertigen Fixture-Stub aus Quoten-Feed', () => {
  const app = loadApp();
  // Stub aus altem Quoten-Feed (completed=false, keine Tore)
  app.applyApiEvents([oddsEvent('Germany', 'Paraguay', '2026-06-29T18:00:00Z', 1.8, 3.5, 4.5)]);
  const key = app.pairKey('Deutschland', 'Paraguay');
  assertEq(app.koFixtures[key].completed, false, 'Stub ist unfertig');
  app.applyStaticResults();
  assertEq(app.koFixtures[key].completed, true, 'statisches Endergebnis vervollständigt den Stub');
  assertEq(app.koFixtures[key].hs, 1);
});

test('tipCategory: Kategorien korrekt', () => {
  const app = loadApp();
  assertEq(app.tipCategory(2, 1, 2, 1), 'exact');
  assertEq(app.tipCategory(2, 1, 3, 2), 'diff');
  assertEq(app.tipCategory(2, 1, 1, 0), 'diff');
  assertEq(app.tipCategory(2, 1, 4, 1), 'tend');
  assertEq(app.tipCategory(1, 1, 2, 2), 'tend', 'Remis-Tipp bei anderem Remis = Tendenz (Diff erfordert Nicht-Remis)');
  assertEq(app.tipCategory(2, 1, 0, 2), 'miss');
});
