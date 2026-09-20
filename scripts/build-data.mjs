#!/usr/bin/env node
// City Memory — data pipeline.
//
//   node scripts/build-data.mjs [--refetch]
//
// Fetches Belgian admin_level=8 boundaries from Overpass, resolves names,
// projects and simplifies them, and writes one scope file per playable area.
// Raw downloads are cached in data/raw/, so a rerun with a warm cache is offline.
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import osmtogeojson from 'osmtogeojson';

import { fetchAll } from './lib/fetch-osm.mjs';
import { fetchLabels } from './lib/wikidata.mjs';
import { PROVINCES, REGIONS, provinceForNis, localLangFor, GERMAN_COMMUNITY } from './lib/regions.mjs';
import { resolveNames } from './lib/names.mjs';
import {
  CANVAS, makeProjection, projectGeometry, simplifyFeatures,
  toPath, bboxOf, labelPoint, polygonsOf, rescueIfEmpty,
} from './lib/geometry.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const p = (...s) => path.join(root, ...s);
const log = (...a) => console.log(...a);

const EXPECTED_TOTAL = 565;
const MIN_TOTAL = 500;
const MAX_TOTAL = 650;

// Simplification is budget-driven rather than fixed: for each scope the build
// walks the ladder from "no simplification" upwards and keeps the *gentlest*
// weight whose emitted file fits the byte budget. The Belgium map therefore ends
// up simplified hard because it carries all 565 shapes, and a province map stays
// close to the source, without either number being hand-tuned.
const WEIGHT_LADDER = [0, 0.05, 0.1, 0.2, 0.4, 0.7, 1.2, 2, 3, 5, 8, 12, 18, 25, 40, 60, 90];
const BUDGETS = {
  country:  { maxBytes: 420_000 },
  region:   { maxBytes: 420_000 },
  province: { maxBytes: 320_000 },
};

const failures = [];
const fail = (msg) => { failures.push(msg); };

