'use client';

/**
 * One EXCEPTION CARD — the hub family's adapter over the shared
 * {@link RecordCard} (the Allocate desk's card). The TAG — why it is an
 * exception — is said ONCE per row, the FBM way: the tone rail + glyph under
 * the checkbox, the word and its meaning on hover (`stateMeaning`), and the
 * section header above the band ("Out of stock · 34"). Line 1 is the blocked
 * entity, right-aligned when it was raised. The direct resolve verb sits at
 * the card's BOTTOM-RIGHT corner (owner 2026-09-29), never beside the identity.
 */

import { memo, useMemo } from 'react';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { OrderIdChip } from '@/components/ui/CopyChip';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { CollapseItem } from '@/design-system/components/Collapse';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { Button } from '@/design-system/primitives';
import { useOrderChannel } from '@/hooks/useCatalog';
import { EXCEPTION_KIND_SPEC, type ExceptionEntityType, type ExceptionRow } from '@/lib/exceptions/types';
import { platformDisplayName } from '@/lib/platform-display';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { EXCEPTIONS_VIEW } from '@/lib/triage/views';
import { formatDateTimePST } from '@/utils/date';
import { exceptionRecordCard, type ExceptionCardModel } from './exception-card-model';

/** The entity's fact label — what the id IS. */
const ENTITY_LABEL: Readonly<Record<ExceptionEntityType, string>> = {
  order: 'Order',
  sku: 'SKU',
  po: 'PO',
  carton: 'Carton',
  label: 'Label',
  location: 'Bin',
  tracking: 'Tracking',
};

/** Quick look (Space): what the face leaves out — the kind's rule, the entity's type, the full raised stamp. */
function ExceptionCardPeek({ row }: { row: ExceptionRow }) {
  const kind = EXCEPTION_KIND_SPEC[row.kind];
  const facts: [string, string | null][] = [
    ['Kind', kind.label],
    [ENTITY_LABEL[row.entity.type], row.entity.label],
    ['Raised', row.raisedAt ? `${formatDateTimePST(row.raisedAt)} PT` : null],
    ['Rule', kind.membership],
  ];
  return (
    <CollapseItem>
      <dl data-testid="exception-card-peek" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-role-data">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-muted">{label}</dt>
              <dd className="min-w-0 font-medium text-text-default">{value}</dd>
            </div>
          ))}
      </dl>
    </CollapseItem>
  );
}

export const ExceptionCard = memo(function ExceptionCard({
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
  showKind,
  onSaveNote,
}: TriageCardSlotProps<ExceptionRow, ExceptionCardModel> & {
  showKind: boolean;
  /** Saves the team's note from line 1 — order-backed rows only (the Allocate card's writer). */
  onSaveNote: (row: ExceptionRow, text: string) => void;
}) {
  const row = model.lead;
  // The order's channel, resolved exactly as the Allocate card does (brand dot + storefront name).
  const resolveChannel = useOrderChannel();
  const channel = useMemo<RecordCardModel['channel']>(() => {
    if (!row.order) return null;
    const resolved = resolveChannel(row.entity.label, row.order.accountSource);
    const label = platformDisplayName(resolved);
    return label ? { label, tooltip: label, dot: <BrandIdentityDot {...platformMetaBrandDot(resolved.meta)} />, badge: null } : null;
  }, [resolveChannel, row.entity.label, row.order]);
  const record = useMemo(() => exceptionRecordCard(model, showKind, channel), [model, showKind, channel]);
  return (
    <RecordCard
      model={record}
      factColumns={EXCEPTIONS_VIEW.facts}
      testIdPrefix={EXCEPTIONS_VIEW.testIdPrefix}
      rowAttrs={{ 'data-exception-key': row.key, 'data-exception-kind': row.kind }}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(row, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{
        role: 'identity',
        content: row.entity.type === 'order' ? (
          // The order number wears the Allocate card's chip: click copies it.
          <OrderIdChip value={row.entity.label} display={row.entity.label} plain dense truncateDisplay={false} fitDisplayWidth disableTooltip />
        ) : (
          <span className="truncate" title={`${ENTITY_LABEL[row.entity.type]} ${row.entity.label}`}>
            {row.entity.label}
          </span>
        ),
      }}
      onSaveNote={row.order ? (text) => onSaveNote(row, text) : undefined}
      trailing={null}
      action={
        <Button
          variant="secondary"
          size="sm"
          className="pointer-events-auto shrink-0"
          onClick={() => onOpen(row)}
          aria-label={`${row.resolveVerb} — ${row.entity.label}`}
          data-testid="exception-resolve-cta"
        >
          {row.resolveVerb}
        </Button>
      }
      quickLook={<ExceptionCardPeek key="peek" row={row} />}
    />
  );
});
