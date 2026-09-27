'use client';

/**
 * Inbound › On the way — the TRIAGE face: one card per purchase inside the
 * desk stage's width, for In place and Split. Floor (⌘/Ctrl+Shift+F) keeps
 * the industrial `RecordLedger`. Same rows, open record, selection and record
 * cursor as the ledger — `IncomingDeliveriesLedger` owns that state and picks
 * the face — so a view switch never loses the open delivery.
 */

import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CollapseItem } from '@/design-system/components/Collapse';
import { DESK_RECORD_ANCHOR_ATTR, DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import type { RowGroup } from '@/lib/group-rows';
import { foldKey } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { purchaseDeliveryState } from '../IncomingDeliveryRecord';
import { IncomingDeliveryCard, type IncomingDeliveryCardModel } from './IncomingDeliveryCard';
import {
  INCOMING_SECTION_LABELS,
  isIncomingSection,
  type IncomingSection,
} from '@/lib/receiving/incoming-sections';
import { cn } from '@/utils/_cn';

const SPRING = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 } as const;

interface IncomingDeliveryCardListProps {
  groups: readonly [string, RowGroup<ReceivingLineRow>[]][];
  loading: boolean;
  empty: ReactNode;
  /** The ledger's open entry key (`group` key or `line:<id>`). */
  openKey: string | null;
  onOpenKey: (key: string) => void;
  onClose: () => void;
  selectedIds: Set<number>;
  onToggleRow: (row: ReceivingLineRow) => void;
  /** Filter + sort — above the cards (right) while no record is open. */
  toolbar?: ReactNode;
  /** Status chips — top-left of the same row. */
  statusChips?: ReactNode;
  /** One line above the list (e.g. the pasted list hit the row cap). */
  notice?: string | null;
  /** The `groups` bands are urgency sections: head each with its name and count. */
  sectioned?: boolean;
  recordTitle: ReactNode;
  recordSubtitle?: ReactNode;
  record: ReactNode;
  /** The open record's verbs — under the list's anchor, like the ledger's strip. */
  actionStrip?: ReactNode;
  indexLabel?: string;
  summary: RecordLedgerSummary;
  footer?: ReactNode;
  scrollRef: RefObject<HTMLDivElement>;
}

