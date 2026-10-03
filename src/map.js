// SVG map: one <path> per municipality, so hit testing is the browser's job and
// there is no point-in-polygon code anywhere in this project.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A shape narrower than this fraction of the full map gets an extra hit target. */
const HIT_TARGET_SHARE = 0.015;

export function createMap(container, { onPick, interactive = true } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const shapes = group('shapes');
  const hits = group('hits');       // fat transparent strokes, above the shapes
  const marks = group('marks');     // rings that point out shapes too small to see
  const labels = group('labels');   // only ever populated after an answer
  svg.append(shapes, hits, marks, labels);
  container.append(svg);

  let base = { x: 0, y: 0, w: 100, h: 100 };
  let view = { ...base };
  let byId = new Map();

  function group(name) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', name);
    return g;
  }

  function applyView() {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    scaleLabels();
  }

  // SVG text is sized in user units, and a viewBox spanning the whole country is
  // thousands of units wide — a 13px font would come out three pixels tall. Size
  // labels against the current view instead, so they stay legible at any zoom.
  function scaleLabels() {
    const size = view.w / 46;
    for (const label of labels.children) {
      const labelSize = label.dataset.studySize ? Math.min(Number(label.dataset.studySize), view.w / 75) : size;
      label.setAttribute('font-size', labelSize);
      label.setAttribute('stroke-width', labelSize / 4);
    }
    for (const mark of marks.children) {
      mark.setAttribute('r', view.w / 55);
      mark.setAttribute('stroke-width', view.w / 330);
    }
  }

  function load(scope) {
    shapes.replaceChildren();
    hits.replaceChildren();
    marks.replaceChildren();
    labels.replaceChildren();
    byId = new Map();

    const [x, y, w, h] = scope.viewBox.split(' ').map(Number);
    base = { x, y, w, h };
    view = { ...base };
    applyView();

    for (const f of scope.features) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', f.path);
      path.setAttribute('class', 'shape');
      path.dataset.id = f.id;
      shapes.append(path);
      byId.set(f.id, { feature: f, path, hit: null, size: Math.sqrt(extent(f.path)) });
    }

    // Only shapes that are genuinely too small to hit get the fat transparent
    // stroke, and the smallest go last so they sit on top of each other. Giving
    // every shape one means a neighbour's stroke covers a strip several pixels
    // deep *inside* its larger neighbour, and a click clearly within a big
    // municipality gets scored against the small one next to it.
    const needsHelp = [...scope.features]
      .filter((f) => byId.get(f.id).size < base.w * HIT_TARGET_SHARE)
      .sort((a, b) => byId.get(b.id).size - byId.get(a.id).size);

    for (const f of needsHelp) {
      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', f.path);
      hit.setAttribute('class', 'hit');
      hit.dataset.id = f.id;
      hits.append(hit);
      byId.get(f.id).hit = hit;
    }
    return byId;
  }

  svg.addEventListener('click', (event) => {
    if (dragged) return; // a pan should not also count as an answer
    // Prefer what was under the pointer when the press started: if the pointer
    // slid onto a neighbour before release, the browser reports the click on
    // their common ancestor (the <svg>), which carries no id.
    const id = pressedId ?? event.target?.dataset?.id;
    if (id && onPick) onPick(id, event);
  });

  /** state is one of: correct, wrong, target, or null to clear. */
  function setState(id, state) {
    const entry = byId.get(id);
    if (!entry) return;
    entry.path.classList.remove('is-correct', 'is-wrong', 'is-target');
    if (!state) return;
    entry.path.classList.add(`is-${state}`);
    // A Brussels commune is a couple of pixels across on the national map, so
    // recolouring it is not something you would notice. Ring it as well.
    if (entry.size < view.w * 0.035) {
      const [cx, cy] = entry.feature.centroid;
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', cx);
      ring.setAttribute('cy', cy);
      ring.setAttribute('class', `mark is-${state}`);
      marks.append(ring);
      scaleLabels();
    }
  }

  function clearStates() {
    for (const { path } of byId.values()) {
      path.classList.remove('is-correct', 'is-wrong', 'is-target');
    }
    marks.replaceChildren();
    labels.replaceChildren();
  }

  /** Mastery shading for the progress map. */
  function setMastery(id, level) {
    const entry = byId.get(id);
    if (!entry) return;
    entry.path.classList.remove('m-unseen', 'm-shaky', 'm-solid');
    entry.path.classList.add(`m-${level}`);
  }

  function showLabel(id, text, variant = '') {
    const entry = byId.get(id);
    if (!entry) return;
    const [cx, cy] = entry.feature.centroid;
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', cx);
    label.setAttribute('y', cy);
    label.setAttribute('class', `label ${variant}`.trim());
    label.setAttribute('text-anchor', 'middle');
    label.textContent = text;
    labels.append(label);
    scaleLabels();
    return label;
  }

  function resetView() {
    view = { ...base };
    applyView();
  }

  // Fit every name near its shape at overview scale, then cap its size as the
  // user zooms in. Names remain present at every zoom; none are culled.
  function showStudyLabels(nameFor) {
    labels.replaceChildren();
    for (const [id, entry] of byId) {
      const text = nameFor(id);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', entry.feature.centroid[0]);
      label.setAttribute('y', entry.feature.centroid[1]);
      label.setAttribute('class', 'label study-label');
      label.setAttribute('text-anchor', 'middle');
      label.dataset.id = id;
      label.dataset.studySize = entry.size / Math.max(4, text.length * 0.55);
      label.textContent = text;
      labels.append(label);
    }
    scaleLabels();
  }

  /** Centre the view on a feature without changing the zoom level. */
  function centreOn(id) {
    const entry = byId.get(id);
    if (!entry) return;
    const [cx, cy] = entry.feature.centroid;
    view = { ...view, x: cx - view.w / 2, y: cy - view.h / 2 };
    clampView();
    applyView();
  }

  function zoomBy(factor, focus) {
    const next = { ...view };
    const maxW = base.w;
    const minW = base.w / 40;
    next.w = Math.min(maxW, Math.max(minW, view.w * factor));
    next.h = next.w * (base.h / base.w);
    // Keep the focus point under the cursor.
    const fx = focus ? (focus.x - view.x) / view.w : 0.5;
    const fy = focus ? (focus.y - view.y) / view.h : 0.5;
    next.x = (focus?.x ?? view.x + view.w / 2) - fx * next.w;
    next.y = (focus?.y ?? view.y + view.h / 2) - fy * next.h;
    view = next;
    clampView();
    applyView();
  }

  function clampView() {
    const slack = Math.max(view.w, view.h) * 0.25;
    view.x = Math.min(Math.max(view.x, base.x - slack), base.x + base.w + slack - view.w);
    view.y = Math.min(Math.max(view.y, base.y - slack), base.y + base.h + slack - view.h);
  }

  function toSvg(event) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    // preserveAspectRatio="xMidYMid meet": the viewBox is letterboxed inside the
    // element, so undo the letterboxing before mapping into viewBox units.
    const scale = Math.min(rect.width / view.w, rect.height / view.h);
    const offsetX = (rect.width - view.w * scale) / 2;
    const offsetY = (rect.height - view.h * scale) / 2;
    return {
      x: view.x + (event.clientX - rect.left - offsetX) / scale,
      y: view.y + (event.clientY - rect.top - offsetY) / scale,
    };
  }

  let dragged = false;
  let pressedId = null;
  if (interactive) attachPanZoom();

  // A non-interactive map (the inset) has no pointer handling of its own, so the
  // click handler has to fall back to the event target.
  if (!interactive) {
    svg.addEventListener('pointerdown', (event) => {
      pressedId = event.target?.dataset?.id ?? null;
    });
  }

  // No double-tap-to-zoom: on this map every pixel is an answer, so the first
  // tap of the gesture would submit one. Zooming is the wheel, a pinch, or the
  // explicit +/- buttons instead. See data/REPORT.md.
  //
  // Panning deliberately does NOT use setPointerCapture. Capturing the pointer
  // makes the browser retarget the compatibility mouse events with it, so the
  // click that follows a press arrives on the <svg> rather than on the <path>
  // that was pressed — which silently swallowed every answer. Listening on the
  // window for the duration of the gesture keeps the drag working past the edge
  // of the map without touching event targeting.
  function attachPanZoom() {
    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomBy(Math.exp(event.deltaY * 0.0015), toSvg(event));
    }, { passive: false });

    const pointers = new Map();
    let last = null;
    let pinchStart = null;
    let pressAt = null;

    /** Movement in screen pixels before a press counts as a pan, not a click. */
    const DRAG_SLOP = 6;

    svg.addEventListener('pointerdown', (event) => {
      pointers.set(event.pointerId, event);
      if (pointers.size === 1) {
        dragged = false;
        pressedId = event.target?.dataset?.id ?? null;
        pressAt = { x: event.clientX, y: event.clientY };
        last = toSvg(event);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
      } else if (pointers.size === 2) {
        pinchStart = { distance: pointerDistance(pointers), w: view.w };
      }
    });

    function onMove(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, event);

      if (pointers.size === 2 && pinchStart) {
        const distance = pointerDistance(pointers);
        if (distance > 0) {
          dragged = true;
          const targetW = pinchStart.w * (pinchStart.distance / distance);
          zoomBy(targetW / view.w, midpoint(pointers, toSvg));
        }
        return;
      }
      if (pointers.size !== 1 || !last || !pressAt) return;
      if (!dragged && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > DRAG_SLOP) {
        dragged = true;
      }
      if (!dragged) return;
      const now = toSvg(event);
      view = { ...view, x: view.x - (now.x - last.x), y: view.y - (now.y - last.y) };
      clampView();
      applyView();
      // `last` is recomputed against the new view, so it stays the same point.
      last = toSvg(event);
    }

    function release(event) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size > 0) return;
      last = null;
      pressAt = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      // The click fires after pointerup; let it see the drag, then forget both.
      setTimeout(() => { dragged = false; pressedId = null; }, 0);
    }
  }

  function pointerDistance(pointers) {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function midpoint(pointers, map) {
    const [a, b] = [...pointers.values()];
    return map({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });
  }

  return {
    svg, load, setState, clearStates, setMastery, showLabel,
    resetView, centreOn, zoomBy, showStudyLabels,
    get ids() { return [...byId.keys()]; },
    feature: (id) => byId.get(id)?.feature ?? null,
    element: (id) => byId.get(id)?.path ?? null,
  };
}

/** Rough on-screen size of a path, used only to order the hit layer. */
function extent(d) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
    const x = Number(m[1]), y = Number(m[2]);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}
