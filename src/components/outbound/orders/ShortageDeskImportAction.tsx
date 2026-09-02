'use client';

/**
 * Shortage desk header CTA — Import coverage (CSV). Same pill slot as every
 * other desk primary ({@link DeskHeaderAction}); the picker is the shared
 * {@link useTableImportFilePicker} so To-ship / Incoming / Shortage do not
 * fork a second file input.
 */

import { useMemo } from 'react';
import { FileText } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import { SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR } from '@/lib/orders/shortage-coverage-import-descriptor';

export function ShortageDeskImportAction() {
  const csv = useTableImportFilePicker(SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR);

  const control = useMemo(
    () => (
      <div className="shrink-0" data-testid="shortage-desk-import">
        {csv.input}
        <DeskHeaderAction
          type="button"
          variant="primary"
          size="sm"
          icon={<FileText aria-hidden className="h-3.5 w-3.5" />}
          disabled={!csv.live}
          onClick={csv.open}
        >
          Import from file
        </DeskHeaderAction>
      </div>
    ),
    [csv.input, csv.live, csv.open],
  );

  return <DeskActionSlotRegistrar>{control}</DeskActionSlotRegistrar>;
}
