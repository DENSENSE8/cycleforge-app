/**
 * Station identity chrome — coplanar flush band under GlobalHeader.
 *
 * Identity sits **flush under GlobalHeader** on the sunken work plane: square
 * all sides, hairline bottom seam only, no elevation. {@link STATION_WORKBENCH_COLUMN}
 * (edge-to-edge of the center column; Displays locks the column at 720 when
 * open) paints an opaque **white card face** (`bg-surface-card`) so carton
 * context, PO lines, and the notes dock share one measure — no `mx-auto`
 * sunken gutters. Icon gap matches GlobalHeader via {@link HEADER_ICON_GAP}.
 *
 * ## Top inset SoT
 *
 * {@link STATION_IDENTITY_INSET_TOP} (`top-0`) pins identity + more-details
 * under the header. {@link STATION_IDENTITY_INSET_RIGHT} (`right-2`) keeps the
 * trailing utility cluster off the right edge. Never stack host `py-*` under
 * this float. Inner pad is zero — content abuts the band edges.
 *
 * Mid-canvas right-edge jumps live on `StationRightEdgeAction` (sibling module)
 * — flush-right sliced tab, not the top identity strip.
 */
import {
  HEADER_ICON_GAP,
} from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';
import { chipLabel, chipText } from '@/design-system/tokens/typography/presets';

/** Flat plane — no lift on the identity band. */
const STATION_IDENTITY_ELEVATION = elevationClass('flat');

/** Absolute identity host — flush under GlobalHeader. */
export const STATION_IDENTITY_INSET_TOP = 'top-0';

/** Trailing inset for more-details / corner utilities. */
export const STATION_IDENTITY_INSET_RIGHT = 'right-2';

/**
 * Absolute float host for {@link StationContextBar} — click-through outer;
 * children re-enable with `pointer-events-auto`. Pairs with
 * {@link STATION_IDENTITY_STACKED_SCROLL_CLEARANCE} on the workbench body.
 */
export const stationContextBarHostClass =
  `pointer-events-none absolute inset-x-0 ${STATION_IDENTITY_INSET_TOP} z-raised`;

/**
 * In-flow host for {@link StationContextBar} — identity is a shrink-0 sibling
 * above the workbench scroll port so the hairline bottom abuts PO lines with
 * **zero** guessed `pt-*` clearance. Use with
 * `StationWorkbench reserveIdentityClearance={false}`.
 */
export const stationContextBarFlowHostClass = 'relative shrink-0';

/**
 * Identity strip — coplanar flush white face on the locked 720 measure: square
 * all sides, hairline bottom only, opaque card fill (same plane as PO lines).
 * Compose with `STATION_WORKBENCH_COLUMN` — do not paint this on a
 * full-bleed host.
 */
export const stationIdentityPanelClass =
  `rounded-none border-0 border-b border-border-soft bg-surface-card ${STATION_IDENTITY_ELEVATION}`;

/**
 * Top-right utilities shell — same flush white recipe as the identity strip.
 */
export const stationUtilityPanelClass =
  `rounded-none border-0 border-b border-border-soft bg-surface-card ${STATION_IDENTITY_ELEVATION}`;

/**
 * Inner pad for flush identity / utility faces — zero on all sides so
 * GlobalHeader → identity → body read as one floor with no side air.
 */
export const stationIdentityPadClass = 'px-0';

/* ── Identity rhythm (one-row carton bar; stacked tokens kept for overlays) ─ */

/**
 * Station chrome seam — carton identity row 1 and Displays push top.
 *
 * `h-9` (36px), not {@link PRIMARY_CHROME_ROW_FACE} (`h-7` / 28px). The
 * photos / classify / identity cells need that taller box; pinning Displays
 * to the 28px ops token left its top band shorter than the carton bar beside
 * it. `min-h-0` kills flex `min-height: auto` so content cannot grow one
 * column past the other. **Not** the GlobalHeader / spine top band
 * (`TOP_CHROME_ROW_FACE` / 40px) — that seam sits above this one.
 */
export const STATION_CHROME_ROW_FACE = 'h-9 min-h-0 shrink-0';

/**
 * Bottom hairline on a station chrome row — painted via `after:` so it does
 * **not** eat the `h-9` / `h-6` box (border-box `border-b` would shrink the
 * fill) and does **not** notch a parent `border-l` (Displays seam). Same token
 * as Displays top band · identity row 1 · leaf eyebrows.
 */
export const STATION_CHROME_SEAM_HAIRLINE =
  'relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border-hairline';

/**
 * Classify urgency·platform·type — **one token**: flush abut (`gap-0`), no
 * side hairlines. Soft drop shadows live off these faces (`shadow-none` on
 * the tone SoTs); never reintroduce `gap-1.5` spacing or vertical rules
 * between classify pills. Chip-to-chip step on chrome row 1 is the same
 * flush abut (`gap-0` + {@link STATION_CHROME_ROW_FACE} +
 * {@link STATION_CHROME_SEAM_HAIRLINE}) composed on the carton identity bar.
 */
