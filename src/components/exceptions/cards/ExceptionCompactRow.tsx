'use client';

/**
 * One exception on ONE row — the Compact face of the Exceptions list (Full is
 * {@link ExceptionCard}). Built from the card's own model
 * (`exceptionRecordCard` → `recordRowFace`), so both faces paint one truth:
 * the tag as the state rail, the blocked record as the identity, its title,
 * the evidence fact and the raised stamp. Space folds the card's quick look.
 */

import { memo, useMemo } from 'react';
import { recordRowFace } from '@/design-system/components/triage-card-list/record-row-face';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageRow } from '@/design-system/components/triage-card-list/TriageRow';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { EXCEPTIONS_VIEW } from '@/lib/triage/views';
import { ExceptionCardPeek } from './ExceptionCard';
import { exceptionRecordCard, type ExceptionCardModel } from './exception-card-model';

export const ExceptionCompactRow = memo(function ExceptionCompactRow(props: TriageCardSlotProps<ExceptionRow, ExceptionCardModel>) {
  const { model } = props;
  const row = model.lead;
  // The row paints neither channel nor kind (the section names the kind), so the card's lookups are not needed here.
  const face = useMemo(
    () =>
      recordRowFace(exceptionRecordCard(model, false, null), EXCEPTIONS_VIEW, {
        identity: model.lead.entity.label,
        identityWidth: 'long',
      }),
    [model],
  );
  return (
    <TriageRow
      {...props}
      face={face}
      testIdPrefix={EXCEPTIONS_VIEW.testIdPrefix}
      rowAttrs={{ 'data-exception-key': row.key, 'data-exception-kind': row.kind }}
      quickLook={<ExceptionCardPeek key="peek" row={row} />}
    />
  );
});
