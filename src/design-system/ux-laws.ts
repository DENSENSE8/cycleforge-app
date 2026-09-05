/**
 * UX law corpus — the data-shape decision table this house designs against.
 *
 * ## What this is, and what it is for
 *
 * Ported from `Garisek-OS/Plans/KoleJainUxLaws.tsx`, a self-contained artifact
 * (no imports, scoped styles) whose whole point is law D1 demonstrated rather
 * than asserted: everything it renders comes from one data object, so changing
 * the data changes the UI.
 *
 * Its exact use case is NOT a component library and NOT a style guide. It is a
 * **decision table**, answering one question an agent asks constantly and
 * usually answers by habit:
 *
 *     "I have data of this shape. What is the correct way to render it?"
 *
 * {@link UX_SHAPES} answers that directly — for each data shape, the wrong
 * rendering (the one reached for by default), the right one, and the rule that
 * separates them. {@link UX_LAWS} is the 29-law corpus behind those calls,
 * grouped: D data drives form, V de-vibe-code, C colour system, H hierarchy and
 * density, P progressive disclosure, S states and motion.
 *
 * ## Why it lives here rather than in Plans/
 *
 * In `Plans/` it was a document — read once, remembered wrongly, never
 * consulted at the moment of a decision. Here it is law the design-mcp server
 * can answer from (`ds_contract`), pinned in `pinned.json`, and hashed by
 * `scripts/ci/check-law-checksums.mjs` so it cannot be quietly relaxed.
 *
 * The engine stays in Garisek-OS; the LAW lives in cycleforge. This file is the
 * cycleforge half.
 *
 * ## It disagrees with code that already shipped
 *
 * That is the point of writing it down. See `docs/warehouse-os/` and the notes
 * on `mobile-display-cohort.ts` — at least two decisions on the mobile scan
 * station contradict D2 and H1, and were argued for in comments before this
 * corpus was consultable.
 */

export type UxLawGroup = 'D' | 'V' | 'C' | 'H' | 'P' | 'S';

export const UX_LAW_GROUPS: Record<UxLawGroup, string> = {
  D: 'Data drives form',
  V: 'De-vibe-code',
  C: 'Colour system',
  H: 'Hierarchy & density',
  P: 'Progressive disclosure',
  S: 'States & motion',
};

export interface UxLaw {
  id: string;
  group: UxLawGroup;
  name: string;
  /** The law itself. */
  stmt: string;
  /** What tells you the law applies. */
  signal: string;
  /** What to do instead. */
  transform: string;
  /** The failure it prevents. */
  anti: string;
}

export interface UxShape {
  key: string;
  label: string;
  /** Fields that indicate this shape. */
  hint: string;
  /** The rendering reached for by default. */
  wrong: string;
  /** The rendering the data actually wants. */
  right: string;
  /** The rule that separates them. */
  rule: string;
  /** Laws this shape is an instance of. */
  laws: readonly string[];
}

/**
 * Data shape → correct rendering.
 *
 * Consult this BEFORE composing a surface, not after. Every `wrong` here is a
 * real default — the thing that gets built when nobody classified the field
 * first (law D1).
 */
