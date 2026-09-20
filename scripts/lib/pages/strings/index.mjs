// The copy for the generated pages, one bundle per language.
//
// en.mjs is the reference. Every other bundle is checked against it before it is
// used, key by key, and a bundle that is missing one stops the build. The
// alternative — quietly substituting the English sentence — produces a page that
// looks finished, reads as half-translated to the only people who would have
// reported it, and tells Google the page is Dutch while a third of it is not.
// A build that refuses is cheaper than that every time.
//
// Two deliberate softenings of that rule:
//
//   - A language with no bundle at all falls back to English wholesale, so the
//     site keeps building while nl.mjs and fr.mjs are being written. That is
//     announced in the build log, loudly, because it is a temporary state and an
//     unnoticed temporary state is a permanent one.
//   - The sections in ENGLISH_ONLY are served from en.mjs whatever the page
//     language is. /privacy and friends are single-language for now, and the 565
//     municipality pages exist once rather than once per language, so demanding
//     a translation of them would block nl.mjs on work nothing renders.
import { existsSync } from 'node:fs';

import { strings as en } from './en.mjs';

// Sections every language must translate in full. These are the pages that get
// a /fr/ and an /en/ copy, so an untranslated key here is a visibly broken page.
const REQUIRED = ['common', 'provinceIndex', 'province', 'region'];

// Sections taken from English regardless of the page language. Municipality
// pages are language-neutral by design; the legal pages are not translated yet.
const ENGLISH_ONLY = ['municipality', 'about', 'privacy', 'terms', 'legalNotice'];

/** Bundles for a list of languages, keyed by language code. */
export async function loadStrings(languages, log = console.log) {
  const bundles = new Map();
  for (const lang of languages) {
    bundles.set(lang, await loadBundle(lang, log));
  }
  for (const [lang, bundle] of bundles) ready.set(lang, bundle);
  return bundles;
}

// Loading a bundle is asynchronous, because it is a dynamic import; rendering a
// page is not. The shell needs its labels in the middle of building a string,
// so the bundles are parked here once, by the build, and read synchronously
// from then on.
const ready = new Map();

/**
 * A loaded bundle, synchronously. Falls back to English for a language nobody
 * loaded — which in a correct build is only the 404 page, rendered before any
 * language has been asked for.
 */
export function bundleFor(lang) {
  return ready.get(lang) ?? en;
}

/**
 * One language's bundle, validated against English and completed from it.
 *
 * Throws when the bundle exists but is incomplete. Falls back to English, with
 * a line in the build log, when it does not exist yet.
 */
export async function loadBundle(lang, log = console.log) {
  if (lang === 'en') return en;

  const file = new URL(`./${lang}.mjs`, import.meta.url);
  if (!existsSync(file)) {
    log(`  ! no strings/${lang}.mjs — the ${lang} pages are being served English copy`);
    return { ...en, lang };
  }

  const { strings } = await import(file.href);
  if (!strings) {
    throw new Error(`strings/${lang}.mjs does not export \`strings\`; see en.mjs for the shape`);
  }
  if (strings.lang !== lang) {
    throw new Error(`strings/${lang}.mjs declares lang '${strings.lang}'; it should be '${lang}'`);
  }
  for (const section of REQUIRED) {
    if (!strings[section]) {
      throw new Error(`strings/${lang}.mjs is missing the whole \`${section}\` section, which every language must translate`);
    }
    checkAgainstEnglish(en[section], strings[section], lang, [section]);
  }

  // English for the sections nobody has been asked to translate, the bundle's
  // own copy for everything else.
  const merged = { ...strings };
  for (const section of ENGLISH_ONLY) merged[section] = en[section];
  return merged;
}

/**
 * Walk the English section and demand the same keys, of the same kind, in the
 * translation. The error names the full path, because "a key is missing" in a
 * file of four hundred lines is not a useful thing to be told.
 */
function checkAgainstEnglish(reference, actual, lang, trail) {
  for (const [key, expected] of Object.entries(reference)) {
    const where = [...trail, key].join('.');
    const got = actual?.[key];

    if (got === undefined) {
      throw new Error(`strings/${lang}.mjs is missing ${where}, which en.mjs defines as ${kindOf(expected)}`);
    }
    if (kindOf(expected) !== kindOf(got)) {
      throw new Error(`strings/${lang}.mjs has ${where} as ${kindOf(got)}; en.mjs has it as ${kindOf(expected)}`);
    }
    if (kindOf(expected) === 'array' && expected.length !== got.length) {
      throw new Error(`strings/${lang}.mjs has ${got.length} items in ${where}; en.mjs has ${expected.length}, and they are rendered in order`);
    }
    if (kindOf(expected) === 'object' || kindOf(expected) === 'array') {
      checkAgainstEnglish(expected, got, lang, [...trail, key]);
    }
  }
}

const kindOf = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'object';
  return typeof value; // 'string' or 'function' in practice
};
