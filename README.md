# City Memory

A browser game for learning the location of every Belgian municipality. The game
names a municipality; you click its shape on the map. Miss it and it comes back
later in the round.

See [data/REPORT.md](data/REPORT.md) for what the last data build produced,
including implementation decisions, and [PUBLISH-PLAN.md](PUBLISH-PLAN.md) for
the publishing plan.

## Play

```sh
npm start            # build and serve the full site at http://localhost:8080/
```

This includes the top navigation, language links, and generated reference pages.
Restart `npm start` after editing files to rebuild the site. For standalone game
development, `npm run dev` serves the source files directly, without the site
navigation; changes appear on refresh. Any static HTTP server can also serve
the built `dist/` folder. Opening `index.html` from the filesystem does **not**,
because the page fetches its data as JSON and `file://` blocks that.

Pick a scope (Belgium, a region, or one of the provinces) and how many
municipalities to drill. Two correct clicks in a row retire an item; a miss puts
it back a few prompts later. Scroll, pinch or use the ± buttons to zoom, drag to
pan, `space` to give up on a prompt, `Esc` to end the round. Progress is stored
per NIS code in `localStorage` and can be exported to JSON.

Open **Provincies** and choose a province to explore its existing map. Hover
or keyboard-focus a municipality to see its name, or toggle **Alle gemeentenamen**
to display every name. Clicking a municipality opens its detail page.

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

## The API

The same data is published as a free, public, read-only JSON API under
`public/api/v1/` — 600 static files, no server, no keys, no quotas.

```sh
npm run build:api    # regenerate it (needs data/raw/, see above)
```

It is not the game's data reshaped. The game projects everything into a
4000-unit SVG canvas, which means nothing outside our own viewBox, so the API
build goes back to the cached OSM extract and keeps WGS84 throughout: real
lon/lat centroids guaranteed to fall inside their own shape, bounding boxes,
surface areas from the spherical excess, and boundaries as spec-compliant
GeoJSON. It also ships the border adjacency graph, which is the one thing in
there you could not look up in a table of names.

| Endpoint | What it is |
|---|---|
| `/api/v1/municipalities.json` | all 565, no geometry, ~250 kB |
| `/api/v1/municipalities/{nis}.json` | one, as a GeoJSON Feature, with its neighbours |
| `/api/v1/provinces.json` · `/provinces/{id}.json` | the eleven, and their members |
| `/api/v1/regions.json` · `/regions/{id}.json` | Flanders, Wallonia, Brussels |
| `/api/v1/search.json` | accent-folded name index for autocomplete |
| `/api/v1/geo/belgium.geojson` | all 565 boundaries in one FeatureCollection |
| `/api/v1/openapi.json` | the OpenAPI 3.1 description of all of it |

Areas check out against the official figures — Aartselaar 10.98 km² against
~11.0, the country 30,581 against 30,689 — which is the test that catches the
winding-order trap: RFC 7946 wants exterior rings counter-clockwise and d3-geo
wants them clockwise, and reading a shape the wrong way round silently measures
the whole planet instead of failing.

## Publishing

```sh
npm run build        # build:api then build:site
npm run serve:dist   # serve what would be deployed, at localhost:8080
```

`scripts/build-site.mjs` assembles `dist/`: the game copied verbatim, plus ~590
generated pages — one per province, region and municipality, in Dutch, French
and English for the pages that earn search traffic — the API docs, the legal
pages, and the CDN's `_headers` and `_redirects`. It refuses to produce a build
that breaks a Cloudflare Pages limit, or that has leaked `node_modules/` or the
25 MB OSM cache into the output.

Everything that depends on an account, a domain or an approval lives in
`scripts/lib/site-config.mjs`, and every value there is empty by default. Empty
means the feature is off: with no publisher ID the site loads no ad script,
renders no slots, writes no `ads.txt` and shows no consent banner. See
[MANUAL-STEPS.md](MANUAL-STEPS.md) for what to fill in and where it comes from,
and [DEPLOY.md](DEPLOY.md) for the hosting itself.

## Layout

```
index.html  styles.css
src/        app.js (screens) · map.js (SVG, pan/zoom) · game.js (round rules)
            store.js (progress) · ui.js (DOM helpers, name display rule)
scripts/    build-data.mjs · build-api.mjs · build-site.mjs · serve.mjs · lib/
            lib/wgs84.mjs (the API's geography) · lib/pages/ (generated pages)
public/data/  municipalities.json · scopes/*.json
public/api/   v1/ — the published API, committed so the site builds without the cache
test/       data · game · store · dom · api · site
data/       name-overrides.json · REPORT.md · REPORT-notes.md · raw/ (gitignored)
```

`src/game.js` and `src/store.js` are pure: no DOM, no storage, no network, which
is what lets `node --test` drive them directly.

## Licence and attribution

The code is MIT. The data is not mine to license: boundaries and names derive
from OpenStreetMap and stay under the
[ODbL](https://www.openstreetmap.org/copyright).
Names additionally from [Wikidata](https://www.wikidata.org) (CC0). The OSM base
timestamp of the current extract is recorded in `data/REPORT.md` and shown in the
page footer.
