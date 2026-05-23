// WM 2022 (Katar) – Daten für den Backtest.
// Stärke-Scores (ad hoc, kalibriert an Pre-Tournament-Outright-Quoten der großen Buchmacher).
// Quelle Outright: Bet365/Pinnacle Konsens 14.11.2022 (Wikipedia: 2022_FIFA_World_Cup, Bookies).
// Higher = stronger. 1.0 wäre theoretisches Maximum (Top-Favorit), 0.05 = Außenseiter.

const WC2022_STRENGTH = {
  // Top-Favoriten
  'Brazil': 0.17, 'Argentina': 0.12, 'France': 0.12, 'England': 0.09, 'Spain': 0.09,
  // Mittelfeld
  'Germany': 0.07, 'Netherlands': 0.05, 'Portugal': 0.04, 'Belgium': 0.04, 'Croatia': 0.025,
  'Uruguay': 0.022, 'Denmark': 0.020, 'Switzerland': 0.018, 'USA': 0.015, 'Senegal': 0.014,
  // Außenseiter
  'Mexico': 0.012, 'Poland': 0.012, 'South Korea': 0.011, 'Serbia': 0.010, 'Japan': 0.010,
  'Wales': 0.009, 'Ecuador': 0.008, 'Iran': 0.008, 'Morocco': 0.007, 'Australia': 0.006,
  'Cameroon': 0.006, 'Canada': 0.005, 'Ghana': 0.005, 'Tunisia': 0.005, 'Saudi Arabia': 0.004,
  'Costa Rica': 0.004, 'Qatar': 0.005
};

// 48 Gruppenspiele (Gruppenphase WM 2022)
// Format: [home, away, homeGoals, awayGoals]
const WC2022_MATCHES = [
  // Gruppe A
  ['Qatar','Ecuador',0,2],
  ['Senegal','Netherlands',0,2],
  ['Qatar','Senegal',1,3],
  ['Netherlands','Ecuador',1,1],
  ['Ecuador','Senegal',1,2],
  ['Netherlands','Qatar',2,0],
  // Gruppe B
  ['England','Iran',6,2],
  ['USA','Wales',1,1],
  ['Wales','Iran',0,2],
  ['England','USA',0,0],
  ['Wales','England',0,3],
  ['Iran','USA',0,1],
  // Gruppe C
  ['Argentina','Saudi Arabia',1,2],
  ['Mexico','Poland',0,0],
  ['Poland','Saudi Arabia',2,0],
  ['Argentina','Mexico',2,0],
  ['Poland','Argentina',0,2],
  ['Saudi Arabia','Mexico',1,2],
  // Gruppe D
  ['Denmark','Tunisia',0,0],
  ['France','Australia',4,1],
  ['Tunisia','Australia',0,1],
  ['France','Denmark',2,1],
  ['Australia','Denmark',1,0],
  ['Tunisia','France',1,0],
  // Gruppe E
  ['Germany','Japan',1,2],
  ['Spain','Costa Rica',7,0],
  ['Japan','Costa Rica',0,1],
  ['Spain','Germany',1,1],
  ['Japan','Spain',2,1],
  ['Costa Rica','Germany',2,4],
  // Gruppe F
  ['Morocco','Croatia',0,0],
  ['Belgium','Canada',1,0],
  ['Belgium','Morocco',0,2],
  ['Croatia','Canada',4,1],
  ['Canada','Morocco',1,2],
  ['Croatia','Belgium',0,0],
  // Gruppe G
  ['Switzerland','Cameroon',1,0],
  ['Brazil','Serbia',2,0],
  ['Cameroon','Serbia',3,3],
  ['Brazil','Switzerland',1,0],
  ['Serbia','Switzerland',2,3],
  ['Cameroon','Brazil',1,0],
  // Gruppe H
  ['Uruguay','South Korea',0,0],
  ['Portugal','Ghana',3,2],
  ['South Korea','Ghana',2,3],
  ['Portugal','Uruguay',2,0],
  ['Ghana','Uruguay',0,2],
  ['South Korea','Portugal',2,1]
];

if (typeof module !== 'undefined') {
  module.exports = { WC2022_STRENGTH, WC2022_MATCHES };
}
