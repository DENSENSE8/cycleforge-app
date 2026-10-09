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
 * corner) at the far left — the title (full, WRAPPING: owner 2026-10-03, no
 * record title is ever truncated on a phone; supersedes the 2026-09-29 one-line
 * title) over the subtitle: the family's facts, then the channel (dot + name)
 * and, when the family names one, the next step ("→ Test"). No checkbox, no
 * hover peek, no chips, no notes, no verbs. The whole card is the open
 * target; the location badge and "+N items" are the only other presses.
 * Nothing here knows the family: the adapter hands a
 * {@link RecordCardMobileModel} (Law 1).
 */

import { useState, type ReactNode } from 'react';
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
  /**
   * Where the record sits — the top row's first element. `onPress` makes it the set-location door.
   * Omitted = the family has no location (a shipped order left the building): no badge, never "No bin".
   */
  location?: { path: string | null; onPress?: () => void };
  onOpen: () => void;
  testIdPrefix: string;
  /**
   * `card` (default): a rounded card with its own hairline ring, spaced in a stack.
   * `row`: a dense list row — square, no ring; the list paints one horizontal
   * hairline between rows and no side lines (the pick list, owner 2026-10-08).
   */
  density?: 'card' | 'row';
}

const PHOTO_BOX = { lg: RECORD_MOBILE_PHOTO_SIZE_CLASS, md: 'size-16', xl: 'size-28' } as const;
/** `fit="natural"`: the box's width at the image's own height. `lg` has no width-only face, so it stays the square. */
const NATURAL_PHOTO_BOX = { lg: cn(RECORD_MOBILE_PHOTO_SIZE_CLASS, 'object-contain'), md: 'h-auto w-16', xl: 'h-auto w-28' } as const;

/**
 * The phone's product photo: no corner, the image filling the square
 * (`object-cover` — a letterboxed well reads as padding); no photo → the
 * package placeholder. `lg`: the list card's lines, exactly their two body
 * rows tall. `md`: a pick list where the photo is how the item is told apart
 * (Pair to SKU's results). `xl`: the order's pick screen, big enough to find
 * the item on the shelf. `fit="natural"` keeps the whole image visible at
 * the box's width and its own height — no crop, no letterbox well
 * (the pick screen, owner 2026-10-08). `onOpen` makes the photo its own
 * press — the full-screen viewer (pick screen, owner 2026-10-08).
 */
export function RecordSquarePhoto({
  url,
  size,
  alt = '',
  fit = 'cover',
  onOpen,
}: {
  url: string | null;
  size: keyof typeof PHOTO_BOX;
  alt?: string;
  fit?: 'cover' | 'natural';
  /** Tap the photo to open it full screen. Ignored without a photo. */
  onOpen?: () => void;
}) {
  const box = PHOTO_BOX[size];
  if (!url) {
    return (
      <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-none bg-surface-sunken text-text-faint', box)}>
        <Package className={size === 'lg' ? 'size-4' : 'size-6'} />
      </span>
    );
  }
  const image = (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(
        'block shrink-0 rounded-none',
        fit === 'natural' ? NATURAL_PHOTO_BOX[size] : cn('bg-surface-sunken object-cover', box),
      )}
    />
  );
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={alt ? `View photo: ${alt}` : 'View photo'}
      data-testid="record-photo-open"
      className={cn('ds-raw-button block shrink-0 cursor-zoom-in rounded-none', focusRing('control'))}
    >
      {image}
    </button>
  ) : (
    image
  );
}

