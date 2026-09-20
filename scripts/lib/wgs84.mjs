// The API needs real coordinates, not the SVG canvas the game plays on.
//
// The game's pipeline projects lon/lat into a 4000-unit Lambert canvas and
// throws the geography away, because the browser only ever draws. An API whose
// coordinates only mean something inside our own viewBox would be useless to
// anyone else, so the API build goes back to the cached OSM extract and keeps
// the geometry in WGS84 (EPSG:4326, lon/lat, the order GeoJSON mandates).
import osmtogeojson from 'osmtogeojson';
import { geoCentroid, geoBounds, geoArea } from 'd3-geo';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature } from 'topojson-client';

import { fetchAll } from './fetch-osm.mjs';

// IUGG mean Earth radius. geoArea returns steradians, so area = r² × steradians.
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Every Belgian municipality from the raw OSM extract, in lon/lat, keyed by NIS.
 *
 * Reads `data/raw/` and never the network when the cache is warm — the same
 * contract the data build has. Returns a Map so callers can join it onto the
 * committed name table without a second pass.
 */
export async function loadWgs84({ rawDir, log = () => {} }) {
  const chunks = await fetchAll({ rawDir, log });
  const osmTimestamp = chunks.find((c) => c.osm3s?.timestamp_osm_base)?.osm3s.timestamp_osm_base ?? null;

  const byNis = new Map();
  for (const chunk of chunks) {
    for (const f of osmtogeojson(chunk).features) {
      const nis = f.properties?.['ref:INS'];
      if (!nis) continue;
      if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') continue;
      if (byNis.has(nis)) continue; // the data build reports duplicates; here the first wins
      byNis.set(nis, {
        nis,
        geometry: rewind(f.geometry),
        osmId: typeof f.id === 'string' ? f.id : null,
        wikidata: f.properties.wikidata ?? null,
        website: f.properties.website ?? null,
      });
    }
  }
  return { byNis, osmTimestamp };
}

/**
 * Put rings in GeoJSON winding order: exterior counter-clockwise, holes
 * clockwise (RFC 7946 §3.1.6, the right-hand rule).
 *
 * osmtogeojson emits rings in OSM's own order, which is arbitrary. Nothing in
 * the game ever noticed, because projecting point by point is winding-agnostic.
 * Every spherical function here does notice: read the wrong way round, a shape
 * means "the whole globe except this", so an unrewound Aartselaar measures 510
 * million km² and bounds the entire planet.
 *
 * Note the two conventions in play, which are opposites. RFC 7946 wants the
 * exterior ring counter-clockwise, and that is what we serve. d3-geo wants the
 * exterior ring clockwise, so every call into d3 below goes through `forD3`.
 * Getting these backwards is silent: you get a number, it is just the planet.
 */
export function rewind(geometry) {
  const fix = (poly) => poly.map((ring, i) => {
    const ccw = ringArea(ring) > 0;
    const wantCcw = i === 0; // exterior counter-clockwise, holes clockwise
    return ccw === wantCcw ? ring : [...ring].reverse();
  });
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: fix(geometry.coordinates) };
  return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(fix) };
}

/** Spec-wound geometry, reversed into the winding d3-geo expects. */
const forD3 = (geometry) => {
  const flip = (poly) => poly.map((ring) => [...ring].reverse());
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: flip(geometry.coordinates) };
  return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(flip) };
};

/** Area in km², from the spherical excess — good to a fraction of a percent at Belgium's size. */
export function areaKm2(geometry) {
  return geoArea(forD3(geometry)) * EARTH_RADIUS_KM ** 2;
}

/**
 * A representative point, as [lon, lat].
 *
 * `geoCentroid` is the spherical area centroid, which can fall outside a
 * horseshoe-shaped or multi-part municipality. The API promises `centroid` is
 * inside the shape — consumers pin markers on it — so a centroid that escapes
 * its own polygon is replaced by a point that cannot: the midpoint of the
 * widest horizontal span across the largest ring's vertical middle.
 */
export function representativePoint(geometry) {
  const c = geoCentroid(forD3(geometry));
  if (Number.isFinite(c[0]) && Number.isFinite(c[1]) && contains(geometry, c)) return round(c, 6);
  return round(insidePoint(geometry), 6);
}

