// i18n-Konsistenz-Tests

test('i18n: alle 4 Sprachen vorhanden', () => {
  const app = loadApp();
  ['de', 'en', 'fr', 'es'].forEach(l => {
    assert(app.I18N[l], `Sprache ${l} fehlt`);
  });
});

test('i18n: alle Keys in allen Sprachen', () => {
  const app = loadApp();
  const langs = ['de', 'en', 'fr', 'es'];
  const allKeys = new Set();
  langs.forEach(l => Object.keys(app.I18N[l]).forEach(k => allKeys.add(k)));
  langs.forEach(l => {
    const missing = [...allKeys].filter(k => !(k in app.I18N[l]));
    assertEq(missing.length, 0, `${l} fehlen ${missing.length} keys: ${missing.slice(0,5).join(',')}`);
  });
});

test('i18n: 48 Team-Labels in allen Sprachen', () => {
  const app = loadApp();
  const teamKeys = Object.keys(app.TEAM_LABELS);
  assertEq(teamKeys.length, 48, 'sollte 48 Teams haben');
  ['de', 'en', 'fr', 'es'].forEach(l => {
    teamKeys.forEach(k => {
      assert(app.TEAM_LABELS[k][l] && app.TEAM_LABELS[k][l].length > 0,
        `${k}.${l} fehlt`);
    });
  });
});

test('Team-Mapping: alle 48 API-Schreibweisen werden gemappt', () => {
  const app = loadApp();
  const apiNames = [
    'Mexico','South Africa','South Korea','Czech Republic',
    'Canada','Switzerland','Qatar','Bosnia & Herzegovina',
    'Brazil','Morocco','Scotland','Haiti',
    'USA','Paraguay','Australia','Turkey',
    'Germany','Curaçao','Ivory Coast','Ecuador',
    'Netherlands','Japan','Sweden','Tunisia',
    'Belgium','Egypt','Iran','New Zealand',
    'Spain','Cape Verde','Saudi Arabia','Uruguay',
    'France','Senegal','Norway','Iraq',
    'Argentina','Algeria','Austria','Jordan',
    'Portugal','Colombia','Uzbekistan','DR Congo',
    'England','Croatia','Ghana','Panama'
  ];
  const unmapped = apiNames.filter(n => !app.findInternalTeam(n));
  assertEq(unmapped.length, 0, `Unmapped: ${unmapped.join(', ')}`);
});

test('GROUPS: 12 Gruppen × 4 Teams = 48', () => {
  const app = loadApp();
  const all = [];
  for (const g of Object.keys(app.GROUPS)) {
    assertEq(app.GROUPS[g].teams.length, 4);
    all.push(...app.GROUPS[g].teams);
  }
  assertEq(all.length, 48);
  // Keine Duplikate
  assertEq(new Set(all).size, 48);
});

test('t(): Variablen-Interpolation', () => {
  const app = loadApp();
  // shareChampionLine: "Weltmeister-Tipp: {team} ({p}%)"
  const out = app.t('shareChampionLine', { team: 'Spain', p: '14.5' });
  assert(out.includes('Spain'), 'Team-Variable interpoliert');
  assert(out.includes('14.5'), 'Prozent-Variable interpoliert');
});

test('t(): fehlender Key → key zurück (fallback)', () => {
  const app = loadApp();
  const out = app.t('xyzNonExistentKey123');
  assertEq(out, 'xyzNonExistentKey123');
});
