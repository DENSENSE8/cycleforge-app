import type { ReactNode } from 'react';
import { RecordGroup, RECORD_GROUP_TITLE_CLASS } from '@/design-system/components/record-ledger/RecordGroup';
import { cn } from '@/utils/_cn';

export type RecordFlowDirection = 'outbound' | 'inbound';

export interface RecordFlowLabels {
  party: 'Customer' | 'Vendor';
  movement: 'Shipping' | 'Purchased from';
}

const RECORD_FLOW_LABELS: Record<RecordFlowDirection, RecordFlowLabels> = {
  outbound: { party: 'Customer', movement: 'Shipping' },
  inbound: { party: 'Vendor', movement: 'Purchased from' },
};

/**
 * The directional vocabulary for a commerce record. Search, desk and compact
 * record surfaces read these labels rather than inventing local synonyms.
 */
export function recordFlowLabels(direction: RecordFlowDirection): RecordFlowLabels {
  return RECORD_FLOW_LABELS[direction];
}

/**
 * The paired relationship card in a commerce record.
 *
 * Outbound reads Customer → Shipping. Inbound mirrors the same scan path as
 * Vendor → Purchased from. The two regions share one card and exactly one
 * hairline so their information architecture stays recognizable across desks
 * and search. Item identity (including serials) belongs to the item region,
 * never to either relationship region or a workflow stage.
 */
export function RecordFlowFacts({
  direction,
  party,
  movement,
  testId,
}: {
  direction: RecordFlowDirection;
  party?: ReactNode;
  movement?: ReactNode;
  testId?: string;
}) {
  const labels = recordFlowLabels(direction);
  const hasParty = party != null;
  const hasMovement = movement != null;

  if (!hasParty && !hasMovement) return null;

  return (
    <RecordGroup
      title={`${labels.party} & ${labels.movement}`}
      titleHidden
      testId={testId}
      className="overflow-hidden"
    >
      {hasParty ? (
        <div role="group" aria-label={labels.party} data-record-flow-role="party">
          {party}
        </div>
      ) : null}
      {hasMovement ? (
        <div
          role="group"
          aria-label={labels.movement}
          data-record-flow-role="movement"
          className={cn(hasParty && 'border-t border-mode-edge')}
        >
          {movement}
        </div>
      ) : null}
    </RecordGroup>
  );
}

/** A consistently headed region inside {@link RecordFlowFacts}. */
export function RecordFlowSection({
  title,
  action,
  testId,
  children,
}: {
  title: string;
  action?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={testId}>
      <header className="flex min-h-mode-hit items-center gap-2 px-4 pt-1">
        <h3 className={cn(RECORD_GROUP_TITLE_CLASS, 'flex-1')}>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
