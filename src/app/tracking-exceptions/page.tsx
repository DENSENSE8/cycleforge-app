import { TrackingExceptionsTable } from '@/components/tracking-exceptions/TrackingExceptionsTable';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

export const dynamic = 'force-dynamic';

/** `/tracking-exceptions` — receiving scans that did not resolve to a Zoho PO. */
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
