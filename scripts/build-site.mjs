#!/usr/bin/env node
// City Memory — site build.
//
//   node scripts/build-site.mjs
//
// Assembles everything that gets published into dist/. The repo root stays the
// thing you develop against (`npm start` serves it directly, and the tests boot
// the real page from it); dist/ is what a host is pointed at, so node_modules,
// the 25 MB OSM cache, the tests and the build scripts never leave the machine.
//
// Paths inside dist/ mirror the repo exactly, so index.html's relative fetches
// of public/data/ work identically in both places and nothing has to know
// whether it is running locally or on a CDN.
import { cp, mkdir, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site } from './lib/site-config.mjs';
import { buildPages } from './lib/pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const p = (...s) => path.join(root, ...s);
const dist = p('dist');
const log = (...a) => console.log(...a);

// Copied verbatim. Everything else in the repo is development-only.
const COPY = ['index.html', 'styles.css', 'src', 'public'];

async function main() {
  if (!existsSync(p('public/api/v1/index.json'))) {
    console.error('public/api/ has not been built. Run `npm run build:api` first.');
    process.exit(1);
  }

  log('1/4 Clearing dist/');
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  log('2/4 Copying the site');
  for (const entry of COPY) {
    await cp(p(entry), path.join(dist, entry), { recursive: true });
  }

  log('3/4 Generating pages');
  const written = await buildPages({ dist, root, site, log });

  log('4/4 Checking what we are about to publish');
  const files = await walk(dist);
  const bytes = files.reduce((s, f) => s + f.size, 0);

  // Cloudflare Pages refuses a deploy over 20,000 files or with any file over
  // 25 MB, and finding that out from a failed deploy is a slow way to learn it.
  const LIMITS = { files: 20_000, fileBytes: 25 * 1024 * 1024 };
  const tooBig = files.filter((f) => f.size > LIMITS.fileBytes);
  const problems = [];
  if (files.length > LIMITS.files) problems.push(`${files.length} files, over the ${LIMITS.files} a Cloudflare Pages deploy allows`);
  for (const f of tooBig) problems.push(`${f.rel} is ${(f.size / 1e6).toFixed(1)} MB, over the 25 MB per-file limit`);
  for (const leak of ['node_modules', 'data/raw', 'test']) {
    if (existsSync(path.join(dist, leak))) problems.push(`${leak}/ leaked into dist/`);
  }
  if (problems.length) {
    console.error('\nThis build cannot be published:');
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    process.exit(1);
  }

  const byKind = new Map();
  for (const f of files) {
    const kind = path.extname(f.rel) || '(none)';
    const cur = byKind.get(kind) ?? { n: 0, bytes: 0 };
    byKind.set(kind, { n: cur.n + 1, bytes: cur.bytes + f.size });
  }
  log(`  ${files.length} files, ${(bytes / 1e6).toFixed(2)} MB`);
  for (const [kind, v] of [...byKind].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 6)) {
    log(`    ${kind.padEnd(9)} ${String(v.n).padStart(4)} files  ${(v.bytes / 1e6).toFixed(2)} MB`);
  }
  log(`  ${written.length} generated pages`);
  log(`\ndist/ is ready. Serve it with \`node scripts/serve.mjs 8080 dist\`.`);
}

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else out.push({ rel: path.relative(base, full), size: (await stat(full)).size });
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
