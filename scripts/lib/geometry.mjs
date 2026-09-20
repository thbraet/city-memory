// Projection, simplification and SVG path emission. All geographic maths happens
// here, at build time; the browser only ever sees path strings.
import { geoConicConformal } from 'd3-geo';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature } from 'topojson-client';

// A 4000-unit canvas across Belgium gives ~75 m per unit, so rounding emitted
// coordinates to one decimal costs well under a pixel at any zoom we offer.
export const CANVAS = 4000;
const PRECISION = 1;

/**
 * A Lambert conformal conic on the Belgian Lambert 72 parameters, fitted to the
 * data.
 *
 * The fit is computed in the plane, from the projected corner points, rather
 * than with d3's `fitExtent`. `fitExtent` measures bounds spherically, and
 * osmtogeojson emits rings in OSM's order rather than GeoJSON winding order, so
 * d3 reads a clockwise exterior ring as "the whole globe except this shape" and
 * every bound comes back as half the planet. Projecting point by point — which
 * is all the pipeline ever does — is winding-agnostic, so the fit is too.
 */
export function makeProjection(featureCollection) {
  const base = geoConicConformal()
    .parallels([49.8333339, 51.1666672])
    .rotate([-4.3674867, 0])
    .scale(1)
    .translate([0, 0]);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of featureCollection.features) {
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        for (const pt of ring) {
          const q = base(pt);
          if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
          if (q[0] < minX) minX = q[0];
          if (q[1] < minY) minY = q[1];
          if (q[0] > maxX) maxX = q[0];
          if (q[1] > maxY) maxY = q[1];
        }
      }
    }
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    throw new Error('could not fit the projection: no finite projected extent');
  }

  const k = Math.min(CANVAS / (maxX - minX), CANVAS / (maxY - minY));
  return base
    .scale(k)
    .translate([CANVAS / 2 - (k * (minX + maxX)) / 2, CANVAS / 2 - (k * (minY + maxY)) / 2]);
}

/** Project a lon/lat geometry into planar canvas coordinates. */
export function projectGeometry(geometry, projection) {
  const project = (ring) => ring.map((pt) => {
    const p = projection(pt);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      throw new Error(`projection failed for point ${JSON.stringify(pt)}`);
    }
    return [round(p[0]), round(p[1])];
  });
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(project) };
  }
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates.map((poly) => poly.map(project)) };
  }
  throw new Error(`unsupported geometry ${geometry.type}`);
}

const round = (n) => Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;

/**
 * Simplify a set of projected features together, through a shared topology so
 * neighbouring municipalities keep their common border and no gaps open up.
 * `weight` is a planar triangle area in canvas units²; 0 means no simplification.
 */
export function simplifyFeatures(features, weight) {
  if (weight <= 0) return features.map((f) => ({ ...f, geometry: clone(f.geometry) }));
  const objects = {};
  for (const f of features) objects[f.id] = { type: f.geometry.type, coordinates: f.geometry.coordinates };
  let topo = topology(objects, 1e5);
  topo = presimplify(topo);
  topo = simplify(topo, weight);
  return features.map((f) => {
    const geo = feature(topo, topo.objects[f.id]);
    return { ...f, geometry: sanitize(geo.geometry) };
  });
}

const clone = (g) => JSON.parse(JSON.stringify(g));

/**
 * Drop rings that simplification collapsed into something that is no longer a
 * polygon: fewer than 4 positions, or zero area. A feature that loses every ring
 * is reported by the caller's assertions rather than silently shipped.
 */
function sanitize(geometry) {
  const keepRing = (ring) => {
    const closed = ring.length >= 2 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
      ? ring
      : [...ring, ring[0]];
    if (closed.length < 4) return null;
    if (Math.abs(ringArea(closed)) < 1e-6) return null;
    return closed;
  };
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates.map(keepRing).filter(Boolean);
    return { type: 'Polygon', coordinates: rings };
  }
  const polys = geometry.coordinates
    .map((poly) => poly.map(keepRing).filter(Boolean))
    .filter((poly) => poly.length > 0);
  return { type: 'MultiPolygon', coordinates: polys };
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

export function polygonsOf(geometry) {
  if (!geometry) return [];
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.filter((poly) => poly.length > 0);
}

/**
 * Simplification that is aggressive enough to keep the national map small can
 * erase a municipality made entirely of tiny pieces — Baarle-Hertog is 26
 * exclaves inside the Netherlands, and every one of them falls below the
 * national weight. A municipality that vanishes is unclickable, so it keeps its
 * largest unsimplified polygon instead. The border it then shares with its
 * neighbours is a hair off; being on the map at all matters more.
 */
export function rescueIfEmpty(simplified, original) {
  if (polygonsOf(simplified).length > 0) return { geometry: simplified, rescued: false };
  let best = null;
  let bestArea = 0;
  for (const poly of polygonsOf(original)) {
    const area = Math.abs(ringArea(poly[0]));
    if (area > bestArea) { bestArea = area; best = poly; }
  }
  if (!best) return { geometry: simplified, rescued: false };
  return { geometry: { type: 'Polygon', coordinates: best }, rescued: true };
}

/** Emit an SVG path string. Rings are closed with `Z`, so no repeated last point. */
export function toPath(geometry) {
  const parts = [];
  for (const poly of polygonsOf(geometry)) {
    for (const ring of poly) {
      const pts = ring.slice(0, -1); // drop the duplicated closing point
      if (pts.length < 3) continue;
      parts.push(`M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`);
    }
  }
  return parts.join('');
}

const fmt = (n) => {
  const r = Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;
  return Number.isInteger(r) ? String(r) : String(r);
};

export function bboxOf(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygonsOf(geometry)) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A point to hang a label on: the area centroid of the largest ring when that
 * falls inside the shape, otherwise the midpoint of the widest horizontal span
 * across the ring's vertical middle. Both are cheap and always inside the
 * feature's bounding box, which the acceptance checks assert.
 */
export function labelPoint(geometry) {
  let best = null;
  let bestArea = 0;
  for (const poly of polygonsOf(geometry)) {
    const area = Math.abs(ringArea(poly[0]));
    if (area > bestArea) {
      bestArea = area;
      best = poly[0];
    }
  }
  if (!best) throw new Error(`no ring to place a label on: ${JSON.stringify(geometry).slice(0, 400)}`);

  const [cx, cy] = ringCentroid(best);
  if (pointInRing(cx, cy, best)) return [round(cx), round(cy)];

  const [minX, minY, maxX, maxY] = bboxOf({ type: 'Polygon', coordinates: [best] });
  let fallback = [round((minX + maxX) / 2), round((minY + maxY) / 2)];
  let widest = 0;
  // Scan a few horizontal lines and take the middle of the widest span inside.
  for (let k = 1; k < 16; k++) {
    const y = minY + ((maxY - minY) * k) / 16;
    const xs = [];
    for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
      const [xi, yi] = best[i];
      const [xj, yj] = best[j];
      if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const span = xs[i + 1] - xs[i];
      if (span > widest) {
        widest = span;
        fallback = [round((xs[i] + xs[i + 1]) / 2), round(y)];
      }
    }
  }
  return fallback;
}

function ringCentroid(ring) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
  }
  if (a === 0) return ring[0];
  return [x / (3 * a), y / (3 * a)];
}
