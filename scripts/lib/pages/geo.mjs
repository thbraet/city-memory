// The pages that give search engines something to find.
//
// The game is one URL and a canvas; nobody searches for "city memory". People
// search for "waar ligt Herstappe", "gemeenten provincie Antwerpen kaart" or
// "communes du Hainaut liste". So every province, every region and every
// municipality gets a real page, in the markup, with something on it that is
// worth reading: the shape drawn from the same data the game uses, the names in
// all three languages, the surface area, and which municipalities it borders.
//
// That last part is what keeps these pages from being thin. A page that only
// repeats a name and a code is boilerplate; a page that shows you the outline
// and tells you it borders nine others is the answer someone was looking for.
//
// The province and region pages exist three times over, once per language,
// because the searches above are not English ones. The 565 municipality pages
// exist once: they already carry the Dutch, French and German name of the
// place, and 1,695 near-identical pages is what Google calls scaled content
// abuse — a risk to the whole domain in exchange for no extra reader.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { document, esc, jsonLd, breadcrumbs, adSlot } from './layout.mjs';
import { loadStrings, loadBundle } from './strings/index.mjs';
import { PROVINCES, REGIONS } from '../regions.mjs';
import { routeFor, alternatesFor as routeAlternates } from './routes.mjs';

const repo = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * URL shape per language.
 *
 * Deliberately here and not in the strings bundle. These are addresses, not
 * copy: a translator changing one after launch silently throws away whatever
 * ranking the old address earned, and the reciprocal hreflang links below are
 * computed from this table, so a typo breaks all three languages at once.
 * Dutch is the default language and takes the bare paths.
 */
export async function build(ctx) {
  const api = ctx.api.municipalities.municipalities;
  const byNis = new Map(api.map((m) => [m.nis, m]));

  // Coarse national paths for the overview maps, detailed provincial ones for a
  // single shape. Drawing a whole province from the detailed file would inline
  // a quarter of a megabyte of path data into one page.
  const scopes = new Map();
  const scope = async (id) => {
    if (!scopes.has(id)) {
      scopes.set(id, JSON.parse(await readFile(path.join(repo, 'public/data/scopes', `${id}.json`), 'utf8')));
    }
    return scopes.get(id);
  };
  const belgium = await scope('belgium');
  const nationalPaths = new Map(belgium.features.map((f) => [f.id, f]));

  const slugs = assignSlugs(api);
  const bundles = await loadStrings(ctx.languages, ctx.log);

  // Membership is language-independent, so it is computed once and handed to
  // all three copies of each page.
  const inProvince = new Map(PROVINCES.map((p) => [p.id, api.filter((m) => m.province.id === p.id).sort(byName)]));
  const inRegion = new Map(Object.values(REGIONS).map((r) => [r.id, api.filter((m) => m.region.id === r.id).sort(byName)]));

  const pages = [];

  for (const lang of ctx.languages) {
    const t = bundles.get(lang);
    pages.push(provinceIndex(ctx, t, lang));
    for (const prov of PROVINCES) {
      pages.push(provincePage(ctx, t, lang, prov, inProvince.get(prov.id), nationalPaths, slugs));
    }
    for (const reg of Object.values(REGIONS)) {
      pages.push(regionPage(ctx, t, lang, reg, inRegion.get(reg.id), nationalPaths, slugs));
    }
  }

  // One page per municipality, in English furniture around three official
  // names. See the note at the top of the file.
  const neutral = await loadBundle('en', ctx.log);
  for (const m of api) {
    const provScope = await scope(m.province.id);
    const shape = provScope.features.find((f) => f.id === m.nis);
    const detail = JSON.parse(await readFile(path.join(repo, 'public/api/v1/municipalities', `${m.nis}.json`), 'utf8'));
    pages.push(municipalityPage(ctx, neutral, m, shape, detail, slugs, byNis));
  }

  return pages;
}

const alternatesFor = (ctx, kind, id) => routeAlternates(ctx.languages, kind, id);

// ------------------------------------------------------------------- listings

