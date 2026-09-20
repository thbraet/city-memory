// A PNG encoder in about eighty lines.
//
// The site needs three or four raster images and nothing else, and every
// image library on npm arrives with a build step, a native binary or both. A
// truecolour PNG is a zlib stream with a header on it, and node:zlib is already
// in the runtime, so writing the container by hand is cheaper than the
// dependency it would replace.
//
// What this deliberately does not do: palettes, alpha, interlacing, gamma,
// 16-bit depth. Colour type 2 (8-bit RGB) with filter 0 on every row is what
// the images here need, and every decoder that exists reads it.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG's CRC is the same polynomial as zip's, but zlib does not expose it, so it
// gets built here once rather than per chunk.
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** length, type, payload, CRC over type+payload. */
const chunk = (type, data) => {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

/**
 * Encode a surface — { width, height, data } where data is width*height*3
 * bytes of RGB — as a PNG.
 *
 * Each scanline is prefixed with a filter byte. Filter 0 means "these are the
 * literal bytes"; the other four predict from the neighbouring pixels and pay
 * off on photographs. The images here are flat fills with anti-aliased edges,
 * which deflate already handles well, and a filter that guesses wrong makes the
 * file bigger, so the rows go in raw.
 */
export function encodePng({ width, height, data }) {
  const stride = width * 3;
  if (data.length !== stride * height) {
    throw new Error(`surface is ${data.length} bytes, expected ${stride * height}`);
  }

  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type 2: truecolour, no alpha
  ihdr[10] = 0;  // compression: deflate, the only value there is
  ihdr[11] = 0;  // filter method 0: the five per-row filters, of which only 0 is used here
  ihdr[12] = 0;  // interlace: none

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Read a PNG this module wrote back into a surface. Only exists so the build's
 * own checks can assert on pixels rather than on byte counts; it understands
 * exactly the subset encodePng emits and nothing else.
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9] };
    if (type === 'IDAT') idat.push(body);
    offset += length + 12;
  }
  if (!header) throw new Error('no IHDR');
  if (header.depth !== 8 || header.colour !== 2) throw new Error(`unsupported PNG: depth ${header.depth}, colour type ${header.colour}`);

  const stride = header.width * 3;
  const raw = inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error(`row ${y} uses filter ${filter}, which this reader does not undo`);
    raw.copy(data, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }
  return { width: header.width, height: header.height, data };
}
