// The API is committed output, so these run against the files themselves — no
// build, no network. A consumer's client breaks when the shape changes, and the
// only way we find out is here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROVINCES, REGIONS } from '../scripts/lib/regions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const API = path.join(root, 'public/api/v1');
const read = async (rel) => JSON.parse(await readFile(path.join(API, rel), 'utf8'));

const index = await read('index.json');
const list = await read('municipalities.json');
const provinces = await read('provinces.json');
const regions = await read('regions.json');
const search = await read('search.json');
const belgium = await read('geo/belgium.geojson');

// Belgium's real extent, generously padded. A projection or winding mistake
// lands coordinates in the North Sea, at [0,0], or around the whole globe, and
// every one of those is caught by a bounding box this loose.
const BELGIUM = { west: 2.4, south: 49.4, east: 6.5, north: 51.6 };
const inBelgium = ([lon, lat]) =>
  lon > BELGIUM.west && lon < BELGIUM.east && lat > BELGIUM.south && lat < BELGIUM.north;

test('the collection carries every municipality exactly once', () => {
  assert.equal(list.count, 565);
  assert.equal(list.municipalities.length, 565);
  const ids = list.municipalities.map((m) => m.nis);
  assert.equal(new Set(ids).size, 565, 'duplicate NIS codes');
  for (const id of ids) assert.match(id, /^\d{5}$/);
  assert.deepEqual([...ids].sort(), ids, 'the collection is not sorted by NIS');
});

test('every municipality has a name in each language and a local one', () => {
  for (const m of list.municipalities) {
    assert.ok(m.name, `${m.nis} has no display name`);
    for (const lang of ['nl', 'fr', 'de']) {
      assert.ok(m.names[lang], `${m.nis} has no ${lang} name`);
    }
    assert.ok(['nl', 'fr', 'de', 'both'].includes(m.officialLanguage), `${m.nis}: ${m.officialLanguage}`);
  }
});

test('centroids are inside Belgium and inside their own bounding box', () => {
  for (const m of list.municipalities) {
    assert.ok(inBelgium(m.centroid), `${m.nis} ${m.name} centroid ${m.centroid} is outside Belgium`);
    const [w, s, e, n] = m.bbox;
    assert.ok(w < e && s < n, `${m.nis} has a degenerate bbox ${m.bbox}`);
    assert.ok(
      m.centroid[0] >= w && m.centroid[0] <= e && m.centroid[1] >= s && m.centroid[1] <= n,
      `${m.nis} ${m.name} centroid ${m.centroid} falls outside its bbox ${m.bbox}`,
    );
  }
});

test('areas are plausible and sum to the size of Belgium', () => {
  for (const m of list.municipalities) {
    // Herstappe is the smallest at ~1.35 km²; Tournai the largest at ~214 km².
    assert.ok(m.areaKm2 > 1 && m.areaKm2 < 400, `${m.nis} ${m.name} is ${m.areaKm2} km²`);
  }
  const total = list.municipalities.reduce((s, m) => s + m.areaKm2, 0);
  // Official 30,689 km². OSM boundaries and the coastline put us within a percent.
  assert.ok(Math.abs(total - 30_689) < 400, `Belgium came out as ${total.toFixed(0)} km²`);
});

test('a few municipalities match their known figures', () => {
  const by = new Map(list.municipalities.map((m) => [m.nis, m]));
  const near = (actual, expected, tolerance, what) =>
    assert.ok(Math.abs(actual - expected) < tolerance, `${what}: ${actual} vs ~${expected}`);

  near(by.get('11001').areaKm2, 11.0, 1, 'Aartselaar area');
  near(by.get('21004').areaKm2, 32.6, 2, 'Brussels area');
  near(by.get('62063').areaKm2, 69.4, 3, 'Liège area');
  // Baarle-Hertog is 26 separate pieces inside the Netherlands. If a build ever
  // quietly reduces it to one polygon, the geometry handling has gone wrong.
  assert.ok(by.get('13002').parts > 10, `Baarle-Hertog has ${by.get('13002').parts} parts`);
  assert.equal(by.get('62063').name, 'Liège');
  assert.equal(by.get('21004').names.nl, 'Brussel');
});

