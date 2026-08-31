import { TrackingExceptionsTable } from '@/components/tracking-exceptions/TrackingExceptionsTable';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

export const dynamic = 'force-dynamic';

/**
 * `/tracking-exceptions` — receiving scans that did not resolve to a Zoho PO.
 *
 * Wears the one page frame (`@/design-system/components/DeskPageChrome` via
 * {@link DeskPageLayout}) rather than the `PageHeader` it hand-rolled before.
 * No tabs: it is a single list, so the frame draws a header and a card and no
 * tab row — which is the honest shape, not a degraded one.
 *
 * `title` is explicit because the spine does not name this surface: it has no
 * `SIDEBAR_PAGE_NAV` entry, so the nav-derived default would be an empty `<h1>`.
 * The subtitle carries what the old paragraph band said, at the altitude the
 * frame reserves for it.
 */
export default function TrackingExceptionsPage() {
  return (
    <DeskPageLayout
      title="Tracking Exceptions"
      subtitle="Receiving scans that did not resolve to a Zoho purchase order. Refresh re-queries Zoho with the same tracking number; the pencil edits or deletes."
      className="h-full"
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <TrackingExceptionsTable />
      </div>
    </DeskPageLayout>
  );
}
