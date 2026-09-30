'use client';

/**
 * RecordCardMobile — the triage card's PHONE face (owner 2026-09-28, BRIEF
 * §14): the desk {@link RecordCard}'s information laid out for a thumb.
 *
 *   [📍 A-14-03-B]                              ● Due today
 *   ┌────┐ Shimano XT derailleur rear, 11-speed
 *   └────┘ ×1 · Used · $89 · ● eBay
 *   +2 items ▾
 *
 * Owner 2026-09-29: the TOP ROW is the location (left, room for a real bin
 * code) and the due date (right), no state rail. A family MAY add its state
 * code and the handle the operator holds after the location (QC queue:
 * `[📍 No bin] RET R-51815 …… 3D`). The BODY ROW: the square photo (no
 * corner) at the far left, exactly as tall as its two rows — the title (one
 * line) over the subtitle: the family's facts, then the channel (dot + name)
 * and, when the family names one, the next step ("→ Test"). No checkbox, no
 * hover peek, no chips, no notes, no verbs. The whole card is the open
 * target; the location badge and "+N items" are the only other presses.
 * Nothing here knows the family: the adapter hands a
 * {@link RecordCardMobileModel} (Law 1).
 */

import { useState } from 'react';
import { ArrowRight, ChevronDown, Package } from '@/components/Icons';
import { LocationBadge } from '@/design-system/components/LocationBadge';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { RECORD_DEADLINE_DOT_CLASS, RECORD_DEADLINE_TONE_CLASS, RECORD_MOBILE_PHOTO_SIZE_CLASS } from '@/design-system/tokens/record-card';
import { cn } from '@/utils/_cn';
import { RecordFactSep, RecordLineFacts, type RecordFactColumn } from './record-fact';
import type { RecordCardLine, RecordCardMobileModel } from './record-card-types';

export interface RecordCardMobileProps {
  model: RecordCardMobileModel;
  /** The family's fact columns, in order (orders: qty · condition · price). */
  factColumns: readonly RecordFactColumn[];
  /** Where the record sits — the top row's first element. `onPress` makes it the set-location door. */
  location: { path: string | null; onPress?: () => void };
  onOpen: () => void;
  testIdPrefix: string;
}

const PHOTO_BOX = { lg: RECORD_MOBILE_PHOTO_SIZE_CLASS, xl: 'size-28' } as const;

/**
 * The phone's product photo: square, no corner, the image filling the square
 * (`object-cover` — a letterboxed well reads as padding); no photo → the
 * package placeholder. `lg`: the list card's lines, exactly their two body
 * rows tall. `xl`: the order's pick screen, big enough to find the item on
 * the shelf.
 */
export function RecordSquarePhoto({ url, size, alt = '' }: { url: string | null; size: keyof typeof PHOTO_BOX; alt?: string }) {
  const box = PHOTO_BOX[size];
  return url ? (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('block shrink-0 rounded-none bg-surface-sunken object-cover', box)}
    />
  ) : (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-none bg-surface-sunken text-text-faint', box)}>
      <Package className={size === 'xl' ? 'size-6' : 'size-4'} />
    </span>
  );
}