export const STATION_IDENTITY_GROUP_CLASS =
  'flex h-full min-h-0 items-stretch gap-0';

/**
 * Leading column on chrome row 1 — boxed exit chevron. Square track on
 * {@link STATION_CHROME_ROW_FACE}; child fills flush (`h-full w-full`).
 * Lifecycle status is the content-width cell immediately AFTER this column and
 * before the order # — state, then which carton — not part of this column.
 */
export const STATION_IDENTITY_LEAD_COL_CLASS =
  'flex h-full aspect-square shrink-0 items-stretch justify-stretch';

/**
 * House inset for identity / action cells that are not a chip face.
 * Same `px-1.5` as CopyChip `outerPad="chip"` and action-pill faces —
 * do not invent a second pad scale.
 */
export const STATION_CHROME_CELL_PAD = 'px-1.5';

/**
 * Text face for EVERY cell on the one-row carton bar — alias of the house
 * {@link chipText} preset, so the bar and dense CopyChips elsewhere in the app
 * are the same face by construction rather than by two strings that happen to
 * agree today.
 *
 * A cell owns its GEOMETRY ({@link STATION_CHROME_CELL_CLASS},
 * {@link STATION_CHROME_CELL_PAD}) and its TONE (Photos blue wash, Claim orange
 * wash) — it does **not** own its type. No cell may declare `font-*`,
 * `tracking-*`, or a `text-role-*` size of its own.
 *
 * **Ink is not in this token.** Semantic colour belongs on the GLYPH
 * (`CHIP_TONES.price.iconClass`, `platformMetaIconTone`), never on the label:
 * painting the label is exactly what left `$41.99` reading `text-text-muted`
 * gray while `eBay` two cells over read default ink at the same 12px. Neutral
 * cells compose {@link STATION_CHROME_CELL_INK}; tone cells keep their own.
 *
 * Guard: `carton-chrome-type-unity.guard.test.ts`.
 */
export const STATION_CHROME_CELL_TEXT = chipText;

/**
 * Word face for bar cells whose content is a LABEL, not a value — Claim, the
 * platform name, the classify pills. Same metrics as
 * {@link STATION_CHROME_CELL_TEXT}; proportional family instead of mono.
 *
 * Two faces, one scale. Mono is load-bearing on IDs and money (character-by-
 * character scanning, tabular figures); it is noise on a word. Forcing `Claim`
 * into mono to satisfy "one token" traded a real affordance for a bookkeeping
 * win — the row reads as one system because the METRICS match, not because the
 * family does. Family is the single axis permitted to vary here; a cell may
 * pick this or {@link STATION_CHROME_CELL_TEXT} and nothing else.
 */
export const STATION_CHROME_CELL_LABEL = chipLabel;

/**
 * Default label ink for a neutral (non-tone) bar cell — order #, tracking,
 * ticket, price, listing. Split from {@link STATION_CHROME_CELL_TEXT} so the
 * tone cells can paint their own without two `text-*` utilities colliding in
 * one class string.
 */
export const STATION_CHROME_CELL_INK = 'text-text-default';

/**
 * Chrome glyph box — same optical size as exit / back (`h-3.5`).
 * Listing · claim · photos · price mark · overflow all use this box.
 */
export const STATION_CHROME_GLYPH_CLASS = 'block h-3.5 w-3.5 shrink-0';


/**
 * Hover seam — the carton bar is one flush strip (`gap-0`, no `divide-x`), so
 * at rest a cell has no edges of its own. On hover it draws its OWN box:
 * an inset hairline on all four sides, which is what gives the vertical rules
 * between neighbouring cells and the horizontal rules top and bottom.
 *
 * `ring-inset`, not `border`: a border is in the box model and would shift the
 * whole row by 1px on hover; an inset ring paints inside the existing box, so
 * nothing moves. Variant-scoped (`hover:`), so it never collides with
 * `focusRing('control', …)`, which is `focus-visible:`-scoped.
 *
 * **One ink — NOT `currentColor`.** This token was briefly `ring-current/30`,
 * on the theory that a cell drawing its box in its own text colour would give
 * every cell the same optical WEIGHT. It does the opposite: the box comes out
 * blue on Photos, orange on Claim, `text-soft` on Back-to-list / Listing /
 * overflow, and `text-default` on the classify pills — four different boxes on
 * one 28px strip, which is precisely the inconsistency this token exists to
 * remove.
 *
 * `text-default/30` is the classify-pill value (their face is
 * `text-text-default`), and the pills are the reference the row is tuned to:
 * dark enough to read over the Photos blue-50 and Claim orange-50 washes, quiet
 * enough not to cage the white neutral cells. The complaint that first motivated
 * `ring-current` — a hairline that disappeared on the colour washes — was true
 * of `border-hairline` (≈ gray-100) specifically, not of a fixed ink as such.
 *
 * EVERY cell on the bar draws this box on hover — the read-only facts (status
 * dot, qty, price) compose the base {@link STATION_CHROME_CELL_CLASS}, which
 * carries the seam + fill, so the strip reads as one uniform set under a
 * pointer sweep rather than splitting into "control" and "fact" cells.
 */
