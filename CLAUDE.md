# Barkerites Match Report

Self-serve match report tool for Colin's hockey teammates. They export their game activity as GPX (Garmin Connect web / Strava), drop it on the page, and get a personal match report — heat map, quarter heat maps, quarter table, HR zones, sprints. **Everything runs client-side in their browser; no file is ever uploaded or stored.** Colin manages nothing.

- **Live:** https://colin1201.github.io/barkerites-report/
- **Repo:** https://github.com/colin1201/barkerites-report (public — required for GitHub Pages on free plan; pure static, no secrets)

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole tool: drop zone + GPX/TCX parser + analysis + canvas rendering. Single file, no dependencies. |
| `test-data/game1.gpx` | Colin's game 1 export used as the E2E test fixture. **Gitignored — real GPS data, never commit.** |

## How the analysis works (ported from hockey-training/game_report.py)

- Parse GPX (`trkpt` lat/lon/time + Garmin `hr` extension) or TCX (`Trackpoint`).
- Derived speed from coords: **raw jitter-capped (<12 m/s) for top speed + sprint bursts** (median smoothing crushes 1-sample sprint peaks at 3-5s GPS sampling — found in testing); **median-of-3 smoothed for distance, moving-time and heat classification**.
- Heat map: moving points (≥0.3 m/s) → local-meters projection → PCA rotation → mirror points after the halftime mark (ends swap) → dense end anchored left on a 91.4×55m pitch frame → 46×28 grid + per-quarter grids.
- Halftime: auto-guessed as midpoint of the longest <0.5 m/s block; user-adjustable slider re-runs everything.
- Quarters = elapsed time ÷ 4 (includes bench/breaks). HR zones = fixed bands (Z1<110 … Z5≥170).

## Testing (before any handoff/redeploy)

Playwright E2E in the session scratchpad drives the real page: garbage-file error path, real GPX upload, tile values vs known game-1 truth (own half ~95%, ~3.9km, top ~25-27, HR ~148-152), slider re-render, desktop + 390px mobile screenshots, zero console errors, no horizontal scroll. Reference script pattern: `test-report-tool.js` (scratchpad; recreate as needed).

## Deploy

Push to `master` on `colin1201` account (`gh auth switch --user colin1201`), GitHub Pages serves from root. Verify live with a NEW-version-unique marker + cache-buster (see side-projects CLAUDE.md deploy rule).

## Phase 2 ideas (not built — see tracker)

Team gallery (everyone's maps per game, needs storage), FIT-file support, prettier URL via a `barkeriteshockey` GitHub org (needs Colin to create the org in the web UI once).
