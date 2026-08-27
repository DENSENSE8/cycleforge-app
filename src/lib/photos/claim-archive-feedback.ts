/**
 * Operator-facing feedback when an unbox photo lands on a carton that already
 * has a Zendesk claim. The copy itself runs in `after()` on the upload route;
 * this only toasts, and coalesces a burst of shots into one notice.
 */

const pending = new Map<number, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;

export function notifyClaimPhotosArchiving(ticketId: number | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (ticketId == null || !Number.isFinite(ticketId) || ticketId <= 0) return;

  const prev = pending.get(ticketId);
  if (prev) clearTimeout(prev);
  pending.set(
    ticketId,
    setTimeout(() => {
      pending.delete(ticketId);
      void import('@/lib/toast').then(({ toast }) => {
        toast.success(`Archiving photos to ticket #${ticketId}`);
      });
    }, DEBOUNCE_MS),
  );
}
