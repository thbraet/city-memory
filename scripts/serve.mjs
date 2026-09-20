#!/usr/bin/env node
// A static file server, so the page can fetch its data over HTTP.
//   node scripts/serve.mjs [port] [root]
//
// The default root is the repo, which is what you develop against. Pass `dist`
// to serve a built site instead, which is the only way to check the generated
// pages, the API headers story and the real link structure before deploying.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const root = path.resolve(repo, process.argv[3] ?? process.env.SERVE_ROOT ?? '.');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.geojson': 'application/geo+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Turn a request path into a file, the way a static host does: a directory
 * serves its index.html, and an extensionless path falls back to `.html`, so
 * /privacy and /provincie/antwerpen work locally exactly as they will on the CDN.
 */
async function resolve(candidate) {
  for (const attempt of [candidate, path.join(candidate, 'index.html'), `${candidate}.html`]) {
    try {
      const info = await stat(attempt);
      if (info.isFile()) return attempt;
      if (info.isDirectory() && attempt === candidate) continue;
    } catch { /* try the next shape */ }
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname);
    const file = await resolve(path.join(root, rel === '/' ? '/index.html' : rel));
    if (!file || !file.startsWith(root)) { res.writeHead(404).end('Not found'); return; }
    const info = await stat(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      // The deployed API is public and cross-origin; mirroring that here means a
      // client tested against localhost meets no surprise in production.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`City Memory → http://localhost:${port}/  (serving ${path.relative(repo, root) || '.'})`);
});
