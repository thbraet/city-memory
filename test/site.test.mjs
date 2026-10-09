// Everything the site build publishes, checked as published.
//
// dist/ is a build artifact and is gitignored, so on a clean checkout there is
// nothing here to read. Rather than test whatever an earlier run happened to
// leave behind — which is how a suite ends up passing against a tree nobody has
// rebuilt in a week — this file runs `scripts/build-site.mjs` itself and reads
// the result. The build takes about half a second, so there is no reason to be
// clever about caching it.
//
// The assertions are about output, not about the functions that produced it:
// a page module can be rewritten, split or renamed and these tests should not
// notice. What they do notice is a page that stopped existing while 600 others
// still link to it, which is the failure mode 619 cross-linked pages actually
// have.
//
// The one exception is the pair of advertising tests. Those need a build that
// the committed configuration does not produce, so they call buildPages()
// directly with a modified copy of the config and throw the output away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site, enabled } from '../scripts/lib/site-config.mjs';
import { buildPages } from '../scripts/lib/pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');

// build-site.mjs refuses to run without the API, and a missing API is a
// different problem with a different fix, so say which one it is rather than
// letting 15 tests fail for a reason none of them names.
const blocked = existsSync(path.join(root, 'public/api/v1/index.json'))
  ? false
  : 'public/api/v1 has not been built — run `npm run build:api` first';

if (!blocked) {
  const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-site.mjs')], { encoding: 'utf8' });
  if (build.status !== 0) {
    throw new Error(`the site build failed, so there is nothing to test:\n${build.stdout}${build.stderr}`);
  }
}

/** node:test has no file-level skip, so the guard rides on every test. */
const siteTest = (name, fn) => test(name, { skip: blocked }, fn);

// Text handling, kept up here because the parsing below runs at module load.
const one = (text, re) => (text.match(re) ?? [])[1];

const unescape = (value) => String(value)
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

/** An absolute URL on our own origin, reduced to the path a visitor types. */
const relative = (value) => {
  if (!value) return value;
  const origin = site.origin.replace(/\/$/, '');
  return value.startsWith(origin) ? (value.slice(origin.length) || '/') : value;
};

// --------------------------------------------------------------- the artefact

const files = blocked ? new Set() : new Set(await walk(dist));
const htmlFiles = [...files].filter((f) => f.endsWith('.html')).sort();

/** Every generated page, parsed once. Reading 619 files costs less than a second. */
const pages = new Map();
for (const file of htmlFiles) {
  const body = await readFile(path.join(dist, file), 'utf8');
  pages.set(file, {
    body,
    lang: one(body, /<html lang="([^"]*)"/),
    title: one(body, /<title>([^<]*)<\/title>/),
    description: one(body, /<meta name="description" content="([^"]*)">/),
    canonical: relative(one(body, /<link rel="canonical" href="([^"]*)">/)),
    robots: one(body, /<meta name="robots" content="([^"]*)">/),
    headings: (body.match(/<h1[\s>]/g) ?? []).length,
    alternates: [...body.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)">/g)]
      .map((m) => ({ lang: m[1], url: relative(unescape(m[2])) })),
  });
}

// The rewrites are part of how the host resolves a URL: /api/v1/municipalities
// is a real address even though the file on disk ends in .json. Checking links
// without them would report working URLs as broken.
const rewrites = blocked ? [] : parseRedirects(await readFile(path.join(dist, '_redirects'), 'utf8'));

const sitemap = blocked ? [] : [...(await readFile(path.join(dist, 'sitemap.xml'), 'utf8'))
  .matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => relative(unescape(m[1])));

// Everything above is read before the first test is registered, deliberately.
// node:test starts running registered tests at the next await, so a top-level
// await placed after them would run the early tests against half a module.

// ------------------------------------------------------------------ the pages

