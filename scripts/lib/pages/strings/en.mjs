// English copy for the generated pages.
//
// HOW TO TRANSLATE THIS FILE
//
// Copy it to nl.mjs or fr.mjs, change `lang`, and rewrite the text. Keep every
// key exactly as it is here: the loader in index.mjs compares your file against
// this one key by key and stops the build if one is missing, because a page
// that silently falls back to English is worse than a build that refuses.
//
// A value is either a piece of text or a small function. A function is used
// where the sentence needs a number or a name in it, and it receives one object
// with named fields, so you can move them anywhere in the sentence or ignore
// the ones your language does not need:
//
//   cta: ({ name }) => `Drill ${name} in the game`
//
// The ${...} pieces are placeholders. Keep the ones you use spelled exactly as
// they appear; the rest of the line is yours. A function may also branch, which
// is how singular and plural, or "in 3 provinces" versus nothing at all, are
// handled — see `region.lede` below.
//
// Five rules that matter:
//
//  1. Values are HTML. A `<strong>` or an `<a href="/privacy">` in the text goes
//     into the page as a tag, not as visible angle brackets. Translate the words
//     between the tags and leave the tags alone.
//  2. Anything passed into a function is already safe to drop into HTML. Do not
//     try to escape it again.
//  3. An argument whose name ends in `Link` is a function, not text. Call it
//     with the words that should become the link: `${privacyLink('privacy
//     policy')}`. You choose the words and where in the sentence they sit; the
//     address is decided by the code.
//  4. The `meta` block on each page is plain text, not HTML — it becomes the
//     browser tab title and the search-result snippet, where a tag would show up
//     literally. Same for `common.tableHeaders` and the map captions, which are
//     also read out by screen readers.
//  5. The `lang` field at the top must match the file name.
//
// Sections `municipality`, `about`, `privacy`, `terms` and `legalNotice` are
// English-only for now; index.mjs serves them from this file whatever the page
// language is, so a translation may leave them out. The four sections above
// them are required of every language.

