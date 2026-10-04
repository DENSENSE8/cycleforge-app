'use client';

/**
 * One import run on ONE row — the Compact face of Imports › Runs (Full is
 * {@link ImportRunCard}). Face from the card's own model (`importRunRecordCard`
 * via `recordRowFace`), so both densities paint one truth.
 */

import { memo, useMemo } from 'react';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { recordRowFace } from '@/design-system/components/triage-card-list/record-row-face';
import { TriageRow } from '@/design-system/components/triage-card-list/TriageRow';
import { usePlatformMeta } from '@/hooks/useCatalog';
import type { ImportRunListItem } from '@/lib/imports/types';
import { IMPORT_RUNS_VIEW } from '@/lib/triage/views';
import { importRunPeek, importRunRecordCard, type ImportRunCardModel } from './ImportRunCard';

export const ImportRunRow = memo(function ImportRunRow(props: TriageCardSlotProps<ImportRunListItem, ImportRunCardModel>) {
  const { model } = props;
  const platformMeta = usePlatformMeta();
  const run = model.lead;
  const face = useMemo(
    () => recordRowFace(importRunRecordCard(model, platformMeta), IMPORT_RUNS_VIEW, { identity: `Run ${run.id}` }),
    [model, platformMeta, run.id],
  );
  return (
    <TriageRow
      {...props}
      face={face}
      testIdPrefix={IMPORT_RUNS_VIEW.testIdPrefix}
      rowAttrs={{ 'data-import-run-id': run.id }}
      quickLook={importRunPeek(run)}
    />
  );
});