siteTest('the build publishes a page for every language, province, region and municipality', () => {
  const count = (prefix) => htmlFiles.filter((f) => f.startsWith(prefix)).length;
  assert.equal(count('gemeente/'), 565, 'one page per municipality');
  for (const prefix of ['provincie/', 'fr/province/', 'en/province/']) {
    assert.equal(count(prefix), 11, `${prefix} should hold the 11 provinces`);
  }
  for (const prefix of ['regio/', 'fr/region/', 'en/region/']) {
    assert.equal(count(prefix), 3, `${prefix} should hold the 3 regions`);
  }
  for (const home of ['index.html', 'fr/index.html', 'en/index.html']) {
    assert.ok(files.has(home), `${home} was not published`);
  }
  assert.ok(files.has('404.html'), 'there is no 404 page');
});

siteTest('every page has a title, one h1, and a canonical that points at itself', () => {
  for (const [file, page] of pages) {
    assert.ok(page.title, `${file} has no <title>`);
    assert.ok(page.title.includes(site.name), `${file} has a title that never names the site: ${page.title}`);
    assert.equal(page.headings, 1, `${file} has ${page.headings} <h1> elements, expected exactly 1`);
    assert.ok(page.canonical, `${file} has no canonical link`);
    assert.equal(
      fileFor(page.canonical), file,
      `${file} declares its canonical as ${page.canonical}, which is a different page`,
    );
  }
});

siteTest('every page has a meta description, and no two pages share one', () => {
  const byDescription = new Map();
  for (const [file, page] of pages) {
    assert.ok(page.description?.trim(), `${file} has an empty meta description`);
    const seen = byDescription.get(page.description);
    if (seen) {
      assert.fail(`${file} and ${seen} carry the same meta description: "${page.description.slice(0, 80)}"`);
    }
    byDescription.set(page.description, file);
  }
});

siteTest('a page declares the language of the directory it was written to', () => {
  for (const [file, page] of pages) {
    assert.ok(site.languages.includes(page.lang), `${file} declares lang="${page.lang}"`);

    const prefix = file.split('/')[0];
    if (site.languages.includes(prefix)) {
      assert.equal(page.lang, prefix, `${file} lives under /${prefix}/ but declares lang="${page.lang}"`);
    }

    // The hreflang set names this page too. If those two disagree the page is
    // telling Google one thing and the browser another.
    const self = page.alternates.find((alt) => alt.url === page.canonical);
    if (self) {
      assert.equal(self.lang, page.lang, `${file} is lang="${page.lang}" but its own hreflang says "${self.lang}"`);
    }
  }
});

// Structure only proves the pages are wired up; it says nothing about whether
// the French page is in French. Three words, one per home page, catch a build
// that wrote the same copy three times.
siteTest('the three home pages are actually in three languages', () => {
  const marker = { 'index.html': 'gemeenten', 'fr/index.html': 'communes', 'en/index.html': 'municipalities' };
  for (const [file, word] of Object.entries(marker)) {
    const h1 = one(pages.get(file).body, /<h1>([^<]*)<\/h1>/) ?? '';
    assert.match(h1.toLowerCase(), new RegExp(word), `${file} has the heading "${h1}"`);
  }
});

// The one that earns its keep. Every other test here checks a page against
// itself; this checks the pages against each other, which is where a renamed
// route rots silently — the page that moved still builds, and the 600 pages
// pointing at its old address still build too.
siteTest('no page links to an address the site does not serve', () => {
  const broken = new Map();
  for (const [file, page] of pages) {
    for (const href of internalLinks(page.body)) {
      if (fileFor(href)) continue;
      if (!broken.has(href)) broken.set(href, []);
      broken.get(href).push(file);
    }
  }
  if (broken.size === 0) return;

  const report = [...broken].slice(0, 10)
    .map(([href, from]) => `  ${href}  <- ${from.length} page(s), e.g. ${from[0]}`)
    .join('\n');
  const more = broken.size > 10 ? `\n  ...and ${broken.size - 10} more` : '';
  assert.fail(`${broken.size} link target(s) do not exist in dist/:\n${report}${more}`);
});

