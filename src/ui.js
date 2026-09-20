// Small DOM helpers and the name display rule.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * The display rule: local official name first, the other language second and
 * smaller. Flanders reads Dutch, Wallonia French, the German-speaking Community
 * German; Brussels is officially bilingual, so both names carry equal weight.
 * Identical names collapse to one.
 */
export function displayName(m) {
  const nl = m.nameNl, fr = m.nameFr, de = m.nameDe;
  let primary, secondary, equal = false;
  switch (m.localLang) {
    case 'fr': primary = fr; secondary = nl; break;
    case 'de': primary = de; secondary = fr; break;
    case 'both': primary = fr; secondary = nl; equal = true; break;
    default: primary = nl; secondary = fr;
  }
  if (!primary) primary = nl || fr || de;
  if (secondary === primary || !secondary) secondary = null;
  return { primary, secondary, equal };
}

/** One-line rendering, e.g. "Mons / Bergen". */
export function fullName(m) {
  const { primary, secondary } = displayName(m);
  return secondary ? `${primary} / ${secondary}` : primary;
}

export function promptNode(m) {
  const { primary, secondary, equal } = displayName(m);
  return el('span', { class: 'prompt-names' },
    el('span', { class: 'prompt-primary' }, primary),
    secondary && el('span', { class: equal ? 'prompt-secondary is-equal' : 'prompt-secondary' }, secondary),
  );
}

export function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}
