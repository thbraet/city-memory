// Add names to the existing linked province and region maps.
for (const figure of document.querySelectorAll('.explorable-map')) {
  const toggle = figure.querySelector('.map-names-toggle');
  const svg = figure.querySelector('svg');
  const hover = figure.querySelector('.map-hover-name');
  const names = new Map([...figure.querySelectorAll('.map-names text')]
    .map((label) => [label.dataset.id, label]));
  let pointed = null;
  let focused = null;

  function updateHover() {
    const label = names.get(pointed ?? focused);
    hover.replaceChildren(...(label ? [label.cloneNode(true)] : []));
  }

  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const visible = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(visible));
    figure.classList.toggle('show-map-names', visible);
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
