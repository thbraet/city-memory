// Dutch copy for the generated pages, in the Belgian variant.
//
// The distinction is not cosmetic. A Dutch reader in Belgium looks for
// "gemeenten", "provincie" and "gewest"; the Netherlands would say "gemeentes"
// and has no gewesten at all, and a page that mixes the two registers reads as
// translated-from-English to exactly the people this site is for. So: gemeenten
// (not gemeentes), gewest (not regio), and the reader is addressed as "je",
// because a fair share of them are schoolchildren doing topografie homework.
//
// Dutch takes the bare paths in geo.mjs's ROUTES, which makes these the pages
// most visitors land on. Titles and descriptions are therefore written as the
// search queries they have to match — "gemeenten van Antwerpen", "kaart",
// "oefenen" — rather than as translations of the English titles.
//
// Sections municipality / about / privacy / terms / legalNotice are absent on
// purpose: index.mjs serves them from en.mjs whatever the page language is.
// See the translation notes at the top of en.mjs for the rules on placeholders,
// HTML and the ...Link arguments.

export const strings = {
  lang: 'nl',

  // ------------------------------------------------------------------ shared
  common: {
    // De vaste onderdelen van elke pagina. Kort houden: ze staan in een navigatiebalk.
    nav: {
      skip: 'Naar de inhoud',
      play: 'Spelen',
      provinces: 'Provincies',
      api: 'API',
      about: 'Over',
      language: 'Taal',
    },
    footer: {
      attribution: ({ osmLink }) => `Grenzen © ${osmLink('OpenStreetMap-bijdragers')}, ODbL. Namen en vormen komen uit een OSM-extract en kunnen achterlopen op de werkelijkheid.`,
      about: 'Over',
      privacy: 'Privacy',
      terms: 'Voorwaarden',
      legal: 'Juridische informatie',
      api: 'API',
      source: 'Broncode',
      kofi: 'Trakteer me op een koffie',
      sponsor: 'Sponsor',
      cookies: 'Cookie-instellingen',
    },
    crumbHome: 'City Memory',
    crumbProvinces: 'Provincies',

    // Only the page furniture is translated here. The municipality pages take
    // their province name straight from the data, so Liège stays Liège there
    // while the province page says Luik. That is how a Belgian writes it in
    // each context anyway, and fixing the "inconsistency" would mean renaming
    // places in the API.
    provinceNames: {
      'antwerpen': 'Antwerpen',
      'brussels': 'Brussel',
      'vlaams-brabant': 'Vlaams-Brabant',
      'brabant-wallon': 'Waals-Brabant',
      'west-vlaanderen': 'West-Vlaanderen',
      'oost-vlaanderen': 'Oost-Vlaanderen',
      'hainaut': 'Henegouwen',
      'liege': 'Luik',
      'limburg': 'Limburg',
      'luxembourg': 'Luxemburg',
      'namur': 'Namen',
    },
    // The constitutional term, not "Vlaanderen" and "Wallonië". Those are
    // places; a gewest is one of the three units the municipalities are
    // actually divided over, and Brussels only exists as one. Every one of the
    // three takes "het", which the sentences below rely on.
    regionNames: {
      flanders: 'Vlaams Gewest',
      wallonia: 'Waals Gewest',
      brussels: 'Brussels Hoofdstedelijk Gewest',
    },

    // Under every map. The credit is required by the ODbL, so keep it.
    figureCaption: ({ caption }) => `${caption}. Grenzen © OpenStreetMap-bijdragers.`,

    tableHeaders: {
      name: 'Gemeente',
      nis: 'NIS',
      area: 'Oppervlakte',
      neighbours: 'Buurgemeenten',
    },
  },

  // -------------------------------------------------------- the province list
  provinceIndex: {
    meta: {
      title: 'Provincies en gewesten van België',
      description: 'De elf Belgische provincies en de drie gewesten, met per stuk het aantal gemeenten, de oppervlakte en een kaart.',
    },
    h1: 'De provincies van België',
    // The merger date is in here because a Belgian reading "565" will wonder
    // whether the page is current; the sentence answers that before it is
    // asked. The comparison with the old 581 stays on the home page, where
    // game.mjs makes it once.
    lede: ({ count }) => `België telt sinds de fusies van 2025 ${count} gemeenten, verdeeld over
  drie gewesten en — als je het Brussels Hoofdstedelijk Gewest als één provincie meetelt —
  elf provincies. Kies er een om de kaart te bekijken, de lijst met gemeenten en hun
  oppervlakte, of om ze in het spel te oefenen.`,
    regionSummary: ({ count, area }) => `${count} gemeenten · ${area} km²`,
    provinceSummary: ({ count, area }) => `${count} gemeenten · ${area} km²`,
    wholeCountryHeading: 'Het hele land in één keer',
    wholeCountryCta: ({ count }) => `Oefen alle ${count} gemeenten`,
  },

  // ------------------------------------------------------------- one province
  province: {
    meta: {
      // "De 67 gemeenten van Antwerpen" over a literal rendering of the
      // English: it is the phrase people type, and the count in the title is
      // what tells them at a glance that the list is post-merger.
      title: ({ name, count }) => `De ${count} gemeenten van ${name}`,
      description: ({ name, count }) => `Alle ${count} gemeenten van ${name} op een kaart, met oppervlakte en de namen in het Nederlands, Frans en Duits. Oefen ze op een interactieve kaart.`,
    },
    lede: ({ name, count, area, region, prefixes }) => `${name} telt ${count} gemeenten en
  beslaat ${area} km², in het ${region}. De NIS-codes beginnen er met ${prefixes}.`,
    mapCaption: ({ name, count }) => `Kaart van de ${count} gemeenten van ${name}`,
    cta: ({ name }) => `Oefen ${name} in het spel`,
    listHeading: ({ count }) => `Alle ${count} gemeenten`,
    extremes: ({ biggest, biggestArea, smallest, smallestArea }) => `De grootste is ${biggest} met
  ${biggestArea} km², de kleinste ${smallest} met ${smallestArea} km².`,
    dataHeading: 'De gegevens',
    dataNote: ({ apiLink, geoLink }) => `Alles op deze pagina zit ook in de
  ${apiLink('API')}, samen met de grenzen als ${geoLink('GeoJSON')}.`,
  },

  // --------------------------------------------------------------- one region
  region: {
    meta: {
      title: ({ name, count }) => `De ${count} gemeenten van het ${name}`,
      description: ({ name }) => `Elke gemeente van het ${name} op een kaart, met oppervlakte en de namen in het Nederlands, Frans en Duits.`,
    },
    // Brussel is one gewest and one province at the same time, so the clause
    // about provinces is dropped there rather than reading "over 1 provincies".
    lede: ({ name, count, area, provinces }) => `Het ${name} telt ${count} gemeenten en
  beslaat ${area} km²${provinces > 1 ? `, verdeeld over ${provinces} provincies` : ''}.`,
    mapCaption: ({ name, count }) => `Kaart van de ${count} gemeenten van het ${name}`,
    cta: ({ name }) => `Oefen het ${name} in het spel`,
    provincesHeading: 'Provincies',
    provinceSummary: ({ count }) => `${count} gemeenten`,
    listHeading: ({ count }) => `Alle ${count} gemeenten`,
  },
};
