/**
 * Character-select armed-cursor face tokens — Displays Root Index golden.
 *
 * Idle rows stay **flush leftmost** (icon at the lead edge). Armed paint is an
 * **instant hard cut** (same React commit as the cursor):
 *   1. Leading `>` chevron — mounts **only on the armed row** (never an empty
 *      reserved slot / gutter on idle peers that shoves every icon into a
 *      second column)
 *   2. Bottom track — absolute underline remounted on the armed row
 *      (no `layoutId` FLIP — shared-element travel read as layout lag)
 *
 * Ink for both markers is **operator accent** (`text-accent-bg` /
 * `bg-accent-bg` → `--ds-color-accent-*` from staff prefs / personal accent).
 * Never page-local hex, never `bg-amber-*` on the selection track (amber stays
 * on attention tone chips / SYNC only).
 *
 * Armed-idle pulse = opacity on `>` + track only (`animate-pulse`). Do **not**
 * gate with `motion-safe:` — that silently no-ops under OS Reduce Motion and
 * reads as a broken pulse. Skip the pulse class in JS when
 * `useReducedMotion()` is true instead. Never full-row / sky Infinity.
 *
 * **Right-rail commit never withholds DOM.** Enter / Space / pointerdown / click
 * calls `onSelect` / leaf mount in the same turn — no hit-marker timer before
 * paint. Press / selectionPulse **depth juice** stays on the scan-station
 * **middle** (procedure pager), not on Displays open. Mouse matches keyboard
 * via primary `pointerdown` commit (click deduped).
 *
 * Next cohort (MasterNav / other armed lists): compose these tokens +
 * {@link useArmedCursorList} — never a page-local twin.
 *
 * Law: Displays Root Index.
 */

/** Shared width budget for tone chip — tabular, no layout expand. */
export const ARMED_CURSOR_CHIP_FACE_CLASS =
  'min-w-10 shrink-0 truncate rounded-none px-1.5 py-0.5 text-center text-role-micro font-semibold uppercase tracking-widest tabular-nums';

/** Armed chevron ink — operator accent (pulse applied separately). */
export const ARMED_CURSOR_CHEVRON_CLASS = 'h-4 w-4 shrink-0 text-accent-bg';

/**
 * Armed bottom track — operator accent (pulse applied separately).
 * Compose on the armed row only; never a local `bg-amber-*` twin.
 */
export const ARMED_CURSOR_TRACK_CLASS =
  'pointer-events-none absolute inset-x-0 bottom-0 z-raised h-0.5 bg-accent-bg';

/**
 * Marker opacity pulse — compose onto chevron / track when motion is allowed.
 * Bare `animate-pulse` (not `motion-safe:`) so OS Reduce Motion is handled in
 * JS via {@link useReducedMotion}, not a silent CSS no-op.
 */
export const ARMED_CURSOR_MARKER_PULSE_CLASS = 'animate-pulse';