function provinceIndex(ctx, t, lang) {
  const url = routeFor(lang, 'provinces');
  const crumbs = breadcrumbs([
    { name: t.common.crumbHome, url: '/' },
    { name: t.common.crumbProvinces, url },
  ], ctx);
  const provinces = ctx.api.provinces.provinces;
  const regions = ctx.api.regions.regions;
  const count = ctx.api.index.counts.municipalities;

  const body = `${crumbs.html}
<article class="prose">
  <h1>${t.provinceIndex.h1}</h1>
  <p class="lede">${t.provinceIndex.lede({ count: esc(String(count)) })}</p>

  ${regions.map((r) => `<section class="region-block">
    <h2><a href="${esc(routeFor(lang, 'region', r.id))}">${esc(regionName(t, r.id, r.name))}</a></h2>
    <p>${t.provinceIndex.regionSummary({ count: esc(String(r.municipalityCount)), area: esc(fmtArea(r.areaKm2, lang)) })}</p>
    <ul class="card-grid">
${provinces.filter((p) => p.region.id === r.id).map((p) => `      <li class="card">
        <a href="${esc(routeFor(lang, 'province', p.id))}"><strong>${esc(provinceName(t, p.id, p.name))}</strong></a>
        <span class="muted">${t.provinceIndex.provinceSummary({ count: esc(String(p.municipalityCount)), area: esc(fmtArea(p.areaKm2, lang)) })}</span>
      </li>`).join('\n')}
    </ul>
  </section>`).join('\n  ')}

  <h2>${t.provinceIndex.wholeCountryHeading}</h2>
  <p><a class="cta" href="/?scope=belgium">${t.provinceIndex.wholeCountryCta({ count: esc(String(count)) })}</a></p>
</article>`;

  return page(ctx, {
    path: pathFor(url),
    url,
    lang,
    alternates: alternatesFor(ctx, 'provinces'),
    title: t.provinceIndex.meta.title,
    description: t.provinceIndex.meta.description,
    head: crumbs.ld,
    body,
  });
}

function provincePage(ctx, t, lang, prov, members, nationalPaths, slugs) {
  const summary = ctx.api.provinces.provinces.find((p) => p.id === prov.id);
  const region = REGIONS[prov.region];
  const name = provinceName(t, prov.id, prov.name);
  const url = routeFor(lang, 'province', prov.id);
  const crumbs = breadcrumbs([
    { name: t.common.crumbHome, url: '/' },
    { name: t.common.crumbProvinces, url: routeFor(lang, 'provinces') },
    { name, url },
  ], ctx);

  const biggest = [...members].sort((a, b) => b.areaKm2 - a.areaKm2)[0];
  const smallest = [...members].sort((a, b) => a.areaKm2 - b.areaKm2)[0];
  const caption = t.province.mapCaption({ name, count: members.length });

  const body = `${crumbs.html}
<article class="prose">
  <h1>${esc(name)}</h1>
  <p class="lede">${t.province.lede({
    name: esc(name),
    count: esc(String(members.length)),
    area: esc(fmtArea(summary.areaKm2, lang)),
    region: esc(regionName(t, region.id, region.name)),
    prefixes: esc(prov.prefixes.join(', ')),
  })}</p>

  ${mapFigure(t, members, nationalPaths, slugs, caption)}

  <p><a class="cta" href="/?scope=${esc(prov.id)}">${t.province.cta({ name: esc(name) })}</a></p>

  <h2>${t.province.listHeading({ count: esc(String(members.length)) })}</h2>
  <p class="muted">${t.province.extremes({
    biggest: esc(biggest.name),
    biggestArea: esc(fmtArea(biggest.areaKm2, lang)),
    smallest: esc(smallest.name),
    smallestArea: esc(fmtArea(smallest.areaKm2, lang)),
  })}</p>
  ${municipalityTable(t, members, slugs, lang)}

  ${adSlot('belowGame', ctx)}

  <h2>${t.province.dataHeading}</h2>
  <p>${t.province.dataNote({
    apiLink: link(ctx.url(`/api/v1/provinces/${prov.id}.json`)),
    geoLink: link(ctx.url(`/api/v1/geo/provinces/${prov.id}.geojson`)),
  })}</p>
</article>`;

  return page(ctx, {
    path: pathFor(url),
    url,
    lang,
    alternates: alternatesFor(ctx, 'province', prov.id),
    title: t.province.meta.title({ name, count: members.length }),
    description: t.province.meta.description({ name, count: members.length }),
    head: crumbs.ld + jsonLd({
      '@context': 'https://schema.org',
      '@type': 'AdministrativeArea',
      name,
      url: ctx.url(url),
      inLanguage: lang,
      containedInPlace: { '@type': 'Country', name: 'Belgium' },
      containsPlace: members.slice(0, 50).map((m) => ({
        '@type': 'City', name: m.name, url: ctx.url(`/gemeente/${slugs.get(m.nis)}`),
      })),
    }),
    body,
  });
}