// ---------------------------------------------------------------- the sitemap

siteTest('the sitemap promises only pages that exist', () => {
  assert.ok(sitemap.length > 0, 'the sitemap is empty');
  assert.equal(new Set(sitemap).size, sitemap.length, 'the sitemap lists the same URL twice');
  for (const loc of sitemap) {
    assert.ok(fileFor(loc), `the sitemap promises ${loc}, which is not in dist/`);
  }
});

siteTest('every page that wants indexing is in the sitemap', () => {
  const listed = new Set(sitemap.map(fileFor));
  const missing = htmlFiles.filter((file) => {
    if (file === '404.html') return false;
    if (pages.get(file).robots?.includes('noindex')) return false;
    return !listed.has(file);
  });
  if (missing.length === 0) return;
  const sample = missing.slice(0, 12).map((file) => `  ${file}`).join('\n');
  const more = missing.length > 12 ? `\n  ...and ${missing.length - 12} more` : '';
  assert.fail(`${missing.length} indexable page(s) are missing from sitemap.xml:\n${sample}${more}`);
});

siteTest('the sitemap leaves out the pages that ask not to be indexed', () => {
  const noindex = sitemap
    .map((loc) => fileFor(loc))
    .filter((file) => pages.get(file)?.robots?.includes('noindex'));
  assert.deepEqual(noindex, [], 'these pages are noindex and should not be in the sitemap');
});

siteTest('robots.txt points crawlers at a sitemap that exists', async () => {
  const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*$/m, 'robots.txt has no user-agent line');
  const declared = one(robots, /^Sitemap:\s*(\S+)$/m);
  assert.ok(declared, 'robots.txt names no sitemap');
  assert.equal(fileFor(relative(declared)), 'sitemap.xml', `robots.txt points at ${declared}`);
});

// ----------------------------------------------------------------- hreflang

siteTest('hreflang is reciprocal and every set names an x-default', () => {
  for (const [file, page] of pages) {
    if (!page.alternates.length) continue;

    assert.ok(
      page.alternates.some((alt) => alt.lang === 'x-default'),
      `${file} has hreflang alternates but no x-default`,
    );
    assert.ok(
      page.alternates.some((alt) => alt.lang !== 'x-default' && alt.url === page.canonical),
      `${file} lists alternates but not itself (${page.canonical})`,
    );

    for (const alt of page.alternates) {
      const target = fileFor(alt.url);
      assert.ok(target, `${file} offers ${alt.lang} at ${alt.url}, which does not exist`);
      if (alt.lang === 'x-default') continue;
      assert.ok(
        pages.get(target).alternates.some((back) => back.url === page.canonical),
        `${file} points at ${target} for ${alt.lang}, but ${target} does not point back`,
      );
    }
  }
});

// ------------------------------------------------------------------ the money

// Two builds that the committed configuration never produces. The empty config
// has to render nothing — not a hidden slot, not a collapsed box, not a consent
// block for a consent decision nobody is being asked to make — and the filled
// one has to render a tag that AdSense will actually accept.

siteTest('with no publisher id, nothing anywhere mentions AdSense', async () => {
  const built = await buildWith((config) => {
    config.ads.adsensePublisherId = '';
    config.ads.slots = { belowGame: '', sidebar: '' };
  });

  for (const [file, body] of built) {
    for (const trace of ['adsbygoogle', 'pagead2.googlesyndication.com', 'ad-slot', 'data-ad-client']) {
      assert.ok(!body.includes(trace), `${file} contains "${trace}" with no ad account configured`);
    }
    // Consent Mode defaults with nothing to consent to are not harmless: they
    // load a dataLayer shim and imply a CMP that is never going to arrive.
    assert.ok(!body.includes("gtag('consent'"), `${file} sets consent defaults with no ad tag to gate`);
  }
  assert.ok(!built.has('ads.txt'), 'ads.txt authorises a seller that does not exist');
});

