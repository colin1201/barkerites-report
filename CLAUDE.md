# Barkerites Match Report

Self-serve match report tool for Colin's hockey teammates. They export their game activity as GPX (Garmin Connect web / Strava), drop it on the page, and get a personal match report — heat map, quarter heat maps, quarter table, HR zones, sprints. **Everything runs client-side in their browser; no file is ever uploaded or stored.** Colin manages nothing.

- **Live:** https://colin1201.github.io/barkerites-report/
- **Repo:** https://github.com/colin1201/barkerites-report (public — required for GitHub Pages on free plan; pure static, no secrets)

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole tool: drop zone + GPX/TCX parser + analysis + canvas rendering. Single file, no dependencies. |
| `test-data/game1.gpx` | Colin's game 1 export used as the E2E test fixture. **Gitignored — real GPS data, never commit.** |

## PARITY RULE: this analysis lives in TWO codebases

The by-quarter table + match metrics exist here (JS, `index.html`) AND in `side-projects/hockey-training/game_report.py` (Python, generates Colin's own dashboard game pages). **Any metric or table change must be applied to BOTH in the same cycle** — they are deliberately parallel implementations (client-side JS for teammates, Garmin-API Python for Colin), not a shared engine. Since 13 Jul 2026 both use halftime-anchored quarters (H1/H2 each split in two) and both mirror H2 around the **union-midpoint pitch centre** (see below). Since **14 Jul 2026** the app also carries the py engine's walk detection (low-activity windows <1.7 m/s ≥45s), recording-hole handling, physics-based sprint glitch filter (>34 km/h or >3.5 m/s² both shoulders), and excluded-window semantics — as self-serve **break/bench chips** instead of py's `--bench`/`--breaks` flags (see below). Known divergences that are OK: halftime detection (app = mirror-symmetry search; py = `--halftime` explicit); py quarter bounds anchor only on `--breaks` windows (human-classified), the app anchors on any ticked window that passes a **±25%-of-half proximity gate** (stops a long bench spell stealing the boundary — KS GW1); py HR is time-weighted (app also time-weights, and both exclude bench/break HR). Venue calibration (`--venue`, surveyed OSM pitch corners) remains py-only — the app can't know which pitch a random teammate played on.

## How the analysis works (ported from hockey-training/game_report.py)

- Parse GPX (`trkpt` lat/lon/time + Garmin `hr` extension) or TCX (`Trackpoint`).
- Derived speed from coords: **raw jitter-capped (<12 m/s) for top speed + sprint bursts** (median smoothing crushes 1-sample sprint peaks at 3-5s GPS sampling — found in testing); **median-of-3 smoothed for distance, moving-time and heat classification**.
- Heat map: moving points (≥0.3 m/s) → local-meters projection → PCA rotation → mirror points after the halftime mark (ends swap) → dense end anchored left on a 91.4×55m pitch frame → 46×28 grid + per-quarter grids.
- **Mirror centre = union midpoint, NOT data centroid (fixed 13 Jul 2026):** because ends swap at halftime, the union of both halves spans the full pitch, so the pitch centre = midpoint of the union's percentile-trimmed extent per axis. The old centroid flip assumed play was symmetric — on Colin's game 2 (lopsided halves: long deep first half + short benched second) the centroid sat ~15m off pitch-centre and the flipped half landed offset, painting his deep first-half cluster as fake midfield presence. Same fix in `game_report.py`.
- **Kick-off / Halftime / Full-time sliders** (added after the first real teammate file, 6 Jul): players often record warm-up + cooldown — the right-back's file had ~29 min of warm-up, which broke the quarters and the ends-swap mirror (he appeared on both flanks). Analysis runs only on the [kick-off, full-time] window. Controls are CLOCK TIMES (type="time", from GPX timestamps in local tz) — "match started 19:35" is how humans remember it, not "minute 32 of my recording" (Colin, 6 Jul). Changing start/end re-detects halftime for the new window.
- **Auto-halftime = mirror-symmetry search** (`autoHalftime()`, upgraded same day): candidates = still blocks ≥45s in the middle 25-75% of the window; each is scored by how well the flipped second half overlaps the first (16×10 histogram intersection on PCA-rotated coords), duration as tiebreak. Longest-still-block alone is WRONG when a player subs off (Colin's own file: sub break 23-27min beat real halftime ~37min). Verified on both real files: RB → 79min (true break 74-83), Colin → 37min (true halftime). **Ground-truth testing pattern: synthetic GPX with known geometry** (player glued to one flank both halves) — proved the mirror math correct when a pixel-count check gave a false alarm.
- **Known limitations:** (1) lateral pitch frame centres on the player's own positions — a one-wing player renders nearer the middle than reality (can't know true sidelines from one player's data); (2) set-piece excursions (penalty corners) show as real hotspots — that's signal, teach users to read them; (3) `game_report.py` (hockey-training) defaults halftime to longest-still-block — WRONG when Colin subs off; always pass `--halftime "39-44"` (window from the still-block list + the 2/5/2 break structure) and `--bench "56-68"` explicitly (game 1 = halftime 33.1-41.5, bench 23.1-30.2; game 2 = halftime 39-44, bench 56-68).
- Quarters are anchored around the detected halftime (H1 and H2 each split in two), not blind elapsed ÷ 4. HR zones = fixed bands (Z1<110 … Z5≥170).
- **Breaks & bench chips (14 Jul 2026, ported from py):** on file load, detect walking-pace-or-below windows (smoothed <1.7 m/s ≥45s, merged with recording holes ≥60s). Windows overlapping the game window ≥90s render as tickable chips; **ticked = excluded from heat maps, quarter stats, sprints, top speed, HR** (and the ticked window nearest each half's midpoint — within ±25% of the half — anchors that half's quarter boundary). **Default ticks: only the halftime-containing window + true sits (window avg smoothed speed <0.5 m/s).** Walking-pace windows default UNTICKED because a quiet defender ranges at walking pace during real play — KS's GW1 file proved it: HR 155-167 during "walking" spells = playing; HR ~135-140 in a tight 20m circle = benched. The player ticks their own bench/card/sub windows (the chip note says so). This is the self-serve stand-in for the py workflow's scan→reconcile-with-Colin step. On-pitch minutes additionally subtract true stills ≥60s and recording holes regardless of chips.
- **Sprint/top-speed glitch filter (14 Jul 2026):** physics-based, same constants as py — reject a sample as glitch if raw speed >34 km/h OR acceleration >3.5 m/s² on BOTH shoulders (teleports). One-sided sharp accel is a real 2-4s burst; don't filter it.
- **Engine unit test: `node test-port.js`** — 16 synthetic ground-truth assertions (window detection, glitch filter both directions, quarter anchoring, bench-corrected on-pitch/fade). Run after ANY engine change, alongside the Playwright drive on the real files.
- **KS's real files (GW1 + GW2) live in `test-data/` (gitignored)** — the best real-world fixtures: warmup start, multiple sub spells, a yellow-card sit-out (GW2 18:17-18:28), benched-into-Q3 pattern. Match timings from Colin's games (he starts recording at push-back): GW1 kick 19:35 / halftime ~20:12 / FT 20:57; GW2 kick 18:08 / halftime 18:49 / FT 19:30.
- **By-quarter table (since 11 Jul):** on-pitch time (quarter minutes minus still blocks ≥60s — breaks, halftime, bench), distance, fast-run metres (≥15 km/h, smoothed speed), sprints (bursts ≥20 km/h, raw speed), top speed, avg HR. Plus a **late-game fade line**: Q4 vs Q1 distance + fast-run rates per on-pitch minute (guarded: needs ≥5 on-pitch min and >0 Q1 fast-run in both quarters, else "not enough data"). The 15/20 km/h thresholds are field-sport conventions, not hockey-validated — fine for self-comparison game to game. Table sits in a `.tscroll` overflow wrapper so 7 columns scroll inside the card on phones.

## Testing (before any handoff/redeploy)

Playwright E2E in the session scratchpad drives the real page: garbage-file error path, real GPX upload, tile values vs known game-1 truth (own half ~95%, ~3.9km, top ~25-27, HR ~148-152), slider re-render, desktop + 390px mobile screenshots, zero console errors, no horizontal scroll. Reference script pattern: `test-report-tool.js` (scratchpad; recreate as needed).

## Deploy

Push to `master` on `colin1201` account (`gh auth switch --user colin1201`), GitHub Pages serves from root. Verify live with a NEW-version-unique marker + cache-buster (see side-projects CLAUDE.md deploy rule).

## Phase 2 ideas (not built — see tracker)

Team gallery (everyone's maps per game, needs storage), FIT-file support, prettier URL via a `barkeriteshockey` GitHub org (needs Colin to create the org in the web UI once).
