// The social card and the raster app icons.
//
// Every generated page carries <meta property="og:image">, and the manifest
// names two PNG icons. Without this module all three are 404s, which is not a
// missing nicety: Slack, WhatsApp, Mastodon and every search preview render a
// link with a broken image as a link nobody clicks.
//
// The card is drawn from the same municipality shapes the game uses, coloured
// the way the game colours them mid-session, so what somebody sees in a chat
// preview is what they get when they follow the link. Drawing it at build time
// from data we already have also means it can never drift out of date: a
// boundary merger that changes the map changes the card in the same build.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from '../png.mjs';
import { surface, fillRings, strokeLines, downscale, arc, rgb } from '../raster.mjs';
import { layout, WEIGHT } from '../wordmark.mjs';

const repo = fileURLToPath(new URL('../../..', import.meta.url));

const CARD = { width: 1200, height: 630 };

// Facebook, LinkedIn and Slack all want 1.91:1 and all downscale it; drawing at
// twice the final size and averaging is where the anti-aliasing comes from, so
// this is not a quality setting to turn down.
const SUPERSAMPLE = 2;

// Straight out of the dark half of styles.css. The card is dark because a
// preview card sits on a white chat background more often than not, and a dark
// rectangle is what makes it read as an object rather than as page furniture.
const COLOURS = {
  bg: rgb('#14161a'),        // --bg
  unseen: rgb('#262a31'),    // --m-unseen
  shaky: rgb('#a8762c'),     // --m-shaky
  solid: rgb('#3f7f5c'),     // --m-solid
  border: rgb('#454c58'),    // --land-line
  ink: rgb('#eceae4'),       // --ink
  inkSoft: rgb('#a5a196'),   // --ink-soft
  accent: rgb('#5fbf8b'),    // --accent
};

export async function build(ctx) {
  const belgium = JSON.parse(await readFile(path.join(repo, 'public/data/scopes/belgium.json'), 'utf8'));
  return [
    { path: 'og.png', body: encodePng(card(belgium)) },
    { path: 'icon-192.png', body: encodePng(appIcon(192)) },
    { path: 'icon-512.png', body: encodePng(appIcon(512)) },
  ];
}

// ------------------------------------------------------------------- the card

function card(belgium) {
  const s = SUPERSAMPLE;
  const surf = surface(CARD.width * s, CARD.height * s, COLOURS.bg);

  // The map takes the right-hand half and the words the left. Overlaying the
  // two would need a scrim to keep the text readable, and a scrim over a map
  // this finely divided turns it into grey mush.
  drawMap(surf, belgium, { x: 540 * s, y: 60 * s, width: 620 * s, height: 510 * s });

  fillRings(surf, [rect(66 * s, 132 * s, 120 * s, 7 * s)], COLOURS.accent);

  const title = { size: 92 * s, weight: 92 * s * WEIGHT };
  strokeLines(surf, layout('CITY', { x: 66 * s, y: 168 * s, size: title.size }), COLOURS.ink, title.weight);
  strokeLines(surf, layout('MEMORY', { x: 66 * s, y: 292 * s, size: title.size }), COLOURS.ink, title.weight);

  // The second line is there for the full-size card; at thumbnail size it is
  // texture, which is fine, but it must not be so small that it looks like dirt.
  const sub = { size: 30 * s, tracking: 2 * s };
  const subWeight = sub.size * WEIGHT;
  strokeLines(surf, layout('565 BELGIAN', { x: 66 * s, y: 430 * s, ...sub }), COLOURS.inkSoft, subWeight);
  strokeLines(surf, layout('MUNICIPALITIES', { x: 66 * s, y: 474 * s, ...sub }), COLOURS.inkSoft, subWeight);

  return downscale(surf, s);
}

/**
 * The 565 municipalities, fitted into a box.
 *
 * Fills first for every municipality, then borders for every municipality.
 * Neighbours share a border, so a per-feature fill-then-stroke pass would let
 * the next feature's fill paint over the line it was just given.
 */
