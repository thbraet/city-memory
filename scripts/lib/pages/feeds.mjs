// The files that are for machines rather than people: sitemap, robots, the
// manifest, the CDN's header and redirect rules, ads.txt, and the 404 page.
//
// The sitemap is built from the pages the other modules actually produced, not
// from a hand-kept list, because a sitemap that promises a page that does not
// exist is worse than no sitemap at all.
import { document, esc } from './layout.mjs';

export async function build(ctx) {
  const { site, enabled } = ctx;
  return [
    { path: 'sitemap.xml', body: sitemap(ctx) },
    { path: 'robots.txt', body: robots(ctx) },
    { path: 'site.webmanifest', body: manifest(ctx) },
    { path: 'icon.svg', body: icon() },
    { path: '_headers', body: headers(ctx) },
    { path: '_redirects', body: redirects(ctx) },
    { path: '404.html', body: notFound(ctx) },
    ...(enabled.ads(site) ? [{ path: 'ads.txt', body: adsTxt(ctx) }] : []),
  ];
}

/**
 * Every indexable page, built from the pages that were actually generated.
 *
 * It used to be a hand-kept list, which is why it promised 21 URLs while the
 * build produced 628 — the 565 municipality pages and every French and English
 * page were missing, and /legal was listed despite carrying a noindex. A
 * sitemap that disagrees with the site is worse than none: it spends crawl
 * budget on the wrong pages and teaches Search Console to distrust the file.
 *
 * ctx.generated carries every file a module returned with a url on it, so the
 * only way into this list now is to have actually been written to disk.
 */
function sitemap(ctx) {
  const stamp = (ctx.data.generatedAt ?? '').slice(0, 10);
  const pages = (ctx.generated ?? []).filter((f) => f.sitemap !== false);

  // changefreq and priority are omitted on purpose: Google has said for years
  // that it ignores both, and an invented priority is a claim we cannot support.
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map((page) => `  <url>
    <loc>${esc(ctx.url(page.url))}</loc>
    <lastmod>${esc(stamp)}</lastmod>${alternateRows(page, ctx)}
  </url>`).join('\n')}
</urlset>
`;
}

/**
 * The xhtml:link rows that tell Google the Dutch, French and English versions
 * of a page are the same page. They have to be reciprocal — every version
 * lists every version, itself included — or Google ignores the lot.
 */
function alternateRows(page, ctx) {
  if (!page.alternates?.length) return '';
  const rows = page.alternates.map((alt) =>
    `\n    <xhtml:link rel="alternate" hreflang="${esc(alt.lang)}" href="${esc(ctx.url(alt.url))}"/>`);
  const fallback = page.alternates.find((a) => a.lang === ctx.site.defaultLanguage) ?? page.alternates[0];
  rows.push(`\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(ctx.url(fallback.url))}"/>`);
  return rows.join('');
}

function robots(ctx) {
  // The API is deliberately crawlable — a public dataset that search engines can
  // see is a public dataset people can find — but there is no point spending
  // crawl budget on 565 near-identical JSON files, so only the entry points are open.
  return `# ${ctx.site.name}
User-agent: *
Allow: /
Disallow: /api/v1/municipalities/
Disallow: /api/v1/geo/

Sitemap: ${ctx.url('/sitemap.xml')}
`;
}

function manifest(ctx) {
  return JSON.stringify({
    name: ctx.site.name,
    short_name: ctx.site.name,
    description: ctx.site.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#10131a',
    theme_color: '#10131a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    categories: ['education', 'games'],
    lang: ctx.site.defaultLanguage,
  }, null, 2) + '\n';
}

/**
 * Cloudflare Pages `_headers`.
 *
 * Two jobs. The API has to be usable from any origin, which means CORS on every
 * endpoint. And the data files are the expensive part of the site — 3.8 MB for
 * the game, 14 MB for the API — so they get a long immutable cache, which is
 * safe because their contents only change when a rebuild republishes the lot.
 * HTML stays short-lived so a fix reaches people the same day.
 */
