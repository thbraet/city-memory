// The letters the social card needs, as monoline outlines.
//
// There is no font engine here and there is not going to be one: parsing a TTF
// and running a hinted rasteriser is a project, not a helper, and bundling a
// font file to draw eleven characters is a licence question nobody wants to
// answer. So the glyphs are drawn the way a sign-writer would draw them — one
// stroke of constant width along a skeleton — which is a shape this file can
// describe in a few numbers and raster.mjs can already paint.
//
// Geometric sans, in the Futura mould: circles are circles and the stems are
// vertical. That style survives being drawn as a monoline better than any
// other, because it has no thick-thin contrast to lose, and it stays readable
// when a preview card is shown 300 pixels wide.
//
// Coordinates are fractions of the cap height, x rightwards from the glyph's
// origin and y downwards from the cap line, so y=0 is the top of a capital and
// y=1 is the baseline. `advance` includes both side bearings.
import { arc } from './raster.mjs';

// The default stroke, again as a fraction of the cap height. Heavy enough to
// hold together at thumbnail size, light enough that the counters in B and 6
// do not close up.
export const WEIGHT = 0.155;

// A stem on the left with a half-round bowl hanging off it: B, P and R are all
// this shape at different heights.
const bowl = (x0, joint, top, bottom, rx) => [
  [x0, top],
  ...arc(joint, (top + bottom) / 2, rx, (bottom - top) / 2, 90, -90, 16),
  [x0, bottom],
];

const GLYPHS = {
  ' ': { advance: 0.34, strokes: [] },
  A: { advance: 0.78, strokes: [[[0.04, 1], [0.35, 0], [0.66, 1]], [[0.14, 0.66], [0.56, 0.66]]] },
  B: { advance: 0.65, strokes: [[[0.05, 0], [0.05, 1]], bowl(0.05, 0.26, 0, 0.5, 0.24), bowl(0.05, 0.26, 0.5, 1, 0.27)] },
  C: { advance: 0.78, strokes: [arc(0.35, 0.5, 0.31, 0.5, 50, 310, 40)] },
  E: { advance: 0.66, strokes: [[[0.05, 0], [0.05, 1]], [[0.05, 0], [0.54, 0]], [[0.05, 0.5], [0.45, 0.5]], [[0.05, 1], [0.54, 1]]] },
  // A C that carries on past its own terminal, up the right side to a crossbar.
  G: { advance: 0.78, strokes: [[...arc(0.35, 0.5, 0.31, 0.5, 50, 310, 40), [0.55, 0.55], [0.33, 0.55]]] },
  I: { advance: 0.25, strokes: [[[0.05, 0], [0.05, 1]]] },
  L: { advance: 0.64, strokes: [[[0.05, 0], [0.05, 1], [0.52, 1]]] },
  M: { advance: 0.85, strokes: [[[0.05, 1], [0.05, 0], [0.39, 0.6], [0.73, 0], [0.73, 1]]] },
  N: { advance: 0.69, strokes: [[[0.05, 1], [0.05, 0], [0.57, 1], [0.57, 0]]] },
  O: { advance: 0.78, strokes: [arc(0.35, 0.5, 0.31, 0.5, 0, 360, 44)] },
  P: { advance: 0.64, strokes: [[[0.05, 0], [0.05, 1]], bowl(0.05, 0.26, 0, 0.54, 0.26)] },
  R: { advance: 0.72, strokes: [[[0.05, 0], [0.05, 1]], bowl(0.05, 0.26, 0, 0.54, 0.26), [[0.26, 0.54], [0.6, 1]]] },
  // Two circles of equal radius, tangent at the middle, each opened by a
  // quarter turn. Drawing the S any other way is how you get a lopsided one.
  S: { advance: 0.7, strokes: [[...arc(0.33, 0.25, 0.25, 0.25, 20, 270, 24), ...arc(0.33, 0.75, 0.25, 0.25, 90, -160, 24)]] },
  T: { advance: 0.76, strokes: [[[0.02, 0], [0.64, 0]], [[0.33, 0], [0.33, 1]]] },
  U: { advance: 0.69, strokes: [[[0.05, 0], [0.05, 0.68], ...arc(0.31, 0.68, 0.26, 0.32, 180, 360, 20), [0.57, 0]]] },
  Y: { advance: 0.75, strokes: [[[0.03, 0], [0.33, 0.52], [0.33, 1]], [[0.63, 0], [0.33, 0.52]]] },
  5: { advance: 0.7, strokes: [[[0.54, 0.02], [0.11, 0.02], [0.11, 0.4], ...arc(0.32, 0.7, 0.26, 0.29, 105, -140, 28)]] },
  6: { advance: 0.72, strokes: [[...arc(0.33, 0.42, 0.27, 0.42, 60, 180, 20), [0.06, 0.7]], arc(0.32, 0.7, 0.26, 0.29, 0, 360, 28)] },
};

/**
 * Look a glyph up, loudly.
 *
 * A missing letter silently dropped would be a card that reads CITY MEMRY, and
 * nobody reviews a build log closely enough to catch that. Adding a word to the
 * card means adding its letters here, and this is where you find that out.
 */
const glyph = (char) => {
  const found = GLYPHS[char];
  if (!found) throw new Error(`no glyph for ${JSON.stringify(char)}; add one to wordmark.mjs`);
  return found;
};

/** The advance width of `text` at a given cap height. */
export const measure = (text, size, tracking = 0) =>
  [...text].reduce((sum, char) => sum + glyph(char).advance * size + tracking, 0) - (text.length ? tracking : 0);

/**
 * The polylines for `text`, in surface coordinates, with the cap line at `y`.
 * Returned rather than drawn so the caller can pick the colour and weight, and
 * so a caller that wants the text centred can measure first.
 */
export function layout(text, { x, y, size, tracking = 0 }) {
  const lines = [];
  let pen = x;
  for (const char of [...text]) {
    const g = glyph(char);
    for (const stroke of g.strokes) {
      lines.push(stroke.map(([gx, gy]) => [pen + gx * size, y + gy * size]));
    }
    pen += g.advance * size + tracking;
  }
  return lines;
}