async function main() {
  const refetch = process.argv.includes('--refetch');
  if (refetch) await rm(p('data/raw'), { recursive: true, force: true });

  log('1/7 Fetching Overpass chunks');
  const chunks = await fetchAll({ rawDir: p('data/raw'), log });
  const osmTimestamp = chunks.find((c) => c.osm3s?.timestamp_osm_base)?.osm3s.timestamp_osm_base ?? null;

  log('2/7 Assembling polygons');
  const entries = [];
  const seen = new Map();
  let droppedNonPolygon = 0;
  for (const chunk of chunks) {
    for (const f of osmtogeojson(chunk).features) {
      const nis = f.properties?.['ref:INS'];
      if (!nis) continue;
      if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') {
        droppedNonPolygon++;
        fail(`${nis} (${f.properties.name}) has non-polygonal geometry ${f.geometry?.type}`);
        continue;
      }
      if (seen.has(nis)) {
        fail(`duplicate ref:INS ${nis}: ${seen.get(nis).tags.name} and ${f.properties.name}`);
        continue;
      }
      const entry = { nis, tags: f.properties, qid: f.properties.wikidata ?? null, geometry: f.geometry };
      seen.set(nis, entry);
      entries.push(entry);
    }
  }
  entries.sort((a, b) => a.nis.localeCompare(b.nis));
  log(`  ${entries.length} municipalities with a ref:INS and a polygon`);

  // Structural assertions on the raw set.
  if (entries.length < MIN_TOTAL || entries.length > MAX_TOTAL) {
    fail(`total ${entries.length} is outside the sane range ${MIN_TOTAL}–${MAX_TOTAL}`);
  }
  for (const e of entries) {
    if (!/^\d{5}$/.test(e.nis)) fail(`${e.nis} is not a five-digit NIS code`);
    if (!provinceForNis(e.nis)) fail(`${e.nis} (${e.tags.name}) has a NIS prefix not in the province table`);
  }

  log('3/7 Resolving names');
  const qids = [...new Set(entries.map((e) => e.qid).filter(Boolean))];
  log(`  ${qids.length}/${entries.length} have a wikidata QID`);
  const labels = await fetchLabels(qids, { cacheFile: p('data/raw/wikidata-labels.json'), log });
  const overrideFile = JSON.parse(await readFile(p('data/name-overrides.json'), 'utf8'));
  const overrides = overrideFile.overrides ?? {};
  const { resolved, conflicts, sources } = resolveNames(entries, labels, overrides);
  log(`  name sources: ${JSON.stringify(sources)}; ${conflicts.length} OSM/Wikidata conflicts`);

  log('4/7 Projecting');
  const collection = { type: 'FeatureCollection', features: resolved.map((e) => ({ type: 'Feature', geometry: e.geometry, properties: {} })) };
  const projection = makeProjection(collection);

  const municipalities = resolved.map((e) => {
    const province = provinceForNis(e.nis);
    const region = province.region;
    return {
      id: e.nis,
      nameNl: e.nameNl,
      nameFr: e.nameFr,
      nameDe: e.nameDe,
      localLang: localLangFor(e.nis, region),
      province: province.id,
      provinceName: province.name,
      region,
      regionName: REGIONS[region].name,
      nameSource: e.nameSource,
      geometry: projectGeometry(e.geometry, projection),
    };
  });

  log('5/7 Building scopes');
  const scopes = [
    { id: 'belgium', name: 'België / Belgique', kind: 'country', members: () => municipalities },
    ...Object.values(REGIONS)
      .filter((r) => r.id !== 'brussels') // Brussels is emitted once, as a province
      .map((r) => ({ id: r.id, name: r.name, kind: 'region', members: () => municipalities.filter((m) => m.region === r.id) })),
    ...PROVINCES.map((pr) => ({ id: pr.id, name: pr.name, kind: 'province', members: () => municipalities.filter((m) => m.province === pr.id) })),
  ];

  await mkdir(p('public/data/scopes'), { recursive: true });
  const scopeIndex = [];
  const sizes = [];

  for (const scope of scopes) {
    const members = scope.members();
    if (members.length === 0) { fail(`scope ${scope.id} is empty`); continue; }

    const budget = BUDGETS[scope.kind];
    const byId = new Map(members.map((m) => [m.id, m]));
    let chosen = null;
    let fallback = null; // most aggressive non-degenerate result, if nothing fits
    for (const weight of WEIGHT_LADDER) {
      const simplified = simplifyFeatures(members, weight);
      const features = [];
      const rescued = [];
      let degenerate = null;
      for (const m of simplified) {
        const fix = rescueIfEmpty(m.geometry, byId.get(m.id).geometry);
        if (fix.rescued) rescued.push(m.id);
        const geometry = fix.geometry;
        const rings = polygonsOf(geometry).flat();
        if (rings.length === 0 || rings.some((r) => r.length < 4)) { degenerate = m.id; break; }
        const pathStr = toPath(geometry);
        if (!pathStr) { degenerate = m.id; break; }
        features.push({
          id: m.id,
          nameNl: m.nameNl, nameFr: m.nameFr, nameDe: m.nameDe,
          localLang: m.localLang,
          province: m.province, provinceName: m.provinceName,
          region: m.region, regionName: m.regionName,
          path: pathStr,
          centroid: labelPointOf(geometry, scope.id, m.id, weight),
        });
      }
      // Too aggressive even with the rescue; try the next, gentler weight.
      if (degenerate) { if (process.env.DEBUG_SIMPLIFY) log(`    ${scope.id} w=${weight}: degenerate at ${degenerate}`); continue; }
      const body = buildScopeFile(scope, features, { osmTimestamp });
      const bytes = Buffer.byteLength(JSON.stringify(body));
      if (process.env.DEBUG_SIMPLIFY) log(`    ${scope.id} w=${weight}: ${(bytes / 1024).toFixed(0)} KB, ${rescued.length} rescued`);
      fallback = { body, bytes, weight, rescued };
      if (bytes <= budget.maxBytes) { chosen = fallback; break; }
    }
    chosen ??= fallback;
    if (!chosen) { fail(`scope ${scope.id}: every simplification weight produced degenerate geometry`); continue; }

    // Post-emission assertions.
    const ids = new Set();
    const [vx, vy, vw, vh] = chosen.body.viewBox.split(' ').map(Number);
    for (const f of chosen.body.features) {
      if (ids.has(f.id)) fail(`scope ${scope.id}: duplicate id ${f.id}`);
      ids.add(f.id);
      if (!/^M[-\d.\s,LZM]+Z$/.test(f.path)) fail(`scope ${scope.id}: malformed path for ${f.id}`);
      const [cx, cy] = f.centroid;
      if (cx < vx || cx > vx + vw || cy < vy || cy > vy + vh) {
        fail(`scope ${scope.id}: centroid of ${f.id} falls outside the viewBox`);
      }
    }
    if (ids.size !== members.length) fail(`scope ${scope.id}: ${ids.size} features for ${members.length} members`);

    const file = p('public/data/scopes', `${scope.id}.json`);
    await writeFile(file, JSON.stringify(chosen.body));
    sizes.push({ scope: scope.id, kind: scope.kind, count: chosen.body.features.length, weight: chosen.weight, bytes: chosen.bytes, rescued: chosen.rescued });
    scopeIndex.push({ id: scope.id, name: scope.name, kind: scope.kind, count: chosen.body.features.length, file: `data/scopes/${scope.id}.json` });
    log(`  ${scope.id.padEnd(16)} ${String(chosen.body.features.length).padStart(3)} features  weight ${String(chosen.weight).padStart(4)}  ${(chosen.bytes / 1024).toFixed(0)} KB`);
  }

  log('6/7 Writing index');
  const index = {
    generatedAt: new Date().toISOString(),
    osmTimestamp,
    canvas: CANVAS,
    scopes: scopeIndex,
    municipalities: municipalities.map((m) => ({
      id: m.id, nameNl: m.nameNl, nameFr: m.nameFr, nameDe: m.nameDe,
      localLang: m.localLang, province: m.province, provinceName: m.provinceName,
      region: m.region, regionName: m.regionName,
    })),
  };
  await writeFile(p('public/data/municipalities.json'), JSON.stringify(index));

  log('7/7 Writing data/REPORT.md');
  await writeReport({ municipalities, conflicts, sources, sizes, osmTimestamp, index, droppedNonPolygon, labels });

  if (failures.length) {
    console.error(`\nBuild FAILED with ${failures.length} structural problem(s):`);
    for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
    process.exit(1);
  }
  log('\nBuild OK');
}

