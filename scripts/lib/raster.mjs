// A software rasteriser: enough of one to draw the social card and the icons.
//
// The surface is a flat RGB byte buffer, the same shape encodePng consumes, and
// there is no alpha channel anywhere. Everything drawn is opaque, which is why
// the drawing order in og.mjs is fills first and borders second rather than
// feature by feature.
//
// There is no anti-aliasing here either. Callers draw at 2x and call downscale,
// which averages four samples per output pixel. That is both simpler than
// coverage maths and better-looking than the alternative, because it smooths
// every edge in the image — polygon, stroke and letterform alike — with one
// pass and no special cases.

/** '#14161a' -> [20, 22, 26]. */
export const rgb = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a six-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

/** A width x height RGB surface, painted with `background`. */
export function surface(width, height, background) {
  const data = Buffer.alloc(width * height * 3);
  data.fill(Buffer.from(background));
  return { width, height, data };
}

/**
 * Fill a set of rings with the even-odd rule.
 *
 * Even-odd rather than nonzero because the municipality data comes from OSM via
 * osmtogeojson, which emits rings in OSM's order rather than GeoJSON's winding
 * order. Under nonzero, an enclave whose ring happens to wind the same way as
 * its parent fills solid instead of punching a hole; under even-odd, winding
 * never enters into it. Rings are treated as closed whether or not the last
 * point repeats the first.
 */
export function fillRings(surf, rings, colour) {
  const [r, g, b] = colour;
  let top = Infinity;
  let bottom = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p[1] < top) top = p[1];
      if (p[1] > bottom) bottom = p[1];
    }
  }
  if (!Number.isFinite(top)) return;

  const first = Math.max(0, Math.floor(top));
  const last = Math.min(surf.height - 1, Math.ceil(bottom));
  const crossings = [];
  for (let y = first; y <= last; y++) {
    // Sample at the pixel centre. A vertex sitting exactly on a scanline would
    // otherwise count as two crossings and leak the fill across the row.
    const scan = y + 0.5;
    crossings.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > scan) !== (yj > scan)) crossings.push(xi + ((scan - yi) * (xj - xi)) / (yj - yi));
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2) span(surf, y, crossings[k], crossings[k + 1], r, g, b);
  }
}

/**
 * Stroke polylines at a given width.
 *
 * Each segment is filled as its own quad and each vertex gets a small disc, so
 * joins and end caps come out round. Drawing the segments separately means a
 * self-crossing outline paints the overlap twice, which costs nothing when
 * every colour is opaque.
 */
export function strokeLines(surf, lines, colour, width) {
  const half = width / 2;
  const cap = disc(half);
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [x0, y0] = line[i];
      const [x1, y1] = line[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      fillRings(surf, [[[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]], colour);
    }
    for (const [x, y] of line) {
      fillRings(surf, [cap.map(([dx, dy]) => [x + dx, y + dy])], colour);
    }
  }
}

/** Box-average a surface down by an integer factor. */
export function downscale(surf, factor) {
  if (surf.width % factor || surf.height % factor) {
    throw new Error(`${surf.width}x${surf.height} does not divide by ${factor}`);
  }
  const width = surf.width / factor;
  const height = surf.height / factor;
  const data = Buffer.alloc(width * height * 3);
  const samples = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy++) {
        let src = ((y * factor + dy) * surf.width + x * factor) * 3;
        for (let dx = 0; dx < factor; dx++) {
          r += surf.data[src++];
          g += surf.data[src++];
          b += surf.data[src++];
        }
      }
      const out = (y * width + x) * 3;
      data[out] = Math.round(r / samples);
      data[out + 1] = Math.round(g / samples);
      data[out + 2] = Math.round(b / samples);
    }
  }
  return { width, height, data };
}

/** Points along an elliptical arc, in degrees, clockwise on screen as θ rises. */
export function arc(cx, cy, rx, ry, from, to, steps = 32) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    points.push([cx + rx * Math.cos(t), cy - ry * Math.sin(t)]);
  }
  return points;
}

// Twelve sides is indistinguishable from a circle at the stroke widths used
// here, and the wordmark is the only place the join shape is visible at all.
const disc = (radius) => arc(0, 0, radius, radius, 0, 360, 12);

// A pixel belongs to the span when its centre does, so a shape that stops
// halfway across a pixel leaves it alone rather than claiming it. At 2x that
// half pixel comes back as a grey level in the downscale.
function span(surf, y, x0, x1, r, g, b) {
  const from = Math.max(0, Math.ceil(x0 - 0.5));
  const to = Math.min(surf.width - 1, Math.ceil(x1 - 0.5) - 1);
  let offset = (y * surf.width + from) * 3;
  for (let x = from; x <= to; x++) {
    surf.data[offset++] = r;
    surf.data[offset++] = g;
    surf.data[offset++] = b;
  }
}