export function IncomingDeliveryCardList({
  groups,
  loading,
  empty,
  openKey,
  onOpenKey,
  onClose,
  selectedIds,
  onToggleRow,
  toolbar,
  statusChips,
  notice,
  sectioned = false,
  recordTitle,
  recordSubtitle,
  record,
  actionStrip,
  indexLabel,
  summary,
  footer,
  scrollRef,
}: IncomingDeliveryCardListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // J / K walk the same record cursor the ledger publishes; the plane owns Esc.
  useRecordCursorKeyboard({ enabled: true, scope: 'record', escape: false });

  const { cards, sectionOf, sectionCounts } = useMemo(() => {
    const next: IncomingDeliveryCardModel[] = [];
    const section = new Map<string, IncomingSection>();
    const counts = new Map<IncomingSection, number>();
    for (const [band, bandGroups] of groups) {
      const bandSection = sectioned && isIncomingSection(band) ? band : null;
      for (const group of bandGroups) {
        const rows = group.rows;
        const lead = rows[0];
        if (!lead) continue;
        // The ledger's own keys, so the open record survives a face switch.
        const key = rows.length > 1 ? foldKey(band, group.key) : `line:${lead.id}`;
        next.push({ key, rows, state: purchaseDeliveryState(rows) });
        if (bandSection) {
          section.set(key, bandSection);
          counts.set(bandSection, (counts.get(bandSection) ?? 0) + 1);
        }
      }
    }
    return { cards: next, sectionOf: section, sectionCounts: counts };
  }, [groups, sectioned]);

  const openLineId = openKey?.startsWith('line:') ? Number(openKey.slice(5)) : null;

  const toggleExpand = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const list = (
    <div data-testid="incoming-delivery-cards" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className="shrink-0">
        {openKey == null && (toolbar || statusChips) ? (
          <div className="flex items-center gap-2 pb-1 pt-2">
            <div className="flex min-w-0 flex-1 items-center">{statusChips}</div>
            {toolbar ? <div className="flex shrink-0 items-center gap-1">{toolbar}</div> : null}
          </div>
        ) : null}
        {notice ? (
          <p role="status" data-testid="incoming-notice" className="px-4 pb-1 text-xs font-semibold text-text-warning">
            {notice}
          </p>
        ) : null}
        {openKey != null && actionStrip ? <div className="pt-2">{actionStrip}</div> : null}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="pb-6 pt-1">
          {cards.length === 0 ? (
            loading ? (
              <CardSkeletons />
            ) : (
              <div className="flex min-h-60 flex-col items-center justify-center gap-2 text-center text-sm text-text-muted">
                {empty}
              </div>
            )
          ) : (
            <ul role="list" aria-label="Incoming deliveries" aria-busy={loading || undefined} className="flex flex-col">
              <AnimatePresence initial={false}>
                {cards.flatMap((card, index) => {
                  const section = sectionOf.get(card.key) ?? null;
                  const head =
                    section && (index === 0 || sectionOf.get(cards[index - 1]!.key) !== section) ? (
                      <motion.li
                        key={`section:${section}`}
                        layout="position"
                        data-testid="incoming-delivery-section"
                        data-section={section}
                        className="sticky top-0 z-20 -mx-1 flex items-center gap-2 bg-surface-card/90 px-5 pb-1.5 pt-3 backdrop-blur-sm"
                      >
                        <span className={cn('text-xs font-semibold', section === 'delivered' ? 'text-text-danger' : section === 'today' ? 'text-text-warning' : 'text-text-muted')}>
                          {INCOMING_SECTION_LABELS[section]}
                        </span>
                        <span className="rounded-full bg-surface-sunken px-1.5 text-[11px] font-semibold tabular-nums text-text-muted">
                          {sectionCounts.get(section) ?? 0}
                        </span>
                      </motion.li>
                    ) : null;
                  const item = (
                  <CollapseItem key={card.key} as="li" enter={false}>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING, delay: Math.min(index, 14) * 0.02 }}
                    >
                      <IncomingDeliveryCard
                        model={card}
                        open={openKey === card.key || (openLineId != null && card.rows.some((row) => row.id === openLineId))}
                        openLineId={openLineId}
                        expanded={expanded.has(card.key)}
                        selectedIds={selectedIds}
                        onOpen={onOpenKey}
                        onToggleExpand={toggleExpand}
                        onToggleRow={onToggleRow}
                      />
                    </motion.div>
                  </CollapseItem>
                  );
                  return head ? [head, item] : [item];
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
      {footer ? (
        <div className="flex shrink-0 items-center gap-3 border-t border-border-hairline px-3 py-1.5 text-xs text-text-muted">
          {footer}
        </div>
      ) : null}
    </div>
  );

  return (
    <div data-testid="incoming-deliveries-ledger" data-face="cards" className="flex min-h-0 min-w-0 flex-1">
      <DeskRecordPlane
        open={openKey != null}
        onClose={onClose}
        title={recordTitle}
        subtitle={recordSubtitle}
        indexLabel={indexLabel}
        list={list}
        summary={<RecordLedgerSummaryPane summary={summary} />}
        recordNoun="delivery"
        recordKey={openKey}
        testId="incoming-deliveries-ledger-record"
      >
        {record}
      </DeskRecordPlane>
    </div>
  );
}

function CardSkeletons() {
  return (
    <div aria-busy role="status" aria-label="Loading deliveries" className="flex flex-col gap-1 px-1">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-2xl px-4 py-3">
          <span className="size-12 animate-pulse rounded-xl bg-surface-sunken" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-3 w-1/3 animate-pulse rounded bg-surface-sunken" />
            <span className="h-3 w-2/3 animate-pulse rounded bg-surface-sunken" />
          </span>
        </div>
      ))}
    </div>
  );
}