function labelPointOf(geometry, scopeId, id, weight) {
  try {
    return labelPoint(geometry);
  } catch (err) {
    throw new Error(`scope ${scopeId}, feature ${id}, weight ${weight}: ${err.message}`);
  }
}

function buildScopeFile(scope, features, { osmTimestamp }) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    for (const m of f.path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
      const x = Number(m[1]), y = Number(m[2]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.02;
  const viewBox = [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad]
    .map((n) => Math.round(n * 10) / 10).join(' ');
  return {
    id: scope.id,
    name: scope.name,
    kind: scope.kind,
    generatedAt: new Date().toISOString(),
    osmTimestamp,
    viewBox,
    features,
  };
}

async function writeReport({ municipalities, conflicts, sources, sizes, osmTimestamp, index, droppedNonPolygon, labels }) {
  const counts = new Map();
  for (const m of municipalities) counts.set(m.province, (counts.get(m.province) ?? 0) + 1);

  const rows = PROVINCES.map((pr) => {
    const got = counts.get(pr.id) ?? 0;
    const delta = got - pr.expected;
    return `| ${pr.name} | ${pr.region} | ${pr.expected} | ${got} | ${delta === 0 ? '—' : (delta > 0 ? `+${delta}` : delta)} |`;
  });
  const total = municipalities.length;
  const totalDelta = total - EXPECTED_TOTAL;

  const conflictRows = conflicts
    .sort((a, b) => a.nis.localeCompare(b.nis))
    .map((c) => `| ${c.nis} | ${c.lang} | ${c.osm} | ${c.wikidata} | ${c.chosen}${c.overridden ? ' *(override)*' : ''} |`);

  const mark = { override: '*', osm: 'o', wikidata: 'w', fallback: 'f' };
  const reviewRows = municipalities
    .filter((m) => m.nameNl !== m.nameFr)
    .map((m) => `| ${m.id} | ${m.provinceName} | ${m.nameNl} \\[${mark[m.nameSource.nl]}\\] | ${m.nameFr} \\[${mark[m.nameSource.fr]}\\] |`);

  const sizeRows = sizes.map((s) => `| ${s.scope} | ${s.kind} | ${s.count} | ${s.weight} | ${(s.bytes / 1024).toFixed(0)} KB | ${s.rescued.length ? s.rescued.join(', ') : '—'} |`);

  const notes = await readFile(p('data/REPORT-notes.md'), 'utf8').catch(() => '');

  const body = `# City Memory — build report

${notes}
## Extract

| | |
|---|---|
| OSM base timestamp | \`${osmTimestamp}\` |
| Built at | \`${index.generatedAt}\` |
| Source | Overpass \`boundary=administrative\` + \`admin_level=8\` + \`ref:INS\`, 9 chunks by leading NIS digit |
| Licence | Boundaries © OpenStreetMap contributors, ODbL — <https://www.openstreetmap.org/copyright> |

## Counts per province

Drift policy: a count that differs from the plan's 2026-09-20 table is **not** a
build failure. The newest OSM state is by definition the state worth learning;
the delta is recorded here and the build continues.

| Province | Region | Plan (2026-09-20) | Observed | Delta |
|---|---|---|---|---|
${rows.join('\n')}
| **Total** | | **${EXPECTED_TOTAL}** | **${total}** | **${totalDelta === 0 ? '—' : totalDelta}** |

Structural checks: ${droppedNonPolygon} feature(s) dropped for non-polygonal geometry,
${failures.length} structural failure(s).

## Name resolution

Precedence: \`data/name-overrides.json\` → OSM \`name:<lang>\` → Wikidata label → OSM \`name\`.

Resolved fields by source (3 languages × ${total} municipalities = ${total * 3}):

| Source | Fields |
|---|---|
| override | ${sources.override} |
| OSM \`name:<lang>\` | ${sources.osm} |
| Wikidata label | ${sources.wikidata} |
| OSM \`name\` fallback | ${sources.fallback} |

Wikidata labels available for ${Object.keys(labels).length} QIDs.

### OSM / Wikidata name conflicts (${conflicts.length})

Every case where OSM's \`name:<lang>\` and the Wikidata label disagree. OSM wins
unless an override says otherwise. Entries marked *(override)* are corrections
committed in \`data/name-overrides.json\`.

| NIS | Lang | OSM | Wikidata | Chosen |
|---|---|---|---|---|
${conflictRows.join('\n')}

### Cross-language review list (${reviewRows.length})

Every municipality whose Dutch and French names differ — the surface the plan asks
for a sanity pass over, because an archaic exonym usually shows up here rather
than as an OSM/Wikidata disagreement (the French label for Knokke-Heist was
"Knocke-Heyst", and OSM carried no \`name:fr\` at all to disagree with).

\`[o]\` = OSM tag, \`[w]\` = Wikidata label, \`[f]\` = OSM \`name\` fallback,
\`[*]\` = corrected in \`data/name-overrides.json\`.

Still worth a human eye: the archaic French *translations* left in place on
purpose — Vieux-Turnhout, Vieux-Héverlé, Heist-sur-la-Montagne,
Wavre-Sainte-Catherine, Capelle-au-Bois, Herck-la-Ville, Saint-Gilles-Waes,
Saint-Nicolas-Waes, Puers-Saint-Amand, Nazareth-La Pinte. They are attested
historical names, and deciding they are dead is not a call this build can verify.

| NIS | Province | Dutch | French |
|---|---|---|---|
${reviewRows.join('\n')}

## Emitted files

| Scope | Kind | Features | Simplify weight | Size | Rescued from simplification |
|---|---|---|---|---|---|
${sizeRows.join('\n')}

Plus \`public/data/municipalities.json\` (${(Buffer.byteLength(JSON.stringify(index)) / 1024).toFixed(0)} KB), the shared
index of all ${total} municipalities with their names, province and region.
`;
  await writeFile(p('data/REPORT.md'), body);
}

await main();
