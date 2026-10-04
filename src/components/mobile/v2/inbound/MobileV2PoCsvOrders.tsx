'use client';

/**
 * The orders of a purchase-order CSV, as the phone shows them in the import's
 * Review and Import steps: one `MobileRecordCard` per order, grouped by status
 * (what needs a fix first), and the order's drill sheet — every line of that
 * order as its own card, with the exact file row and field of each problem.
 * The card never lists lines inline; tapping it is the pinpoint view.
 */

import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import {
  MobileRecordCard,
  MobileRecordCardList,
  type MobileRecordCardFact,
  type MobileRecordCardTone,
} from '@/design-system/components/MobileRecordCard';
import { formatInboundMoney } from '@/lib/inbound/inbound-order-compose';
import { PO_COLUMNS } from '@/lib/inbound/po-columns';
import type { PoCsvOrderSummary } from '@/lib/inbound/po-csv-import';
import type { PoReviewGroup, PoReviewLine, PoReviewOrder, PoReviewStatus } from '@/lib/inbound/po-csv-review';
import { formatDateKeyMedium } from '@/utils/date';

/** The file carries no currency column; CSV purchase orders are dollars. */
const CSV_CURRENCY = 'USD';

/** `review` = the dry run (before Import); `result` = what the writer did. */
export type PoOrdersPhase = 'review' | 'result';

const STATUS_WORD: Record<PoOrdersPhase, Record<PoReviewStatus, string>> = {
  review: { needs_fix: 'Needs fix', failed: 'Failed', new: 'New', updated: 'Updated', unchanged: 'Unchanged' },
  result: { needs_fix: 'Held', failed: 'Failed', new: 'Added', updated: 'Updated', unchanged: 'Unchanged' },
};

const STATUS_TONE: Record<PoReviewStatus, MobileRecordCardTone> = {
  needs_fix: 'warn',
  failed: 'bad',
  new: 'ok',
  updated: 'neutral',
  unchanged: 'neutral',
};

/** "1 order" / "3 orders" — the import's one count wording. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function orderDateLabel(dateKey: string | null): string | null {
  return dateKey ? formatDateKeyMedium(dateKey, { weekday: 'none', withYear: true }) : null;
}

/** Problems as card facts, labelled by the field they name — labels kept distinct. */
function problemFacts(line: PoReviewLine): MobileRecordCardFact[] {
  const seen = new Set<string>();
  return line.problems.map((p) => {
    let label = PO_COLUMNS[p.field].label;
    for (let n = 2; seen.has(label); n += 1) label = `${PO_COLUMNS[p.field].label} (${n})`;
    seen.add(label);
    return { label, value: p.message };
  });
}

/** File row, as a spreadsheet numbers it (header is row 1). */
function fileRowLabel(line: PoReviewLine): string {
  return `Row ${line.row + 2}`;
}

function groupHeading(status: PoReviewStatus, phase: PoOrdersPhase, count: number): string {
  return `${STATUS_WORD[phase][status]} · ${count}`;
}

function PoOrderGroups({
  groups,
  orphans,
  phase,
  onOpen,
}: {
  groups: readonly PoReviewGroup[];
  /** File rows with no order number — shown with what needs a fix. */
  orphans: readonly PoReviewLine[];
  phase: PoOrdersPhase;
  onOpen: (orderKey: string) => void;
}) {
  const needsFix = groups.find((g) => g.status === 'needs_fix');
  const rest = groups.filter((g) => g.status !== 'needs_fix');
  return (
    <div data-testid={`m-po-csv-${phase}-orders`}>
      {needsFix || orphans.length ? (
        <MobileRecordCardList label={groupHeading('needs_fix', phase, (needsFix?.orders.length ?? 0) + orphans.length)}>
          {needsFix?.orders.map((order) => <PoOrderCard key={order.key} order={order} phase={phase} onOpen={onOpen} />)}
          {orphans.map((line) => (
            <MobileRecordCard
              key={`row-${line.row}`}
              identity={fileRowLabel(line)}
              title={line.title ?? 'No item title'}
              detail="Not in any order — the row has no order number."
              facts={problemFacts(line)}
              status={STATUS_WORD[phase].needs_fix}
              tone="warn"
              testId={`m-po-csv-row-${line.row}`}
            />
          ))}
        </MobileRecordCardList>
      ) : null}
      {rest.map((group) => (
        <MobileRecordCardList key={group.status} label={groupHeading(group.status, phase, group.orders.length)}>
          {group.orders.map((order) => <PoOrderCard key={order.key} order={order} phase={phase} onOpen={onOpen} />)}
        </MobileRecordCardList>
      ))}
    </div>
  );
}

function PoOrderCard({ order, phase, onOpen }: { order: PoReviewOrder; phase: PoOrdersPhase; onOpen: (orderKey: string) => void }) {
  const [first] = order.lines;
  const more = order.lines.length - 1;
  const problems = order.orderProblems.length + order.lines.reduce((sum, l) => sum + l.problems.length, 0);
  const firstProblem = order.orderProblems[0] ?? order.lines.flatMap((l) => l.problems.map((p) => `${fileRowLabel(l)}: ${p.message}`))[0];
  return (
    <MobileRecordCard
      identity={`Order ${order.orderNumber}`}
      timestamp={orderDateLabel(order.orderDate)}
      title={first?.title ?? 'No item title'}
      detail={more > 0 ? `+${plural(more, 'more item')}` : null}
      facts={problems && firstProblem ? [{ label: problems === 1 ? 'To fix' : `To fix (${problems})`, value: firstProblem }] : undefined}
      count={plural(order.units, 'item')}
      amount={order.totalCents != null ? formatInboundMoney(order.totalCents, CSV_CURRENCY) : null}
      status={STATUS_WORD[phase][order.status]}
      tone={STATUS_TONE[order.status]}
      onOpen={() => onOpen(order.key)}
      testId={`m-po-csv-order-${order.orderNumber}`}
    />
  );
}