export const UX_SHAPES: readonly UxShape[] = [
  {
    "key": "temporal",
    "label": "Time-ordered events",
    "hint": "created_at, status changes, audit log",
    "wrong": "Sortable table with a date column",
    "right": "Timeline / activity rail, newest first, date as a group header",
    "rule": "Time is an axis, not a column. If order carries meaning, render the order.",
    "laws": [
      "D1",
      "D4",
      "H2"
    ]
  },
  {
    "key": "enum",
    "label": "Finite enum status",
    "hint": "pending | picking | shipped | void",
    "wrong": "Plain text column, or a text-heavy chip repeating the label",
    "right": "Chip with semantic fill; the enum owns the colour, not the designer",
    "rule": "A closed set gets a closed visual vocabulary. Colour comes from meaning.",
    "laws": [
      "D2",
      "C3",
      "V2"
    ]
  },
  {
    "key": "numeric",
    "label": "Numeric / currency",
    "hint": "qty, £ amount, duration, %",
    "wrong": "Left-aligned proportional text so digits fail to line up",
    "right": "Right-aligned, tabular-nums, place-value aligned, unit set once in the header",
    "rule": "Numbers are compared vertically. Alignment is the comparison.",
    "laws": [
      "D3",
      "H1"
    ]
  },
  {
    "key": "geographic",
    "label": "Geographic breakdown",
    "hint": "orders by region, warehouse by site",
    "wrong": "Bar chart with region names on the Y axis",
    "right": "Shaded map with a ranked side legend; bars only for the top-N cut",
    "rule": "Spatial data has a native shape. Use it before you abstract it.",
    "laws": [
      "D1",
      "D5"
    ]
  },
  {
    "key": "relational",
    "label": "Parent → children",
    "hint": "order → lines, batch → units",
    "wrong": "Two disconnected tables, or a modal that loses the parent context",
    "right": "Master-detail: list on the left, detail pane on the right, parent stays visible",
    "rule": "Never make the user hold the parent in their head.",
    "laws": [
      "D6",
      "P1",
      "H3"
    ]
  },
  {
    "key": "narrative",
    "label": "Long free text",
    "hint": "notes, descriptions, AI output",
    "wrong": "Wrapping to three lines inside a dense row and destroying the rhythm",
    "right": "Truncate to one line with a hover/expand reveal; stream it if generated",
    "rule": "Truncation is how a dense layout buys breathing room.",
    "laws": [
      "H2",
      "P2",
      "S2"
    ]
  },
  {
    "key": "single-kpi",
    "label": "One headline metric",
    "hint": "MRR, throughput, error rate",
    "wrong": "A giant lone number repeated in an identical KPI strip on every page",
    "right": "Value + delta + micro-sparkline; the trend is the point, not the digit",
    "rule": "A number with no baseline is decoration. Ship the comparison with it.",
    "laws": [
      "D7",
      "V4"
    ]
  },
  {
    "key": "proportion",
    "label": "Parts of a whole",
    "hint": "channel mix, status split",
    "wrong": "Pie with nine slices and a legend you have to cross-reference",
    "right": "Two-column donut with inline labelled rows, or a stacked bar if ordered",
    "rule": "If the legend does the work, the chart has failed.",
    "laws": [
      "D1",
      "V4"
    ]
  }
] as const;

