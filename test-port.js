// Throwaway runtime test for the 14 Jul port (walk detection + physics sprint filter).
// Synthetic ground truth: 90-min recording, known breaks/bench/sprints/glitch.
'use strict';
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

// minimal DOM stubs so the wiring at the bottom of the script doesn't crash
const el = () => ({ addEventListener(){}, style:{}, value:'', textContent:'', innerHTML:'',
  classList:{ add(){}, remove(){} }, querySelectorAll(){ return []; }, dataset:{} });
const ctx = {
  document: { getElementById: el, createElement: el, querySelectorAll(){ return []; },
    documentElement: {} },
  getComputedStyle(){ return { getPropertyValue(){ return ''; } }; },
  window: { scrollTo(){} },
  FileReader: function(){}, DOMParser: function(){},
  console,
};
vm.createContext(ctx);
vm.runInContext(src + '\n; this.__ = {analyse, slowRuns, sampleGaps, mergeWindows, autoHalftime, benchDefaults};', ctx);
const { analyse, slowRuns, sampleGaps, mergeWindows } = ctx.__;

// --- synthetic game: 3s samples, 90 min ---
// play = 2.5 m/s meander; windows of 1.0 m/s walking:
//   Q1 break 17-19 min, halftime 35-40, Q3 break 55-57, card sit-out 63-70 (walking the sideline)
// sprints (6.5 m/s = 23.4 km/h, 9s) at 10, 30, 50, 80 min; glitch spike (11.9 m/s) at 25 min
const walk = [[17*60,19*60],[35*60,40*60],[55*60,57*60],[63*60,70*60]];
const sprintT = [10*60, 30*60, 50*60, 80*60];
const pts = [];
for (let t = 0; t <= 90*60; t += 3){
  let v = 2.5;
  if (walk.some(([a,b]) => t >= a && t < b)) v = 1.0;
  if (sprintT.some(s => t >= s && t < s+9)) v = 6.5;
  const glitchHere = (t === 25*60);
  const raw = glitchHere ? 11.9 : v;
  pts.push({ x: Math.sin(t/40)*20, y: Math.cos(t/53)*15, t, hr: 140 + (v>2?15:-20), spd: v, spdRaw: raw });
}

let fail = 0;
const ok = (name, cond, detail='') => { console.log((cond?'PASS':'FAIL') + '  ' + name + (detail?'  ('+detail+')':'')); if(!cond) fail++; };

// 1. window detection finds exactly the 4 planted walking windows (±10s edges)
const W = mergeWindows(slowRuns(pts, 1.7, 45).concat(sampleGaps(pts)));
ok('detects 4 walk windows', W.length === 4, JSON.stringify(W.map(w=>w.map(x=>Math.round(x/60)))));
walk.forEach((w,i) => ok(`window ${i} edges within 10s`,
  W[i] && Math.abs(W[i][0]-w[0])<=10 && Math.abs(W[i][1]-w[1])<=10));

// 2. analyse with all windows excluded, halftime at 37.5 min
const halfT = 37.5*60;
const r = analyse(pts, 0, halfT, 90*60, W);

// sprints: 4 planted, glitch spike must NOT count (11.9 m/s = 42.8 km/h > 34)
ok('sprints == 4 (glitch rejected)', r.sprints === 4, 'got '+r.sprints);
ok('top speed == 23.4 (not 42.8)', Math.abs(r.top - 23.4) < 0.2, 'got '+r.top);

// quarter bounds anchored at break windows: Q1 ends ~17min -> Q1 sprint at 10min in Q1, 30min sprint in Q2, 50min in Q3, 80min in Q4
ok('sprints per quarter 1/1/1/1', r.quarters.every(q => q.sprints === 1),
   r.quarters.map(q=>q.sprints).join('/'));

// quarter boundary in H2 = window nearest the H2 midpoint (65 min): that's the
// 63-70 sit-out (mid 66.5), not the 55-57 break (mid 56) -> Q4 = 70->90 = 20 min,
// Q3 = 40->63 minus the 2-min 55-57 break = 21 min. Both windows stay excluded.
ok('Q4 on-pitch ~20 min', Math.abs(r.quarters[3].onPitch - 20) < 1.5, 'got '+r.quarters[3].onPitch.toFixed(1));
ok('Q3 on-pitch ~21 min', Math.abs(r.quarters[2].onPitch - 21) < 1.5, 'got '+r.quarters[2].onPitch.toFixed(1));
// Q1 = 0->17 full play = 17 min
ok('Q1 on-pitch ~17 min', Math.abs(r.quarters[0].onPitch - 17) < 1.5, 'got '+r.quarters[0].onPitch.toFixed(1));

