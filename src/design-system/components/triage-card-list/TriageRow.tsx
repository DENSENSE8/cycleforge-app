'use client';

/**
 * TriageRow — the ONE-ROW density of {@link TriageCardList} (owner
 * 2026-09-28, `docs/design-system/HANDOFF-remove-desk-floor.md` §3): a
 * user-friendly list that is one line per record, edge to edge — not a
 * spreadsheet. One record = one full-bleed row closed by a hairline; no cell
 * borders, no column headers, no resize / reorder chrome. Every row reads the
 * same facts in the same place, left → right:
 *
 *   ☐ · state badge · [photo] · identity · title · 2–4 key facts · → next step
 *
 * API (the host's side — everything else is the card list's):
 * - Mount `<TriageCardList density="row" …>` with the SAME family / feed / cut
 *   / record / summary / bulk a card list takes: selection bar, numbering
 *   (`N · 1–100 of N`), pager, chips, held-new pill, X / Space / Enter, J / K
 *   and the record plane (In place / Split) are the face's, unchanged.
 * - The family's `renderCard` returns
 *   `<TriageRow {...slotProps} face={myRowFace(slotProps.model)} testIdPrefix={VIEW.testIdPrefix} />`.
 * - {@link TriageRowFace} is the row as data: `state` (any desk's
 *   `RecordStateFace` or an outbound `LifecycleState`), `identity` (the
 *   handle the floor says aloud: bin, unit id, order # — shown whole, so give
 *   a long handle `identityWidth: 'long'`), `title`, optional `photo`,
 *   `facts` in priority order, `next` (the verb opening the record leads
 *   to), and the three aria strings.
 * - Facts: 2–4, each with a fixed `width` (`num` · `short` · `code` · `long`)
 *   so rows line up without column chrome. The row discloses by ITS width
 *   (`@container/row`) and the title always keeps its room: fact 1 from
 *   `@3xl`, fact 2 from `@4xl`, facts 3–4 from `@5xl` — Split's list (2/3 of
 *   the canvas) reads state · identity · title · next plus what its width
 *   allows, the fixed In place stage shows all — so order them most-needed
 *   first. A fact's `value` is a card fact face (`RecordFactFace`: code,
 *   qty, place, date, … — the ONE painter the cards use, Law 2) or plain
 *   text; `label` is a muted lead word (`SN`, `SKU`, `Qty`) for a value that
 *   does not read alone.
 * - A high-information desk queue may opt into `wide`: up to eight facts stay
 *   visible on one shared horizontal scroll plane, and `endFact` + `next` pin
 *   at the right edge. The list host must pair it with `rowScroll`.
 * - Keys: the whole row is the open target (Enter opens, focus lands back on
 *   it when Esc closes the record); the checkbox is the only check; Space
 *   folds `quickLook` when the family passes one.
 */

