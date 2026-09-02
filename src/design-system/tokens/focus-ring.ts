/**
 * Focus-ring recipes — the single source of truth for keyboard/pointer focus
 * affordance (focus-ring axis of the display-convergence campaign).
 *
 * The census found ~670 distinct hand-rolled focus recipes across 220 files
 * (ring width, opacity, offset, and colour all drifting) with zero governing
 * token. This module collapses them to a small set of canonical recipes,
 * keyed the way this codebase already governs every other tone→class map
 * (condition-tone.ts, CHIP_TONES, workflow-stages.ts): a string-Record
 * registry consumed via `cn()`. It grows from the three primitive siblings
 * that already encoded the recipe — `TextField.toneClass` (field),
 * `Button` (control), `SearchField.toneClass` (wrapper).
 *
 * Four archetypes, by how the element takes focus:
 *  - `field`   — the element itself is the input (`:focus`): a 2px tinted ring
 *                + a border-colour shift. (`TextField`, raw `<input>`.)
 *  - `control` — a button/actionable (`:focus-visible`, so a mouse click does
 *                not flash a ring): a 2px ring + 1px offset. (`Button`,
 *                `IconButton`.)
 *  - `wrapper` — a container whose child input takes focus (`:focus-within`):
 *                a border-colour shift on the frame. (`SearchField`.)
 *  - `cell`    — a navigable spreadsheet-grid cell (`:focus-visible`): a 2px
 *                INSET ring — an offset ring would paint outside the cell and
 *                be clipped by adjacent cells / the frozen pane. (Pending grid
 *                editable cells; the Sheets navigate-mode cell cursor.)
 *  - `halo`    — a container that OWNS the focus affordance for a composite
 *                built from several boxes (`:focus-within`): a 2px tinted ring
 *                and no border shift, because the halo's job is to trace the
 *                whole silhouette while each part keeps its own edge.
 *                (`WeldedStack` — staff reaction welded to the composer.)
 *  - `grouped` — a part INSIDE such a composite, following its container's
 *                focus (`group-focus-within:`): the same border shift as
 *                `wrapper`, scoped to the Tailwind `group` on that container.
 *                It exists because an outline cannot change colour halfway up
 *                a single shape: without it the welded panel kept its tone
 *                border while the composer below went blue, and the seam the
 *                weld exists to erase reappeared as a colour break. Requires
 *                `group` on the container.
 *
 * Tones are SEMANTIC (accent/danger/warning/success/neutral) — not the 9 raw
 * Tailwind shades the old recipes sprawled across. `accent` (blue) is the
 * default; a field only needs a non-accent tone when its state is meaningful
 * (a danger/warning/success form field). Ring OPACITY is canonical per
 * archetype (field /20, control /40) — the biggest single source of the old
 * drift was /10 vs /20 vs /25 for the same job.
 *
 * Colour note: focus blue is `blue-500` (the app's pervasive focus hue, no
 * dedicated semantic token yet); `neutral` uses the semantic `border-strong`.
 * Consume via `cn(focusRing('field', 'warning'), …)`; never hand-roll a
 * `focus:ring-*` recipe (guard: control-size sibling `focus-ring-tokens.guard.test.ts`).
 */

export type FocusArchetype = 'field' | 'control' | 'wrapper' | 'cell' | 'halo' | 'grouped';
export type FocusTone = 'accent' | 'danger' | 'warning' | 'success' | 'neutral';

const FIELD_BASE = 'outline-none focus:ring-2';
const FIELD: Record<FocusTone, string> = {
  accent: 'focus:border-blue-500 focus:ring-blue-500/20',
  danger: 'focus:border-red-500 focus:ring-red-500/20',
  warning: 'focus:border-amber-500 focus:ring-amber-500/20',
  success: 'focus:border-emerald-500 focus:ring-emerald-500/20',
  neutral: 'focus:border-border-strong focus:ring-border-strong/15',
};

const CONTROL_BASE = 'outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const CONTROL: Record<FocusTone, string> = {
  accent: 'focus-visible:ring-blue-500/40',
  danger: 'focus-visible:ring-red-500/40',
  warning: 'focus-visible:ring-amber-500/40',
  success: 'focus-visible:ring-emerald-500/40',
  neutral: 'focus-visible:ring-border-strong/40',
};

const WRAPPER: Record<FocusTone, string> = {
  accent: 'focus-within:border-blue-500',
  danger: 'focus-within:border-red-500',
  warning: 'focus-within:border-amber-500',
  success: 'focus-within:border-emerald-500',
  neutral: 'focus-within:border-border-strong',
};

const HALO_BASE = 'focus-within:ring-2';
const HALO: Record<FocusTone, string> = {
  accent: 'focus-within:ring-blue-500/20',
  danger: 'focus-within:ring-red-500/20',
  warning: 'focus-within:ring-amber-500/20',
  success: 'focus-within:ring-emerald-500/20',
  neutral: 'focus-within:ring-border-strong/15',
};

const GROUPED: Record<FocusTone, string> = {
  accent: 'group-focus-within:border-blue-500',
  danger: 'group-focus-within:border-red-500',
  warning: 'group-focus-within:border-amber-500',
  success: 'group-focus-within:border-emerald-500',
  neutral: 'group-focus-within:border-border-strong',
};

const CELL_BASE = 'outline-none focus-visible:ring-2 focus-visible:ring-inset';
const CELL: Record<FocusTone, string> = {
  accent: 'focus-visible:ring-blue-500/40',
  danger: 'focus-visible:ring-red-500/40',
  warning: 'focus-visible:ring-amber-500/40',
  success: 'focus-visible:ring-emerald-500/40',
  neutral: 'focus-visible:ring-border-strong/40',
};

/**
 * The focus recipe for an archetype + tone, as a `cn()`-ready class string.
 * @example className={cn('rounded-lg border', focusRing('field', 'warning'))}
 */
export function focusRing(archetype: FocusArchetype = 'field', tone: FocusTone = 'accent'): string {
  if (archetype === 'field') return `${FIELD_BASE} ${FIELD[tone]}`;
  if (archetype === 'control') return `${CONTROL_BASE} ${CONTROL[tone]}`;
  if (archetype === 'cell') return `${CELL_BASE} ${CELL[tone]}`;
  if (archetype === 'halo') return `${HALO_BASE} ${HALO[tone]}`;
  if (archetype === 'grouped') return GROUPED[tone];
  return WRAPPER[tone];
}
