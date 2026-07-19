import { Loader2 } from '@/components/Icons';

/**
 * RouteLoading — the shared `loading.tsx` body for route-level Suspense.
 *
 * Server-renderable (no client hooks) so Next can stream it before any page
 * JS arrives — that first paint is what keeps slow-network navigations from
 * sitting on a blank frame. Deliberately minimal: a centered house spinner
 * row, no layout skeleton, so the swap to real content never registers as a
 * layout shift.
 *
 * Usage (route file):
 *   export default function Loading() {
 *     return <RouteLoading label="Loading receiving…" />;
 *   }
 */
export function RouteLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center py-16">
      <div className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}