function regionPage(ctx, t, lang, reg, members, nationalPaths, slugs) {
  const summary = ctx.api.regions.regions.find((r) => r.id === reg.id);
  const provinces = PROVINCES.filter((p) => p.region === reg.id);
  const name = regionName(t, reg.id, reg.name);
  const url = routeFor(lang, 'region', reg.id);
  const crumbs = breadcrumbs([
    { name: t.common.crumbHome, url: '/' },
    { name: t.common.crumbProvinces, url: routeFor(lang, 'provinces') },
    { name, url },
  ], ctx);
  const caption = t.region.mapCaption({ name, count: members.length });

  const body = `${crumbs.html}
<article class="prose">
  <h1>${esc(name)}</h1>
  <p class="lede">${t.region.lede({
    name: esc(name),
    count: esc(String(members.length)),
    area: esc(fmtArea(summary.areaKm2, lang)),
    provinces: provinces.length,
  })}</p>

  ${mapFigure(t, members, nationalPaths, slugs, caption)}

  <p><a class="cta" href="/?scope=${esc(reg.id)}">${t.region.cta({ name: esc(name) })}</a></p>

  ${provinces.length > 1 ? `<h2>${t.region.provincesHeading}</h2>
  <ul class="card-grid">
${provinces.map((p) => {
    const count = members.filter((m) => m.province.id === p.id).length;
    return `    <li class="card"><a href="${esc(routeFor(lang, 'province', p.id))}"><strong>${esc(provinceName(t, p.id, p.name))}</strong></a>
      <span class="muted">${t.region.provinceSummary({ count: esc(String(count)) })}</span></li>`;
  }).join('\n')}
  </ul>` : ''}

  <h2>${t.region.listHeading({ count: esc(String(members.length)) })}</h2>
  ${municipalityTable(t, members, slugs, lang)}

  ${adSlot('belowGame', ctx)}
</article>`;

  return page(ctx, {
    path: pathFor(url),
    url,
    lang,
    alternates: alternatesFor(ctx, 'region', reg.id),
    title: t.region.meta.title({ name, count: members.length }),
    description: t.region.meta.description({ name, count: members.length }),
    head: crumbs.ld,
    body,
  });
}

// -------------------------------------------------------------- one at a time

