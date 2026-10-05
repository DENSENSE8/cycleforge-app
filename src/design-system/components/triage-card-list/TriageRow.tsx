'use client';

/**
 * TriageRow — the ONE-ROW density of {@link TriageCardList} (owner
 * 2026-09-28, `docs/design-system/HANDOFF-remove-desk-floor.md` §3): a
 * user-friendly list that is one line per record, edge to edge — not a
 * spreadsheet. One record = one full-bleed row closed by a hairline; no cell
 * borders, no column headers, no resize / reorder chrome. Every row reads the
 * same facts in the same place, left → right:
 *
 *   ☐ (on hover / focus / touch, or once checked) · [state badge] · [photo] · identity · title · 2–4 key facts · → next step
 *
 * API (the host's side — everything else is the card list's):
 * - Mount `<TriageCardList density="row" …>` with the SAME family / feed / cut
 *   / record / summary / bulk a card list takes: selection bar, numbering
 *   (`N · 1–100 of N`), pager, chips, held-new pill, X / Space / Enter, J / K
 *   and the record plane (In place / Split) are the face's, unchanged.
 * - The family's `renderCard` returns
 *   `<TriageRow {...slotProps} face={myRowFace(slotProps.model)} testIdPrefix={VIEW.testIdPrefix} />`.
 * - {@link TriageRowFace} is the row as data: `state` (any desk's
 *   `RecordStateFace` or an outbound `LifecycleState`; `null` when every row
 *   of the list would wear the same badge, so the column is dropped), `identity` (the
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
 * - Identifiers stay copyable (owner 2026-10-04): `identityCopy` / a fact's
 *   `copy` paint the cell as the house `CopyChip` (click copies, hover shows
 *   the copy bubble) in the identifier's tone — FNSKU, ticket, serial, order #,
 *   SKU. A self-evident format needs no lead word (a SKU has dashes, an ASIN
 *   does not): give `label` only to a value that cannot be told apart.
 *   An order / PO handle is an `OperationalIdentity` (`@/lib/operational-identity`):
 *   pass it as `identity` and the row paints the same face the Full card does.
 * - A high-information desk queue may opt into `wide`: up to eight facts stay
 *   visible on one shared horizontal scroll plane, and `endFact` + `next` pin
 *   at the right edge. The list host must pair it with `rowScroll`.
 * - `trailingAction`: the record's one direct verb (FNSKU's Print), the row's
 *   LAST cell. It shows on row hover / focus / touch and while its own
 *   popover is open (`aria-expanded`), so the verb runs without opening the
 *   record. A list whose `next` is always null drops the empty next column.
 * - Keys: the whole row is the open target (Enter opens, focus lands back on
 *   it when Esc closes the record); the checkbox is the only check; Space
 *   folds `quickLook` when the family passes one.
 */

import { memo, useRef, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight } from '@/components/Icons';
import { CopyChip, type ChipTone } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { CARD_STAGGER_CAP, CARD_STAGGER_S, CardCheck } from '@/design-system/components/record-card/RecordCard';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { denseRecordTitle, recordNote, recordPerson, recordPlatform } from '@/design-system/tokens/typography/presets';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { LIFECYCLE, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';
import { RecordFactPaint, type RecordFactFace } from '@/design-system/components/record-card/record-fact';
import { OperationalIdentityChip } from '@/design-system/components/OperationalIdentityChip';
import { isCopyableIdentity, type OperationalIdentity } from '@/lib/operational-identity';
import type { TriageCardModelBase, TriageCardSlotProps } from './TriageCardList';

/** A fact's fixed column — the rows line up with no header row. */
export type TriageRowFactWidth = 'num' | 'short' | 'code' | 'long';

const WIDTH_CLASS: Readonly<Record<TriageRowFactWidth, string>> = {
  num: 'w-16 justify-end text-right',
  short: 'w-24',
  code: 'w-32',
  long: 'w-52',
};

/**
 * A copyable identifier's column: the same width as a floor, never a ceiling —
 * an identifier is never clipped (owner 2026-10-04: the last digit of an FNSKU
 * was cut off). Same-length ids still line up row to row.
 */
const MIN_WIDTH_CLASS: Readonly<Record<TriageRowFactWidth, string>> = {
  num: 'min-w-16 justify-end text-right',
  short: 'min-w-24',
  code: 'min-w-32',
  long: 'min-w-52',
};

/** Facts disclose by the row's own width (see the API note). Literal — Tailwind reads the source. */
const FACT_TIER_CLASS = ['hidden @3xl/row:flex', 'hidden @4xl/row:flex', 'hidden @5xl/row:flex', 'hidden @5xl/row:flex'] as const;

const FACT_TONE_CLASS = {
  default: 'text-mode-ink',
  muted: 'text-mode-muted',
  warn: 'text-mode-warn',
} as const;

const FACT_VOICE_CLASS = {
  data: 'text-role-data',
  platform: recordPlatform,
  person: recordPerson,
  note: recordNote,
} as const;

/**
 * An identifier the floor copies (FNSKU, ticket, serial, order #): the cell is
 * the house {@link CopyChip} — click copies, hover shows the copy bubble — in
 * the identifier's tone. `display` is the face (default `value`).
 */
export interface TriageRowCopy {
  value: string;
  display?: string;
  tone: ChipTone;
}

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
  /** Typographic identity for a plain-text value; semantic color remains controlled independently by `tone`. */
  voice?: keyof typeof FACT_VOICE_CLASS;
  /** The full text when the cell truncates. */
  tip?: string;
  /** The cell is a copyable identifier: painted as a CopyChip in place of `value`. */
  copy?: TriageRowCopy;
}

