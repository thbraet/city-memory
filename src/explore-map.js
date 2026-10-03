// Add names to the existing linked province and region maps.
for (const figure of document.querySelectorAll('.explorable-map')) {
  const toggle = figure.querySelector('.map-names-toggle');
  const svg = figure.querySelector('svg');
  const nameLayer = figure.querySelector('.map-names');
  const hover = figure.querySelector('.map-hover-name');
  const names = new Map([...figure.querySelectorAll('.map-names text')]
    .map((label) => [label.dataset.id, label]));
  let pointed = null;
  let focused = null;

  function updateHover() {
    const label = names.get(pointed ?? focused);
    hover.replaceChildren(...(label ? [label.cloneNode(true)] : []));
  }

  // Own visibility directly: an old or missing stylesheet must not reveal names.
  nameLayer.style.display = 'none';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const visible = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(visible));
    nameLayer.style.display = visible ? 'inline' : 'none';
    nameLayer.style.visibility = visible ? 'visible' : 'hidden';
  });
  svg.addEventListener('pointerover', (event) => {
    pointed = event.target.closest('a[data-id]')?.dataset.id ?? null;
    updateHover();
  });
  svg.addEventListener('pointerleave', () => {
    pointed = null;
    updateHover();
  });
  svg.addEventListener('focusin', (event) => {
    focused = event.target.closest('a[data-id]')?.dataset.id ?? null;
    updateHover();
  });
  svg.addEventListener('focusout', () => {
    focused = null;
    updateHover();
  });
}
