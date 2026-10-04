'use client';

/**
 * One ORDER CARD on Operations › Imports › Orders — the imported-order
 * family's adapter over the shared {@link RecordCard} (the To-ship card
 * anatomy): line 1 the order number (the door into the order) · channel ·
 * source · what the import filled … review door · outcome; the title is the
 * SKU identity title; the facts are tracking, where in the source it came
 * from, and why it was held or skipped.
 */

import { memo, useMemo } from 'react';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardChip, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { TriageCardModelBase, TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import type { ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import { IMPORT_ROW_OUTCOME_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import { CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { useOrderChannel } from '@/hooks/useCatalog';
import type { ImportRunRowItem } from '@/lib/imports/types';
import {
  IMPORT_ROW_UNTITLED,
  filledFieldLabel,
  importRowLocator,
  importRowReasonLabel,
  importSourceLabel,
  importStamp,
} from '@/lib/imports/record-faces';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { IMPORT_ROWS_VIEW } from '@/lib/triage/views';
import { cn } from '@/utils/_cn';
import { ImportOrderNumber, ImportReviewDoor } from '../import-record-parts';
import { ImportCardPeek } from './ImportCardPeek';

/** One imported order per card. */
export type ImportRowCardModel = TriageCardModelBase<ImportRunRowItem>;

/** The imported order as the shared card reads it (`imports.rows`: the outcome face top-right); `channel` is the catalog-resolved storefront (a hook's). */
export function importRowRecordCard(model: ImportRowCardModel, channel: RecordCardModel['channel']): ViewCardModel<typeof IMPORT_ROWS_VIEW> {
  const row = model.lead;
  const state = IMPORT_ROW_OUTCOME_LIFECYCLE[row.outcome];
  const source = importSourceLabel(row.source);
  const locator = importRowLocator(row);
  const filled = row.filledFields.map(filledFieldLabel);
  const chips: RecordCardChip[] =
    filled.length > 0
      ? [
          {
            id: 'filled',
            tone: 'info',
            short: `${filled.length} filled`,
            long: `Filled ${filled.join(' · ')}`,
            tooltip: `This import filled ${filled.join(', ')}`,
          },
        ]
      : [];
  return {
    key: model.key,
    leadId: row.id,
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: `${state.label} by ${source} in run ${row.runId}`,
    alert: null,
    aria: {
      card: `Order ${row.externalOrderId}, ${state.label} by ${source}, ${row.title ?? ''}`,
      open: `Open the import record of order ${row.externalOrderId}`,
      check: `Select order ${row.externalOrderId}`,
    },
    channel,
    person: source,
    chips,
    notes: { fixed: null, own: null },
    status: { kind: 'state', face: state.label, tone: state.tone, tip: `${state.label} by ${source} in run ${row.runId}` },
    next: null,
    lines: [
      {
        id: row.id,
        title: row.title ?? IMPORT_ROW_UNTITLED,
        photoUrl: null,
        facts: {
          tracking: row.trackingNumber ? { kind: 'code', text: row.trackingNumber, title: 'Tracking number' } : null,
          locator: locator ? { kind: 'code', text: locator, title: `Where in ${source} it came from` } : null,
          reason: row.reason ? { kind: 'missing', text: importRowReasonLabel(row.reason) } : null,
        },
        alert: false,
        alertNote: null,
      },
    ],
    hiddenAlertLabel: () => '',
  };
}

export const ImportRowCard = memo(function ImportRowCard({
  model,
  checked,
  open,
  expanded,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  onTogglePeek,
  canReview,
}: TriageCardSlotProps<ImportRunRowItem, ImportRowCardModel> & { canReview: boolean }) {
  const row = model.lead;
  const channel = useOrderChannel()(row.externalOrderId, row.accountSource);

  const record = useMemo(
    () =>
      importRowRecordCard(
        model,
        channel.label
          ? {
              label: channel.label,
              tooltip: [channel.connectionName ?? channel.label, row.accountSource].filter(Boolean).join(' · '),
              dot: <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />,
              badge: null,
            }
          : null,
      ),
    [model, row.accountSource, channel],
  );

  const review = <ImportReviewDoor importExceptionId={row.importExceptionId} canReview={canReview} />;

  return (
    <RecordCard
      view={IMPORT_ROWS_VIEW}
      model={record}
      factColumns={IMPORT_ROWS_VIEW.facts}
      testIdPrefix={IMPORT_ROWS_VIEW.testIdPrefix}
      rowAttrs={{ 'data-import-row-id': row.id }}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(row, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{ role: 'identity', content: <ImportOrderNumber row={row} /> }}
      trailing={
        row.importExceptionId != null
          ? { role: 'trailing', content: <span className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto text-role-nav')}>{review}</span> }
          : null
      }
      quickLook={
        <ImportCardPeek
          key="peek"
          testId="import-row-card-peek"
          facts={[
            ['Imported', `${importStamp(row.createdAt)} PT`],
            ['Run', `Run ${row.runId}`],
            ['Account', row.accountSource],
            ['Item #', row.itemNumber],
            ['Order id', row.orderRowId],
            ['ShipStation shipment', row.shipstationShipmentId],
            ['Filled', row.filledFields.length > 0 ? row.filledFields.map(filledFieldLabel).join(', ') : null, true],
          ]}
        />
      }
    />
  );
});
