'use client';

/**
 * One purchase on ONE row — the Compact face of the Inbound list (Full is
 * {@link IncomingDeliveryCard}). The face is derived from the card's own
 * {@link receiptRecordCard} model and the same `OperationalIdentity`, so both densities paint one truth.
 */

import { memo, useMemo } from 'react';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageRow } from '@/design-system/components/triage-card-list/TriageRow';
import { recordRowFace } from '@/design-system/components/triage-card-list/record-row-face';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { ReceiptCardPeek } from './IncomingDeliveryCard';
import { receiptRecordCard, type ReceiptCardModel } from './receipt-card-model';

export const IncomingDeliveryRow = memo(function IncomingDeliveryRow(props: TriageCardSlotProps<ReceivingLineRow, ReceiptCardModel>) {
  const { model } = props;
  const face = useMemo(
    () =>
      recordRowFace(receiptRecordCard(model), INCOMING_PIPELINE_VIEW, {
        identity: model.identity,
        identityWidth: 'long',
      }),
    [model],
  );
  return (
    <TriageRow
      {...props}
      face={face}
      testIdPrefix={INCOMING_PIPELINE_VIEW.testIdPrefix}
      quickLook={<ReceiptCardPeek key="peek" model={model} />}
    />
  );
});
