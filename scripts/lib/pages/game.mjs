// The home page — the game itself, wrapped in something a crawler can read.
//
// build-site.mjs copies the repo's index.html into dist/ in step 2 and then
// runs the page modules in step 3, and this module is first in that list, so
// the file written here lands on top of the copy. That is deliberate: the repo
// root stays the thing `npm start` and the jsdom test boot, unchanged and free
// of site furniture, while the published home page gets the shared shell.
//
// The server-rendered introduction lives *inside* #app, above the boot notice's
// sibling content. src/app.js renders every screen with root.replaceChildren(),
// so the moment the index loads and showStart() runs, the whole introduction is
// swapped out for the real start screen. Nobody with JavaScript ends up reading
// a paragraph stacked on top of the game, and nobody without it — a crawler on
// its first pass, a slow connection, a blocked module — gets a blank box. This
// is why the intro needs no hiding logic and app.js needs no change for it.
//
// The ad slots are the one thing that has to sit outside #app, because anything
// inside it is wiped on boot and an ad that survives for 300 ms is worth less
// than no ad at all. The round-end slot starts hidden; src/app.js shows it on
// the summary screen only, never over the map while someone is playing.
import { document, esc, jsonLd, adSlot } from './layout.mjs';
import { routeFor, homeFor, alternatesFor } from './routes.mjs';
import { bundleFor } from './strings/index.mjs';

export async function build(ctx) {
  const languages = ctx.languages?.length ? ctx.languages : [ctx.site.defaultLanguage];
  const alternates = languages.map((lang) => ({ lang, url: homeFor(lang) }));
  return languages.map((lang) => home(ctx, lang, languages.length > 1 ? alternates : undefined));
}

const homePath = (ctx, lang) => (lang === ctx.site.defaultLanguage ? 'index.html' : `${lang}/index.html`);

function home(ctx, lang, alternates) {
  const t = COPY[lang] ?? COPY.en;
  // Province and region names come from the page's own bundle, not from the
  // API: the API returns each name in its official language, so an unfiltered
  // list gives a Dutch page "Hainaut" and "Liège" where /provincies two clicks
  // away says "Henegouwen" and "Luik".
  const names = bundleFor(lang).common;
  const count = ctx.api.index.counts.municipalities;
  const extract = (ctx.api.index.osmExtract ?? '').slice(0, 10);
  const provinces = ctx.api.provinces.provinces;
  const regions = ctx.api.regions.regions;

  const body = `<div id="app" class="app">
  <noscript><p class="notice">${esc(t.noscript)}</p></noscript>
  <p class="notice" id="boot">${esc(t.booting)}</p>
  <header class="masthead">
    <h1>${esc(t.heading(count))}</h1>
    <p class="tagline">${esc(t.rules)}</p>
  </header>
  <section class="panel">
    <p>${esc(t.current(count))}</p>
    <p class="hint">${esc(t.data(extract))}</p>
  </section>
  <section class="panel">
    <h2>${esc(t.provinces)}</h2>
    <ul class="scope-list">
${provinces.map((p) => `      <li><a href="${esc(routeFor(lang, 'province', p.id))}">${esc(names.provinceNames[p.id] ?? p.name)}</a> <span class="chip-count">${esc(t.units(p.municipalityCount))}</span></li>`).join('\n')}
    </ul>
    <h3>${esc(t.regions)}</h3>
    <ul class="scope-list">
${regions.map((r) => `      <li><a href="${esc(routeFor(lang, 'region', r.id))}">${esc(names.regionNames[r.id] ?? r.name)}</a> <span class="chip-count">${esc(t.units(r.municipalityCount))}</span></li>`).join('\n')}
    </ul>
    <p class="hint"><a href="${esc(routeFor(lang, 'provinces'))}">${esc(t.allProvinces)}</a></p>
  </section>
</div>
${adSlot('belowGame', ctx, { id: 'ad-round-end' })}
${adSlot('sidebar', ctx)}`;

  return {
    path: homePath(ctx, lang),
    url: homeFor(lang),
    lang,
    alternates,
    sitemap: true,
    body: document({
      url: homeFor(lang),
      lang,
      alternates,
      title: t.title(count),
      description: t.description(count),
      wide: true,
      head: jsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: ctx.site.name,
        url: ctx.url(homeFor(lang)),
        description: t.description(count),
        applicationCategory: 'EducationalApplication',
        applicationSubCategory: 'Geography quiz',
        operatingSystem: 'Any browser',
        browserRequirements: 'Requires JavaScript',
        inLanguage: lang,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        about: { '@type': 'Country', name: 'Belgium' },
      }),
      body,
      // Absolute, not relative: the French and English homes live one directory
      // down, where `src/app.js` would resolve to /fr/src/app.js.
      scripts: '<script type="module" src="/src/app.js"></script>\n',
    }, ctx),
  };
}

