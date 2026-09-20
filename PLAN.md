# City Memory — plan

A browser game for learning the location of every Belgian municipality. The game
names a municipality; you click its shape on the map. Miss it and it comes back
later in the round.

This plan is written to be executed autonomously, with no human in the loop.
Every external source below was verified live on 2026-09-20. Where something
could be ambiguous at build time, the plan states the decision rule to follow
rather than leaving it open.

## Decisions taken

| Decision | Choice |
|---|---|
| Boundary vintage | **Current (2026) state — 565 municipalities** |
| Prompt language | Both names shown (`Mons / Bergen`), local name first |
| Delivery | Static site in this repo — plain HTML/CSS/JS, no runtime dependencies |
| Mastery rule | Two correct **in a row** retires an item from the batch |
| Scopes | Belgium · Flanders · Wallonia · Brussels · each of the 11 provinces |
| Batch size | User-chosen N, sampled from the selected scope |

## Data

### Source: OpenStreetMap via Overpass

Belgian municipalities are `boundary=administrative` + `admin_level=8` relations.
OSM is the only source verified to carry the **current** boundary set: Eurostat
GISCO LAU stops at 2024, and geoBoundaries' Belgian data is the pre-2019 state
(589 units). Statbel is authoritative but its download pages are CAPTCHA-gated
and cannot be scripted.

Verified live query (returned 565 relations, OSM base timestamp 2026-09-20):

```
[out:json][timeout:280];
area["ISO3166-1"="BE"][admin_level=2]->.b;
rel(area.b)["boundary"="administrative"]["admin_level"="8"]["ref:INS"~"^<D>"];
out geom;
```

**A `User-Agent` header is mandatory.** Plain `curl` gets `406 Not Acceptable`
from `overpass-api.de`. Use
`city-memory/0.1 (+https://github.com/<user>/city-memory)`.

Fetch in **9 chunks** by first digit of `ref:INS` (`^1`, `^2`, … `^9`). One
province chunk was ~4 MB / 3 s, so the whole country is ~60 MB; chunking keeps
every request well inside the Overpass timeout and makes retries cheap. Cache
each raw response in `data/raw/osm-<D>.json` (gitignored) and skip refetching if
present, so reruns cost nothing. Retry each chunk 3× with backoff; if a chunk
still fails, fall back to the mirror `https://overpass.osm.ch/api/interpreter`.

### Assembling polygons

Run the raw Overpass output through `osmtogeojson` (verified: correctly assembles
the multipolygon relations into `Polygon`/`MultiPolygon`). It also emits the
relations' member nodes as stray `Point` features — **filter to features that have
a `ref:INS` property and a polygonal geometry.**

### Names

Every municipality has `ref:INS` and a `wikidata` QID (verified: 565/565), but
only 311 have `name:nl` and 328 have `name:fr`. Resolve each language with this
precedence:

1. OSM `name:nl` / `name:fr` / `name:de` — locally maintained, most trustworthy.
2. Wikidata label in that language, fetched via
   `https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=nl|fr|de&ids=<50 QIDs>`
   (verified working; batch 50 QIDs per request, ~12 requests total, send the
   same `User-Agent`).
3. OSM `name` as the final fallback.
4. `data/name-overrides.json`, a committed hand-edited file, wins over all of the
   above.

**Wikidata labels need a sanity pass.** Some are archaic exonyms nobody uses —
the French label for Knokke-Heist is "Knocke-Heyst". The build writes every case
where the two names differ to `data/REPORT.md` for review, and the override file
is where corrections land. Seed the override file with the handful of obvious
ones found on the first run.

**Display rule:** show the local official name first (Dutch in Flanders, French in
Wallonia, both in Brussels), with the other language second and smaller. If the
two names are identical, show one. A municipality is assigned its local language
from its region, which is derived from the NIS code.

### Province and region

Derived from the first two digits of the NIS code. Verified against the live data
— every one of the 565 maps to a known prefix, none unmatched:

| Prefix | Province | Region | Count |
|---|---|---|---|
| 11–13 | Antwerpen | Flanders | 67 |
| 21 | Brussels | Brussels | 19 |
| 23–24 | Vlaams-Brabant | Flanders | 63 |
| 25 | Brabant wallon | Wallonia | 27 |
| 31–38 | West-Vlaanderen | Flanders | 62 |
| 41–46 | Oost-Vlaanderen | Flanders | 55 |
| 51–58 | Hainaut | Wallonia | 69 |
| 61–64 | Liège | Wallonia | 84 |
| 71–73 | Limburg | Flanders | 38 |
| 81–85 | Luxembourg | Wallonia | 43 |
| 91–93 | Namur | Wallonia | 38 |
| | **Total** | | **565** |

### Drift policy

OSM is a live database, so a future merger will change these numbers. The build
**does not fail** on a count mismatch — the newest OSM state is by definition the
state we want to learn. It writes the observed counts and any delta from the
table above into `data/REPORT.md` and continues.