/** The pinpoint view of one order: every line, its file row, and each problem by field. */
export function PoOrderSheet({ order, phase, onClose }: { order: PoReviewOrder | null; phase: PoOrdersPhase; onClose: () => void }) {
  return (
    <MobileV2ActionSheet
      open={order != null}
      onClose={onClose}
      eyebrow={order ? STATUS_WORD[phase][order.status] : undefined}
      title={order ? `Order ${order.orderNumber}` : 'Order'}
      description={
        order
          ? [plural(order.units, 'item'), order.totalCents != null ? formatInboundMoney(order.totalCents, CSV_CURRENCY) : null, orderDateLabel(order.orderDate)]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      verbs={[]}
      onVerb={() => undefined}
      dockLabel="Order lines"
      testId="m-po-csv-order-sheet"
    >
      {order?.orderProblems.length ? (
        <ul className="space-y-1 px-mode-page pt-3 text-role-caption text-text-warning" aria-label="Order problems">
          {order.orderProblems.map((problem) => (
            <li key={problem} className="break-words">
              {problem}
            </li>
          ))}
        </ul>
      ) : null}
      {order ? (
        <MobileRecordCardList label={plural(order.lines.length, 'line')}>
          {order.lines.map((line) => (
            <MobileRecordCard
              key={line.row}
              identity={line.itemNumber ? `Item ${line.itemNumber}` : fileRowLabel(line)}
              timestamp={line.itemNumber ? fileRowLabel(line) : null}
              title={line.title ?? 'No item title'}
              facts={[
                ...(line.sku ? [{ label: 'SKU', value: line.sku }] : []),
                ...(line.tracking ? [{ label: 'Tracking', value: line.tracking }] : []),
                ...problemFacts(line),
              ]}
              count={line.quantity != null ? `Qty ${line.quantity}` : 'Qty missing'}
              amount={
                line.unitCostCents != null
                  ? `${formatInboundMoney(line.unitCostCents, CSV_CURRENCY)}${line.quantity != null && line.quantity > 1 ? ' each' : ''}`
                  : null
              }
              status={line.problems.length ? STATUS_WORD.review.needs_fix : null}
              tone={line.problems.length ? 'warn' : 'neutral'}
              testId={`m-po-csv-line-${line.row}`}
            />
          ))}
        </MobileRecordCardList>
      ) : null}
    </MobileV2ActionSheet>
  );
}

/** Step 3 "Review orders": the dry run's counts, then the order cards by status. */
export function PoReviewStep({
  summary,
  checking,
  error,
  groups,
  orphans,
  onOpen,
}: {
  summary: PoCsvOrderSummary | null;
  checking: boolean;
  error: string | null;
  groups: readonly PoReviewGroup[];
  orphans: readonly PoReviewLine[];
  onOpen: (orderKey: string) => void;
}) {
  if (checking) return <p className="px-mode-page py-3 text-role-caption text-text-muted">Checking every order against what is already on file…</p>;
  if (error) return <p className="break-words px-mode-page py-3 text-role-caption text-text-warning">{error}</p>;
  return (
    <>
      {summary ? (
        <p className="break-words px-mode-page pt-3 text-role-body text-text-default" data-testid="m-po-csv-review-summary">
          {[
            plural(summary.orders, 'order'),
            summary.new ? `${summary.new} new` : null,
            summary.updated ? `${summary.updated} updated` : null,
            summary.unchanged ? `${summary.unchanged} unchanged` : null,
            summary.needsFix ? `${summary.needsFix} need a fix` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      {summary?.needsFix ? (
        <p className="break-words px-mode-page pt-1 text-role-caption text-text-muted">
          An order that needs a fix stays out of this import, whole. Fix the file and upload it again.
        </p>
      ) : null}
      <PoOrderGroups groups={groups} orphans={orphans} phase="review" onOpen={onOpen} />
    </>
  );
}

/** Step 4 "Import": in flight, failed, or what the writer did — grouped like the review. */
export function PoImportStep({
  importing,
  error,
  summary,
  groups,
  orphans,
  onOpen,
}: {
  /** Orders being imported; null when not in flight. */
  importing: number | null;
  error: string | null;
  summary: PoCsvOrderSummary | null;
  groups: readonly PoReviewGroup[];
  orphans: readonly PoReviewLine[];
  onOpen: (orderKey: string) => void;
}) {
  if (importing != null) return <p className="px-mode-page py-3 text-role-body text-text-default">Importing {plural(importing, 'order')}…</p>;
  if (error) return <p className="break-words px-mode-page py-3 text-role-body text-text-warning">{error}</p>;
  if (!summary) return null;
  return (
    <>
      <p className="break-words px-mode-page pt-3 text-role-body text-text-default" data-testid="m-po-csv-landed">
        {[
          `${summary.landed} imported`,
          summary.unchanged ? `${summary.unchanged} unchanged` : null,
          summary.needsFix ? `${summary.needsFix} held` : null,
          summary.failed ? `${summary.failed} failed` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <PoOrderGroups groups={groups} orphans={orphans} phase="result" onOpen={onOpen} />
    </>
  );
}
