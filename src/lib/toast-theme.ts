/**
 * Kinetic Ledger toast chrome — classNames + duration policy.
 *
 * Consumed by `AppToaster` (visual) and `@/lib/toast` (API defaults).
 * Light status-pill fills; never solid `richColors` paint.
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

export const TOAST_CLASSNAMES = {
  toast:
    'group pointer-events-auto relative flex w-auto max-w-[min(22rem,calc(100vw-1.5rem))] items-center gap-2 rounded-surface border border-edge-subtle bg-card px-3 py-2 text-ink-primary shadow-[0_1px_2px_rgba(15,23,42,0.05),0_4px_12px_rgba(15,23,42,0.04)]',
  title: 'text-sm font-semibold leading-none text-current',
  description: 'mt-0.5 text-xs font-medium leading-snug text-current/70',
  content: 'min-w-0 flex items-center',
  icon: 'shrink-0 text-current opacity-90 [&>svg]:block',
  loader: 'shrink-0 text-ink-accent [&>svg]:block',
  closeButton:
    'absolute right-1.5 top-1.5 rounded-control p-0.5 text-current/45 transition-colors hover:bg-surface-high hover:text-current',
  actionButton:
    'mt-1.5 rounded-control border border-current/20 bg-card/80 px-2 py-1 text-xs font-semibold text-current hover:bg-card',
  cancelButton:
    'mt-1.5 rounded-control px-2 py-1 text-xs font-medium text-current/70 hover:text-current',
  success: 'border-edge-success bg-surface-success text-ink-success',
  error: 'border-edge-danger bg-surface-danger text-ink-danger',
  warning: 'border-edge-warning bg-surface-warning text-ink-warning',
  info: 'border-edge-accent bg-surface-accent text-ink-accent',
  loading: 'border-edge-subtle bg-card text-ink-muted',
  default: 'border-edge-subtle bg-card text-ink-primary',
} as const;