function headers(ctx) {
  return `# Cloudflare Pages reads this file.
#
# Each block repeats its full header set rather than relying on a more general
# block to supply the rest. Whether Cloudflare merges matching rules or lets the
# most specific one win is not something this file should be betting the API's
# CORS headers on, and at six rules against a limit of a hundred, repetition
# costs nothing.

/api/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, OPTIONS
  Access-Control-Max-Age: 86400
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  X-Content-Type-Options: nosniff

/api/v1/geo/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, OPTIONS
  Access-Control-Max-Age: 86400
  Content-Type: application/geo+json; charset=utf-8
  Cache-Control: public, max-age=3600, stale-while-revalidate=604800
  X-Content-Type-Options: nosniff

# The game's own data. Same bytes for everyone, replaced wholesale by a rebuild.
/public/data/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/src/*
  Cache-Control: public, max-age=3600

/styles.css
  Cache-Control: public, max-age=3600

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: geolocation=(), microphone=(), camera=(), interest-cohort=()
  Cache-Control: public, max-age=600, must-revalidate
`;
}

/**
 * Extensionless aliases for the API.
 *
 * `/api/v1/municipalities` is the URL people will type and the one that reads
 * well in documentation; the file on disk has to end in .json so the CDN serves
 * the right content type. A 200 rewrite gives both without a redirect hop.
 */
function redirects(ctx) {
  const rows = [
    ['/api', '/api/', 301],
    ['/api/v1', '/api/v1/index.json', 200],
    ['/api/v1/municipalities', '/api/v1/municipalities.json', 200],
    ['/api/v1/municipalities/:nis', '/api/v1/municipalities/:nis.json', 200],
    ['/api/v1/provinces', '/api/v1/provinces.json', 200],
    ['/api/v1/provinces/:id', '/api/v1/provinces/:id.json', 200],
    ['/api/v1/regions', '/api/v1/regions.json', 200],
    ['/api/v1/regions/:id', '/api/v1/regions/:id.json', 200],
    ['/api/v1/search', '/api/v1/search.json', 200],
    ['/api/v1/openapi', '/api/v1/openapi.json', 200],
  ];
  return `# Cloudflare Pages redirects. A 200 is a rewrite: the URL stays put.
${rows.map(([from, to, code]) => `${from}  ${to}  ${code}`).join('\n')}
`;
}

/**
 * ads.txt — the file that tells buyers who is allowed to sell this site's
 * inventory. Only written when there is a real publisher id: a placeholder here
 * is worse than the file's absence, because it authorises nobody while looking
 * like it authorises someone.
 */
function adsTxt(ctx) {
  const id = ctx.site.ads.adsensePublisherId.replace(/^ca-/, '');
  return `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`;
}

function notFound(ctx) {
  return document({
    path: '404.html',
    url: '/404',
    lang: 'en',
    title: 'Not found',
    description: 'That page does not exist.',
    body: `<article class="prose">
  <h1>Not here</h1>
  <p>That address does not point at anything. It may have been a province that got
  renamed, or a typo in a NIS code.</p>
  <ul>
    <li><a href="/">Play the game</a></li>
    <li><a href="/provincies">Browse by province</a></li>
    <li><a href="/api/">Read the API docs</a></li>
  </ul>
</article>`,
  }, ctx);
}

/** The map pin the tab and the manifest share. Inline, so it costs one request. */
function icon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="City Memory">
  <rect width="64" height="64" rx="12" fill="#10131a"/>
  <path d="M32 12c-7.2 0-13 5.8-13 13 0 9.7 13 27 13 27s13-17.3 13-27c0-7.2-5.8-13-13-13z" fill="#4ade80"/>
  <circle cx="32" cy="25" r="5" fill="#10131a"/>
</svg>
`;
}