function municipalityPage(ctx, t, m, shape, detail, slugs, byNis) {
  const s = t.municipality;
  const slug = slugs.get(m.nis);
  const prov = PROVINCES.find((p) => p.id === m.province.id);
  // Declared English because the framing sentences are English, even though the
  // page links into the Dutch routes: those are the canonical ones, and sending
  // a reader from here to a translated province page they did not ask for is
  // worse than the mixed register.
  const routes = ctx.site.defaultLanguage;
  const url = `/gemeente/${slug}`;
  const crumbs = breadcrumbs([
    { name: t.common.crumbHome, url: '/' },
    { name: t.common.crumbProvinces, url: routeFor(routes, 'provinces') },
    { name: m.province.name, url: routeFor(routes, 'province', m.province.id) },
    { name: m.name, url },
  ], ctx);

  const neighbours = detail.properties.neighbours
    .map((n) => ({ ...n, slug: slugs.get(n.nis), area: byNis.get(n.nis)?.areaKm2 }))
    .filter((n) => n.slug);

  // The names are only worth listing when they actually differ — "Aartselaar,
  // known in French as Aartselaar" is noise, and noise on 565 pages is exactly
  // what makes a site look automated.
  const otherNames = [
    m.names.nl !== m.name ? ['nl', m.names.nl] : null,
    m.names.fr !== m.name ? ['fr', m.names.fr] : null,
    m.names.de !== m.name && m.names.de !== m.names.fr && m.names.de !== m.names.nl ? ['de', m.names.de] : null,
  ].filter(Boolean);

  const body = `${crumbs.html}
<article class="prose">
  <h1>${esc(m.name)}</h1>
  <p class="lede">${s.lede({
    name: esc(m.name),
    province: esc(m.province.name),
    region: esc(m.region.name),
    area: esc(fmtArea(m.areaKm2)),
    parts: m.parts,
    neighbours: neighbours.length,
  })}</p>

  ${shape ? shapeFigure(t, shape, s.shapeCaption({ name: m.name })) : ''}

  <dl class="facts">
    <dt>${s.facts.nis}</dt><dd><code>${esc(m.nis)}</code></dd>
    <dt>${s.facts.province}</dt><dd><a href="${esc(routeFor(routes, 'province', m.province.id))}">${esc(m.province.name)}</a></dd>
    <dt>${s.facts.region}</dt><dd><a href="${esc(routeFor(routes, 'region', m.region.id))}">${esc(m.region.name)}</a></dd>
    <dt>${s.facts.area}</dt><dd>${esc(fmtArea(m.areaKm2))} km²</dd>
    <dt>${s.facts.centre}</dt><dd>${s.coordinates({ lat: esc(m.centroid[1].toFixed(4)), lon: esc(m.centroid[0].toFixed(4)) })}</dd>
${otherNames.map(([code, name]) => `    <dt>${s.inLanguage({ language: s.languageNames[code] })}</dt><dd>${esc(name)}</dd>`).join('\n')}
  </dl>

  ${neighbours.length ? `<h2>${s.bordersHeading}</h2>
  <p>${s.bordersLede({ name: esc(m.name) })}</p>
  <ul class="neighbours">
${neighbours.map((n) => `    <li><a href="/gemeente/${esc(n.slug)}">${esc(n.name)}</a></li>`).join('\n')}
  </ul>` : `<h2>${s.bordersHeading}</h2>
  <p>${s.noBorders({ name: esc(m.name) })}</p>`}

  <h2>${s.learnHeading}</h2>
  <p>${s.learnText({
    name: esc(m.name),
    province: esc(m.province.name),
    count: esc(String(prov.expected)),
  })}</p>
  <p><a class="cta" href="/?scope=${esc(m.province.id)}">${s.learnCta({ province: esc(m.province.name) })}</a></p>

  ${adSlot('belowGame', ctx)}

  <h2>${s.apiHeading}</h2>
  <p>${s.apiNote({
    endpointLink: link(ctx.url(`/api/v1/municipalities/${m.nis}.json`)),
    nis: esc(m.nis),
  })}</p>
</article>`;

  return page(ctx, {
    path: `gemeente/${slug}/index.html`,
    url,
    lang: 'en',
    title: s.meta.title({ name: m.name }),
    description: s.meta.description({
      name: m.name,
      nis: m.nis,
      province: m.province.name,
      area: fmtArea(m.areaKm2),
      neighbours: neighbours.length,
    }),
    head: crumbs.ld + jsonLd({
      '@context': 'https://schema.org',
      '@type': 'City',
      name: m.name,
      alternateName: [...new Set([m.names.nl, m.names.fr, m.names.de])].filter((n) => n !== m.name),
      url: ctx.url(url),
      identifier: { '@type': 'PropertyValue', propertyID: 'NIS', value: m.nis },
      containedInPlace: { '@type': 'AdministrativeArea', name: m.province.name, url: ctx.url(routeFor(routes, 'province', m.province.id)) },
      geo: { '@type': 'GeoCoordinates', latitude: m.centroid[1], longitude: m.centroid[0] },
      addressCountry: 'BE',
    }),
    body,
  });
}

// ----------------------------------------------------------------- ingredients

/** A province- or region-sized map, drawn from the coarse national paths. */
function mapFigure(t, members, nationalPaths, slugs, caption) {
  const shapes = members.map((m) => nationalPaths.get(m.nis)).filter(Boolean);
  if (!shapes.length) return '';
  const box = fitBox(shapes);
  return `<figure class="map-figure">
  <svg viewBox="${esc(box)}" role="img" aria-label="${esc(caption)}" class="static-map">
${shapes.map((s, i) => `    <a href="/gemeente/${esc(slugs.get(members[i].nis))}"><path d="${esc(s.path)}"><title>${esc(members[i].name)}</title></path></a>`).join('\n')}
  </svg>
  <figcaption>${t.common.figureCaption({ caption: esc(caption) })}</figcaption>
</figure>`;
}

