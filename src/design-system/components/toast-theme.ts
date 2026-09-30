/**
 * Kinetic Ledger toast chrome — classNames + duration policy + lifetime bar.
 *
 * Consumed by `AppToaster` (visual) and `@/lib/toast` (API defaults).
 * Light status-pill fills; never solid `richColors` paint.
 *
 * Lifetime bar: every timed toast paints a thin tone bar along its bottom edge
 * that drains over the toast's lifetime (`.cf-toast` in src/app/globals.css).
 * The bar is a background layer of the toast itself, not a child node, so it
 * reaches every toast Sonner renders — including ones whose content we do not
 * own — and it clips to the toast's own corner. Sonner exposes no remaining
 * time, so the bar mirrors its timer from the outside:
 *   - lifetime → `--cf-toast-lifetime` (per toast, set by `@/lib/toast`;
 *     falls back to the Toaster default, which `AppToaster` stamps);
 *   - pause    → Sonner pauses while the stack is expanded (hover) or the tab
 *     is hidden; the CSS pauses on `[data-expanded=true]` and the Toaster's
 *     idle class for the same two conditions;
 *   - restart  → Sonner restarts the timer whenever a toast is updated in place
 *     (same `id`); `@/lib/toast` flips `--cf-toast-drain` between two identical
 *     keyframes so the animation restarts with it.
 * `loading` toasts never time out in Sonner, so they show no drain — the bar
 * holds full width as a pending tone instead of a spinner.
 */

export const TOAST_DURATION = {
  /** Soft confirm — glanceable, then gone. */
  success: 2200,
  info: 3500,
  warning: 4500,
  /** Sticky enough to read; close affordance on. */
  error: 6000,
  /**
   * Loading is finite so a missed realtime settle (e.g. inventory sync) cannot
   * spin forever. Call sites that need longer should pass an explicit duration.
   */
  loading: 45_000,
} as const;

export type ToastKind = keyof typeof TOAST_DURATION;

/** The Toaster-level default: what Sonner uses when a toast names no duration. */
export const TOAST_DEFAULT_DURATION = TOAST_DURATION.success;

/** Per-toast lifetime (ms) the bar drains over. */
export const TOAST_LIFETIME_VAR = '--cf-toast-lifetime';
/** Which of the two identical drain keyframes runs; flipping it restarts the bar. */
export const TOAST_DRAIN_VAR = '--cf-toast-drain';
export const TOAST_DRAIN_KEYFRAMES = ['cf-toast-drain-a', 'cf-toast-drain-b'] as const;
/** Stamped on toasts with `duration: Infinity` — nothing to count down. */
export const TOAST_PERSISTENT_CLASS = 'cf-toast-persistent';
/** On the Toaster while the tab is hidden — Sonner's timers pause, so does the bar. */
export const TOASTER_IDLE_CLASS = 'cf-toaster-idle';

export const TOAST_CLASSNAMES = {
  toast:
    'cf-toast group pointer-events-auto relative flex w-auto min-w-[min(20rem,calc(100vw-1.5rem))] max-w-[min(24rem,calc(100vw-1.5rem))] items-center gap-2.5 rounded-lg border border-border-soft bg-surface-card px-4 py-3 font-sans text-text-default shadow-elev-overlay has-[[data-close-button]]:pr-9',
  title: 'text-role-data font-semibold leading-snug text-current',
  description: 'mt-0.5 text-role-caption font-medium leading-snug text-current/70',
  content: 'min-w-0 flex items-center',
  /** Pending toasts carry no icon — the bar is the pending signal. */
  icon: 'shrink-0 text-current opacity-90 group-data-[type=loading]:hidden [&>svg]:block',
  closeButton:
    'absolute right-2 top-2 rounded-md p-1 text-current/45 transition-colors hover:bg-scrim/5 hover:text-current',
  actionButton:
    'mt-1.5 rounded-md border border-current/20 bg-surface-card/80 px-2.5 py-1 text-role-caption font-semibold text-current hover:bg-surface-card',
  cancelButton:
    'mt-1.5 rounded-md px-2.5 py-1 text-role-caption font-medium text-current/70 hover:text-current',
  success: 'border-border-success bg-surface-success text-text-success',
  error: 'border-border-danger bg-surface-danger text-text-danger',
  warning: 'border-border-warning bg-surface-warning text-text-warning',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  loading: 'border-border-soft bg-surface-card text-text-muted',
  default: 'border-border-soft bg-surface-card text-text-default',
} as const;
