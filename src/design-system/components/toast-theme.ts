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
  loading: Number.POSITIVE_INFINITY,
} as const;

export type ToastKind = keyof typeof TOAST_DURATION;

export const TOAST_CLASSNAMES = {
  toast:
    'group pointer-events-auto relative flex w-[min(22rem,calc(100vw-1.5rem))] items-start gap-2.5 rounded-lg border border-border-soft bg-surface-card px-3.5 py-2.5 text-text-default shadow-[0_1px_2px_rgba(15,23,42,0.05),0_4px_12px_rgba(15,23,42,0.04)]',
  title: 'text-role-caption font-semibold leading-snug text-current',
  description: 'mt-0.5 text-role-micro font-medium leading-snug text-current/70',
  content: 'min-w-0 flex-1',
  icon: 'mt-0.5 shrink-0 text-current opacity-90',
  loader: 'mt-0.5 shrink-0 text-text-info',
  closeButton:
    'absolute right-1.5 top-1.5 rounded-md p-0.5 text-current/45 transition-colors hover:bg-black/5 hover:text-current',
  actionButton:
    'mt-1.5 rounded-md border border-current/20 bg-surface-card/80 px-2 py-1 text-role-micro font-semibold text-current hover:bg-surface-card',
  cancelButton:
    'mt-1.5 rounded-md px-2 py-1 text-role-micro font-medium text-current/70 hover:text-current',
  success: 'border-border-success bg-surface-success text-text-success',
  error: 'border-border-danger bg-surface-danger text-text-danger',
  warning: 'border-border-warning bg-surface-warning text-text-warning',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  loading: 'border-border-soft bg-surface-card text-text-muted',
  default: 'border-border-soft bg-surface-card text-text-default',
} as const;
