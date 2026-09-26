'use client';

/** Add-orders leaf bodies for the To-ship rail. */

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
