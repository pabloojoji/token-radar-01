# Token Radar — Night Ops

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/pabloojoji/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/pabloojoji/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A night-ops mission-control radar for pre-token protocols: it reads a sealed
DefiLlama snapshot, ranks every pre-token protocol by an implied value the
model computes from the snapshot's own figures, names one airdrop number per
protocol, and hands the reader a farm plan for each one — on a dark,
single-accent dashboard with a KPI strip, sortable and filterable board,
per-protocol detail view with a radar chart, and five self-checks the page
runs live.

## The value model (radar-2), in one paragraph

Implied value is an expected value: `implied = round(tvl_usd × category multiple × growth × maturity × TGE odds × chain breadth)`, where the category multiple is the median market-cap-per-TVL of the live-token protocols in the same category (at least 4 peers, otherwise the snapshot-wide median, clamped to [0.05, 0.80]), growth is `1 + clamp(change_7d, −50, 100) / 100 × 0.6`, maturity is `0.6 + 0.4 × min(age, 1095) / 1095` (older is worth more if it launches), TGE odds are `0.5 + 0.5 / (1 + age / 730)` (the longer a protocol has run with no token, the less likely a near launch, decaying with age and never below one half), chain breadth is `1 + 0.03 × min(chains, 5)`, and age is days since first listing (365 when unlisted); the airdrop number each row names is the model's airdrop pool, 5% of implied value. The board covers the whole 40-protocol watchlist plus every other rankable pre-token protocol the watchlist leaves out (198 rows on the dev snapshot: 40 watchlist + 158 early), live-token protocols are set aside with their market caps, and every number shown is in the snapshot or computed from its figures — farm costs and times are plan estimates, labelled as such.

## Run it

Node.js 22.18 or later, standard library only, nothing to install:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

That writes `out/board.json` (the ranked board), `out/data.js` (the
dashboard's dataset), `out/dashboard/` (the page), `out/screenshots/` (the
three screenshots) and `out/dossier.json` (the judge's summary, built with the
vendored `vendor/makefun-board.ts`). Run it twice: both runs write identical
bytes.

## Layout

- `main.ts` — the entry program: reads the snapshot, builds the board, writes
  the outputs and the dossier.
- `lib/model.ts` — the radar-2 model: peer multiples, implied value, farm
  plans, live-token view, board validation.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored from the kit.
- `dashboard/` — `index.html`, `style.css`, `app.js`: the night-ops page, no
  network, no framework. Total source 44,188 bytes, under the 64 KB the
  dossier shows whole.
- `screenshots/` — `1-board.jpg` (the board), `2-detail.jpg` (a protocol's
  detail view), `3-filtered.jpg` (a filtered view), each 1440×900.

## Design

Deep navy ink with one electric accent (signal lime): a KPI strip on top, the
ranked board as the hero with text search, category and chain filters, a
watchlist-only toggle, a TVL floor and sorting, a detail view per protocol
with the model's every term, a five-axis radar chart, a six-step farm plan
with cost and time, and the nearest rivals above and below. Deliberately not
a plain light dense table and not a dark terminal clone: the hierarchy,
spacing and the lime-on-navy system are the design.