siteTest('with a publisher id, the tag ships behind consent defaults and ads.txt names the seller', async () => {
  const publisher = 'ca-pub-1234567890123456';
  const built = await buildWith((config) => {
    config.ads.adsensePublisherId = publisher;
    config.ads.slots = { belowGame: '1111111111', sidebar: '2222222222' };
  });

  const home = built.get('index.html');
  const tag = home.indexOf('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
  const consent = home.indexOf("gtag('consent','default'");
  assert.ok(tag > -1, 'the AdSense script is not on the home page');
  assert.ok(consent > -1, 'the home page loads AdSense without Consent Mode defaults');
  assert.ok(consent < tag, 'the consent defaults come after the ad tag, which is too late to matter');
  assert.ok(home.includes(`client=${publisher}`), 'the ad tag carries no publisher id');
  assert.ok(home.includes(`data-ad-client="${publisher}"`), 'the home page renders no ad slot');
  assert.ok(home.includes('showRevocationMessage'), 'there is no way back to the consent choice');

  // The round-end slot lives outside #app, starts hidden and is filled by
  // src/app.js on the summary screen — never pushed while it is invisible.
  const roundEnd = home.match(/<aside[^>]*id="ad-round-end"[^>]*>[\s\S]*?<\/aside>/);
  assert.ok(roundEnd, 'the home page has no round-end ad slot');
  assert.match(roundEnd[0], /\shidden[\s>]/, 'the round-end slot is visible during play');
  assert.ok(roundEnd[0].includes('data-ad-slot="1111111111"'), 'the round-end slot is not the belowGame unit');
  assert.ok(!roundEnd[0].includes('.push('), 'the round-end slot is filled while hidden');
  assert.ok(home.indexOf('id="ad-round-end"') > home.indexOf('id="app"'), 'the round-end slot is inside #app and gets wiped');

  // Every generated page, not just the home page: a page that loads the script
  // without the defaults is the one that gets the site a warning.
  for (const [file, body] of built) {
    if (!file.endsWith('.html')) continue;
    assert.ok(body.includes('adsbygoogle.js'), `${file} does not load the ad tag`);
    assert.ok(
      body.indexOf("gtag('consent','default'") < body.indexOf('adsbygoogle.js'),
      `${file} loads the ad tag before the consent defaults`,
    );
  }

  assert.equal(
    built.get('ads.txt'),
    'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n',
    'ads.txt does not authorise this publisher, so nobody may sell the inventory',
  );
});

siteTest('the published build agrees with the committed configuration about advertising', () => {
  const on = enabled.ads(site);
  for (const [file, page] of pages) {
    assert.equal(
      page.body.includes('adsbygoogle'), on,
      on ? `${file} carries no ad code although a publisher id is configured`
        : `${file} carries ad code although site-config has no publisher id`,
    );
  }
  assert.equal(files.has('ads.txt'), on, on ? 'ads.txt is missing' : 'ads.txt shipped with no ad account');
});

// ------------------------------------------------------------- the deploy rules

siteTest('the _headers rules name paths the deploy contains, and the API is cross-origin', async () => {
  const rules = parseHeaders(await readFile(path.join(dist, '_headers'), 'utf8'));
  assert.ok(rules.length > 0, '_headers has no rules');

  for (const rule of rules) {
    assert.ok(rule.path.startsWith('/'), `${rule.path} is not an absolute path`);
    assert.ok(rule.headers.size > 0, `${rule.path} sets no headers`);
    const pattern = new RegExp('^' + rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    assert.ok(
      [...files].some((file) => pattern.test(`/${file}`)),
      `the _headers rule ${rule.path} matches nothing in dist/`,
    );
  }

  // A public JSON API that no other origin may read is not a public API.
  const api = rules.find((rule) => rule.path === '/api/*');
  assert.ok(api, '_headers has no rule for /api/*');
  assert.equal(api.headers.get('access-control-allow-origin'), '*', 'the API is not readable cross-origin');
  assert.match(api.headers.get('access-control-allow-methods') ?? '', /GET/, 'the API does not allow GET cross-origin');
});

siteTest('the _redirects rules parse the way Cloudflare Pages reads them', () => {
  assert.ok(rewrites.length > 0, '_redirects has no rules');
  for (const rule of rewrites) {
    assert.ok(rule.from.startsWith('/'), `${rule.from} is not an absolute path`);
    assert.ok(rule.to.startsWith('/'), `${rule.from} points at ${rule.to}, which is not an absolute path`);
    assert.ok([200, 301, 302, 308].includes(rule.status), `${rule.from} has status ${rule.status}`);
    // A parameter in the target that the source never captures silently becomes
    // a literal ':nis' in the served path.
    for (const param of rule.to.match(/:\w+/g) ?? []) {
      assert.ok(rule.from.includes(param), `${rule.from} -> ${rule.to} uses ${param}, which the source never captures`);
    }
  }
});

siteTest('the manifest and the icons it names are published', async () => {
  const manifest = JSON.parse(await readFile(path.join(dist, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.ok(site.languages.includes(manifest.lang), `the manifest declares lang "${manifest.lang}"`);
  for (const icon of manifest.icons) {
    assert.ok(fileFor(icon.src), `the manifest names ${icon.src}, which is not in dist/`);
  }
});

// -------------------------------------------------------------------- the law

siteTest('the legal pages exist and the imprint admits when it is incomplete', () => {
  for (const file of ['about/index.html', 'privacy/index.html', 'terms/index.html', 'legal/index.html']) {
    assert.ok(pages.has(file), `${file} was not published`);
  }

  const imprint = pages.get('legal/index.html');
  const complete = enabled.owner(site) && Boolean(site.owner.address);
  if (complete) {
    assert.ok(imprint.body.includes(site.owner.address), 'the imprint omits the address it is required to carry');
    assert.ok(imprint.body.includes(site.owner.email), 'the imprint omits the contact address');
  } else {
    assert.match(
      imprint.body, /not filled in yet/,
      'the owner details are empty but the imprint does not say so, which is the one thing it must not do',
    );
  }

  // Serving an imprint that Google then indexes ahead of the game is a waste of
  // the crawl and of the reader's click.
  assert.match(imprint.robots ?? '', /noindex/, 'the imprint should not be indexed');

  // The privacy notice describes what is on the page, so it may only describe
  // ad cookies when there are ad cookies.
  const privacy = pages.get('privacy/index.html').body;
  assert.equal(
    /Google|AdSense/.test(privacy), enabled.ads(site),
    enabled.ads(site)
      ? 'ads are on but the privacy notice never names Google'
      : 'the privacy notice describes Google ad cookies that this build does not set',
  );
});

// ------------------------------------------------------------------- plumbing

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * The file a static host would serve for a URL, or undefined.
 *
 * Directory-index and extensionless resolution both have to be here, because
 * both scripts/serve.mjs and Cloudflare Pages do them: /privacy is a real
 * address even though the file is privacy/index.html, and a test that did not
 * know that would report the entire site as broken.
 */
function fileFor(url) {
  const rel = requestPath(url);
  if (rel === undefined) return undefined;
  const direct = onDisk(rel);
  if (direct) return direct;

  // A 200 rule in _redirects is a rewrite, so the URL is served even though no
  // file sits at it. Anything else is a hop to a different address and is not
  // this function's business. Exactly one pass, the way Pages applies them: a
  // rule whose target matches its own source (/api/v1/x/:id -> .../:id.json)
  // would otherwise rewrite itself for as long as the stack holds out.
  for (const rule of rewrites) {
    if (rule.status !== 200) continue;
    const match = rule.pattern.exec(`/${rel}`);
    if (!match) continue;
    const target = onDisk(requestPath(rule.to.replace(/:(\w+)/g, (_, name) => match.groups?.[name] ?? '')));
    if (target) return target;
  }
  return undefined;
}

/** A URL reduced to the dist-relative path to look for, or undefined if it is not ours. */
function requestPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return undefined;
  let rel = url.split('#')[0].split('?')[0].replace(/^\//, '').replace(/\/$/, '');
  try {
    rel = decodeURIComponent(rel);
  } catch { /* a malformed escape is its own answer: nothing matches it */ }
  return rel === '' ? 'index' : rel;
}

// A declaration rather than an arrow, so it is hoisted: everything under this
// heading is defined below the tests that call it.
function onDisk(rel) {
  if (rel === undefined) return undefined;
  return [rel, `${rel}/index.html`, `${rel}.html`].find((candidate) => files.has(candidate));
}

/** Every site-relative address a page points at, hrefs, sources and og: images alike. */
function internalLinks(body) {
  const found = [];
  for (const match of body.matchAll(/(?:href|src)="([^"]+)"/g)) found.push(match[1]);
  for (const match of body.matchAll(/<meta property="og:(?:image|url)" content="([^"]+)">/g)) found.push(match[1]);
  return found
    .map((raw) => relative(unescape(raw)))
    .filter((href) => href.startsWith('/'));
}

function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: new Map() });
      continue;
    }
    const [name, ...rest] = line.trim().split(':');
    rules.at(-1)?.headers.set(name.trim().toLowerCase(), rest.join(':').trim());
  }
  return rules;
}

