'use client';

/**
 * One repair ticket on ONE row — the Compact face of the repair list (Full is
 * {@link RepairCard}). Built by `recordRowFace` from the card's own model, so
 * both faces paint one truth; the identity is the ticket number the floor says.
 */

import { memo, useMemo } from 'react';
import { recordRowFace } from '@/design-system/components/triage-card-list/record-row-face';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageRow } from '@/design-system/components/triage-card-list/TriageRow';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { RepairCardModel } from '@/lib/repair/repair-card-model';
import { REPAIR_QUEUE_VIEW } from '@/lib/triage/views';
import { RepairCardPeek } from './RepairCard';

export const RepairRow = memo(function RepairRow(props: TriageCardSlotProps<RSRecord, RepairCardModel>) {
  const { model } = props;
  const face = useMemo(() => {
    const { ticket } = model.handles;
    return recordRowFace(model.record, REPAIR_QUEUE_VIEW, {
      identity: ticket ? `#${ticket}` : 'No ticket #',
    });
  }, [model]);
  return (
    <TriageRow
      {...props}
      face={face}
      testIdPrefix={REPAIR_QUEUE_VIEW.testIdPrefix}
      rowAttrs={{ 'data-repair-id': model.lead.id }}
      quickLook={<RepairCardPeek key="peek" model={model} />}
    />
  );
});
