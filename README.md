# City Memory

A browser game for learning the location of every Belgian municipality. The game
names a municipality; you click its shape on the map. Miss it and it comes back
later in the round.

See [PLAN.md](PLAN.md) for the design and [data/REPORT.md](data/REPORT.md) for
what the last data build produced, including the decisions it had to make.

## Play

```sh
npm start            # http://localhost:8080/
```

Anything that serves this folder over HTTP works — `python3 -m http.server`, a
static host, whatever. Opening `index.html` from the filesystem does **not**,
because the page fetches its data as JSON and `file://` blocks that.

Pick a scope (Belgium, a region, or one of the provinces) and how many
municipalities to drill. Two correct clicks in a row retire an item; a miss puts
it back a few prompts later. Scroll, pinch or use the ± buttons to zoom, drag to
pan, `space` to give up on a prompt, `Esc` to end the round. Progress is stored
per NIS code in `localStorage` and can be exported to JSON.

## Test

```sh
npm test             # node --test test/  — 118 checks, no network
```

Covers the committed data (scope membership against the province/region table,
path and centroid validity), the round mechanics (including that a round
terminates for every scope and every batch size from 1 to the scope size),
progress export/import, and a jsdom smoke test that boots the real page.

## Rebuild the data

```sh
npm run build:data              # uses data/raw/ if present
node scripts/build-data.mjs --refetch   # re-download from Overpass
```

The build fetches Belgian `admin_level=8` boundaries from Overpass in nine chunks,
resolves Dutch, French and German names from OSM, Wikidata and
`data/name-overrides.json`, projects and simplifies them, and writes
`public/data/`. Raw downloads are cached in `data/raw/` (gitignored, ~25 MB), so a
rerun with a warm cache never touches the network. The committed outputs mean the
site works without ever running this.

A count that differs from the plan's table is recorded in `data/REPORT.md` and the
build continues; a structural problem (duplicate or missing NIS code, a
non-polygonal feature, an unknown NIS prefix, an empty scope, a total outside
500–650) fails the build.

## Layout

```
index.html  styles.css
src/        app.js (screens) · map.js (SVG, pan/zoom) · game.js (round rules)
            store.js (progress) · ui.js (DOM helpers, name display rule)
scripts/    build-data.mjs · serve.mjs · lib/
public/data/  municipalities.json · scopes/*.json
test/       data · game · store · dom
data/       name-overrides.json · REPORT.md · REPORT-notes.md · raw/ (gitignored)
```

`src/game.js` and `src/store.js` are pure: no DOM, no storage, no network, which
is what lets `node --test` drive them directly.

## Licence and attribution

Boundaries © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
Names additionally from [Wikidata](https://www.wikidata.org) (CC0). The OSM base
timestamp of the current extract is recorded in `data/REPORT.md` and shown in the
page footer.