function parseRedirects(text) {
  return text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [from, to, status] = line.split(/\s+/);
      const source = '^' + from
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/:(\w+)/g, (_, name) => `(?<${name}>[^/]+)`) + '$';
      return { from, to, status: Number(status), pattern: new RegExp(source) };
    });
}

/**
 * The generated files a given configuration would produce, as text.
 *
 * buildPages() takes the config as an argument rather than importing it, which
 * is the seam that makes the advertising tests possible at all: the ads-on
 * build is exactly the real build with one field filled in.
 */
async function buildWith(mutate) {
  const config = structuredClone(site);
  mutate(config);

  const dir = await mkdtemp(path.join(tmpdir(), 'city-memory-site-'));
  try {
    const written = await buildPages({ dist: dir, root, site: config, log: () => {} });
    const out = new Map();
    for (const rel of written) {
      // The social card and the app icons are PNG; reading them as text would
      // only produce mojibake to search for ad code in.
      if (/\.(png|jpe?g|webp|ico)$/.test(rel)) continue;
      out.set(rel, await readFile(path.join(dir, rel), 'utf8'));
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

siteTest('province names start hidden and toggle without a stylesheet', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(await readFile(path.join(dist, 'provincie/antwerpen/index.html'), 'utf8'), {
    runScripts: 'outside-only',
  });
  const { document, MouseEvent } = dom.window;
  const layer = document.querySelector('.map-names');
  const toggle = document.querySelector('.map-names-toggle');
  const hidden = () => dom.window.getComputedStyle(layer).display === 'none';
  assert.ok(hidden(), 'names hidden even before JavaScript and CSS load');
  dom.window.eval(await readFile(path.join(dist, 'src/explore-map.js'), 'utf8'));
  assert.ok(hidden(), 'initialization keeps names hidden');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  for (let i = 0; i < 2; i++) {
    toggle.click();
    assert.ok(!hidden(), 'first click shows names');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    toggle.click();
    assert.ok(hidden(), 'second click hides names again');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  }
  const link = document.querySelector('.static-map a');
  link.querySelector('path').dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  assert.equal(document.querySelector('.map-hover-name').textContent, link.getAttribute('aria-label'));
  assert.ok(hidden(), 'hover does not reveal the other names');
  assert.equal(document.querySelectorAll('.static-map title').length, 0);
  dom.window.close();
});