It **does fail** on structural problems, because those mean a broken pipeline:
a duplicate or missing `ref:INS`, a feature with no polygonal geometry, a NIS
prefix not in the table, an empty scope, or a total outside 500–650.

### Licence

OSM data is ODbL. The app footer must read
"Boundaries © OpenStreetMap contributors, ODbL" and link to
`https://www.openstreetmap.org/copyright`. `data/REPORT.md` records the OSM base
timestamp of the extract.

## Phase 0 — Data pipeline

`scripts/build-data.mjs`, Node, build-time dependencies only (`osmtogeojson`,
`d3-geo`, `topojson-server`, `topojson-simplify`). Nothing ships to the browser.
Committed outputs, so the site works without ever rerunning the build.

1. Fetch the 9 chunks, cache in `data/raw/`.
2. Convert with `osmtogeojson`, filter to `ref:INS` polygons.
3. Attach names, province, region.
4. Project once at build time (`geoConicConformal` fitted to Belgium) and emit SVG
   path strings — the browser never does geographic maths.
5. Simplify per scope: aggressive for the Belgium-wide map, gentle for province
   maps, so the national file stays a few hundred KB while province maps keep
   their detail. Simplification must not create empty or self-crossing paths;
   assert every output path is non-empty and every polygon keeps ≥ 3 points.
6. Emit one file per scope to `public/data/scopes/`:
   `{ generatedAt, osmTimestamp, viewBox, features: [{ id, nameNl, nameFr, nameDe, localLang, province, region, path, centroid }] }`
   plus a shared `public/data/municipalities.json` index.
7. Write `data/REPORT.md`: counts per province, deltas, name conflicts, file sizes.

## Phase 1 — Map and click handling

- One `<svg>`, one `<path>` per municipality, `vector-effect: non-scaling-stroke`.
- A click lands on the path element itself, so hit testing is the browser's job —
  no point-in-polygon code.
- Tiny shapes get a transparent wide stroke as an extra hit target, plus pan and
  zoom (viewBox manipulation: wheel, drag, pinch, double-tap) with a reset button.
- The 19 Brussels communes are unclickably small at national zoom, so the Belgium
  scope gets an always-visible Brussels inset in the corner.
- **No names on hover during play.** Labels appear only after an answer.

## Phase 2 — Game loop

- Start screen: pick scope, pick N.
- Selection weights toward weakness using stored stats: never-seen first, then
  previously-missed, then long-unseen, then mastered.
- Queue: an item retires after two consecutive correct clicks. A wrong click
  resets its streak and re-queues it roughly four positions later (jittered), so
  it returns within the round but not immediately. The round ends when the queue
  empties.
- Feedback on a wrong click: the shape you clicked is named and flashed red, the
  correct one pulses amber, then both fade back to neutral.
- Round summary: accuracy, the list of stumbles, and a "drill just these" button.

## Phase 3 — Persistence and progress

- `localStorage` under `city-memory.v1`: per-municipality
  `{ seen, correct, wrong, streak, lastSeen }`, keyed by NIS code so progress
  survives a data rebuild.
- A progress map: Belgium coloured by mastery (never seen / shaky / solid), so the
  blind spots are visible geographically — which is the whole point of the project.
- JSON export/import so progress survives a cleared browser or a new machine.

## Phase 4 — Polish

- Keyboard: `space` to give up on the current prompt, `Esc` to end the round.
- Dark mode, responsive layout, touch-friendly targets.
- Optional later modes: reverse (shape → name), timed, "which province is this".

## Repo layout

```
city-memory/
  index.html
  styles.css
  src/{app,map,game,store,ui}.js
  public/data/scopes/*.json
  public/data/municipalities.json
  scripts/build-data.mjs
  test/*.test.mjs
  data/raw/              # gitignored, large downloads
  data/name-overrides.json
  data/REPORT.md
  PLAN.md
```

## Autonomous execution

Order of work — Phase 0 first, because it is the only phase that can genuinely
fail against the outside world:

1. Phase 0 end to end, structural assertions passing, `data/REPORT.md` written.
2. Phase 1 — a clickable map of Belgium that logs what you clicked.
3. Phase 2 — the game loop on top of it.
4. Phase 3 — persistence and the progress map.
5. Phase 4 — polish.

Acceptance checks, all runnable headlessly via `node --test`:

- Every scope file parses; every `id` appears exactly once per scope; every scope
  is non-empty; scope membership matches the province/region table.
- Every `path` is a non-empty, well-formed SVG path string; every `centroid` falls
  inside the scope's `viewBox`.
- Game-loop unit tests: an item needs two consecutive correct answers to retire; a
  wrong answer resets the streak and requeues; a round terminates for every scope
  and for N from 1 to the scope size.
- Store unit tests: stats round-trip through export/import unchanged.
- A DOM smoke test (jsdom, or Playwright if it installs cleanly): load the page,
  start a Belgium round, dispatch a click on the correct path, assert the answer
  registers; dispatch a wrong one, assert the requeue.

If a step is blocked, finish everything that is not blocked, then record what was
left undone and why at the top of `data/REPORT.md`.
