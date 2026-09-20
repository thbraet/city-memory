#!/usr/bin/env node
// City Memory — public API build.
//
//   node scripts/build-api.mjs
//
// Writes a static, versioned, read-only JSON API into public/api/v1/. Every
// endpoint is a file on disk, so the API is served by the same CDN as the game,
// costs nothing to run, has no database to fall over, and cannot be rate-limited
// into an outage by a popular client.
//
// Names, provinces and regions come from the committed game data, so the API
// can never disagree with what the map shows. Geometry comes from the cached
// OSM extract in data/raw/, because the game's own geometry is projected into
// an SVG canvas and means nothing outside it.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { topology } from 'topojson-server';
import { neighbors } from 'topojson-client';

import { PROVINCES, REGIONS } from './lib/regions.mjs';
import {
  loadWgs84, areaKm2, representativePoint, bbox,
  simplifyTogether, roundGeometry, countPositions, polygonsOf,
} from './lib/wgs84.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const p = (...s) => path.join(root, ...s);
const log = (...a) => console.log(...a);

export const API_VERSION = 'v1';
const OUT = p('public/api', API_VERSION);

// Where the API lives once deployed. Overridable so a fork can publish its own
// copy without every `links` field pointing back here.
const BASE = (process.env.API_BASE_URL ?? 'https://citymemory.pages.dev').replace(/\/$/, '');
const SELF = `${BASE}/api/${API_VERSION}`;

// Three levels of detail, because one size genuinely does not fit:
//   detail   — a single municipality, fetched alone, can afford ~10 kB
//   province — a dozen to eighty shapes in one response
//   country  — all 565 in one response, so it has to be lean or nobody waits
const WEIGHTS = { detail: 1e-8, province: 5e-8, country: 2e-6 };
const DIGITS = 5; // ~1 m at this latitude; more is noise from an OSM extract

const LICENCE = {
  data: {
    name: 'Open Database License (ODbL) v1.0',
    url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    notice:
      'Boundaries and names derive from OpenStreetMap and stay under ODbL. If you '
      + 'redistribute this data, or a database derived from it, you must attribute '
      + 'OpenStreetMap and license the derived database under ODbL. Maps, images and '
      + 'analyses produced from it are Produced Works and only need the attribution.',
  },
  code: { name: 'MIT', url: `${BASE}/`, holder: 'City Memory' },
};