/** [west, south, east, north] — the GeoJSON bbox order. */
export function bbox(geometry) {
  const [[w, s], [e, n]] = geoBounds(forD3(geometry));
  return round([w, s, e, n], 6);
}

/**
 * Simplify a set of lon/lat features through one shared topology, so that
 * neighbouring municipalities keep their common border and no sliver gaps open
 * between them. `weight` is a planar triangle area in square degrees.
 *
 * A feature simplified into nothing keeps its largest original ring instead:
 * Baarle-Hertog is 26 exclaves and every one of them is below any useful
 * weight, and an API that silently drops a municipality is worse than one that
 * serves it a little coarser than its neighbours.
 */
export function simplifyTogether(features, weight, quantization = 1e6) {
  if (weight <= 0) return features.map((f) => ({ ...f, geometry: structuredClone(f.geometry) }));

  const objects = {};
  for (const f of features) objects[f.id] = { type: f.geometry.type, coordinates: f.geometry.coordinates };
  let topo = topology(objects, quantization);
  topo = presimplify(topo);
  topo = simplify(topo, weight);

  return features.map((f) => {
    const geo = feature(topo, topo.objects[f.id]);
    const cleaned = sanitize(geo.geometry);
    if (polygonsOf(cleaned).length > 0) return { ...f, geometry: cleaned };
    return { ...f, geometry: largestRing(f.geometry), rescued: true };
  });
}

/** Round every coordinate to `digits` decimals. Six decimals is ~0.1 m; five is ~1 m. */
export function roundGeometry(geometry, digits) {
  const f = (ring) => ring.map(([x, y]) => [round1(x, digits), round1(y, digits)]);
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(f) };
  }
  return { type: 'MultiPolygon', coordinates: geometry.coordinates.map((p) => p.map(f)) };
}

export function countPositions(geometry) {
  let n = 0;
  for (const poly of polygonsOf(geometry)) for (const ring of poly) n += ring.length;
  return n;
}

export function polygonsOf(geometry) {
  if (!geometry) return [];
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.filter((poly) => poly.length > 0 && poly[0].length > 0);
}

// ------------------------------------------------------------------ internals

const round1 = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;
const round = (arr, digits) => arr.map((n) => round1(n, digits));

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Planar point-in-polygon, holes included. Belgium is small enough that treating
 *  lon/lat as a plane is exact for this purpose. */
function contains(geometry, point) {
  for (const poly of polygonsOf(geometry)) {
    if (!pointInRing(point, poly[0])) continue;
    if (poly.slice(1).some((hole) => pointInRing(point, hole))) continue;
    return true;
  }
  return false;
}

function insidePoint(geometry) {
  let best = null;
  let bestArea = 0;
  for (const poly of polygonsOf(geometry)) {
    const a = Math.abs(ringArea(poly[0]));
    if (a > bestArea) { bestArea = a; best = poly[0]; }
  }
  if (!best) return [NaN, NaN];

  const ys = best.map((p) => p[1]);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs = [];
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const [xi, yi] = best[i];
    const [xj, yj] = best[j];
    if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let widest = [xs[0] ?? best[0][0], xs[1] ?? best[0][0]];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > widest[1] - widest[0]) widest = [xs[i], xs[i + 1]];
  }
  return [(widest[0] + widest[1]) / 2, y];
}

function sanitize(geometry) {
  const keepRing = (ring) => {
    const closed = ring.length >= 2 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
      ? ring
      : [...ring, ring[0]];
    if (closed.length < 4) return null;
    if (Math.abs(ringArea(closed)) < 1e-12) return null;
    return closed;
  };
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(keepRing).filter(Boolean) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates
      .map((poly) => poly.map(keepRing).filter(Boolean))
      .filter((poly) => poly.length > 0),
  };
}

function largestRing(geometry) {
  let best = null;
  let bestArea = 0;
  for (const poly of polygonsOf(geometry)) {
    const a = Math.abs(ringArea(poly[0]));
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  return best ? { type: 'Polygon', coordinates: best } : geometry;
}
