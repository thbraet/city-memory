// French copy for the generated pages. Belgian French, not French from France.
//
// Three choices that look like mistakes to a reader in Paris and are not:
//
//  - "commune", never "municipalité". A Belgian commune is a commune; the other
//    word belongs to Quebec and to translations out of English.
//  - The regions are written out as administrative bodies — Région flamande,
//    Région wallonne, Région de Bruxelles-Capitale — rather than as "la Flandre"
//    and "la Wallonie". These pages group municipalities by the entity the NIS
//    code belongs to, and the territory and the institution are not the same.
//  - The reader is "vous". A public site used by schools and by adults that
//    switched to "tu" would read as trying to be liked.
//
// The structural problem French has here and English does not: the names arrive
// from a table and their articles do not agree. Le Hainaut, le Limbourg, but
// Anvers and Namur bare. "Les communes de ${name}" would produce "de le
// Hainaut", so no sentence below puts a preposition in front of a province
// name. A province name is the subject of its sentence, or it sits in front of
// a colon. Every region name starts with the feminine "Région", so those
// sentences can safely say "la ${name}".
//
// The spaces before ; and : are U+202F, the narrow no-break space. They are
// invisible in a diff, so do not retype one as an ordinary space: that is what
// lets the punctuation wrap onto the next line on a narrow screen. Nothing in
// this file contains <, > or &, so none of it interacts with esc() in
// layout.mjs beyond passing through it.
//
// Sections municipality, about, privacy, terms and legalNotice are deliberately
// absent; index.mjs serves those from en.mjs whatever the page language is.

export const strings = {
  lang: 'fr',

  // ------------------------------------------------------------------ shared
  common: {
    // Les éléments fixes de chaque page. Libellés courts : ils tiennent dans une barre de navigation.
    nav: {
      skip: 'Aller au contenu',
      play: 'Jouer',
      provinces: 'Provinces',
      api: 'API',
      about: 'À propos',
      language: 'Langue',
    },
    footer: {
      attribution: ({ osmLink }) => `Limites © ${osmLink('les contributeurs d\u2019OpenStreetMap')}, ODbL. Les noms et les tracés proviennent d\u2019un extrait OSM et peuvent accuser un retard sur la réalité.`,
      about: 'À propos',
      privacy: 'Confidentialité',
      terms: 'Conditions',
      legal: 'Mentions légales',
      api: 'API',
      source: 'Code source',
      kofi: 'Offrez-moi un café',
      sponsor: 'Sponsor',
      cookies: 'Paramètres des cookies',
    },
    crumbHome: 'City Memory',
    crumbProvinces: 'Provinces',

    provinceNames: {
      'antwerpen': 'Anvers',
      'brussels': 'Bruxelles-Capitale',
      'vlaams-brabant': 'Brabant flamand',
      'brabant-wallon': 'Brabant wallon',
      'west-vlaanderen': 'Flandre-Occidentale',
      'oost-vlaanderen': 'Flandre-Orientale',
      'hainaut': 'Hainaut',
      'liege': 'Liège',
      'limburg': 'Limbourg',
      'luxembourg': 'Luxembourg',
      'namur': 'Namur',
    },
    regionNames: {
      flanders: 'Région flamande',
      wallonia: 'Région wallonne',
      brussels: 'Région de Bruxelles-Capitale',
    },

    // The credit is required by the ODbL, so keep it. "les contributeurs
    // OpenStreetMap" is the wording the francophone OSM community uses itself.
    figureCaption: ({ caption }) => `${caption}. Limites © les contributeurs OpenStreetMap.`,

    tableHeaders: {
      name: 'Commune',
      nis: 'NIS',
      area: 'Superficie',
      neighbours: 'Limitrophes',
    },
  },

  // -------------------------------------------------------- the province list
  provinceIndex: {
    meta: {
      title: 'Provinces de Belgique',
      description: 'Les onze provinces belges et les trois régions, avec pour chacune son nombre de communes, sa superficie et sa carte.',
    },
    h1: 'Les provinces de Belgique',
    lede: ({ count }) => `La Belgique compte ${count} communes, réparties entre trois régions
  et, Bruxelles-Capitale comptant pour une, onze provinces. Choisissez-en une pour voir sa
  carte, ses communes et la superficie de chacune, ou pour vous y entraîner dans le jeu.`,
    regionSummary: ({ count, area }) => `${count} communes · ${area} km²`,
    provinceSummary: ({ count, area }) => `${count} communes · ${area} km²`,
    wholeCountryHeading: 'Tout le pays en une fois',
    wholeCountryCta: ({ count }) => `S’entraîner sur les ${count} communes`,
  },

  // ------------------------------------------------------------- one province
  province: {
    meta: {
      // People search for "communes du Hainaut" and for "carte", so both words
      // are in the title. The name stays in front of the dash because that is
      // what the reader recognises in a list of results.
      title: ({ name, count }) => `${name} — carte et liste des ${count} communes`,
      description: ({ name, count }) => `${name} : les ${count} communes, avec la carte, les superficies et les noms en néerlandais, en français et en allemand. Exercez-vous à les situer sur une carte interactive.`,
    },
    lede: ({ name, count, area, region, prefixes }) => `${name} compte ${count} communes
  réparties sur ${area} km², en ${region}. Ses codes NIS commencent par ${prefixes}.`,
    mapCaption: ({ name, count }) => `${name} : carte des ${count} communes`,
    cta: ({ name }) => `S’entraîner sur ${name} dans le jeu`,
    listHeading: ({ count }) => `Les ${count} communes`,
    extremes: ({ biggest, biggestArea, smallest, smallestArea }) => `La plus étendue est ${biggest},
  avec ${biggestArea} km² ; la plus petite est ${smallest}, avec ${smallestArea} km².`,
    dataHeading: 'Les données',
    dataNote: ({ apiLink, geoLink }) => `Tout ce qui figure sur cette page se trouve dans
  l’${apiLink('API')}, avec les limites en ${geoLink('GeoJSON')}.`,
  },

  // --------------------------------------------------------------- one region
  region: {
    meta: {
      title: ({ name, count }) => `${name} — carte et liste des ${count} communes`,
      description: ({ name }) => `${name} : toutes les communes, avec la carte, les superficies et les noms en néerlandais, en français et en allemand.`,
    },
    // Bruxelles-Capitale is a region and a province at once, so the clause about
    // provinces is dropped there rather than reading "dans 1 provinces".
    lede: ({ name, count, area, provinces }) => `La ${name} compte ${count} communes
  réparties sur ${area} km²${provinces > 1 ? `, dans ${provinces} provinces` : ''}.`,
    mapCaption: ({ name, count }) => `${name} : carte des ${count} communes`,
    cta: ({ name }) => `S’entraîner sur la ${name} dans le jeu`,
    provincesHeading: 'Provinces',
    provinceSummary: ({ count }) => `${count} communes`,
    listHeading: ({ count }) => `Les ${count} communes`,
  },
};