export const strings = {
  lang: 'en',

  // ------------------------------------------------------------------ shared
  common: {
    // The furniture every page carries. Short labels: they sit in a nav bar.
    nav: {
      skip: 'Skip to content',
      play: 'Play',
      provinces: 'Provinces',
      api: 'API',
      about: 'About',
      language: 'Language',
    },
    footer: {
      attribution: ({ osmLink }) => `Boundaries © ${osmLink('OpenStreetMap contributors')}, ODbL. Names and shapes are an OSM extract and may lag reality.`,
      about: 'About',
      privacy: 'Privacy',
      terms: 'Terms',
      legal: 'Legal notice',
      api: 'API',
      source: 'Source',
      kofi: 'Buy me a coffee',
      sponsor: 'Sponsor',
      cookies: 'Cookie settings',
    },
    crumbHome: 'City Memory',
    crumbProvinces: 'Provinces',

    // The eleven provinces and three regions as this language writes them. The
    // official name is the one on the page; this is only how it is spelled for
    // a reader of this language, so leave a name alone where there is no
    // established translation.
    provinceNames: {
      'antwerpen': 'Antwerp',
      'brussels': 'Brussels-Capital',
      'vlaams-brabant': 'Flemish Brabant',
      'brabant-wallon': 'Walloon Brabant',
      'west-vlaanderen': 'West Flanders',
      'oost-vlaanderen': 'East Flanders',
      'hainaut': 'Hainaut',
      'liege': 'Liège',
      'limburg': 'Limburg',
      'luxembourg': 'Luxembourg',
      'namur': 'Namur',
    },
    regionNames: {
      flanders: 'Flanders',
      wallonia: 'Wallonia',
      brussels: 'Brussels-Capital',
    },

    // Under every map. The credit is required by the ODbL, so keep it.
    figureCaption: ({ caption }) => `${caption}. Boundaries © OpenStreetMap contributors.`,

    tableHeaders: {
      name: 'Municipality',
      nis: 'NIS',
      area: 'Area',
      neighbours: 'Borders',
    },
  },

  // -------------------------------------------------------- the province list
  provinceIndex: {
    meta: {
      title: 'Provinces of Belgium',
      description: 'All eleven Belgian provinces and three regions, with the number of municipalities and surface area of each, and a map of every one.',
    },
    h1: 'The provinces of Belgium',
    lede: ({ count }) => `Belgium has ${count} municipalities, spread over three regions and — counting
  Brussels-Capital as one — eleven provinces. Pick one to see its map, its municipalities
  and how big each of them is, or to drill it in the game.`,
    regionSummary: ({ count, area }) => `${count} municipalities · ${area} km²`,
    provinceSummary: ({ count, area }) => `${count} municipalities · ${area} km²`,
    wholeCountryHeading: 'The whole country at once',
    wholeCountryCta: ({ count }) => `Drill all ${count} municipalities`,
  },

  // ------------------------------------------------------------- one province
  province: {
    meta: {
      title: ({ name, count }) => `${name} — its ${count} municipalities`,
      description: ({ name, count }) => `All ${count} municipalities of ${name}, with a map, surface areas and names in Dutch, French and German. Drill them on an interactive map.`,
    },
    lede: ({ name, count, area, region, prefixes }) => `${name} has ${count} municipalities across
  ${area} km², in ${region}. Its NIS codes start with ${prefixes}.`,
    mapCaption: ({ name, count }) => `Map of the ${count} municipalities of ${name}`,
    cta: ({ name }) => `Drill ${name} in the game`,
    listHeading: ({ count }) => `All ${count} municipalities`,
    extremes: ({ biggest, biggestArea, smallest, smallestArea }) => `The largest is ${biggest} at ${biggestArea} km²;
  the smallest is ${smallest} at ${smallestArea} km².`,
    dataHeading: 'The data',
    dataNote: ({ apiLink, geoLink }) => `Everything on this page is in the
  ${apiLink('API')}, along with the boundaries as ${geoLink('GeoJSON')}.`,
  },

  // --------------------------------------------------------------- one region
  region: {
    meta: {
      title: ({ name, count }) => `${name} — its ${count} municipalities`,
      description: ({ name }) => `Every municipality in ${name}, with a map, surface areas and names in Dutch, French and German.`,
    },
    // Brussels-Capital is one region and one province, so the clause about
    // provinces is left off there rather than reading "in 1 provinces".
    lede: ({ name, count, area, provinces }) => `${name} has ${count} municipalities across
  ${area} km²${provinces > 1 ? `, in ${provinces} provinces` : ''}.`,
    mapCaption: ({ name, count }) => `Map of the ${count} municipalities of ${name}`,
    cta: ({ name }) => `Drill ${name} in the game`,
    provincesHeading: 'Provinces',
    provinceSummary: ({ count }) => `${count} municipalities`,
    listHeading: ({ count }) => `All ${count} municipalities`,
  },

  // --------------------------------------------------- one municipality (565)
  // These pages exist once, not once per language, and already carry the Dutch,
  // French and German name of the place. Three near-identical translations of
  // "Liège is in the province of Liège" is what Google calls scaled content
  // abuse, and it would put the whole site at risk for no extra reader.
  municipality: {
    meta: {
      title: ({ name }) => `${name} — where it is on the map`,
      description: ({ name, nis, province, area, neighbours }) => `${name} (NIS ${nis}) is a municipality in ${province}, ${area} km², bordering ${neighbours} others. See its outline and learn to place it.`,
    },
    lede: ({ name, province, region, area, parts, neighbours }) => `${name} is a municipality in ${province},
  ${region}. It covers ${area} km²${parts > 1 ? ` in ${parts} separate pieces` : ''} and borders
  ${neighbours} other municipalit${neighbours === 1 ? 'y' : 'ies'}.`,
    shapeCaption: ({ name }) => `The outline of ${name}`,
    facts: {
      nis: 'NIS code',
      province: 'Province',
      region: 'Region',
      area: 'Area',
      centre: 'Centre',
    },
    coordinates: ({ lat, lon }) => `${lat}° N, ${lon}° E`,
    // Only rendered for a name that actually differs from the displayed one.
    // "Aartselaar, known in French as Aartselaar" is noise, and noise on 565
    // pages is exactly what makes a site look automated.
    inLanguage: ({ language }) => `In ${language}`,
    languageNames: { nl: 'Dutch', fr: 'French', de: 'German' },
    bordersHeading: 'Borders',
    bordersLede: ({ name }) => `${name} shares a border with:`,
    noBorders: ({ name }) => `${name} shares no land border with another Belgian municipality.`,
    learnHeading: 'Learn where it is',
    learnText: ({ name, province, count }) => `${name} is one of ${count} municipalities in ${province}.
  The game names one and asks you to click it on the map; miss it and it comes back.`,
    learnCta: ({ province }) => `Drill ${province}`,
    apiHeading: 'In the API',
    apiNote: ({ endpointLink, nis }) => `${endpointLink(`<code>/api/v1/municipalities/${nis}.json</code>`)}
  — the same facts as JSON, with the boundary as GeoJSON.`,
  },

  // ------------------------------------------------------------------- /about
  about: {
    meta: {
      title: 'About',
      description: ({ count }) => `What City Memory is, where its data comes from, and who runs it. A free game for learning all ${count} Belgian municipalities.`,
    },
    h1: 'About City Memory',
    lede: `A municipality is named. You click its shape on the map. Miss it and it
  comes back later in the round, until you stop missing it.`,
    whyHeading: 'Why it exists',
    why1: ({ count }) => `Belgium has ${count} municipalities. Most people who live here can place a
  few dozen and guess at the rest. There is no trick to learning them — you have to meet
  each one repeatedly, get it wrong, and meet it again — which is exactly the kind of
  thing software is good at arranging.`,
    why2: `So the game is spaced repetition with a map instead of flashcards. Two correct clicks
  in a row retire a municipality for the round; a miss puts it back a few prompts later.
  Your progress is kept in your own browser, per NIS code, and you can export it as JSON.`,
    dataHeading: 'Where the data comes from',
    data1: ({ osmLink, extractDate }) => `Boundaries and names are an extract of ${osmLink('OpenStreetMap')},
  taken on ${extractDate}, filtered to Belgian
  <code>admin_level=8</code> areas that carry a NIS code. Names in Dutch, French and German
  come from OSM's own name tags, from Wikidata where OSM is silent, and from a small
  hand-kept override file where both are wrong.`,
    data2: `The display rule is the one the country uses: the local official name first — Dutch in
  Flanders, French in Wallonia, German in the German-speaking Community — with the other
  language second, and both equally in Brussels.`,
    data3: ({ statbelLink }) => `None of this is authoritative. It is OpenStreetMap, which means it is what mappers have
  recorded, and it can lag a merger or carry a mistake. Where it matters, check with the
  ${statbelLink('Belgian statistical office')}.`,
    apiHeading: 'The API',
    api: ({ apiLink }) => `The same data is published as a ${apiLink('free public API')} — names, NIS codes,
  centroids, surface areas, which municipalities border which, and boundaries as GeoJSON.
  No key, no quota. If you build something with it, it cost nothing and that is the point.`,
    ownerHeading: 'Who runs it',
    ownerNamed: ({ name, country, emailLink, email }) => `City Memory is run by ${name} in ${country}.
  Questions, corrections and bug reports: ${emailLink(email)}.`,
    ownerAnonymous: ({ legalLink }) => `City Memory is run by one person in Belgium, as a side project. The
  ${legalLink('legal notice')} carries the formal contact details.`,
    source: ({ repoLink }) => `The source is on ${repoLink('GitHub')} under the MIT
  licence. Corrections to the map data are better sent to OpenStreetMap than to me — fix it
  there and it reaches everyone, including this site at the next rebuild.`,
    adsHeading: 'How it pays for itself',
    ads: ({ privacyLink }) => `The site carries advertising. Hosting costs nothing, so what the ads bring in goes
  towards the domain name and, if there is ever anything left, the time. What the ads do
  with your data — and how to say no — is in the ${privacyLink('privacy policy')}.`,
    supportHeading: 'Supporting it',
    // kofiLink and sponsorsLink are each either a link function or null,
    // depending on which accounts exist.
    support: ({ kofiLink, sponsorsLink }) => {
      const offers = [kofiLink?.('buy me a coffee'), sponsorsLink?.('sponsor the project')].filter(Boolean);
      return `If it was useful, ${offers.join(' or ')}. It stays free either way.`;
    },
  },

  // ----------------------------------------------------------------- /privacy
  // An Article 13 GDPR notice. Its precision matters more than its prose: if a
  // sentence here is ambiguous in translation, prefer the clumsier wording that
  // says the same thing as the English.
  privacy: {
    meta: {
      title: 'Privacy',
      description: 'What City Memory stores, what it sends to third parties, and how to withdraw consent. Written under Article 13 GDPR.',
    },
    h1: 'Privacy',
    lede: ({ ads }) => `The short version: your progress never leaves your browser, and this site
  has no server that could collect anything${ads ? '. Advertising is the one exception, and it only runs if you agree to it' : ' and no advertising'}.`,
    updated: ({ date }) => `Last updated ${date}. Written
  to satisfy Article 13 of the GDPR.`,

    controllerHeading: 'Who is responsible',
    controller: ({ controller }) => `The controller for any personal data processed here is ${controller}.`,
    controllerNamed: ({ name, country, emailLink, email }) => `${name}, ${country} — ${emailLink(email)}`,
    controllerAnonymous: ({ legalLink }) => `the operator named in the ${legalLink('legal notice')}`,

    deviceHeading: 'What stays on your device',
    device: `Your game progress — which municipalities you have seen, how often you were right, your
  current streak per NIS code — is written to <code>localStorage</code> in your own browser.
  It is never transmitted anywhere. There is no account, no sign-up and no server to hold it.
  Clearing your browser data erases it, which is also the only way it can be erased, because
  nobody else has a copy.`,
    cookieTable: {
      headers: { key: 'Key', kind: 'Kind', purpose: 'Purpose', kept: 'Kept for' },
      progress: { key: '<code>city-memory:progress</code>', kind: 'localStorage', purpose: 'Your per-municipality progress', kept: 'Until you clear it' },
      adsGeneral: { key: 'Google advertising cookies', kind: 'Third-party cookies', purpose: 'Serving and measuring ads; personalisation only with consent', kept: "Up to 24 months, per Google's policy" },
      adsNamed: { key: '<code>__gpi</code>, <code>__gads</code>, consent string', kind: 'Third-party cookies', purpose: 'Ad delivery, frequency capping and your recorded consent choice', kept: 'Up to 13 months' },
    },

    logsHeading: 'Server logs',
    logs: `The site is static files served by Cloudflare. Their edge records the usual request
  metadata — IP address, time, path, user agent — for delivery and abuse prevention, as any
  web server must. That processing is Cloudflare's, under their own terms, and nothing from
  it reaches me in identifiable form.`,

    analyticsHeading: 'Audience measurement',
    analytics: `Visitor counts come from Cloudflare Web Analytics, which sets no cookie and writes
  nothing to your device. It records a page view without building a profile and without
  following you to other sites. Because it stores nothing on your device, it is outside the
  consent requirement of Article 5(3) of the ePrivacy Directive and runs for everyone.`,

    adsHeading: 'Advertising',
    adsNone: `There is none. No ad network is loaded, no ad script is requested, and no third party
  is told that you visited.`,
    adsWho: `Ads are served by Google (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4,
  Ireland). To do that, Google and its partners may read and write cookies and similar
  identifiers on your device, and may process your IP address.`,
    adsBasis: `<strong>Legal basis: your consent</strong>, under Article 6(1)(a) GDPR. You are asked
  before any of it happens, through Google's consent dialogue. Until you choose, this site
  signals to Google that ad storage, ad personalisation, ad user data and analytics storage
  are all denied.`,
    adsRefusal: `If you refuse, you still get the game; you may see non-personalised ads, which are
  chosen from the page's content rather than from anything about you.`,
    adsWithdrawal: `<strong>Withdrawing consent</strong> is as easy as giving it: the “Cookie settings” link
  at the bottom of every page reopens the dialogue, and your new choice takes effect
  immediately. You can also clear the cookies in your browser.`,
    adsVendors: ({ vendorListLink }) => `The vendors who may be involved are listed in Google's
  ${vendorListLink('certified vendor list')}.
  Some of them are outside the EEA; Google relies on the European Commission's adequacy
  decision for the US and on standard contractual clauses elsewhere.`,

    neverHeading: 'What is never done',
    never: ({ ads }) => [
      'No account, no email address collected, no newsletter.',
      `No selling or sharing of data with anyone${ads ? ' beyond the advertising described above' : ''}.`,
      'No profiling of you by this site, and no automated decision-making.',
      'No tracking pixels, social widgets or embedded videos.',
    ],

    rightsHeading: 'Your rights',
    rights: `Under the GDPR you have the right of access, rectification, erasure, restriction of
  processing, objection, and data portability, and the right to withdraw consent at any time
  without affecting what was lawful before you did.`,
    rightsPractical: ({ ads, adCentreLink, legalLink }) => `Practically: the only data this site holds about you is in your own browser, so access,
  portability and erasure are all in your hands — export your progress from the
  <em>Progress data</em> screen, or clear it there. ${ads
    ? `For anything Google holds, use Google's own privacy controls at ${adCentreLink('My Ad Center')}.`
    : `For anything else, write to the address in the ${legalLink('legal notice')}.`}`,
    supervisoryAuthority: ({ dpaLink }) => `You can complain to the Belgian data protection authority: Gegevensbeschermingsautoriteit /
  Autorité de protection des données, Drukpersstraat 35, 1000 Brussel —
  ${dpaLink('gegevensbeschermingsautoriteit.be')}.`,

    childrenHeading: 'Children',
    children: ({ ads }) => `The game is suitable for school-age players and asks nothing of them. No data is
  knowingly collected from anyone, at any age${ads ? ', and ads are not personalised for users Google identifies as children' : ''}.`,

    changesHeading: 'Changes',
    changes: ({ repoLink }) => `If this notice changes materially, the date at the top changes with it. The history of
  every version is public in the ${repoLink('repository')}.`,
  },

  // ------------------------------------------------------------------- /terms
  terms: {
    meta: {
      title: 'Terms',
      description: 'The terms for using City Memory and its public API, including what the ODbL requires when you redistribute the data.',
    },
    h1: 'Terms',
    lede: `Use it freely. It is given as it is, and the data belongs to
  OpenStreetMap's contributors rather than to me.`,

    gameHeading: 'The game',
    game: `Free to use, for anyone, including in a classroom. No account, no licence to accept,
  no attribution asked for. If a teacher wants to put it in front of thirty pupils, that is
  exactly what it is for.`,

    apiHeading: 'The API',
    apiIntro: ({ apiLink }) => `The ${apiLink('public API')} is free and unauthenticated. There are no rate limits
  because there is no server to overload — it is static files behind a CDN. Two requests:`,
    apiRequests: [
      `Cache what you fetch rather than requesting the same file in a loop. The data changes
    a few times a year at most.`,
      `If it becomes load-bearing for you, copy the files and serve them yourself. That is
    allowed, it is faster for you, and it means an outage here is not an outage there.`,
    ],
    apiVersioning: `The API is versioned in its path. <code>/api/v1/</code> will not change shape
  incompatibly; a breaking change becomes <code>/api/v2/</code>. That said, this is a free
  service run by one person and it comes with no availability promise of any kind.`,

    licenceHeading: 'The data licence, in plain terms',
    licenceIntro: ({ odblLink }) => `Boundaries and names derive from OpenStreetMap and are licensed under the
  ${odblLink('Open Database License 1.0')}.
  What that means for you:`,
    licencePoints: [
      `<strong>If you display it</strong> — a map, an app, a graphic — credit
    “© OpenStreetMap contributors” where the people looking at it can see it. That is a
    Produced Work, and attribution is all that is required.`,
      `<strong>If you redistribute the data itself</strong>, or a database you built from
    it, that database has to be offered under the ODbL as well, and you have to say what you
    changed.`,
    ],
    licenceSummary: `In short: use the numbers, credit the mappers, and keep derived databases open.`,

    codeHeading: 'The code',
    code: ({ repoLink }) => `The site's source is MIT-licensed and on ${repoLink('GitHub')}.
  Fork it, run your own copy, point it at another country if you like.`,

    warrantyHeading: 'No warranty',
    warranty: `City Memory is provided “as is”, without warranty of any kind. The boundaries are an
  OpenStreetMap extract, not a cadastral record: they can be out of date, simplified, or
  simply wrong, and they are simplified deliberately so the map draws quickly. Do not use
  them for anything where being wrong has consequences — legal, administrative, navigational
  or otherwise. To the extent the law allows, I am not liable for any loss arising from use
  of this site or its data.`,

    useHeading: 'Acceptable use',
    use: `Do not attempt to break the site, and do not redistribute it in a way that implies it is
  yours or that it is official. Beyond that, there is nothing here to abuse.`,
  },

  // ------------------------------------------------------------------- /legal
  legalNotice: {
    meta: {
      title: 'Legal notice',
      description: 'Who operates City Memory, as required by Article XII.6 of the Belgian Code of Economic Law.',
    },
    h1: 'Legal notice',
    basis: `Published under Article XII.6 of the Belgian Code of Economic Law, which
  requires an online service to identify who is behind it.`,
    facts: {
      operator: 'Operator',
      address: 'Address',
      country: 'Country',
      email: 'Email',
      enterpriseNumber: 'Enterprise number',
      vat: 'VAT',
    },
    incomplete: `<strong>These details are not filled in yet.</strong> City Memory is currently run as a
    personal, non-commercial project. Before advertising is switched on, this page must carry
    the operator's name, a geographic address and contact details — see
    <code>MANUAL-STEPS.md</code> in the repository.`,
    // Two versions, because with no repository configured there is no issue
    // tracker to point at, and a legal notice is the last page on the site that
    // should carry a link to nowhere.
    incompleteMeanwhile: ({ issuesLink }) => `In the meantime: the site is operated by a private individual in Belgium and carries no
  advertising. Contact runs through the ${issuesLink('issue tracker')}.`,
    incompleteNoContact: 'In the meantime: the site is operated by a private individual in Belgium and carries no advertising.',

    hostingHeading: 'Hosting',
    hosting: `The site is static files served by Cloudflare, Inc., 101 Townsend St, San Francisco,
  CA 94107, United States.`,

    contentHeading: 'Content',
    content: ({ termsLink }) => `Map data © OpenStreetMap contributors, under the ODbL. Site code under the MIT licence.
  See the ${termsLink('terms')} for what that allows.`,

    disputeHeading: 'Dispute resolution',
    dispute: ({ odrLink }) => `The European Commission's online dispute resolution platform is at
  ${odrLink('ec.europa.eu/consumers/odr')}.
  Nothing is sold here, so it is unlikely to be needed.`,
  },
};