test('province and region membership agrees with the NIS prefix table', () => {
  assert.equal(provinces.provinces.length, PROVINCES.length);
  assert.equal(regions.regions.length, Object.keys(REGIONS).length);

  const counted = new Map(provinces.provinces.map((p) => [p.id, p.municipalityCount]));
  for (const prov of PROVINCES) {
    const actual = list.municipalities.filter((m) => m.province.id === prov.id).length;
    assert.equal(counted.get(prov.id), actual, `${prov.id} count disagrees with the collection`);
    assert.equal(actual, prov.expected, `${prov.id} has ${actual}, the table expects ${prov.expected}`);
  }
  for (const m of list.municipalities) {
    const prov = PROVINCES.find((p) => p.id === m.province.id);
    assert.ok(prov, `${m.nis} is in unknown province ${m.province.id}`);
    assert.ok(prov.prefixes.includes(m.nis.slice(0, 2)), `${m.nis} is filed under ${prov.id}`);
    assert.equal(m.region.id, prov.region, `${m.nis} region disagrees with its province`);
  }
});

test('neighbours are mutual, real, and never self-referential', async () => {
  const sample = ['11001', '21004', '62063', '13002', '81001'];
  for (const nis of sample) {
    const detail = await read(`municipalities/${nis}.json`);
    const neighbours = detail.properties.neighbours.map((n) => n.nis);
    assert.ok(neighbours.length > 0, `${nis} borders nobody`);
    assert.ok(!neighbours.includes(nis), `${nis} borders itself`);
    for (const other of neighbours) {
      const back = await read(`municipalities/${other}.json`);
      assert.ok(
        back.properties.neighbours.some((n) => n.nis === nis),
        `${nis} claims ${other} as a neighbour but not the other way round`,
      );
    }
  }
});

test('every municipality has a detail file that is a valid GeoJSON Feature', async () => {
  const files = await readdir(path.join(API, 'municipalities'));
  assert.equal(files.length, 565);

  for (const m of list.municipalities) {
    assert.ok(files.includes(`${m.nis}.json`), `${m.nis} has no detail file`);
  }

  // Checking all 565 geometries costs a few seconds and is worth it: a broken
  // ring is exactly the kind of thing that only shows up on someone else's map.
  for (const file of files) {
    const f = await read(`municipalities/${file}`);
    assert.equal(f.type, 'Feature', `${file} is not a Feature`);
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type), `${file}: ${f.geometry.type}`);
    for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) {
      for (const ring of poly) {
        assert.ok(ring.length >= 4, `${file} has a ring of ${ring.length} positions`);
        assert.deepEqual(ring[0], ring.at(-1), `${file} has an unclosed ring`);
        for (const position of ring) {
          assert.equal(position.length, 2, `${file} has a position of ${position.length} numbers`);
          assert.ok(inBelgium(position), `${file} has a position outside Belgium: ${position}`);
        }
      }
    }
  }
});

test('exterior rings wind counter-clockwise, as RFC 7946 requires', async () => {
  const shoelace = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return sum / 2;
  };
  for (const nis of ['11001', '21004', '62063']) {
    const f = await read(`municipalities/${nis}.json`);
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      assert.ok(shoelace(poly[0]) > 0, `${nis} has a clockwise exterior ring`);
      for (const hole of poly.slice(1)) {
        assert.ok(shoelace(hole) < 0, `${nis} has a counter-clockwise hole`);
      }
    }
  }
});