import { memo, useRef, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight } from '@/components/Icons';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { CARD_STAGGER_CAP, CARD_STAGGER_S, CardCheck } from '@/design-system/components/record-card/RecordCard';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { denseRecordTitle } from '@/design-system/tokens/typography/presets';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { LIFECYCLE, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';
import { RecordFactPaint, type RecordFactFace } from '@/design-system/components/record-card/record-fact';
import type { TriageCardModelBase, TriageCardSlotProps } from './TriageCardList';

/** A fact's fixed column — the rows line up with no header row. */
export type TriageRowFactWidth = 'num' | 'short' | 'code' | 'long';

const WIDTH_CLASS: Readonly<Record<TriageRowFactWidth, string>> = {
  num: 'w-16 justify-end text-right',
  short: 'w-24',
  code: 'w-32',
  long: 'w-52',
};

/** Facts disclose by the row's own width (see the API note). Literal — Tailwind reads the source. */
const FACT_TIER_CLASS = ['hidden @3xl/row:flex', 'hidden @4xl/row:flex', 'hidden @5xl/row:flex', 'hidden @5xl/row:flex'] as const;

const FACT_TONE_CLASS = {
  default: 'text-mode-ink',
  muted: 'text-mode-muted',
  warn: 'text-mode-warn',
} as const;

export interface TriageRowFact {
  /** Stable id — the cell's test id (`<prefix>-fact-<id>`). */
  id: string;
  /** Muted lead word for a value that does not read alone (`SN`, `SKU`) — sentence case. */
  label?: string;
  /** A card fact face (painted by `RecordFactPaint`), plain text, or null for an empty cell (the column still holds its place). */
  value: RecordFactFace | string | null;
  width: TriageRowFactWidth;
  /** Ink for a plain-text value — `warn`: needs a decision now; `muted`: context. Faces carry their own. */
  tone?: keyof typeof FACT_TONE_CLASS;
  /** The full text when the cell truncates. */
  tip?: string;
}

/** The row as data — what the family's model says one record IS on this list. */
export interface TriageRowFace {
  state: RecordStateFace | LifecycleState;
  /** The record's handle — bin, unit id, order number. */
  identity: string;
  /** Short visual handle; `identity` remains the full accessible/title value. */
  identityDisplay?: string;
  /** The handle's column (default `code`); `long` for a unit id / tracking-length handle. */
  identityWidth?: TriageRowFactWidth;
  title: string;
  /** Present = the family shows photos (a thumb holds the column even with no `url`). */
  photo?: { url: string | null };
  /** 2–4, most needed first. */
  facts: readonly TriageRowFact[];
  /** Keep every fact visible and make the row wide enough for shared horizontal scrolling. */
  wide?: boolean;
  /** A deadline or similarly decisive fact pinned immediately before `next`. */
  endFact?: TriageRowFact;
  /** Pin `endFact` + `next` to the right edge of the shared scrollport. */
  stickyEnd?: boolean;
  /** The step opening this record leads to (`Count`, `Pick`), or null. `blocked` tints it. */
  next: { label: string; blocked?: boolean } | null;
  /** The next step's column (default `w-20`, sized for one-word verbs); `code` for two-word steps or tags. */
  nextWidth?: TriageRowFactWidth;
  aria: { row: string; open: string; check: string };
}

export interface TriageRowProps<Row, Model extends TriageCardModelBase<Row>> extends TriageCardSlotProps<Row, Model> {
  face: TriageRowFace;
  /** The view's prefix: `<prefix>` on the row, `-open`, `-check`, `-next`, `-fact-<id>`. */
  testIdPrefix: string;
  /** Extra `data-*` attributes the family's readers use — the same ones its card carries (`RecordCard` `rowAttrs`). */
  rowAttrs?: Readonly<Record<`data-${string}`, string | number>>;
  /** Space's fold under the row — a keyed node (it animates its own height). */
  quickLook?: ReactNode;
}

function TriageRowImpl<Row, Model extends TriageCardModelBase<Row>>({
  model,
  checked,
  open,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onTogglePeek,
  face,
  testIdPrefix,
  quickLook,
  rowAttrs,
}: TriageRowProps<Row, Model>) {
  const openRef = useRef<HTMLButtonElement>(null);
  const id = (part: string) => `${testIdPrefix}-${part}`;
  const selected = checked !== false;
  const stateId = typeof face.state === 'string' ? face.state : face.state.id;
  const stateLabel = typeof face.state === 'string' ? LIFECYCLE[face.state].label : face.state.label;
  const openRecord = (event: MouseEvent) =>
    onOpen(model.lead, { shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, detail: event.detail, target: event.target });

  return (
    <motion.article
      {...rowAttrs}
      {...{ [DESK_RECORD_KEY_ATTR]: model.ids[0] }}
      data-state={stateId}
      data-testid={testIdPrefix}
      aria-label={face.aria.row}
      initial={enterIndex != null ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: enterIndex != null ? Math.min(enterIndex, CARD_STAGGER_CAP) * CARD_STAGGER_S : 0 }}
      className={cn(
        // Full bleed: the wash and the hairline run the list's whole width.
        'group/row @container/row relative isolate flex flex-col border-b border-mode-rule transition-colors duration-100',
        face.wide && 'min-w-[88rem]',
        selected ? 'bg-surface-accent' : open ? 'bg-mode-well' : 'hover:bg-mode-hover',
      )}
    >
      {/* The open target — the whole row, and the first focusable (the plane hands focus back here on Esc). */}
      <button
        ref={openRef}
        type="button"
        aria-label={face.aria.open}
        aria-current={open || undefined}
        aria-expanded={quickLook ? peekOpen : undefined}
        data-testid={id('open')}
        onClick={openRecord}
        // Space = quick look (Enter, the button's own key, opens).
        onKeyDown={(event) => {
          if (event.key !== ' ' || event.repeat) return;
          event.preventDefault();
          onTogglePeek(model.key);
        }}
        className={cn('absolute inset-0 z-0 cursor-pointer', focusRing('cell', 'neutral'))}
      />
      {/* Open = a left mark as well as the wash, so it reads under a check too. */}
      {open ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-mode-ink" /> : null}

      <div
        className={cn(
          'pointer-events-none relative z-10 flex min-w-0 items-center gap-1.5 pr-3',
          // The select bar is inset 4px, then padded 16px. Wide rows have no
          // list inset, so 20px lands their 28px check column on the same axis.
          face.wide ? 'min-h-9 py-0.5 pl-5' : 'min-h-10 overflow-hidden py-1 pl-4',
        )}
      >
        {/* The check column — the select bar's check axis. */}
        <span className="flex w-7 shrink-0 justify-center">
          <CardCheck
            checked={checked}
            label={face.aria.check}
            testId={id('check')}
            onToggle={(event) => {
              onToggleCheck(model, event);
              openRef.current?.focus({ preventScroll: true });
            }}
          />
        </span>
        <span className="flex w-28 shrink-0" data-testid={id('state')}>
          <LifecycleCode state={face.state} srLabel={null} className="max-w-full">
            {stateLabel}
          </LifecycleCode>
        </span>
        {face.photo ? (
          <PhotoHoverPeek
            src={face.photo.url}
            alt={face.title}
            className={cn('block size-8 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-mode-rule', face.photo.url ? 'bg-surface-card' : 'bg-mode-well')}
          >
            {face.photo.url ? (
              <img
                src={face.photo.url}
                alt=""
                loading="lazy"
                // A dead link leaves the empty thumb, never the broken-image glyph.
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
                className="size-full object-cover"
              />
            ) : null}
          </PhotoHoverPeek>
        ) : null}
        <span
          className={cn(
            WIDTH_CLASS[face.identityWidth ?? 'code'],
            'flex h-8 shrink-0 items-center truncate font-sans text-role-body font-semibold leading-none tabular-nums text-mode-ink',
          )}
          title={face.identity}
          data-testid={id('identity')}
        >
          {face.identityDisplay ?? face.identity}
        </span>
        <span className={cn(denseRecordTitle, 'truncate text-mode-ink', face.wide ? 'w-80 shrink-0' : 'min-w-32 flex-1')} title={face.title}>
          {face.title}
        </span>
        {face.facts.slice(0, face.wide ? 8 : 4).map((fact, i) => (
          <span
            key={fact.id}
            data-testid={id(`fact-${fact.id}`)}
            title={fact.tip}
            className={cn(
              face.wide ? 'flex' : FACT_TIER_CLASS[i],
              WIDTH_CLASS[fact.width],
              'min-w-0 shrink-0 items-baseline gap-1 text-role-data tabular-nums',
              FACT_TONE_CLASS[fact.tone ?? 'default'],
            )}
          >
            {fact.label ? <span className="shrink-0 text-role-caption text-mode-muted">{fact.label}</span> : null}
            <span className="min-w-0 truncate">
              {fact.value == null || typeof fact.value === 'string' ? fact.value : <RecordFactPaint face={fact.value} />}
            </span>
          </span>
        ))}
        {/* The decisive deadline + next step stay reachable while a wide row scrolls. */}
        <span
          className={cn(
            'flex shrink-0 items-center justify-end gap-2',
            face.stickyEnd && [
              'sticky right-0 z-20 self-stretch border-l border-mode-rule pl-2',
              selected ? 'bg-surface-accent' : open ? 'bg-mode-well' : 'bg-surface-canvas group-hover/row:bg-mode-hover',
            ],
          )}
        >
          {face.endFact ? (
            <span
              data-testid={id(`fact-${face.endFact.id}`)}
              title={face.endFact.tip}
              className={cn(
                WIDTH_CLASS[face.endFact.width],
                'flex min-w-0 shrink-0 items-baseline gap-1 text-role-data tabular-nums',
                FACT_TONE_CLASS[face.endFact.tone ?? 'default'],
              )}
            >
              {face.endFact.label ? <span className="shrink-0 text-role-caption text-mode-muted">{face.endFact.label}</span> : null}
              <span className="min-w-0 truncate">
                {face.endFact.value == null || typeof face.endFact.value === 'string' ? face.endFact.value : <RecordFactPaint face={face.endFact.value} />}
              </span>
            </span>
          ) : null}
          <span className={cn('flex shrink-0 justify-end', face.nextWidth ? WIDTH_CLASS[face.nextWidth] : 'w-20')}>
            {face.next ? (
              <span
                data-testid={id('next')}
                aria-label={`Next step: ${face.next.label}`}
                className={cn('inline-flex items-center gap-1 whitespace-nowrap text-role-body font-semibold', face.next.blocked ? 'text-mode-warn' : 'text-mode-ink')}
              >
                <ArrowRight className="size-3.5 text-mode-faint" aria-hidden />
                {face.next.label}
              </span>
            ) : null}
          </span>
        </span>
      </div>
      {quickLook ? <AnimatePresence initial={false}>{peekOpen ? quickLook : null}</AnimatePresence> : null}
    </motion.article>
  );
}

export const TriageRow = memo(TriageRowImpl) as typeof TriageRowImpl;
