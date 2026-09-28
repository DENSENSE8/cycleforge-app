'use client';

import Link from 'next/link';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { Button } from '@/design-system/primitives';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { IMPORTS_PATH, importStamp, importTriggerLabel } from '@/lib/imports/record-faces';
import { useImportRun } from '@/lib/imports/record-client';
import { cn } from '@/utils/_cn';

/** `?run=` on the Orders view: which run the list is narrowed to, with the way out. */
export function ImportRunScopeBanner({ runId, onClear }: { runId: number; onClear: () => void }) {
  const run = useImportRun(runId).data;
  return (
    <EvidenceNotice>
      <span className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate">
          Orders from run {runId}
          {run ? ` · ${importTriggerLabel(run)} · ${importStamp(run.startedAt)} PT` : ''}
        </span>
        <Link href={`${IMPORTS_PATH}?run=${runId}`} className={cn(RECORD_LABEL_CLASS, 'shrink-0 hover:underline')}>
          Open run
        </Link>
        <Button variant="secondary" size="sm" onClick={onClear}>
          All runs
        </Button>
      </span>
    </EvidenceNotice>
  );
}
