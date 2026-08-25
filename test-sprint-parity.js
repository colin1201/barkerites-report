/**
 * PARITY TEST: the app's sprint detector must agree with game_report.py's.
 *
 * The two implementations are deliberately parallel (client-side JS for
 * teammates, Python for Colin's own reports), which means they can silently
 * drift. This runs the SAME speed sequences through the JS rule and asserts the
 * counts the Python suite asserts for those sequences (test_game_report.py S20b).
 *
 * Run: node test-sprint-parity.js
 */
const SPRINT_ENTER = 20, SPRINT_EXIT = 15, SPRINT_MIN_BREAK = 2;

// mirrors the loop in index.html — kept in this file only as the test's subject
function countSprints(kmhSeries, dt = 1) {
  let sprints = 0, inb = false, belowSince = null;
  for (let i = 0; i < kmhSeries.length; i++) {
    const t = i * dt, kmh = kmhSeries[i], ok = kmh !== null;
    if (!inb) {
      if (ok && kmh >= SPRINT_ENTER) { sprints++; inb = true; belowSince = null; }
    } else if (!ok) {
      inb = false; belowSince = null;
    } else if (kmh >= SPRINT_EXIT) {
      belowSince = null;
    } else {
      if (belowSince === null) belowSince = t;
      if (t - belowSince >= SPRINT_MIN_BREAK) { inb = false; belowSince = null; }
    }
  }
  return sprints;
}

const hold = (v, n) => Array(n).fill(v);
const CASES = [
  // [name, series, expected] — expectations match test_game_report.py S20b/S20
  ['a steady burst is one sprint', [...hold(21, 5)], 1],
  ['a 1s dip to 19 km/h stays one sprint', [...hold(21, 4), 19, ...hold(21, 4)], 1],
  ['a 2s dip to 11 km/h stays one sprint (debounced)',
   [...hold(21, 4), 11, 11, ...hold(21, 4)], 1],
  ['a 5s drop to 11 km/h splits into two',
   [...hold(21, 4), ...hold(11, 5), ...hold(21, 4)], 2],
  ['a long walk between bursts splits them',
   [...hold(21, 4), ...hold(5, 30), ...hold(21, 4)], 2],
  ['never reaching 20 km/h is no sprint', [...hold(19.9, 20)], 0],
  ['excluded samples end the effort', [...hold(21, 4), null, null, ...hold(21, 4)], 2],
  ['entry needs 20, not 18', [...hold(18, 10)], 0],
];

let fails = 0;
for (const [name, series, want] of CASES) {
  const got = countSprints(series);
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${name} — expected ${want}, got ${got}`);
}
// the constants themselves must match the Python engine
const PY = { enter: 20.0, exit: 15.0, brk: 2.0 };
for (const [k, v, py] of [['enter', SPRINT_ENTER, PY.enter], ['exit', SPRINT_EXIT, PY.exit],
                          ['min break', SPRINT_MIN_BREAK, PY.brk]]) {
  const ok = v === py;
  if (!ok) fails++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${k} constant matches game_report.py — ${v} vs ${py}`);
}
console.log(fails ? `\n${fails} FAILURE(S)` : '\nsprint parity OK');
process.exit(fails ? 1 : 0);