test('the national GeoJSON holds every shape and stays small enough to fetch', async () => {
  assert.equal(belgium.type, 'FeatureCollection');
  assert.equal(belgium.features.length, 565);
  assert.ok(belgium.attribution.includes('OpenStreetMap'), 'no attribution on the GeoJSON');

  const [w, s, e, n] = belgium.bbox;
  assert.ok(w > 2.4 && w < 2.7, `west edge ${w}`);
  assert.ok(e > 6.3 && e < 6.5, `east edge ${e}`);
  assert.ok(s > 49.4 && s < 49.6, `south edge ${s}`);
  assert.ok(n > 51.4 && n < 51.6, `north edge ${n}`);

  const bytes = (await readFile(path.join(API, 'geo/belgium.geojson'))).length;
  assert.ok(bytes < 1_500_000, `belgium.geojson is ${(bytes / 1e6).toFixed(2)} MB — too big for one request`);
});

test('province and region GeoJSON exists for each, and partitions the country', async () => {
  let total = 0;
  for (const prov of PROVINCES) {
    const fc = await read(`geo/provinces/${prov.id}.geojson`);
    assert.equal(fc.features.length, prov.expected, `${prov.id} GeoJSON`);
    total += fc.features.length;
  }
  assert.equal(total, 565, 'the province files do not add up to the country');

  let regionTotal = 0;
  for (const reg of Object.values(REGIONS)) {
    const fc = await read(`geo/regions/${reg.id}.geojson`);
    regionTotal += fc.features.length;
  }
  assert.equal(regionTotal, 565, 'the region files do not add up to the country');
});

test('the search index folds accents and covers every name', () => {
  assert.equal(search.entries.length, 565);
  const liege = search.entries.find((e) => e.nis === '62063');
  assert.ok(liege.terms.includes('liege'), 'Liège does not match an unaccented "liege"');
  assert.ok(liege.terms.includes('luik'), 'Liège is not findable by its Dutch name');
  for (const entry of search.entries) {
    for (const term of entry.terms) {
      assert.equal(term, term.toLowerCase(), `"${term}" is not lowercased`);
      assert.ok(!/[̀-ͯ]/.test(term.normalize('NFD')), `"${term}" still carries accents`);
    }
  }
});

test('the discovery document points at endpoints that exist', async () => {
  assert.equal(index.api, 'v1');
  assert.equal(index.counts.municipalities, 565);
  assert.ok(index.license.data.name.includes('ODbL'), 'the API does not declare the ODbL');
  assert.ok(index.license.data.attribution.includes('OpenStreetMap'));

  const origin = new URL(index.endpoints.municipalities).origin;
  for (const [name, template] of Object.entries(index.endpoints)) {
    assert.ok(template.startsWith(origin), `${name} points somewhere else entirely`);
    if (template.includes('{')) continue; // templates are exercised by the files above
    const rel = new URL(template).pathname.replace('/api/v1/', '');
    await assert.doesNotReject(() => read(rel), `${name} -> ${rel} does not exist`);
  }
});

test('the OpenAPI document describes the endpoints the API actually serves', async () => {
  const spec = await read('openapi.json');
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.info.license.name.includes('ODbL'));

  const described = Object.keys(spec.paths);
  for (const p of ['/municipalities.json', '/municipalities/{nis}.json', '/provinces.json', '/search.json', '/geo/belgium.geojson']) {
    assert.ok(described.includes(p), `${p} is served but undocumented`);
  }
  for (const p of described) {
    assert.ok(spec.paths[p].get.summary, `${p} has no summary`);
    assert.ok(spec.paths[p].get.responses[200], `${p} documents no success response`);
  }
});

test('every link in the API resolves to a file we publish', async () => {
  const origin = new URL(index.endpoints.municipalities).origin;
  const detail = await read('municipalities/62063.json');
  const links = [
    ...Object.values(detail.links),
    ...detail.properties.neighbours.map((n) => n.links.self),
  ];
  for (const link of links) {
    assert.ok(link.startsWith(origin), `${link} leaves the site`);
    const rel = new URL(link).pathname;
    if (!rel.startsWith('/api/')) continue; // page links are checked by the site tests
    await assert.doesNotReject(() => read(rel.replace('/api/v1/', '')), `${link} is broken`);
  }
});
