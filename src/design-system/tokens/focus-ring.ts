/** Focus-ring recipes — the single source of truth for keyboard/pointer focus affordance (focus-ring axis of the display-convergence campaign). */

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