/** One line: square photo · title (one line) over facts, then — on the lead only — the channel and the next step. */
function CardLine({
  line,
  factColumns,
  channel,
  next,
  testId,
}: {
  line: RecordCardLine;
  factColumns: readonly RecordFactColumn[];
  channel: RecordCardMobileModel['channel'];
  next?: RecordCardMobileModel['next'];
  testId?: (part: string) => string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <RecordSquarePhoto url={line.photoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p data-testid={testId?.('title')} className="truncate text-role-body font-medium text-text-default" title={line.title}>
          {line.title}
        </p>
        <div data-testid={testId?.('facts')} className="flex min-w-0 items-center gap-x-1.5 overflow-hidden text-role-caption text-text-muted">
          <RecordLineFacts line={line} columns={factColumns} className="shrink-0 flex-nowrap text-role-caption" />
          {channel ? (
            <>
              <RecordFactSep />
              <span data-testid={testId?.('platform')} className="flex min-w-0 items-center gap-1 font-medium text-text-default" title={channel.label}>
                {channel.dot}
                <span className="min-w-0 truncate">{channel.label}</span>
                {channel.badge ? <span className="shrink-0 rounded-md bg-surface-sunken px-1 text-text-muted">{channel.badge}</span> : null}
              </span>
            </>
          ) : null}
          {next ? (
            <span
              data-testid={testId?.('next')}
              title={next.tip}
              aria-label={`Next step: ${next.label}`}
              className={cn('ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap', next.blocked ? 'text-text-danger' : 'text-text-faint')}
            >
              <ArrowRight className="size-3.5" aria-hidden />
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATE_TONE_CLASSES[next.tone].dot)} />
              <span className={cn('font-semibold', next.blocked ? 'text-text-danger' : 'text-text-default')}>{next.label}</span>
            </span>
          ) : null}
        </div>
        {line.alertNote ? <p className="text-role-caption font-medium text-text-danger">{line.alertNote}</p> : null}
      </div>
    </div>
  );
}

export function RecordCardMobile({ model, factColumns, location, onOpen, testIdPrefix }: RecordCardMobileProps) {
  const [expanded, setExpanded] = useState(false);
  const lead = model.lines[0];
  if (!lead) return null;
  const id = (part: string) => `${testIdPrefix}-${part}`;
  const more = model.lines.slice(1);
  const { deadline } = model;

  return (
    <article
      data-testid={testIdPrefix}
      data-record-key={model.leadId}
      aria-label={model.aria.card}
      className="relative isolate flex w-full min-w-0 flex-col gap-2 overflow-hidden rounded-mode bg-surface-card p-3 ring-1 ring-inset ring-border-hairline"
    >
      {/* The open target — the whole card. */}
      <button
        type="button"
        aria-label={model.aria.open}
        data-testid={id('open')}
        onClick={onOpen}
        className={cn('absolute inset-0 z-0 cursor-pointer rounded-mode', focusRing('control'))}
      />

      {/* Top row — location · code · ref …… due date. */}
      <div data-testid={id('row')} className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
        <LocationBadge text={location.path} onPress={location.onPress} className="pointer-events-auto shrink" />
        {model.code ? (
          <LifecycleCode state={model.code} srLabel={model.code.label} className="shrink-0 text-role-eyebrow">
            {model.code.code}
          </LifecycleCode>
        ) : null}
        {model.ref ? (
          <span data-testid={id('ref')} className="shrink-0 font-mono text-role-caption font-semibold text-text-muted">
            {model.ref}
          </span>
        ) : null}
        <span
          data-testid={id('deadline')}
          title={deadline.tip ?? undefined}
          className={cn('ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-role-caption tabular-nums', RECORD_DEADLINE_TONE_CLASS[deadline.tone])}
        >
          <span aria-hidden className={cn('size-2 rounded-full', RECORD_DEADLINE_DOT_CLASS[deadline.tone])} />
          {deadline.face}
        </span>
      </div>

      {/* Body row — the lead line. */}
      <div className="pointer-events-none relative z-10">
        <CardLine line={lead} factColumns={factColumns} channel={model.channel} next={model.next} testId={id} />
      </div>

      {more.length > 0 ? (
        <div className="pointer-events-none relative z-10 flex min-w-0 flex-col gap-2">
          {expanded ? (
            <ul aria-label="More items" className="flex flex-col gap-2">
              {more.map((line) => (
                <li key={line.id}>
                  <CardLine line={line} factColumns={factColumns} channel={null} />
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Show fewer items' : `Show ${more.length} more item${more.length === 1 ? '' : 's'}`}
            data-testid={id('expand')}
            onClick={() => setExpanded((open) => !open)}
            className={cn(
              'ds-raw-button pointer-events-auto inline-flex min-h-mode-hit items-center gap-0.5 self-start rounded-md text-role-caption font-medium text-text-muted',
              focusRing('control'),
            )}
          >
            {expanded ? 'Fewer items' : `+${more.length} item${more.length === 1 ? '' : 's'}`}
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
          </button>
        </div>
      ) : null}
    </article>
  );
}