async function main() {
  if (!existsSync(p('data/raw'))) {
    console.error(
      'data/raw/ is missing, so there is no WGS84 geometry to build the API from.\n'
      + 'Run `node scripts/build-data.mjs --refetch` once to populate the cache '
      + '(~25 MB from Overpass), then rerun this.',
    );
    process.exit(1);
  }

  log(`1/7 Reading the committed game data`);
  const index = JSON.parse(await readFile(p('public/data/municipalities.json'), 'utf8'));
  const names = new Map(index.municipalities.map((m) => [m.id, m]));

  log('2/7 Loading WGS84 geometry from the OSM cache');
  const { byNis, osmTimestamp } = await loadWgs84({ rawDir: p('data/raw'), log: () => {} });

  const missing = index.municipalities.filter((m) => !byNis.has(m.id));
  if (missing.length) {
    throw new Error(
      `${missing.length} municipalities in the game data have no geometry in the OSM cache `
      + `(${missing.slice(0, 5).map((m) => m.id).join(', ')}…). The cache is stale — refetch it.`,
    );
  }
  log(`  ${byNis.size} shapes, OSM extract ${osmTimestamp}`);

  log('3/7 Measuring');
  const records = index.municipalities.map((m) => {
    const geo = byNis.get(m.id);
    return {
      ...m,
      geometry: geo.geometry,
      osmId: geo.osmId,
      wikidata: geo.wikidata,
      centroid: representativePoint(geo.geometry),
      bbox: bbox(geo.geometry),
      areaKm2: Math.round(areaKm2(geo.geometry) * 100) / 100,
      parts: polygonsOf(geo.geometry).length,
    };
  });

  log('4/7 Finding neighbours');
  // Who borders whom, from a shared topology: two municipalities are neighbours
  // when they share an arc. This is the one fact in the API that no amount of
  // reading the other endpoints would give you, and it is what makes the data
  // worth fetching rather than looking up a table of names.
  const adjacency = findNeighbours(records);
  for (const r of records) r.neighbours = adjacency.get(r.id) ?? [];
  const orphans = records.filter((r) => r.neighbours.length === 0);
  if (orphans.length) log(`  ${orphans.length} with no land neighbour: ${orphans.map((r) => r.id).join(', ')}`);
  log(`  ${round2(records.reduce((s, r) => s + r.neighbours.length, 0) / records.length)} neighbours on average`);

  log('5/7 Simplifying');
  const features = records.map((r) => ({ id: r.id, geometry: r.geometry }));
  const simplified = {};
  for (const [level, weight] of Object.entries(WEIGHTS)) {
    const set = simplifyTogether(features, weight);
    simplified[level] = new Map(set.map((f) => [f.id, roundGeometry(f.geometry, DIGITS)]));
    const positions = set.reduce((s, f) => s + countPositions(f.geometry), 0);
    const rescued = set.filter((f) => f.rescued).length;
    log(`  ${level.padEnd(8)} weight ${String(weight).padEnd(7)} ${positions} positions${rescued ? `, ${rescued} rescued` : ''}`);
  }

  log('6/7 Writing endpoints');
  await rm(OUT, { recursive: true, force: true });
  const written = [];
  const write = async (rel, value) => {
    const file = path.join(OUT, rel);
    await mkdir(path.dirname(file), { recursive: true });
    const body = JSON.stringify(value);
    await writeFile(file, body);
    written.push({ rel, bytes: Buffer.byteLength(body) });
  };

  const meta = {
    api: API_VERSION,
    generatedAt: index.generatedAt,
    osmExtract: osmTimestamp,
    source: 'OpenStreetMap',
    license: LICENCE,
  };

  // --- collections -----------------------------------------------------------
  const summary = (r) => ({
    nis: r.id,
    name: displayName(r),
    names: { nl: r.nameNl, fr: r.nameFr, de: r.nameDe },
    officialLanguage: r.localLang,
    province: { id: r.province, name: r.provinceName },
    region: { id: r.region, name: r.regionName },
    centroid: r.centroid,
    bbox: r.bbox,
    areaKm2: r.areaKm2,
    parts: r.parts,
    neighbourCount: r.neighbours?.length ?? 0,
    osm: { relation: r.osmId, wikidata: r.wikidata },
    links: { self: `${SELF}/municipalities/${r.id}.json` },
  });

  await write('municipalities.json', {
    ...meta,
    count: records.length,
    municipalities: records.map(summary),
  });

  for (const r of records) {
    // A GeoJSON Feature, so it drops straight into Leaflet, MapLibre or QGIS
    // without the consumer unwrapping anything first.
    await write(`municipalities/${r.id}.json`, {
      ...meta,
      type: 'Feature',
      id: r.id,
      bbox: r.bbox,
      properties: {
        ...summary(r),
        neighbours: r.neighbours.map((nis) => ({
          nis,
          name: displayName(names.get(nis)),
          links: { self: `${SELF}/municipalities/${nis}.json` },
        })),
      },
      geometry: simplified.detail.get(r.id),
      links: {
        self: `${SELF}/municipalities/${r.id}.json`,
        collection: `${SELF}/municipalities.json`,
        province: `${SELF}/provinces/${r.province}.json`,
        map: `${BASE}/gemeente/${slug(r)}`,
      },
    });
  }

  // --- provinces and regions -------------------------------------------------
  const byProvince = groupBy(records, (r) => r.province);
  const byRegion = groupBy(records, (r) => r.region);

  await write('provinces.json', {
    ...meta,
    count: PROVINCES.length,
    provinces: PROVINCES.map((prov) => {
      const members = byProvince.get(prov.id) ?? [];
      return {
        id: prov.id,
        name: prov.name,
        region: { id: prov.region, name: REGIONS[prov.region].name },
        municipalityCount: members.length,
        nisPrefixes: prov.prefixes,
        areaKm2: round2(members.reduce((s, r) => s + r.areaKm2, 0)),
        bbox: unionBbox(members),
        links: {
          self: `${SELF}/provinces/${prov.id}.json`,
          geojson: `${SELF}/geo/provinces/${prov.id}.geojson`,
        },
      };
    }),
  });

  for (const prov of PROVINCES) {
    const members = byProvince.get(prov.id) ?? [];
    await write(`provinces/${prov.id}.json`, {
      ...meta,
      id: prov.id,
      name: prov.name,
      region: { id: prov.region, name: REGIONS[prov.region].name },
      municipalityCount: members.length,
      areaKm2: round2(members.reduce((s, r) => s + r.areaKm2, 0)),
      bbox: unionBbox(members),
      municipalities: members.map(summary),
      links: {
        self: `${SELF}/provinces/${prov.id}.json`,
        geojson: `${SELF}/geo/provinces/${prov.id}.geojson`,
        collection: `${SELF}/provinces.json`,
      },
    });
  }

  await write('regions.json', {
    ...meta,
    count: Object.keys(REGIONS).length,
    regions: Object.values(REGIONS).map((reg) => {
      const members = byRegion.get(reg.id) ?? [];
      return {
        id: reg.id,
        name: reg.name,
        officialLanguage: reg.lang,
        municipalityCount: members.length,
        provinces: PROVINCES.filter((prov) => prov.region === reg.id).map((prov) => prov.id),
        areaKm2: round2(members.reduce((s, r) => s + r.areaKm2, 0)),
        bbox: unionBbox(members),
        links: { self: `${SELF}/regions/${reg.id}.json`, geojson: `${SELF}/geo/regions/${reg.id}.geojson` },
      };
    }),
  });

  for (const reg of Object.values(REGIONS)) {
    const members = byRegion.get(reg.id) ?? [];
    await write(`regions/${reg.id}.json`, {
      ...meta,
      id: reg.id,
      name: reg.name,
      officialLanguage: reg.lang,
      municipalityCount: members.length,
      provinces: PROVINCES.filter((prov) => prov.region === reg.id)
        .map((prov) => ({ id: prov.id, name: prov.name, links: { self: `${SELF}/provinces/${prov.id}.json` } })),
      areaKm2: round2(members.reduce((s, r) => s + r.areaKm2, 0)),
      bbox: unionBbox(members),
      municipalities: members.map(summary),
      links: { self: `${SELF}/regions/${reg.id}.json`, collection: `${SELF}/regions.json` },
    });
  }

  // --- GeoJSON ---------------------------------------------------------------
  const collection = (members, level) => ({
    type: 'FeatureCollection',
    bbox: unionBbox(members),
    license: LICENCE.data.name,
    attribution: LICENCE.data.attribution,
    generatedAt: meta.generatedAt,
    features: members.map((r) => ({
      type: 'Feature',
      id: r.id,
      bbox: r.bbox,
      properties: {
        nis: r.id,
        name: displayName(r),
        nameNl: r.nameNl,
        nameFr: r.nameFr,
        nameDe: r.nameDe,
        province: r.province,
        region: r.region,
        areaKm2: r.areaKm2,
      },
      geometry: simplified[level].get(r.id),
    })),
  });

  await write('geo/belgium.geojson', collection(records, 'country'));
  for (const prov of PROVINCES) {
    await write(`geo/provinces/${prov.id}.geojson`, collection(byProvince.get(prov.id) ?? [], 'province'));
  }
  for (const reg of Object.values(REGIONS)) {
    await write(`geo/regions/${reg.id}.geojson`, collection(byRegion.get(reg.id) ?? [], 'country'));
  }

  // --- search index ----------------------------------------------------------
  // One small file a client can hold in memory and filter locally: there is no
  // server to run a query against, and 565 rows is nothing. Accent-folded so
  // "Liege" finds "Liège" and "Sint-Genesius-Rode" survives being typed badly.
  await write('search.json', {
    ...meta,
    count: records.length,
    hint: 'Match `q` against each entry in `terms`; they are lowercased and accent-folded.',
    entries: records.map((r) => ({
      nis: r.id,
      name: displayName(r),
      terms: [...new Set([r.nameNl, r.nameFr, r.nameDe].filter(Boolean).map(fold))],
      province: r.province,
      centroid: r.centroid,
      links: { self: `${SELF}/municipalities/${r.id}.json` },
    })),
  });

  // --- discovery -------------------------------------------------------------
  await write('index.json', {
    ...meta,
    name: 'City Memory API',
    description:
      'Read-only reference data for all 565 Belgian municipalities: official names in '
      + 'Dutch, French and German, NIS codes, province and region, WGS84 centroid, '
      + 'bounding box, area and boundary geometry.',
    documentation: `${BASE}/api/`,
    openapi: `${SELF}/openapi.json`,
    terms: `${BASE}/terms`,
    contact: `${BASE}/about`,
    cors: 'Every endpoint is public, unauthenticated and sends Access-Control-Allow-Origin: *.',
    endpoints: {
      municipalities: `${SELF}/municipalities.json`,
      municipality: `${SELF}/municipalities/{nis}.json`,
      provinces: `${SELF}/provinces.json`,
      province: `${SELF}/provinces/{id}.json`,
      regions: `${SELF}/regions.json`,
      region: `${SELF}/regions/{id}.json`,
      search: `${SELF}/search.json`,
      geojsonBelgium: `${SELF}/geo/belgium.geojson`,
      geojsonProvince: `${SELF}/geo/provinces/{id}.geojson`,
      geojsonRegion: `${SELF}/geo/regions/{id}.geojson`,
    },
    counts: {
      municipalities: records.length,
      provinces: PROVINCES.length,
      regions: Object.keys(REGIONS).length,
    },
  });

  await write('openapi.json', openapi(records, meta));

  log('7/7 Done');
  const total = written.reduce((s, w) => s + w.bytes, 0);
  const biggest = [...written].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  log(`  ${written.length} files, ${(total / 1e6).toFixed(2)} MB total`);
  for (const w of biggest) log(`    ${(w.bytes / 1024).toFixed(0).padStart(6)} kB  ${w.rel}`);
  await writeFile(
    p('public/api', 'MANIFEST.json'),
    JSON.stringify({ generatedAt: meta.generatedAt, version: API_VERSION, files: written }, null, 2),
  );
}