/** One municipality on its own, at the detail the province file carries. */
function shapeFigure(t, shape, caption) {
  return `<figure class="map-figure single">
  <svg viewBox="${esc(fitBox([shape], 0.08))}" role="img" aria-label="${esc(caption)}" class="static-map">
    <path d="${esc(shape.path)}"/>
  </svg>
  <figcaption>${t.common.figureCaption({ caption: esc(caption) })}</figcaption>
</figure>`;
}

function municipalityTable(t, members, slugs, lang) {
  const th = t.common.tableHeaders;
  return `<table class="municipalities">
  <thead><tr><th>${esc(th.name)}</th><th>${esc(th.nis)}</th><th>${esc(th.area)}</th><th>${esc(th.neighbours)}</th></tr></thead>
  <tbody>
${members.map((m) => `    <tr>
      <td><a href="/gemeente/${esc(slugs.get(m.nis))}">${esc(m.name)}</a></td>
      <td><code>${esc(m.nis)}</code></td>
      <td>${esc(fmtArea(m.areaKm2, lang))} km²</td>
      <td>${esc(String(m.neighbourCount))}</td>
    </tr>`).join('\n')}
  </tbody>
</table>`;
}

/**
 * A viewBox around a set of canvas shapes, with a margin.
 *
 * The paths are absolute `M x y L x y …` in the game's 4000-unit canvas, so the
 * numbers can be read straight out of the string — no parsing library, and no
 * need to reproject anything that was already projected once.
 */
function fitBox(shapes, margin = 0.04) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    for (const match of s.path.matchAll(/(-?\d+(?:\.\d+)?)[ ](-?\d+(?:\.\d+)?)/g)) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const pad = Math.max(w, h) * margin;
  return `${round(minX - pad)} ${round(minY - pad)} ${round(w + pad * 2)} ${round(h + pad * 2)}`;
}

const round = (n) => Math.round(n * 10) / 10;
/**
 * A surface area, written the way the page's language writes numbers.
 *
 * "2845 km2" and "5.3 km2" are wrong on a Dutch or French page: a Belgian
 * reader expects 2.845 and 5,3 in Dutch, 2 845 and 5,9 in French. Intl is a
 * Node built-in, so getting this right costs nothing but the argument.
 */
const fmtArea = (n, lang = 'en') => new Intl.NumberFormat(LOCALES[lang] ?? 'en-GB', {
  minimumFractionDigits: n >= 100 ? 0 : 1,
  maximumFractionDigits: n >= 100 ? 0 : 1,
}).format(n);

const LOCALES = { nl: 'nl-BE', fr: 'fr-BE', en: 'en-GB' };
const byName = (a, b) => a.name.localeCompare(b.name, 'nl');

/**
 * A link helper for the strings bundle: `link(href)('the words')`.
 *
 * The label is inserted as markup rather than escaped, because bundle values
 * are HTML and a label is sometimes `<code>…</code>`. Labels come from the
 * bundle, never from data.
 */
const link = (href) => (label) => `<a href="${esc(href)}">${label}</a>`;

const provinceName = (t, id, fallback) => t.common.provinceNames[id] ?? fallback;
const regionName = (t, id, fallback) => t.common.regionNames[id] ?? fallback;

/** dist/ path for a site-relative URL: '/fr/provinces' -> 'fr/provinces/index.html'. */
const pathFor = (url) => `${url.replace(/^\//, '')}/index.html`;

/** URL slugs, unique by construction: a clash falls back to name-province. */
function assignSlugs(municipalities) {
  const taken = new Map();
  const slugs = new Map();
  for (const m of municipalities) {
    let s = slugify(m.name);
    if (taken.has(s)) s = `${s}-${slugify(m.province.name)}`;
    if (taken.has(s)) s = `${s}-${m.nis}`;
    taken.set(s, m.nis);
    slugs.set(m.nis, s);
  }
  return slugs;
}

const slugify = (name) => name
  .split(' / ')[0]
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// Every page here is indexable and belongs in the sitemap; the alternates ride
// along so feeds.mjs can emit the xhtml:link rows without recomputing routes.
const page = (ctx, spec) => ({
  path: spec.path,
  body: document(spec, ctx),
  url: spec.url,
  lang: spec.lang,
  alternates: spec.alternates,
  sitemap: true,
});
