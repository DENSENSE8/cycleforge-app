'use client';

/**
 * Add-orders leaf bodies for the To-ship rail.
 *
 * `SyncImportSection` was deleted 2026-09-15 with the rail's `sync` leaf: order
 * import is its own measured run surface now (`OrderSyncRunView` on the desk,
 * `/m/orders/sync` on the phone), and a sheet-name field beside an "Import
 * latest orders" button was the second way to start the same job.
 *
 * Content only — the leaf list, the Root Index, its find row and its keybinds
 * all live in `DeskInspectorIndexShell` (the Unbox Displays recipe), composed
 * by {@link OrderIngestRail}. Nothing here paints chrome, a header, or a close:
 * the rail host owns the singleton dismiss.
 *
 * @domain-job outbound-order-ingest
 * @hardware-target Workbench
 * @density ops
 * @justification Leaf content for an existing index shell, not a new surface.
 */

import { FileText } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

export function FileImportSection({
  error,
  onClearError,
  onChoose,
}: {
  error: string | null;
  onClearError: () => void;
  onChoose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-border-hairline px-4 py-3 text-role-caption text-text-soft">
        Opens desk staging — triage Ready / Action required, then confirm into To-ship.
      </p>
      <div className="px-4 py-3">
        <Button
          variant="primary"
          size="sm"
          icon={<FileText className="h-3.5 w-3.5" />}
          onClick={onChoose}
          className="font-semibold"
          data-testid="order-ingest-choose-csv"
        >
          Choose CSV
        </Button>
      </div>
      {error ? (
        <p className="px-4 py-2 text-role-caption text-text-danger" role="alert">
          {error}{' '}
          <button type="button" className="underline" onClick={onClearError}>
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}