// distance excludes walking windows: walking would add ~1.0*60*16min ~ 960m; play ~2.5 m/s
// expected total ≈ 2.5 * (90-16)*60 + sprint extra 4*9*(6.5-2.5) = 11100 + 144 ≈ 11.2km
ok('distance excludes walk windows', Math.abs(r.distAll - 11250) < 400, 'got '+Math.round(r.distAll));

// avg HR excludes bench (walking HR 120 dragged in would lower it): play HR 155
ok('avg HR ≈ play HR (bench excluded)', r.avgHr >= 153, 'got '+r.avgHr);

// 3. glitch with plausible speed but implausible double-shoulder accel
const pts2 = pts.map(p => ({...p}));
const k = pts2.findIndex(p => p.t === 45*60);
pts2[k].spdRaw = 9.0; // 32.4 km/h, under the 34 cap; shoulders 2.5 -> accel 6.5/3 = 2.17 < 3.5 -> NOT glitch, counts as sprint
const r2 = analyse(pts2, 0, halfT, 90*60, W);
ok('plausible-accel burst kept', r2.sprints === 5, 'got '+r2.sprints);
const pts3 = pts.map(p => ({...p}));
pts3[k].spdRaw = 9.0; pts3[k-1].spdRaw = 0.2; pts3[k+1].spdRaw = 0.2; // accel ±2.9 -> still <3.5? 8.8/3=2.93 -> kept
pts3[k-1].t = k>0 ? pts3[k].t-2 : 0; pts3[k+1].t = pts3[k].t+2; // tighten to 2s -> 4.4 m/s^2 both -> glitch
const r3 = analyse(pts3, 0, halfT, 90*60, W);
ok('teleport (double-shoulder accel) rejected', r3.sprints === 4, 'got '+r3.sprints);

// 4. no exclusions passed (user unticked everything) -> engine still runs, walking counts
const r4 = analyse(pts, 0, halfT, 90*60, []);
ok('no-exclusion path runs', r4.quarters.length === 4 && r4.distAll > r.distAll);

// 5. benchDefaults: bench anchor from the halftime sit; windows AT the bench
// spot -> ticked, walking-pace windows elsewhere on the pitch -> play.
// bench at (0,60); play meanders around (0,0); one walk window at (0,60)
// (a sub spell), one walk window out at (35,0) (quiet defending).
const BX = 0, BY = 60;
const pts5 = [];
for (let t = 0; t <= 90*60; t += 3){
  let v = 2.5, x = Math.sin(t/40)*20, y = Math.cos(t/53)*15;
  const atBench = (t >= 35*60 && t < 40*60) || (t >= 55*60 && t < 62*60); // halftime + sub spell
  const quietFar = (t >= 70*60 && t < 74*60);                             // quiet defending, far away
  if (atBench){ v = 0.9; x = BX + Math.sin(t)*3; y = BY + Math.cos(t)*3; }
  if (quietFar){ v = 0.9; x = 35 + Math.sin(t)*4; y = Math.cos(t)*4; }
  pts5.push({ x, y, t, hr: atBench ? 120 : 150, spd: v, spdRaw: v });
}
const W5 = ctx.__.mergeWindows(ctx.__.slowRuns(pts5, 1.7, 45));
const defs = ctx.__.benchDefaults(pts5, W5, 37.5*60);
const labelled = W5.map((w,i) => [Math.round(w[0]/60)+'-'+Math.round(w[1]/60), defs[i]]);
ok('halftime window auto-ticked', labelled.some(([l,b]) => l==='35-40' && b), JSON.stringify(labelled));
ok('sub spell at bench spot auto-ticked', labelled.some(([l,b]) => l==='55-62' && b));
ok('quiet defending far from bench NOT ticked', labelled.some(([l,b]) => l==='70-74' && !b));

process.exit(fail ? 1 : 0);
