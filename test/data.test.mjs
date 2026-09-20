// Acceptance checks on the committed data files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVINCES, REGIONS, provinceForNis } from '../scripts/lib/regions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));

const index = await read('public/data/municipalities.json');
const scopes = new Map();
for (const s of index.scopes) scopes.set(s.id, await read(path.join('public/data', `scopes/${s.id}.json`)));

test('the index describes every scope the plan asks for', () => {
  const ids = new Set(index.scopes.map((s) => s.id));
  assert.ok(ids.has('belgium'), 'Belgium');
  for (const r of Object.values(REGIONS)) assert.ok(ids.has(r.id), `region ${r.id}`);
  for (const p of PROVINCES) assert.ok(ids.has(p.id), `province ${p.id}`);
  assert.ok(index.osmTimestamp, 'records the OSM base timestamp');
});

test('the municipality total is in the sane range', () => {
  assert.ok(index.municipalities.length >= 500 && index.municipalities.length <= 650,
    `${index.municipalities.length} municipalities`);
});

test('every NIS code is unique and maps to a known province', () => {
  const seen = new Set();
  for (const m of index.municipalities) {
    assert.match(m.id, /^\d{5}$/);
    assert.ok(!seen.has(m.id), `duplicate ${m.id}`);
    seen.add(m.id);
    const province = provinceForNis(m.id);
    assert.ok(province, `${m.id} has no province`);
    assert.equal(m.province, province.id);
    assert.equal(m.region, province.region);
  }
});

test('every municipality has a usable name in every language', () => {
  for (const m of index.municipalities) {
    for (const key of ['nameNl', 'nameFr', 'nameDe']) {
      assert.equal(typeof m[key], 'string', `${m.id} ${key}`);
      assert.ok(m[key].length > 0, `${m.id} ${key} is empty`);
    }
    assert.ok(['nl', 'fr', 'de', 'both'].includes(m.localLang), `${m.id} localLang ${m.localLang}`);
  }
});

for (const [id, scope] of scopes) {
  test(`scope ${id}: parses, is non-empty, and has no duplicate ids`, () => {
    assert.ok(scope.features.length > 0, 'non-empty');
    const seen = new Set();
    for (const f of scope.features) {
      assert.ok(!seen.has(f.id), `duplicate ${f.id} in ${id}`);
      seen.add(f.id);
    }
    assert.equal(seen.size, scope.features.length);
    assert.ok(scope.osmTimestamp, 'records the OSM base timestamp');
  });

  test(`scope ${id}: membership matches the province/region table`, () => {
    const meta = index.scopes.find((s) => s.id === id);
    const expected = index.municipalities.filter((m) => (
      meta.kind === 'country' ? true : meta.kind === 'region' ? m.region === id : m.province === id
    ));
    assert.equal(scope.features.length, expected.length, `${id} count`);
    assert.deepEqual(
      scope.features.map((f) => f.id).sort(),
      expected.map((m) => m.id).sort(),
    );
    assert.equal(meta.count, scope.features.length);
  });

  test(`scope ${id}: every path is a well-formed, non-empty SVG path`, () => {
    for (const f of scope.features) {
      assert.equal(typeof f.path, 'string', `${f.id} path type`);
      assert.ok(f.path.length > 0, `${f.id} path is empty`);
      assert.match(f.path, /^M/, `${f.id} does not start with a moveto`);
      assert.match(f.path, /Z$/, `${f.id} is not closed`);
      assert.doesNotMatch(f.path, /[^MLZ\d.\-\s]/, `${f.id} has unexpected path commands`);
      // Every subpath needs at least three points to enclose any area.
      for (const sub of f.path.split('M').slice(1)) {
        const points = sub.replace(/Z$/, '').split('L');
        assert.ok(points.length >= 3, `${f.id} has a subpath with ${points.length} points`);
        for (const pt of points) {
          const [x, y] = pt.trim().split(/\s+/).map(Number);
          assert.ok(Number.isFinite(x) && Number.isFinite(y), `${f.id} has a non-finite point "${pt}"`);
        }
      }
    }
  });

  test(`scope ${id}: every centroid falls inside the viewBox`, () => {
    const [vx, vy, vw, vh] = scope.viewBox.split(' ').map(Number);
    assert.ok([vx, vy, vw, vh].every(Number.isFinite), 'viewBox is numeric');
    assert.ok(vw > 0 && vh > 0, 'viewBox has area');
    for (const f of scope.features) {
      assert.equal(f.centroid.length, 2, `${f.id} centroid shape`);
      const [cx, cy] = f.centroid;
      assert.ok(cx >= vx && cx <= vx + vw, `${f.id} centroid x ${cx} outside ${vx}..${vx + vw}`);
      assert.ok(cy >= vy && cy <= vy + vh, `${f.id} centroid y ${cy} outside ${vy}..${vy + vh}`);
    }
  });

  test(`scope ${id}: every path lies inside the viewBox`, () => {
    const [vx, vy, vw, vh] = scope.viewBox.split(' ').map(Number);
    for (const f of scope.features) {
      for (const m of f.path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
        const x = Number(m[1]), y = Number(m[2]);
        assert.ok(x >= vx - 1 && x <= vx + vw + 1, `${f.id} x ${x} outside the viewBox`);
        assert.ok(y >= vy - 1 && y <= vy + vh + 1, `${f.id} y ${y} outside the viewBox`);
      }
    }
  });
}

test('the Belgium scope carries every municipality', () => {
  assert.equal(scopes.get('belgium').features.length, index.municipalities.length);
});

test('regions and provinces partition Belgium exactly once', () => {
  const regionIds = Object.values(REGIONS).map((r) => r.id).filter((r) => scopes.has(r));
  const covered = new Set();
  for (const id of [...regionIds, 'brussels']) {
    for (const f of scopes.get(id).features) covered.add(f.id);
  }
  assert.equal(covered.size, index.municipalities.length, 'regions cover Belgium');

  const provCovered = new Set();
  let provTotal = 0;
  for (const p of PROVINCES) {
    const scope = scopes.get(p.id);
    provTotal += scope.features.length;
    for (const f of scope.features) provCovered.add(f.id);
  }
  assert.equal(provTotal, index.municipalities.length, 'provinces do not overlap');
  assert.equal(provCovered.size, index.municipalities.length, 'provinces cover Belgium');
});

test('the German-speaking Community is exactly the nine municipalities, by name', () => {
  // Pinned by name, not by code: the list is hand-maintained NIS codes, and a
  // single mistyped digit silently labels the wrong municipality German-speaking
  // (63045 is Lierneux; Lontzen is 63048).
  const expected = ['Amel', 'Büllingen', 'Bütgenbach', 'Eupen', 'Kelmis', 'Lontzen', 'Raeren', 'Sankt Vith', 'Burg-Reuland'];
  const german = index.municipalities.filter((m) => m.localLang === 'de');
  assert.deepEqual(german.map((m) => m.nameDe).sort(), [...expected].sort());
  for (const m of german) {
    assert.equal(m.province, 'liege', `${m.nameDe} is in Liège province`);
    assert.equal(m.region, 'wallonia');
  }
});

test('every other municipality takes its language from its region', () => {
  for (const m of index.municipalities) {
    if (m.localLang === 'de') continue;
    const expected = m.region === 'flanders' ? 'nl' : m.region === 'wallonia' ? 'fr' : 'both';
    assert.equal(m.localLang, expected, `${m.id} ${m.nameNl}`);
  }
});
