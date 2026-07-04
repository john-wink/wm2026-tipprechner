// Regressionstests: Ergebnis-Übernahme (/scores) und K.-o.-Runden-Zuordnung.
// Basis: reale API-Antwort von api.the-odds-api.com vom 04.07.2026 (daysFrom=3).
// Die Antwort enthält NUR die letzten 3 Tage + kommende Spiele — die R32-Spiele
// vom 28.–30.06. fehlen also. Starres 16er-Chunking scheitert daran (Bug).

const SCORES_2026_07_04 = [
  { commence_time: '2026-07-01T16:00:00Z', completed: true,  home_team: 'England',     away_team: 'DR Congo',
    scores: [{ name: 'England', score: '2' }, { name: 'DR Congo', score: '1' }] },
  { commence_time: '2026-07-01T20:00:00Z', completed: true,  home_team: 'Belgium',     away_team: 'Senegal',
    scores: [{ name: 'Belgium', score: '3' }, { name: 'Senegal', score: '2' }] },
  { commence_time: '2026-07-02T00:00:00Z', completed: true,  home_team: 'USA',         away_team: 'Bosnia & Herzegovina',
    scores: [{ name: 'USA', score: '2' }, { name: 'Bosnia & Herzegovina', score: '0' }] },
  { commence_time: '2026-07-02T19:00:00Z', completed: true,  home_team: 'Spain',       away_team: 'Austria',
    scores: [{ name: 'Spain', score: '3' }, { name: 'Austria', score: '0' }] },
  { commence_time: '2026-07-02T23:00:00Z', completed: true,  home_team: 'Portugal',    away_team: 'Croatia',
    scores: [{ name: 'Portugal', score: '2' }, { name: 'Croatia', score: '1' }] },
  { commence_time: '2026-07-03T03:00:00Z', completed: true,  home_team: 'Switzerland', away_team: 'Algeria',
    scores: [{ name: 'Switzerland', score: '2' }, { name: 'Algeria', score: '0' }] },
  // K.-o.-Spiel mit Entscheidung erst nach Verlängerung/Elfmeterschießen:
  // die API meldet nur den Stand nach 90 Minuten (1:1). Dass Ägypten
  // weiterkam, ist nur aus dem Achtelfinal-Fixture (vs. Argentinien) ablesbar.
  { commence_time: '2026-07-03T18:00:00Z', completed: true,  home_team: 'Australia',   away_team: 'Egypt',
    scores: [{ name: 'Australia', score: '1' }, { name: 'Egypt', score: '1' }] },
  { commence_time: '2026-07-03T22:00:00Z', completed: true,  home_team: 'Argentina',   away_team: 'Cape Verde',
    scores: [{ name: 'Argentina', score: '3' }, { name: 'Cape Verde', score: '2' }] },
  { commence_time: '2026-07-04T01:30:00Z', completed: true,  home_team: 'Colombia',    away_team: 'Ghana',
    scores: [{ name: 'Colombia', score: '1' }, { name: 'Ghana', score: '0' }] },
  // Achtelfinale (noch nicht gespielt, scores = null)
  { commence_time: '2026-07-04T17:00:00Z', completed: false, home_team: 'Canada',      away_team: 'Morocco',   scores: null },
  { commence_time: '2026-07-04T21:00:00Z', completed: false, home_team: 'Paraguay',    away_team: 'France',    scores: null },
  { commence_time: '2026-07-05T20:00:00Z', completed: false, home_team: 'Brazil',      away_team: 'Norway',    scores: null },
  { commence_time: '2026-07-06T00:00:00Z', completed: false, home_team: 'Mexico',      away_team: 'England',   scores: null },
  { commence_time: '2026-07-06T19:00:00Z', completed: false, home_team: 'Portugal',    away_team: 'Spain',     scores: null },
  { commence_time: '2026-07-07T00:00:00Z', completed: false, home_team: 'USA',         away_team: 'Belgium',   scores: null },
  { commence_time: '2026-07-07T16:00:00Z', completed: false, home_team: 'Argentina',   away_team: 'Egypt',     scores: null },
  { commence_time: '2026-07-07T20:00:00Z', completed: false, home_team: 'Switzerland', away_team: 'Colombia',  scores: null }
];

const TEST_SETTINGS = { exact: 4, diff: 3, tend: 2, maxGoals: 7 };

test('applyScoreEvents: 9 abgeschlossene Ergebnisse + 17 K.-o.-Fixtures übernommen', () => {
  const app = loadApp();
  const n = app.applyScoreEvents(SCORES_2026_07_04);
  assertEq(n, 9, 'alle 9 abgeschlossenen Spiele sollten als Ergebnis übernommen werden');
  assertEq(Object.keys(app.koFixtures).length, 17, 'alle 17 Events sind K.-o.-Fixtures');
});

test('findResult: Ergebnis korrekt auf Heim/Auswärts orientiert', () => {
  const app = loadApp();
  app.applyScoreEvents(SCORES_2026_07_04);
  const r1 = app.findResult('England', 'DRKongo');
  assertEq(r1.hs, 2); assertEq(r1.as, 1);
  const r2 = app.findResult('DRKongo', 'England');
  assertEq(r2.hs, 1); assertEq(r2.as, 2, 'gespiegelte Abfrage muss das Ergebnis spiegeln');
});

