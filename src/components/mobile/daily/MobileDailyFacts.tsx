'use client';

/**
 * The item sheet's FACT LEAF — what one checklist item is, read-only.
 *
 * Extracted from `MobileDailySheets` for the same reason `MobileDailyComposerFields`
 * was extracted from the composer: the sheet is a SHELL (state, permission,
 * commit) and these are its leaves, so a reviewer reading "what happens when I
 * press Save" is not scrolling past thirty lines of `<dt>`/`<dd>`.
 *
 * It answers, in order: what kind, whose, did I, did the shift, which day, what
 * is attached, when was it last touched — all derived from the report the API
 * already assembled and the links read, never re-counted here.
 *
 * NO `Id` ROW. The handle rides the sheet header's top-right corner (operator
 * 2026-09-15 — *"within the edit it can display the ID top right"*); a fact row
 * would print it twice on a 390px screen.
 */

import { TicketChip, TrackingChip } from '@/components/ui/CopyChip';
import { formatDateTimePST } from '@/utils/date';
import type { DailyCheckItem, DailyCheckItemLink, DailyCheckReport } from '@/lib/daily-checks/types';

const FACT_ROW = 'flex items-baseline justify-between gap-3';
const FACT_LABEL = 'text-role-micro uppercase tracking-wide text-text-faint';
const FACT_VALUE = 'min-w-0 truncate text-role-caption text-text-default';

/** The house face per link kind — ticket chip, WO mono, last-8 tracking. */
function LinkFace({ link }: { link: DailyCheckItemLink }) {
  if (link.entityType === 'TRACKING') return <TrackingChip value={link.label ?? ''} dense />;
  if (link.entityType === 'ZENDESK_TICKET') {
    return <TicketChip value={String(link.entityId)} display={`#${link.entityId}`} dense />;
  }
  return (
    <span className="font-mono text-role-caption tabular-nums text-text-default">
      WO-{link.entityId}
    </span>
  );
}

/**
 * The facts the sheet answers. The Shift fraction uses the item's OWN
 * denominator: the roster, except for an assigned one-off.
 */
function itemFacts(
  item: DailyCheckItem,
  report: DailyCheckReport | undefined,
): readonly { label: string; value: string }[] {
  const mineDone = report?.mine.doneItemIds.includes(item.id) ?? false;
  const roster = report?.staff ?? [];
  const teamDone = roster.filter((s) => s.doneItemIds.includes(item.id)).length;
  const teamTotal = item.kind === 'once' && item.assignedStaffId != null ? 1 : roster.length;
  return [
    { label: 'Kind', value: item.kind === 'once' ? 'Just today' : 'Every day' },
    {
      label: 'Owner',
      value:
        item.kind === 'once' ? (item.assignedStaffName ?? 'Whole shift') : 'The shift, every day',
    },
    { label: 'You', value: mineDone ? 'Checked off today' : 'Not checked off yet' },
    {
      label: 'Shift',
      value: teamTotal > 0 ? `${teamDone} of ${teamTotal} done` : 'No roster today',
    },
    { label: 'Day', value: report?.dateKey ?? '—' },
  ];
}

/**
 * The sheet's one scroller: the field and the verbs stay pinned above and
 * below, these facts move. `min-h-0` is load-bearing inside the sheet's flex
 * column — without it the list refuses to shrink and pushes Save off-screen.
 */
export function MobileDailyFacts({
  item,
  report,
  links,
  linksLoading,
  lastMarkedAt,
}: {
  item: DailyCheckItem;
  report: DailyCheckReport | undefined;
  links: readonly DailyCheckItemLink[] | undefined;
  linksLoading: boolean;
  /** The viewer's newest mark instant on this day, or null. */
  lastMarkedAt: string | null;
}) {
  return (
    <dl className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-1 pt-3">
      {item.description ? (
        <div className="flex flex-col gap-1">
          <dt className={FACT_LABEL}>Description</dt>
          <dd className="whitespace-pre-wrap break-words text-role-caption text-text-default">
            {item.description}
          </dd>
        </div>
      ) : null}

      {itemFacts(item, report).map((fact) => (
        <div key={fact.label} className={FACT_ROW}>
          <dt className={FACT_LABEL}>{fact.label}</dt>
          <dd className={FACT_VALUE}>{fact.value}</dd>
        </div>
      ))}
      <div className={FACT_ROW}>
        <dt className={FACT_LABEL}>Links</dt>
        <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {linksLoading ? (
            <span className="text-role-caption text-text-muted">Loading…</span>
          ) : links && links.length > 0 ? (
            links.map((link) => <LinkFace key={link.id} link={link} />)
          ) : (
            <span className="text-role-caption text-text-muted">None</span>
          )}
        </dd>
      </div>
      {lastMarkedAt ? (
        <div className={FACT_ROW}>
          <dt className={FACT_LABEL}>Last mark</dt>
          <dd className="text-role-caption text-text-default">
            {formatDateTimePST(lastMarkedAt)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