/** The full corpus, grouped by {@link UX_LAW_GROUPS}. */
export const UX_LAWS: readonly UxLaw[] = [
  {
    "id": "D1",
    "group": "D",
    "name": "Classify before you compose",
    "stmt": "Every field gets typed as enum, numeric, temporal, geographic, relational or narrative before a single component is chosen.",
    "signal": "You can name the component but not the data classification behind it.",
    "transform": "Inventory the entities on the screen, tag each one, then run the mapping table.",
    "anti": "Reaching for a table because the data \"looks tabular\"."
  },
  {
    "id": "D2",
    "group": "D",
    "name": "Closed sets get chips",
    "stmt": "A finite enum renders as a chip carrying a semantic fill — never as free text and never as a sentence.",
    "signal": "Status text sitting in a column at the same weight as the row title.",
    "transform": "Map each enum member to a semantic token; chip label is one or two words, no icon needed.",
    "anti": "Text-heavy chips that restate the column header."
  },
  {
    "id": "D3",
    "group": "D",
    "name": "Numbers align right, always",
    "stmt": "Numeric and currency columns are right-aligned with tabular figures so place values stack.",
    "signal": "Digits that fail to line up down a column.",
    "transform": "text-align:right + font-variant-numeric:tabular-nums; unit stated once in the header.",
    "anti": "Mixing the unit into every cell."
  },
  {
    "id": "D4",
    "group": "D",
    "name": "Order-bearing data keeps its order",
    "stmt": "When sequence carries meaning, the layout expresses sequence — a timeline, not a sortable grid.",
    "signal": "A date column the user immediately sorts on every visit.",
    "transform": "Vertical rail, date group headers, newest first, sort control removed.",
    "anti": "Making the user re-establish order the data already had."
  },
  {
    "id": "D5",
    "group": "D",
    "name": "Native shape before abstraction",
    "stmt": "Data with an inherent geometry — geographic, hierarchical, temporal — renders in that geometry first.",
    "signal": "A bar chart standing in for a map, or an indented list standing in for a tree.",
    "transform": "Use the native form; fall back to bars only for an explicit top-N cut.",
    "anti": "Defaulting to bars because bars are easy."
  },
  {
    "id": "D6",
    "group": "D",
    "name": "Parent stays on screen",
    "stmt": "Relational data uses master-detail so the parent record never leaves the viewport.",
    "signal": "A modal that hides the list it was opened from.",
    "transform": "List rail + detail pane; selection drives the pane, URL carries the selection.",
    "anti": "Losing context to a full-screen overlay."
  },
  {
    "id": "D7",
    "group": "D",
    "name": "No metric without a baseline",
    "stmt": "A KPI ships with its comparison — delta, sparkline or target — or it does not ship.",
    "signal": "A large number with nothing to judge it against.",
    "transform": "Value + period delta + micro-sparkline in one tile.",
    "anti": "Identical KPI strips duplicated across every page of the app."
  },
  {
    "id": "V1",
    "group": "V",
    "name": "Icons, not emoji",
    "stmt": "A single consistent stroke icon set replaces every emoji in product chrome.",
    "signal": "Emoji in row avatars, status text or button labels.",
    "transform": "Adopt one set (Phosphor or Lucide), fixed stroke width, neutral colour by default.",
    "anti": "Emoji as an avatar or a status indicator."
  },
  {
    "id": "V2",
    "group": "V",
    "name": "Colour is earned, not sprinkled",
    "stmt": "Saturated hues appear only where data or state justifies them; chrome stays neutral.",
    "signal": "Bright clashing accents on buttons, cards and icons simultaneously.",
    "transform": "Desaturate the palette, move all meaning-bearing colour into data-viz and status.",
    "anti": "A different accent per card."
  },
  {
    "id": "V3",
    "group": "V",
    "name": "Rows collapse their actions",
    "stmt": "Row-level actions live behind an overflow menu; at most one primary action stays inline.",
    "signal": "Three or more buttons repeated on every row.",
    "transform": "Keep the primary action, move the rest to a ⋯ menu revealed on hover/focus.",
    "anti": "A button wall that makes every row look urgent."
  },
  {
    "id": "V4",
    "group": "V",
    "name": "No template repetition",
    "stmt": "Two pages must not share an identical layout skeleton unless they answer the same question.",
    "signal": "Every route opening with the same three-KPI strip and the same chart.",
    "transform": "Delete the duplicate strip; give each page the shape its own data demands.",
    "anti": "One dashboard template reskinned as the whole product."
  },
  {
    "id": "V5",
    "group": "V",
    "name": "Show the product, not the icon",
    "stmt": "Marketing surfaces lead with real screenshots of real data, not abstract iconography.",
    "signal": "A feature grid of generic glyphs above the fold.",
    "transform": "Skewed, cropped product shots with legible real content; icons demoted to support.",
    "anti": "Stock illustration standing in for the thing you built."
  },
  {
    "id": "C1",
    "group": "C",
    "name": "Four surfaces minimum",
    "stmt": "The neutral foundation carries at least four distinct planes so elevation reads without shadow.",
    "signal": "Cards that disappear into the page background.",
    "transform": "background → surface → surface-container → surface-container-high, each a real step apart.",
    "anti": "One grey for everything, then a drop shadow to compensate."
  },
  {
    "id": "C2",
    "group": "C",
    "name": "Never pure black or white",
    "stmt": "Text uses a very dark neutral and surfaces a very light one — never #000 or #fff.",
    "signal": "Maximum contrast that makes long reading harsh.",
    "transform": "Pull both ends toward the middle; keep contrast ratios, drop the glare.",
    "anti": "#000 on #fff as a default."
  },
  {
    "id": "C3",
    "group": "C",
    "name": "Semantics come from meaning",
    "stmt": "Success, warning and danger are assigned by what the data means, never by what looks good.",
    "signal": "A red that signals nothing, or a green used as a brand accent.",
    "transform": "Bind each status to a semantic token; components reference the token, never a hex.",
    "anti": "Reusing the danger colour for emphasis."
  },
  {
    "id": "C4",
    "group": "C",
    "name": "Dark is not inverted light",
    "stmt": "The dark theme is its own palette — elevated surfaces get lighter, borders brighten, logos desaturate.",
    "signal": "A dark mode produced by flipping lightness values.",
    "transform": "In OKLCH: L −0.03 per step down, C +0.02, rotate H slightly; raise border contrast.",
    "anti": "Elevation rendered by making a surface darker in dark mode."
  },
  {
    "id": "C5",
    "group": "C",
    "name": "Icons stay neutral",
    "stmt": "Icon colour is inherited from text; colour is applied only to signal status or an active state.",
    "signal": "A rainbow sidebar where every item has its own hue.",
    "transform": "currentColor by default; accent only on the active item.",
    "anti": "Colour-coding navigation for decoration."
  },
  {
    "id": "H1",
    "group": "H",
    "name": "Size, position, colour — in that order",
    "stmt": "Importance is expressed by scale and placement first; colour is the last lever, not the first.",
    "signal": "Everything the same size, with colour doing all the ranking.",
    "transform": "Establish a type scale, put the answer top-left, then add at most one accent.",
    "anti": "Flat hierarchy rescued with highlight fills."
  },
  {
    "id": "H2",
    "group": "H",
    "name": "Truncation buys breathing room",
    "stmt": "One line per row is the default; overflow reveals on demand rather than reflowing the layout.",
    "signal": "Rows of differing heights caused by wrapping text.",
    "transform": "Single-line ellipsis + hover tooltip or expand affordance; keep the row rhythm fixed.",
    "anti": "Letting one long value set the height of every row."
  },
  {
    "id": "H3",
    "group": "H",
    "name": "Sidebar is the spine",
    "stmt": "Navigation is built first and grouped by task, because it sets the cognitive load for everything after.",
    "signal": "A flat list of twelve links with no grouping.",
    "transform": "Group under short labels, demote secondary links into a popover, one account card at the foot.",
    "anti": "Every route promoted to top-level nav."
  },
  {
    "id": "H4",
    "group": "H",
    "name": "Build order is fixed",
    "stmt": "Sidebar → main frame → data → functional controls. Tabs and bulk actions come last.",
    "signal": "A polished chart on a page whose navigation is still undecided.",
    "transform": "Lock the spine, place the critical answer top of main, then charts, then controls.",
    "anti": "Designing the chart before the page has a job."
  },
  {
    "id": "H5",
    "group": "H",
    "name": "Standardise the primitives",
    "stmt": "Radii, spacing and elevation come from a scale expressed as variables — never ad-hoc values.",
    "signal": "Three different corner radii visible in one screenshot.",
    "transform": "One 4px-based spacing scale, one radius scale, both consumed as tokens.",
    "anti": "Hand-tuned pixel values inside components."
  },
  {
    "id": "P1",
    "group": "P",
    "name": "Container weight matches ask size",
    "stmt": "The container is chosen by how many fields you are requesting, not by habit.",
    "signal": "A full-width flyout collecting three fields.",
    "transform": "Walk the container ladder: inline → popover → modal → flyout → page.",
    "anti": "One modal component used for every interaction in the app."
  },
  {
    "id": "P2",
    "group": "P",
    "name": "Advanced stays collapsed",
    "stmt": "Options used by a minority open closed, behind a single labelled toggle.",
    "signal": "A form where the common path is buried among rarely-used settings.",
    "transform": "Split required from advanced; collapse advanced with the count shown on the toggle.",
    "anti": "Exposing every setting to prove the feature exists."
  },
  {
    "id": "P3",
    "group": "P",
    "name": "Cut click depth before adding polish",
    "stmt": "Merging nav entries and surfacing actions in place beats any amount of visual refinement.",
    "signal": "A routine task that takes four clicks and two page loads.",
    "transform": "Count the clicks for the top three tasks; merge, inline or popover until each is ≤2.",
    "anti": "Polishing a flow instead of shortening it."
  },
  {
    "id": "S1",
    "group": "S",
    "name": "All four states or it is not done",
    "stmt": "Empty, loading, success and error are designed for every data surface — the happy path alone is a prototype.",
    "signal": "A blank white area where a first-run user should see guidance.",
    "transform": "Empty state explains and offers the first action; loading is a skeleton of the real layout.",
    "anti": "A spinner standing in for four unwritten states."
  },
  {
    "id": "S2",
    "group": "S",
    "name": "Reveal, do not dump",
    "stmt": "Generated or slow content streams in; long lists skeleton-load in the shape they will take.",
    "signal": "A long pause followed by everything appearing at once.",
    "transform": "Stream tokens, fade process steps in sequentially, skeleton match the final geometry.",
    "anti": "A blocking spinner for content that could arrive progressively."
  },
  {
    "id": "S3",
    "group": "S",
    "name": "Motion guides, never decorates",
    "stmt": "Every animation explains a relationship — where something came from, what changed, what succeeded.",
    "signal": "Entrance animations on content that was already visible.",
    "transform": "Hover, press and focus get feedback; transitions carry origin; honour prefers-reduced-motion.",
    "anti": "Movement added because the page felt static."
  },
  {
    "id": "S4",
    "group": "S",
    "name": "Optimistic where reversible",
    "stmt": "Actions that can be undone apply immediately and reconcile in the background.",
    "signal": "A spinner on a toggle that could not plausibly fail.",
    "transform": "Apply locally, fire the request, roll back with a toast on failure.",
    "anti": "Optimistic updates on irreversible or money-moving actions."
  }
] as const;

/** One law by id, or null. */
export function uxLaw(id: string): UxLaw | null {
  return UX_LAWS.find((l) => l.id.toLowerCase() === id.trim().toLowerCase()) ?? null;
}

/** The shape whose hint or label best matches a described field. */
export function uxShapesFor(query: string): UxShape[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return UX_SHAPES.filter(
    (s) =>
      s.key.includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.hint.toLowerCase().includes(q) ||
      q.includes(s.key),
  );
}