/** The row as data — what the family's model says one record IS on this list. */
export interface TriageRowFace {
  /** The record's state badge; null = the list has one constant state, so no badge column. */
  state: RecordStateFace | LifecycleState | null;
  /**
   * The record's handle — bin, unit id, order number. An {@link OperationalIdentity}
   * paints itself (`OperationalIdentityChip`): face, copy and spoken label are its own,
   * so `identityDisplay` / `identityCopy` apply only to a plain string handle.
   */
  identity: string | OperationalIdentity;
  /** Short visual handle; `identity` remains the full accessible/title value. */
  identityDisplay?: string;
  /** The handle's column (default `code`); `long` for a unit id / tracking-length handle. */
  identityWidth?: TriageRowFactWidth;
  /** The handle is a copyable identifier: painted as a CopyChip (face `display` ?? `identityDisplay` ?? `identity`). */
  identityCopy?: TriageRowCopy;
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
  /** The record's one direct verb at the right edge, revealed on hover / focus (see the API note). */
  trailingAction?: ReactNode;
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
  trailingAction,
}: TriageRowProps<Row, Model>) {
  const openRef = useRef<HTMLButtonElement>(null);
  const id = (part: string) => `${testIdPrefix}-${part}`;
  const selected = checked !== false;
  const stateId = face.state == null ? undefined : typeof face.state === 'string' ? face.state : face.state.id;
  const identityCopyable = typeof face.identity === 'string' ? face.identityCopy != null : isCopyableIdentity(face.identity);
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
          // The select bar is inset 4px, then padded 16px; rows are full-bleed (no list inset), so
          // 20px lands the 28px check column on the select-all's axis (measured 2026-10-04: pl-4 sat 4px left).
          'pointer-events-none relative z-10 flex min-w-0 items-center gap-1.5 pl-5 pr-3',
          face.wide ? 'min-h-9 py-0.5' : 'min-h-10 overflow-hidden py-1',
        )}
      >
        {/* The check column — the select bar's check axis. The checkbox shows on row hover / focus,
            always on touch, and stays once checked (the 2026-09-15 gutter law, as on the card). */}
        <span
          className={cn(
            'flex w-7 shrink-0 justify-center',
            checked === false &&
              'opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
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
        {face.state != null ? (
          <span className="flex w-28 shrink-0" data-testid={id('state')}>
            <LifecycleCode state={face.state} srLabel={null} className="max-w-full">
              {typeof face.state === 'string' ? LIFECYCLE[face.state].label : face.state.label}
            </LifecycleCode>
          </span>
        ) : null}
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
            identityCopyable
              ? [MIN_WIDTH_CLASS[face.identityWidth ?? 'code'], 'pointer-events-auto flex h-8 shrink-0 items-center']
              : [WIDTH_CLASS[face.identityWidth ?? 'code'], 'flex h-8 shrink-0 items-center truncate'],
            'font-sans text-role-body font-semibold leading-none tabular-nums text-mode-ink',
          )}
          title={typeof face.identity === 'string' && !face.identityCopy ? face.identity : undefined}
          data-testid={id('identity')}
        >
          {typeof face.identity !== 'string' ? (
            <OperationalIdentityChip identity={face.identity} presentation="compact" />
          ) : face.identityCopy ? (
            <CopyChip
              value={face.identityCopy.value}
              display={face.identityCopy.display ?? face.identityDisplay ?? face.identity}
              ariaLabel={face.identity}
              tone={face.identityCopy.tone}
              // Whole value, no overflow clip: `truncate` on the tight-tracked mono face shaved the last glyph.
              truncateDisplay={false}
              fitDisplayWidth
            />
          ) : (
            (face.identityDisplay ?? face.identity)
          )}
        </span>
        <span className={cn(denseRecordTitle, 'truncate text-mode-ink', face.wide ? 'w-80 shrink-0' : 'min-w-32 flex-1')} title={face.title}>
          {face.title}
        </span>
        {face.facts.slice(0, face.wide ? 8 : 4).map((fact, i) => (
          // A fact's full text (a note, a status's why) shows in the house tooltip, never the native
          // `title`; the cell takes the pointer only then, and a click on it still opens the record.
          <HoverTooltip key={fact.id} label={fact.tip} disabled={!fact.tip} asChild focusable={false}>
            <span
              data-testid={id(`fact-${fact.id}`)}
              onClick={fact.tip && !fact.copy ? openRecord : undefined}
              className={cn(
                face.wide ? 'flex' : FACT_TIER_CLASS[i],
                fact.copy ? MIN_WIDTH_CLASS[fact.width] : [WIDTH_CLASS[fact.width], 'min-w-0'],
                'shrink-0 items-baseline gap-1 tabular-nums',
                fact.tip && 'pointer-events-auto cursor-pointer',
                FACT_VOICE_CLASS[fact.voice ?? 'data'],
                FACT_TONE_CLASS[fact.tone ?? 'default'],
              )}
            >
              {fact.label ? <span className="shrink-0 text-role-caption text-mode-muted">{fact.label}</span> : null}
              {fact.copy ? (
                <span className="pointer-events-auto shrink-0">
                  <CopyChip value={fact.copy.value} display={fact.copy.display ?? fact.copy.value} tone={fact.copy.tone} truncateDisplay={false} fitDisplayWidth />
                </span>
              ) : (
                <span className="min-w-0 truncate">
                  {fact.value == null || typeof fact.value === 'string' ? fact.value : <RecordFactPaint face={fact.value} />}
                </span>
              )}
            </span>
          </HoverTooltip>
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
            <HoverTooltip label={face.endFact.tip} disabled={!face.endFact.tip} asChild focusable={false}>
              <span
                data-testid={id(`fact-${face.endFact.id}`)}
                onClick={face.endFact.tip ? openRecord : undefined}
                className={cn(
                  WIDTH_CLASS[face.endFact.width],
                  'flex min-w-0 shrink-0 items-baseline gap-1 tabular-nums',
                  face.endFact.tip && 'pointer-events-auto cursor-pointer',
                  FACT_VOICE_CLASS[face.endFact.voice ?? 'data'],
                  FACT_TONE_CLASS[face.endFact.tone ?? 'default'],
                )}
              >
                {face.endFact.label ? <span className="shrink-0 text-role-caption text-mode-muted">{face.endFact.label}</span> : null}
                <span className="min-w-0 truncate">
                  {face.endFact.value == null || typeof face.endFact.value === 'string' ? face.endFact.value : <RecordFactPaint face={face.endFact.value} />}
                </span>
              </span>
            </HoverTooltip>
          ) : null}
          {/* A list whose next is always null and carries a verb gives the empty next column to the verb. */}
          {face.next || !trailingAction ? (
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
          ) : null}
          {trailingAction ? (
            <span
              data-testid={id('action')}
              className={cn(
                'pointer-events-auto flex shrink-0 items-center opacity-0 transition-opacity duration-150',
                'group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100',
              )}
            >
              {trailingAction}
            </span>
          ) : null}
        </span>
      </div>
      {quickLook ? <AnimatePresence initial={false}>{peekOpen ? quickLook : null}</AnimatePresence> : null}
    </motion.article>
  );
}

export const TriageRow = memo(TriageRowImpl) as typeof TriageRowImpl;