// ---------------------------------------------------------------------- helpers

/** The same display rule the game uses: local official name first. */
function displayName(r) {
  switch (r.localLang) {
    case 'fr': return r.nameFr || r.nameNl;
    case 'de': return r.nameDe || r.nameFr;
    case 'both': return r.nameFr === r.nameNl ? r.nameFr : `${r.nameFr} / ${r.nameNl}`;
    default: return r.nameNl || r.nameFr;
  }
}

export function slug(r) {
  return fold(displayName(r).split(' / ')[0])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const fold = (s) => s
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

const round2 = (n) => Math.round(n * 100) / 100;

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function unionBbox(members) {
  if (!members.length) return null;
  const b = members.reduce(
    (acc, r) => [
      Math.min(acc[0], r.bbox[0]), Math.min(acc[1], r.bbox[1]),
      Math.max(acc[2], r.bbox[2]), Math.max(acc[3], r.bbox[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  return b.map((n) => Math.round(n * 1e6) / 1e6);
}

/**
 * Adjacency, as a NIS -> [NIS] map.
 *
 * topojson's `neighbors` compares arc indices rather than coordinates, so two
 * municipalities count as neighbours only when they genuinely share a stretch
 * of border — not when their outlines merely touch at a rounded corner.
 * Quantisation has to be fine enough that a shared border survives as one arc;
 * 1e6 over Belgium is about 4 mm.
 */
function findNeighbours(records) {
  const objects = {};
  for (const r of records) objects[r.id] = { type: r.geometry.type, coordinates: r.geometry.coordinates };
  const topo = topology(objects, 1e6);
  const ids = records.map((r) => r.id);
  const lists = neighbors(ids.map((id) => topo.objects[id]));
  return new Map(ids.map((id, i) => [id, lists[i].map((j) => ids[j]).sort()]));
}

function openapi(records, meta) {
  const nisExample = records[0].id;
  const json = (schemaRef) => ({ 'application/json': { schema: schemaRef } });
  const ok = (description, schema) => ({ description, content: json(schema) });
  const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
  const str = (description, example) => ({ type: 'string', ...(description ? { description } : {}), ...(example !== undefined ? { example } : {}) });
  const num = (description) => ({ type: 'number', ...(description ? { description } : {}) });

  const position = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: '[longitude, latitude] in WGS84 (EPSG:4326).' };
  const bboxSchema = { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: '[west, south, east, north] in WGS84.' };

  const summarySchema = obj({
    nis: str('The five-digit Belgian NIS/INS code. The stable key for a municipality.', nisExample),
    name: str('The official name as the municipality itself writes it.'),
    names: obj({ nl: str(), fr: str(), de: str() }),
    officialLanguage: { type: 'string', enum: ['nl', 'fr', 'de', 'both'] },
    province: obj({ id: str(), name: str() }),
    region: obj({ id: str(), name: str() }),
    centroid: position,
    bbox: bboxSchema,
    areaKm2: num('Surface area in square kilometres, from the spherical excess of the boundary.'),
    parts: { type: 'integer', description: 'How many disjoint polygons the municipality is made of. Baarle-Hertog has 26.' },
    neighbourCount: { type: 'integer', description: 'How many other Belgian municipalities share a border with this one.' },
    osm: obj({ relation: str('The OpenStreetMap relation, e.g. relation/58545.'), wikidata: str('The Wikidata Q-id, if OSM records one.') }),
  }, ['nis', 'name', 'names', 'province', 'region', 'centroid', 'bbox', 'areaKm2']);

  const path = (summaryText, description, schema) => ({
    get: {
      summary: summaryText,
      description,
      responses: { 200: ok('Success', schema), 404: { description: 'No such resource.' } },
    },
  });

  const withNis = (base) => ({
    ...base,
    get: {
      ...base.get,
      parameters: [{
        name: 'nis', in: 'path', required: true, description: 'Five-digit NIS code.',
        schema: { type: 'string', pattern: '^\\d{5}$', example: nisExample },
      }],
    },
  });

  const withId = (base, description, example) => ({
    ...base,
    get: {
      ...base.get,
      parameters: [{ name: 'id', in: 'path', required: true, description, schema: { type: 'string', example } }],
    },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'City Memory API',
      version: '1.0.0',
      summary: 'Reference data for all 565 Belgian municipalities.',
      description:
        'A free, public, read-only API. Every endpoint is a static file on a CDN, so there '
        + 'are no keys, no quotas and no rate limits — but also no query parameters: filter '
        + 'the collections client-side, or fetch the province or region file you need.\n\n'
        + `Data is an OpenStreetMap extract of ${meta.osmExtract}, under ODbL. If you `
        + 'redistribute the data you must attribute OpenStreetMap contributors.',
      license: { name: LICENCE.data.name, url: LICENCE.data.url },
      contact: { name: 'City Memory', url: `${BASE}/about` },
    },
    servers: [{ url: SELF, description: 'Production' }],
    paths: {
      '/municipalities.json': path(
        'Every municipality, without geometry',
        'All 565 in one response, with names, codes, centroid, bbox and area but no boundary. '
        + 'About 250 kB. Fetch this once and filter it locally.',
        obj({ count: { type: 'integer' }, municipalities: { type: 'array', items: summarySchema } }),
      ),
      '/municipalities/{nis}.json': withNis(path(
        'One municipality, with its boundary',
        'A GeoJSON Feature: the summary fields under `properties`, and the boundary under '
        + '`geometry` at roughly 10 m fidelity.',
        obj({
          type: str(undefined, 'Feature'),
          properties: obj({ ...summarySchema.properties, neighbours: { type: 'array', description: 'Every municipality sharing a border with this one.', items: obj({ nis: str(), name: str() }) } }),
          geometry: obj({ type: str(), coordinates: {} }),
        }),
      )),
      '/provinces.json': path('The eleven provinces', 'Brussels is counted as a province here, as the game does.', obj({ provinces: { type: 'array', items: obj({ id: str(), name: str(), municipalityCount: { type: 'integer' } }) } })),
      '/provinces/{id}.json': withId(
        path('One province and all its municipalities', 'Includes the full summary of every municipality in it.', obj({ id: str(), name: str(), municipalities: { type: 'array', items: summarySchema } })),
        'Province id, e.g. antwerpen, hainaut, west-vlaanderen.', 'antwerpen',
      ),
      '/regions.json': path('The three regions', 'Flanders, Wallonia and Brussels-Capital.', obj({ regions: { type: 'array', items: obj({ id: str(), name: str() }) } })),
      '/regions/{id}.json': withId(
        path('One region and all its municipalities', '', obj({ id: str(), name: str(), municipalities: { type: 'array', items: summarySchema } })),
        'Region id: flanders, wallonia or brussels.', 'flanders',
      ),
      '/search.json': path(
        'A name index for autocomplete',
        'Every name in all three languages, lowercased and accent-folded, so a client can '
        + 'match user input without normalising anything itself.',
        obj({ entries: { type: 'array', items: obj({ nis: str(), name: str(), terms: { type: 'array', items: str() } }) } }),
      ),
      '/geo/belgium.geojson': path(
        'All 565 boundaries as one FeatureCollection',
        'Simplified hard enough to send in one response. Use the province files when you need detail.',
        obj({ type: str(undefined, 'FeatureCollection'), features: { type: 'array', items: obj({}) } }),
      ),
      '/geo/provinces/{id}.geojson': withId(
        path('One province\'s boundaries as a FeatureCollection', 'Simplified about forty times less than the national file.', obj({ type: str(undefined, 'FeatureCollection') })),
        'Province id.', 'antwerpen',
      ),
      '/geo/regions/{id}.geojson': withId(
        path('One region\'s boundaries as a FeatureCollection', '', obj({ type: str(undefined, 'FeatureCollection') })),
        'Region id.', 'flanders',
      ),
    },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