test('koFixturesByRound: Runden-Zuordnung übersteht Lücken (daysFrom=3)', () => {
  const app = loadApp();
  app.applyScoreEvents(SCORES_2026_07_04);
  const br = app.koFixturesByRound();
  assertEq(br.r32.length, 9, 'nur die 9 bekannten Sechzehntelfinals gehören ins R32');
  assertEq(br.r16.length, 8, 'alle 8 Achtelfinals gehören ins R16');
  assertEq(br.qf.length, 0, 'kein Viertelfinale bekannt');
  // Stichprobe: Argentina vs Egypt (07.07.) ist ein Achtelfinale, KEIN Sechzehntelfinale
  const inR16 = br.r16.some(f => (f.home === 'Argentinien' && f.away === 'Aegypten'));
  assert(inR16, 'Argentinien vs Ägypten muss im Achtelfinale liegen');
});

test('hasLiveBracket: erkennt Live-Daten auch ohne R32-Fixtures', () => {
  const app = loadApp();
  // Nutzer startet erst zum Viertelfinale: nur QF-Fixtures bekannt
  app.applyScoreEvents([
    { commence_time: '2026-07-09T20:00:00Z', completed: false, home_team: 'France', away_team: 'Brazil', scores: null }
  ]);
  assert(app.hasLiveBracket(), 'ein einzelnes QF-Fixture ist ein Live-Bracket');
});

test('advancerFromFixtures: Elfmeter-Sieger aus Folgerunden-Fixture ablesen', () => {
  const app = loadApp();
  app.applyScoreEvents(SCORES_2026_07_04);
  const adv = app.advancerFromFixtures('Australien', 'Aegypten');
  assertEq(adv, 'Aegypten', 'Ägypten spielt im Achtelfinale gegen Argentinien → Ägypten kam weiter');
});

test('koWinner: 1:1 nach 90 Min. → echter Aufsteiger statt Modell-Favorit', () => {
  const app = loadApp();
  app.applyScoreEvents(SCORES_2026_07_04);
  const m = { id: 'KO-TEST-1', isKO: true, home: 'Australien', away: 'Aegypten',
    oddH: null, oddD: null, oddA: null, bookmakerData: [], aggOverride: null };
  assertEq(app.koWinner(m, TEST_SETTINGS), 'Aegypten');
});

test('advancerFromFixtures: Halbfinal-Verlierer im Spiel um Platz 3 führt nicht in die Irre', () => {
  const app = loadApp();
  app.applyScoreEvents([
    // Halbfinale endet 1:1 (Entscheidung n.E.) — Frankreich kommt weiter
    { commence_time: '2026-07-14T19:00:00Z', completed: true, home_team: 'Spain', away_team: 'France',
      scores: [{ name: 'Spain', score: '1' }, { name: 'France', score: '1' }] },
    // Spanien (Verlierer) spielt um Platz 3, Frankreich steht im Finale
    { commence_time: '2026-07-18T19:00:00Z', completed: false, home_team: 'Spain', away_team: 'England', scores: null },
    { commence_time: '2026-07-19T19:00:00Z', completed: false, home_team: 'France', away_team: 'Argentina', scores: null }
  ]);
  assertEq(app.advancerFromFixtures('Spanien', 'Frankreich'), 'Frankreich',
    'nur das Finale (Folgerunde) zählt, nicht das Spiel um Platz 3');
});

test('Gruppenergebnis wird nicht von K.-o.-Rematch derselben Teams überschrieben', () => {
  const app = loadApp();
  // Gruppenspiel (beide Gruppe H): Spanien 2:0 Uruguay
  app.applyScoreEvents([
    { commence_time: '2026-06-19T20:00:00Z', completed: true, home_team: 'Spain', away_team: 'Uruguay',
      scores: [{ name: 'Spain', score: '2' }, { name: 'Uruguay', score: '0' }] }
  ]);
  // Hypothetisches Finale derselben Teams: 1:1
  app.applyScoreEvents([
    { commence_time: '2026-07-19T19:00:00Z', completed: true, home_team: 'Spain', away_team: 'Uruguay',
      scores: [{ name: 'Spain', score: '1' }, { name: 'Uruguay', score: '1' }] }
  ]);
  const grp = app.findResult('Spanien', 'Uruguay');
  assertEq(grp.hs, 2, 'Gruppenergebnis (für die Tabelle) muss 2:0 bleiben');
  assertEq(grp.as, 0);
  const ko = app.findResult('Spanien', 'Uruguay', true);
  assertEq(ko.hs, 1, 'K.-o.-Sicht muss das Finalergebnis 1:1 liefern');
  assertEq(ko.as, 1);
});

test('Gruppenspiele landen nicht in koFixtures', () => {
  const app = loadApp();
  app.applyScoreEvents([
    { commence_time: '2026-06-19T20:00:00Z', completed: true, home_team: 'Spain', away_team: 'Uruguay',
      scores: [{ name: 'Spain', score: '2' }, { name: 'Uruguay', score: '0' }] }
  ]);
  assertEq(Object.keys(app.koFixtures).length, 0, 'gruppeninterne Spiele in der Gruppenphase sind keine K.-o.-Fixtures');
});