/** One line: square photo · title (full, wraps) over facts, then — on the lead only — the channel and the next step. */
function CardLine({
  line,
  factColumns,
  channel,
  next,
  testId,
  compact = false,
  footer,
}: {
  line: RecordCardLine;
  factColumns: readonly RecordFactColumn[];
  channel: RecordCardMobileModel['channel'];
  next?: RecordCardMobileModel['next'];
  testId?: (part: string) => string;
  /** The boxy row: tighter photo gap. */
  compact?: boolean;
  /** Under the facts — the boxy row's status · due line. */
  footer?: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 items-start', compact ? 'gap-2' : 'gap-3')}>
      <RecordSquarePhoto url={line.photoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p data-testid={testId?.('title')} className="break-words text-role-body font-medium text-text-default">
          {line.title}
        </p>
        <div data-testid={testId?.('facts')} className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-role-caption text-text-muted">
          <RecordLineFacts line={line} columns={factColumns} className="shrink-0 flex-nowrap text-role-caption" />
          {channel ? (
            <>
              <RecordFactSep />
              <span data-testid={testId?.('platform')} className="flex min-w-0 items-center gap-1 font-medium text-text-default">
                {channel.dot}
                <span className="min-w-0 break-words">{channel.label}</span>
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
        {footer}
      </div>
    </div>
  );
}

export function RecordCardMobile({ model, factColumns, location, onOpen, testIdPrefix, density = 'card' }: RecordCardMobileProps) {
  const [expanded, setExpanded] = useState(false);
  const lead = model.lines[0];
  if (!lead) return null;
  const id = (part: string) => `${testIdPrefix}-${part}`;
  const more = model.lines.slice(1);
  const { deadline } = model;

  // `row` (the pick list, owner 2026-10-08): boxy and tight so every fact reads at a glance — the location
  // is a full-width square band that wraps (never scrolls off the row), the status and due date ride
  // one line under the facts. `card` keeps its top row.
  const boxy = density === 'row';
  const deadlineFace = (
    <span
      data-testid={id('deadline')}
      title={deadline.tip ?? undefined}
      className={cn('ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-role-caption tabular-nums', RECORD_DEADLINE_TONE_CLASS[deadline.tone])}
    >
      <span aria-hidden className={cn('size-2 rounded-full', RECORD_DEADLINE_DOT_CLASS[deadline.tone])} />
      {deadline.face}
    </span>
  );
  const codeFace = model.code ? (
    // `state-badge` styles its corner outside the utility layer, so the boxy row forces the square.
    <LifecycleCode state={model.code} srLabel={model.code.label} className={cn('shrink-0 whitespace-nowrap text-role-eyebrow', boxy && '!rounded-none')}>
      {model.code.code}
    </LifecycleCode>
  ) : null;
  const refFace = model.ref ? (
    <span data-testid={id('ref')} className="shrink-0 font-mono text-role-caption font-semibold text-text-muted">
      {model.ref}
    </span>
  ) : null;

  return (
    <article
      data-testid={testIdPrefix}
      data-record-key={model.leadId}
      aria-label={model.aria.card}
      className={cn(
        'relative isolate flex w-full min-w-0 flex-col overflow-hidden bg-surface-card',
        boxy ? 'gap-0 p-0' : 'gap-2 p-3',
        density === 'card' && 'rounded-mode ring-1 ring-inset ring-border-hairline',
      )}
    >
      {/* The open target — the whole card. */}
      <button
        type="button"
        aria-label={model.aria.open}
        data-testid={id('open')}
        onClick={onOpen}
        className={cn('absolute inset-0 z-0 cursor-pointer', density === 'card' && 'rounded-mode', focusRing('control'))}
      />

      {boxy ? (
        <>
          {location ? (
            <div data-testid={id('row')} className="pointer-events-none relative z-10">
              <LocationBadge text={location.path} onPress={location.onPress} fit="band" className="pointer-events-auto" />
            </div>
          ) : null}
          <div className="pointer-events-none relative z-10 px-2 py-1.5">
            <CardLine
              line={lead}
              factColumns={factColumns}
              channel={model.channel}
              next={model.next}
              testId={id}
              compact
              footer={
                <div className="flex min-w-0 items-center gap-1.5 pt-0.5">
                  {codeFace}
                  {refFace}
                  {deadlineFace}
                </div>
              }
            />
          </div>
        </>
      ) : (
        <>
          {/* Top row — location · code · ref …… due date. The location strip scrolls left ↔ right so the
              whole path and the status chip stay readable; the due date stays pinned right. */}
          <div data-testid={id('row')} className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
            {/* The strip takes pointer events only to scroll; a tap on it (not on the location door) still
                opens the card — keyboard users open via the card's own button. */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              data-testid={id('location-strip')}
              onClick={onOpen}
              className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {location ? <LocationBadge text={location.path} onPress={location.onPress} fit="full" className="shrink-0" /> : null}
              {codeFace}
              {refFace}
            </div>
            {deadlineFace}
          </div>

          {/* Body row — the lead line. */}
          <div className="pointer-events-none relative z-10">
            <CardLine line={lead} factColumns={factColumns} channel={model.channel} next={model.next} testId={id} />
          </div>
        </>
      )}

      {more.length > 0 ? (
        <div className={cn('pointer-events-none relative z-10 flex min-w-0 flex-col gap-2', boxy && 'px-2 pb-1.5')}>
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