// ------------------------------------------------------------------- the copy
//
// SEAM: this is the only page-level copy still held in its own module. When
// scripts/lib/pages/strings/ grows a bundle, these three entries are what it
// replaces; the shape below (one object per language, values that take the
// numbers as arguments) is what a bundle has to provide.
//
// The claim about 581 is worth stating once and only once. Belgium's municipal
// mergers of 1 January 2025 took the count from 581 to 565, and the quiz sites
// people land on first have not redrawn their maps. That is a fact about the
// data, not a boast, so it is written as one.

const COPY = {
  nl: {
    title: (n) => `Leer alle ${n} Belgische gemeenten`,
    description: (n) => `Een gratis kaartspel: een gemeente wordt genoemd, jij klikt haar aan. Alle ${n} Belgische gemeenten, actueel na de fusies van 2025.`,
    heading: (n) => `Leer alle ${n} Belgische gemeenten`,
    rules: 'Er verschijnt een gemeentenaam. Jij klikt haar vorm aan op de kaart. Mis je ze, dan komt ze later in de ronde terug, tot je ze niet meer mist.',
    current: (n) => `België telt ${n} gemeenten sinds de fusies van 1 januari 2025. De meeste online quizzen vragen nog naar de 581 van daarvoor; hier staat de huidige lijst.`,
    data: (date) => `Grenzen en namen komen uit een OpenStreetMap-extract van ${date}. Je voortgang blijft in je eigen browser en kun je als JSON exporteren.`,
    provinces: 'Provincies',
    regions: 'Gewesten',
    units: (n) => `${n} gemeenten`,
    allProvinces: 'Alle provincies en gewesten op één pagina',
    booting: 'De kaart wordt geladen…',
    noscript: 'Het spel zelf heeft JavaScript nodig. De lijsten hieronder werken zonder.',
  },
  fr: {
    title: (n) => `Apprenez les ${n} communes belges`,
    description: (n) => `Un jeu de carte gratuit : une commune est nommée, vous la cliquez. Les ${n} communes belges, à jour après les fusions de 2025.`,
    heading: (n) => `Apprenez les ${n} communes belges`,
    rules: 'Une commune est nommée. Vous cliquez sur sa forme sur la carte. Si vous vous trompez, elle revient plus tard dans la manche, jusqu’à ce que vous ne vous trompiez plus.',
    current: (n) => `La Belgique compte ${n} communes depuis les fusions du 1er janvier 2025. La plupart des quiz en ligne en demandent encore 581 ; celui-ci utilise la liste actuelle.`,
    data: (date) => `Les limites et les noms proviennent d’un extrait OpenStreetMap du ${date}. Votre progression reste dans votre propre navigateur et s’exporte en JSON.`,
    provinces: 'Provinces',
    regions: 'Régions',
    units: (n) => `${n} communes`,
    allProvinces: 'Toutes les provinces et régions sur une page',
    booting: 'Chargement de la carte…',
    noscript: 'Le jeu lui-même a besoin de JavaScript. Les listes ci-dessous fonctionnent sans.',
  },
  en: {
    title: (n) => `Learn all ${n} Belgian municipalities`,
    description: (n) => `A free map game: a municipality is named, you click it. All ${n} Belgian municipalities, current after the 2025 mergers.`,
    heading: (n) => `Learn all ${n} Belgian municipalities`,
    rules: 'A municipality is named. You click its shape on the map. Miss it and it comes back later in the round, until you stop missing it.',
    current: (n) => `Belgium has ${n} municipalities since the mergers of 1 January 2025. Most quizzes online still ask for the 581 that existed before that; this one uses the current list.`,
    data: (date) => `Boundaries and names come from an OpenStreetMap extract of ${date}. Your progress stays in your own browser and can be exported as JSON.`,
    provinces: 'Provinces',
    regions: 'Regions',
    units: (n) => `${n} municipalities`,
    allProvinces: 'Every province and region on one page',
    booting: 'Loading the map…',
    noscript: 'The game itself needs JavaScript. The lists below do not.',
  },
};