function drawMap(surf, belgium, box) {
  const [vx, vy, vw, vh] = belgium.viewBox.split(' ').map(Number);
  const scale = Math.min(box.width / vw, box.height / vh);
  const ox = box.x + (box.width - vw * scale) / 2;
  const oy = box.y + (box.height - vh * scale) / 2;
  const place = (rings) => rings.map((ring) => ring.map(([x, y]) => [ox + (x - vx) * scale, oy + (y - vy) * scale]));

  const shapes = belgium.features.map((f) => ({ rings: place(parsePath(f.path)), colour: COLOURS[state(f.id)] }));
  for (const shape of shapes) fillRings(surf, shape.rings, shape.colour);
  // A hair over one device pixel at the final size: any thinner and the borders
  // average away to nothing in the downscale, any thicker and a small
  // municipality is more outline than fill.
  for (const shape of shapes) strokeLines(surf, shape.rings.map(closed), COLOURS.border, 1.3);
}

/**
 * Which of the game's three knowledge colours a municipality gets.
 *
 * A uniform map is an accurate picture of a game nobody has played yet. A
 * sprinkle of solid and shaky is what the board actually looks like a few
 * minutes in, and it says more about the product than any caption would. The
 * hash is over the NIS code so the same build produces the same card twice, and
 * so the pattern is scattered rather than following the province-ordered codes.
 */
function state(nis) {
  let h = 2166136261;
  for (let i = 0; i < nis.length; i++) {
    h ^= nis.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bucket = (h >>> 0) % 100;
  if (bucket < 21) return 'solid';
  if (bucket < 30) return 'shaky';
  return 'unseen';
}

/**
 * The scope files hold one absolute-command SVG path per municipality, with one
 * `M x y L x y … Z` subpath per ring. geometry.mjs writes them and nothing else
 * ever will, so a regex is a fair reader for them — this is not a general SVG
 * path parser and should not grow into one.
 */
function parsePath(d) {
  const rings = [];
  for (const sub of d.split('Z')) {
    const points = [];
    for (const [, x, y] of sub.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) points.push([Number(x), Number(y)]);
    if (points.length >= 3) rings.push(points);
  }
  return rings;
}

// fillRings closes a ring implicitly; a stroke has to be told.
const closed = (ring) => [...ring, ring[0]];

const rect = (x, y, width, height) => [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];

// ------------------------------------------------------------------ the icons

/**
 * The map pin from feeds.mjs icon(), as pixels.
 *
 * Square and opaque rather than a rounded rectangle on transparency, because
 * this encoder has no alpha channel and because every platform that shows these
 * — Android's launcher, iOS's home screen, a browser's install prompt — applies
 * its own mask anyway. A rounded corner baked in here would be masked a second
 * time and come out chewed.
 *
 * Drawn on the same 64-unit grid as the SVG, in the same two colours, so the
 * vector and the raster icon are the same icon rather than two drawings of one.
 */
function appIcon(size) {
  const s = 4;
  const unit = (size * s) / 64;
  const surf = surface(size * s, size * s, rgb('#10131a'));

  // The pin is a circle and a point, and the outline runs along the two lines
  // that touch the circle from the point. The tangent sits at acos(r/d) from
  // the line joining them, which is what stops the join showing as a corner.
  const head = { x: 32, y: 25, r: 13 };
  const tip = 52;
  const spread = (Math.acos(head.r / (tip - head.y)) * 180) / Math.PI;
  const outline = [
    ...arc(head.x, head.y, head.r, head.r, 270 + spread, 270 + spread + (360 - 2 * spread), 48),
    [head.x, tip],
  ];
  const hole = arc(head.x, head.y, 5, 5, 0, 360, 32);

  const toSurface = (ring) => ring.map(([x, y]) => [x * unit, y * unit]);
  fillRings(surf, [outline, hole].map(toSurface), rgb('#4ade80'));

  return downscale(surf, s);
}
