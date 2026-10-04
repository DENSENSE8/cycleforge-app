'use client';

/**
 * MobileRecordCard — the phone's ONE face for a record in a list (owner
 * 2026-10-03: "V1-looking" truncated rows are retired).
 *
 *   ▌Order 65767176  [New]                    Oct 2
 *   ▌Vintage Sony Walkman WM-2 cassette player, silver,
 *   ▌with original belt clip
 *   ▌Supplier Goodwill · Tracking 1Z…full number
 *   ▌2 items                                  $84.50
 *
 * Fixed hierarchy: identity top-left, timestamp top-right, the full title
 * under the identity, then detail / facts, count bottom-left, money
 * bottom-right. NOTHING that identifies or describes the record is truncated,
 * clamped or ellipsized — every slot wraps (`break-words`). Lines and details
 * are not shown inline: the whole card is the tap target (`onOpen`) that
 * drills into a scrollable detail (a sheet for a linked quick look, a route
 * for a primary record). The left rail and the status pill carry `tone`.
 *
 * Selection mode (a pick-many step, e.g. which shelves to print): pass
 * `selected` as a boolean and the tap toggles membership instead of drilling
 * in — the card reports `aria-pressed`, paints the accent ring and a check in
 * the top-right corner.
 *
 * Tier 3 by construction: no className, no children — the slots are typed, so
 * a caller cannot re-introduce a truncated column layout. Press feedback is
 * MobileDataListRow's (surface-hover / surface-selected), never ink inversion.
 */

import { useId, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { MOBILE_DATA_LIST_ROW_INTERACTION_CLASS } from '@/design-system/components/MobileDataListRow';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { TAP_MIN_H_CLASS } from '@/design-system/tokens/interaction';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';

export interface MobileRecordCardFact {
  label: string;
  value: string;
}

export type MobileRecordCardTone = 'neutral' | 'ok' | 'warn' | 'bad';

export interface MobileRecordCardProps {
  /** Top-left, e.g. "Order 65767176". */
  identity: string;
  /** Top-right, preformatted (src/utils date formatters). */
  timestamp?: string | null;
  /** Full, wraps, never truncated. */
  title: string;
  /** Wraps under the title. */
  detail?: string | null;
  /** Label/value facts; wrap, never truncated. */
  facts?: readonly MobileRecordCardFact[];
  /** Bottom-left, e.g. "2 items". */
  count?: string | null;
  /** Bottom-right, preformatted money. */
  amount?: string | null;
  /** Short state word, e.g. "New", "Needs fix". */
  status?: string | null;
  tone?: MobileRecordCardTone;
  /** The whole card is the tap target → drill into the record's detail (or, with `selected`, toggle it). */
  onOpen?: () => void;
  /** Selection mode: the card is a toggle in a pick-many list; `true` = picked. */
  selected?: boolean;
  testId?: string;
}

const TONE_STATE = { neutral: 'neutral', ok: 'success', warn: 'warning', bad: 'danger' } as const;

const CARD_CLASS =
  'relative flex w-full min-w-0 flex-col gap-1 overflow-hidden rounded-mode bg-surface-card py-3 pl-4 pr-3 text-left text-text-default ring-1 ring-inset ring-border-hairline';

function CardBody({
  identity,
  timestamp,
  title,
  detail,
  facts,
  count,
  amount,
  status,
  tone = 'neutral',
  selected,
  testId,
}: Omit<MobileRecordCardProps, 'onOpen'>) {
  const toneClasses = STATE_TONE_CLASSES[TONE_STATE[tone]];
  const part = (name: string) => (testId ? `${testId}-${name}` : undefined);
  const hasFoot = Boolean(count || amount);
  return (
    <>
      {tone !== 'neutral' ? <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', toneClasses.dot)} /> : null}
      <span className="flex min-w-0 items-start gap-2">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span data-testid={part('identity')} className="min-w-0 break-words text-role-data font-semibold tabular-nums">
            {identity}
          </span>
          {status ? (
            <span data-testid={part('status')} className={cn('rounded-md px-1.5 text-role-caption', toneClasses.pill)}>
              {status}
            </span>
          ) : null}
        </span>
        {timestamp ? (
          <span data-testid={part('timestamp')} className="shrink-0 text-role-caption tabular-nums text-text-muted">
            {timestamp}
          </span>
        ) : null}
        {selected !== undefined ? (
          <span
            aria-hidden
            data-testid={part('check')}
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              selected ? 'bg-fill-info text-text-inverse' : 'border border-border-strong',
            )}
          >
            {selected ? <Check className="h-3.5 w-3.5" /> : null}
          </span>
        ) : null}
      </span>
      <span data-testid={part('title')} className="block min-w-0 break-words text-role-body font-medium">
        {title}
      </span>
      {detail ? (
        <span data-testid={part('detail')} className="block min-w-0 break-words text-role-caption text-text-muted">
          {detail}
        </span>
      ) : null}
      {facts && facts.length > 0 ? (
        <span data-testid={part('facts')} className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-role-caption">
          {facts.map((fact) => (
            <span key={fact.label} className="min-w-0 break-words">
              <span className="text-text-muted">{fact.label}</span> <span className="font-medium">{fact.value}</span>
            </span>
          ))}
        </span>
      ) : null}
      {hasFoot ? (
        <span className="mt-1 flex min-w-0 items-end gap-3">
          <span data-testid={part('count')} className="min-w-0 flex-1 break-words text-role-caption text-text-muted">
            {count}
          </span>
          {amount ? (
            <span data-testid={part('amount')} className="shrink-0 text-role-data font-semibold tabular-nums">
              {amount}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

export function MobileRecordCard({ onOpen, testId, ...body }: MobileRecordCardProps) {
  if (!onOpen) {
    return (
      <article data-testid={testId} className={CARD_CLASS}>
        <CardBody {...body} testId={testId} />
      </article>
    );
  }
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onOpen}
      aria-pressed={body.selected}
      className={cn(
        'ds-raw-button touch-manipulation',
        CARD_CLASS,
        TAP_MIN_H_CLASS,
        MOBILE_DATA_LIST_ROW_INTERACTION_CLASS,
        focusRing('control'),
        body.selected && 'ring-2 ring-border-accent',
      )}
    >
      <CardBody {...body} testId={testId} />
    </button>
  );
}

/** Grouped stack of MobileRecordCards: the page inset and the gap between cards. */
export function MobileRecordCardList({ children, label }: { children: ReactNode; label?: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={label ? headingId : undefined} className="flex flex-col gap-2 px-mode-page py-3">
      {label ? (
        <h2 id={headingId} className="break-words text-role-body font-medium text-mode-ink">
          {label}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
