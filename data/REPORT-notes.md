## Decisions this build made that PLAN.md did not specify

Nothing in the plan turned out to be blocked. All five phases are implemented and
every acceptance check in the plan's "Autonomous execution" section passes. The
judgement calls below were made where the plan was silent or where following it
literally would have produced something wrong.

**Brussels is emitted once, not twice.** The plan lists the scopes as
"Belgium · Flanders · Wallonia · Brussels · each of the 11 provinces", but the
province/region table's 11 rows already include Brussels — which is a region, not
a province. Emitting it under both headings would have produced two identical
19-municipality scope files. There are therefore **14 distinct scope files**, and
the start screen lists Brussels once, under Provinces.

**The nine municipalities of the German-speaking Community get `localLang: "de"`.**
The plan derives the local language from the region, which would label Eupen,
Kelmis, Sankt Vith and their neighbours French-first. They are officially
German-speaking, and the plan asks for `nameDe` to be resolved at all, which only
pays off if German is displayed somewhere. The list is hard-coded in
`scripts/lib/regions.mjs`; every other municipality follows the plan's rule.
Hand-maintained NIS codes are easy to get wrong — the first version had `63045`,
which is Lierneux, not Lontzen (`63048`) — so a test pins the nine by name rather
than by code.

**Brussels shows French first, Dutch second, at equal weight.** The plan says
"both in Brussels" without fixing an order. Neither name is subordinate, so the
secondary name is rendered in the same size as the primary rather than smaller.

**The map never captures the pointer.** Panning originally called
`svg.setPointerCapture()` on pointerdown. While an element holds pointer capture
the browser retargets the compatibility mouse events with it, so the `click` that
follows a press arrives on the `<svg>` rather than on the `<path>` that was
pressed — and the `<svg>` carries no `data-id`. Every single answer was dropped
silently: you could click the map forever and nothing happened. Panning now
listens on the window for the duration of a gesture instead, which keeps a drag
working past the edge of the map without touching event targeting, and the
answer is resolved from the pointerdown target rather than the click target.
jsdom does not implement capture retargeting, so the original smoke test could
not have caught this; `test/dom.test.mjs` now dispatches the sequence the way a
real browser delivers it (pointerdown on the path, click on the svg).

**Only small shapes get an extra hit target.** The plan asks for "a transparent
wide stroke as an extra hit target" on tiny shapes. Applying it to every shape
means a neighbour's 10-pixel stroke covers a strip several pixels *inside* the
larger municipality next to it, and a click plainly within a big municipality
scores against the small one beside it — Vielsalm's own centre resolved to
Lierneux. Shapes narrower than 1.5% of the full map get the fat target; the rest
rely on their fill.

**Double-tap-to-zoom was dropped in favour of explicit ± buttons.** The plan asks
for both "a click lands on the path element itself" and "double-tap" zoom. On this
map every pixel is an answer, so the first tap of a double-tap submits one — a
real double-click in the browser scored a wrong answer before it zoomed. Wheel,
drag, pinch and Reset are unchanged; the two buttons replace the gesture. This is
the only requirement in the plan that was deliberately not implemented as written.

**The projection is fitted in the plane, not with `fitExtent`.** `osmtogeojson`
emits rings in OSM's order rather than GeoJSON winding order, and d3's spherical
`geoPath.bounds` reads a clockwise exterior ring as "the whole globe except this
shape". Every feature's bounds came back as half the planet and `fitExtent`
collapsed the map to a single point. The pipeline only ever projects point by
point, which is winding-agnostic, so the fit is computed the same way. SVG
rendering uses `fill-rule: evenodd`, which is winding-agnostic too, so enclaves
render and hit-test as holes.

**Simplification is budget-driven rather than hand-tuned.** The plan asks for
"aggressive for the Belgium-wide map, gentle for province maps". Rather than pick
two numbers, the build walks a ladder of simplification weights and keeps the
*gentlest* one whose emitted file fits a byte budget (420 KB for the country and
region maps, 320 KB for a province). Belgium lands on a hard weight because it
carries 565 shapes; provinces land near the source data. The chosen weight per
scope is in the table below.

**No municipality is allowed to vanish.** Baarle-Hertog is 26 exclaves inside the
Netherlands, and an early build simplified every one of them away, leaving the
municipality unclickable. Any feature that loses all of its geometry now keeps its
largest unsimplified polygon instead — the border it then shares with its
neighbours is a hair off, and being on the map at all matters more. This is a
safety net that lets the budget search try aggressive weights without risk; at the
weights actually chosen it never fires, and the rescue column below is empty
throughout. At the national weight Baarle-Hertog keeps 5 of its 26 pieces, and the
smallest municipalities in the country — Sint-Joost-ten-Node, Herstappe — all
survive.

**The name review list is cross-language, not OSM-versus-Wikidata.** The plan
says to report "every case where the two names differ". Read as an OSM/Wikidata
disagreement it would have missed the plan's own example: OSM carries no
`name:fr` for Knokke-Heist at all, so there was nothing to disagree with and
"Knocke-Heyst" would have shipped unreviewed. Both tables are below; the
cross-language one is the review surface.

**The override file corrects spellings, not translations.** Both sources turned
out to carry archaic exonyms, in both directions. 43 overrides are committed,
limited to cases where the French form is a pre-1900 spelling of the same word
(`gh`→`g`, `y`→`i`, `c`→`k`, `-que`→`-ke`, silent `-e`) and modern French usage is
simply the Dutch spelling, plus two accent restorations on official Walloon
spellings. Living French exonyms that are genuinely different words — Anvers,
Malines, Gand, Courtrai, Louvain, Ostende, Lierre, Hal, Vilvorde, Schaerbeek —
are deliberately untouched. Archaic French *translations* (Vieux-Turnhout,
Heist-sur-la-Montagne, Wavre-Sainte-Catherine, …) are also untouched and flagged
for a human, because calling them dead is not a call this build can verify.

**Phase 4's "optional later modes" were not built.** Reverse mode, timed mode and
"which province is this" are listed in the plan as optional and later; the five
phases are complete without them.

