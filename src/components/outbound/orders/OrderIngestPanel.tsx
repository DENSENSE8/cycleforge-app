'use client';

/**
 * Add-orders leaf bodies for the To-ship rail.
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

import { Database, FileText, Loader2 } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

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
        <p className="px-4 py-2 text-role-caption text-rose-700" role="alert">
          {error}{' '}
          <button type="button" className="underline" onClick={onClearError}>
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function SyncImportSection({
  isTransferring,
  manualSheetName,
  onSheetNameChange,
  status,
  onImport,
  onCancel,
}: {
  isTransferring: boolean;
  manualSheetName: string;
  onSheetNameChange: (next: string) => void;
  status: { type: 'success' | 'error'; message: string } | null;
  onImport: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="divide-y divide-border-hairline border-b border-border-hairline">
        <TextField
          appearance="flush"
          label="Sheet name (optional)"
          value={manualSheetName}
          onChange={onSheetNameChange}
          disabled={isTransferring}
          mono
        />
      </div>
      <div className="px-4 py-3">
        {isTransferring ? (
          <Button
            variant="danger"
            size="sm"
            icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
            onClick={onCancel}
            className="font-semibold"
          >
            Cancel import
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={<Database className="h-3.5 w-3.5" />}
            onClick={onImport}
            className="font-semibold"
            data-testid="order-ingest-import-latest"
          >
            Import latest orders
          </Button>
        )}
      </div>
      {status ? (
        <p
          className={cn(
            'px-4 py-2 text-role-caption',
            status.type === 'success' ? 'text-emerald-700' : 'text-rose-700',
          )}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