export const STATION_CHROME_CELL_HOVER_SEAM =
  'hover:ring-1 hover:ring-inset hover:ring-text-default/30';

/**
 * Hover FILL that pairs with {@link STATION_CHROME_CELL_HOVER_SEAM}. The box and
 * the wash are one gesture: a cell that rings without filling (or fills without
 * ringing) reads as a different kind of control under the same pointer. Every
 * neutral cell uses this; the tone cells (Photos, Claim) step their own wash
 * instead and must NOT stack this on top of it.
 */
export const STATION_CHROME_CELL_HOVER_FILL = 'hover:bg-surface-hover/50';

/**
 * Interactive cell on the carton bar that is NOT one of the button faces in
 * `station-context-action-pill.ts` — i.e. the identity chips (order #,
 * tracking #, ticket). Those chips are `inline-flex` and vertically centred, so
 * left to themselves their hover box would be shorter than the row and the strip
 * would delineate at two different heights. This wrapper hands them the same
 * `h-full` cell box, seam and fill that every other interactive cell has.
 *
 * Read-only facts (status dot, qty, price) compose
 * {@link STATION_CHROME_CELL_CLASS}, which now carries the SAME seam + fill —
 * so they box on hover identically; this variant only adds `items-stretch` for
 * the inline chips whose own box would otherwise be shorter than the row.
 */
export const STATION_CHROME_HOVER_CELL_CLASS = [
  'flex h-full min-h-0 shrink-0 items-stretch',
  STATION_CHROME_CELL_HOVER_FILL,
  STATION_CHROME_CELL_HOVER_SEAM,
].join(' ');

/**
 * Shared cell on the one-row carton bar: fill chrome height, vertical center,
 * and draw the hover box (seam + fill) so status dot / qty / price delineate
 * the same as every interactive cell. Chip faces keep their own `px-1.5`;
 * status / price compose {@link STATION_CHROME_CELL_PAD}. No leading hairline —
 * the bar is one continuous strip (no `border-l` / `divide-x` between cells).
 */
export const STATION_CHROME_CELL_CLASS = [
  'flex h-full min-h-0 shrink-0 items-center',
  STATION_CHROME_CELL_HOVER_FILL,
  STATION_CHROME_CELL_HOVER_SEAM,
].join(' ');

/** Gap between icons / chips — same integer as GlobalHeader. */
export const stationIdentityGapClass = HEADER_ICON_GAP;

/**
 * More-details inside the context-bar host — `top-0` of that host + right inset.
 * When Ticket push squeezes Unbox, mount on the pane with
 * {@link stationMoreDetailsPaneHostClass} instead.
 */
export const stationMoreDetailsHostClass =
  `pointer-events-auto absolute top-0 ${STATION_IDENTITY_INSET_RIGHT} flex items-start`;

/**
 * Pane-anchored more-details — same top/right insets. `z-panelPopover` sits
 * above fullscreen Unbox push (`z-panel`) so the carton ↑↓ cursor stays
 * visible and clickable on the top-right when the column is expanded.
 */
export const stationMoreDetailsPaneHostClass =
  `pointer-events-auto absolute ${STATION_IDENTITY_INSET_TOP} ${STATION_IDENTITY_INSET_RIGHT} z-panelPopover flex items-start`;

/**
 * One-row identity clearance (~36px flush at `top-0`, zero Y-pad).
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-9';

/**
 * Two-row identity clearance (~60px = chrome `h-9` + secondary `h-6`, gap-0 +
 * zero Y-pad). Opt in via `StationWorkbench reserveIdentityClearance="stacked"`.
 */
// ds-allow-spacing: stacked identity overlay = station h-9 + secondary h-6 (not a density step).
export const STATION_IDENTITY_STACKED_SCROLL_CLEARANCE = 'pt-[60px]'; // ds-allow-spacing
/**
 * Bottom-CENTER anchor for a menu opened by a carton-bar cell (the listing
 * menu, and any future hand-rolled bar panel). ONE definition of "how a bar
 * cell menu is placed" so the strip's menus read as one system: centered under
 * the cell, not left/right-bound to it. Radix-driven menus (classify, photos,
 * overflow) express the same intent through their own `align`/placement props;
 * this token is for the CSS-positioned panels that do not go through Radix.
 *
 * A cell that hosts one composes `relative`; the panel composes this.
 */
export const STATION_CHROME_BAR_MENU_ANCHOR =
  'absolute left-1/2 top-full z-panelPopover -translate-x-1/2 pt-1.5';
