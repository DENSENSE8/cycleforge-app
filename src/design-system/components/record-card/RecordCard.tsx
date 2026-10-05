'use client';

/**
 * RecordCard — the ONE triage card every family wears (layer 3 of
 * `docs/design-system/HANDOFF-record-card-foundation.md`; BRIEF §13).
 *
 *   ┃ ☐ #5043 ↗  ● Ecwid · Jane D.  [chips] 🗨              Listing ↗   ● Due today
 *   ┃ ◉   [📷] Shimano XT derailleur
 *   ┃          ×1 · Used · Stock 0 · SKU · 📍 A-14 · $89            Details ▾
 *   ┃     +4 items ▾ · 1 more out of stock
 *
 * Fixed anatomy, fed by a {@link RecordCardModel}: rail · check with the status
 * icon beneath · line 1 (identity top-left … status top-right) · the lead line
 * (photo, title, facts in the family's column order, Details at the far right)
 * · "+N items" unfolding the other lines as aligned columns · the quick look.
 * Nothing here knows the family (Law 1): what differs arrives as model data,
 * fact faces (`record-fact.tsx`) or the three family slots — `identity`,
 * `trailing` and `quickLook`. A checked card's verbs live only in the
 * selection bar (Law 5), never on the card.
 */

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { ArrowRight, ChevronDown, MessageSquare, Package } from '@/components/Icons';
import { Popover, PopoverAnchor, PopoverContent } from '@/design-system/primitives/radix-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { CollapseItem } from '@/design-system/components/Collapse';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CARD_DISCLOSE, CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_DEADLINE_DOT_CLASS, RECORD_DEADLINE_TONE_CLASS, RECORD_RAIL_HATCH_STYLE } from '@/design-system/tokens/record-card';
import { denseRecordTitle, recordNote, recordPerson, recordPlatform } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';
import { RecordFactPaint, RecordFactSep, RecordLineFacts, type RecordFactColumn } from './record-fact';
import type { CardDisclosureTier, RecordCardChip, RecordCardLine, RecordCardModel, RecordCardSlotFact } from './record-card-types';
import { recordCardOutlineClass } from './record-card-outline';
import type { CardViewDecl, ViewCardModel, ViewQuickLookProps } from '../triage-card-list/triage-view';

const SPRING = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 } as const;
const SOFT_SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const;

/** The cards' arrival: each card waits its turn (capped), then springs up. The one-row density shares the cadence. */
export const CARD_STAGGER_S = 0.028;
export const CARD_STAGGER_CAP = 14;
/**
 * When the last staggered card has landed — the list's chrome (section
 * headers) rises only after this, so text never travels with the cards.
 */
export const CARD_LIST_SETTLE_S = CARD_STAGGER_S * CARD_STAGGER_CAP + 0.3;

/** Propagated from the card's `whileHover` — the photo breathes, the rail thickens, the glyph nods. */
const RAIL_VARIANTS: Variants = { rest: { scaleX: 1 }, hover: { scaleX: 1.75 } };
const PHOTO_VARIANTS: Variants = { rest: { scale: 1 }, hover: { scale: 1.07 } };

/** Chips on line 1 — the fact box, pill-shaped. */
const CARD_CHIP = cn(CARD_FACT_BOX_CLASS, 'gap-1 rounded-full px-2 text-xs font-semibold');
const CHIP_TONE_CLASS: Readonly<Record<RecordCardChip['tone'], string>> = {
  warning: 'bg-surface-warning text-text-warning',
  info: 'bg-surface-info text-text-info',
};

/**
 * The unfolded lines' grid: photo · title · one column per fact · slack. The
 * title column sizes to the longest title (truncating when the card runs
 * out), so the facts start right after the titles and line up row to row.
 * Literal per fact count — Tailwind only generates classes it can read. A view
 * that declares no photo (`slots.photo: 'none'`) drops the photo column.
 */
const MORE_LINES_GRID_BY_FACTS: Readonly<Record<number, string>> = {
  1: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(1,auto)_1fr] items-center gap-x-2',
  2: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(2,auto)_1fr] items-center gap-x-2',
  3: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(3,auto)_1fr] items-center gap-x-2',
  4: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(4,auto)_1fr] items-center gap-x-2',
  5: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(5,auto)_1fr] items-center gap-x-2',
  6: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(6,auto)_1fr] items-center gap-x-2',
  7: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(7,auto)_1fr] items-center gap-x-2',
  8: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(8,auto)_1fr] items-center gap-x-2',
};
const MORE_LINES_GRID_NO_PHOTO_BY_FACTS: Readonly<Record<number, string>> = {
  1: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(1,auto)_1fr] items-center gap-x-2',
  2: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(2,auto)_1fr] items-center gap-x-2',
  3: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(3,auto)_1fr] items-center gap-x-2',
  4: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(4,auto)_1fr] items-center gap-x-2',
  5: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(5,auto)_1fr] items-center gap-x-2',
  6: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(6,auto)_1fr] items-center gap-x-2',
  7: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(7,auto)_1fr] items-center gap-x-2',
  8: 'grid min-w-0 grid-cols-[minmax(0,max-content)_repeat(8,auto)_1fr] items-center gap-x-2',
};

/** An unfolded column below its tier keeps its cell but empties it. */
const TIER_SHOW_CLASS: Readonly<Record<CardDisclosureTier, string | null>> = {
  always: null,
  brand: CARD_DISCLOSE.brand.show,
  label: CARD_DISCLOSE.label.show,
  detail: 'hidden @2xl/card:inline',
};

/** Stops a nested control's press from reaching the card's open target. */
const stop = (event: MouseEvent | PointerEvent) => event.stopPropagation();

/** The pointer gesture that opened the record — enough for ⌘ / Ctrl new-tab and double-click handling. */
export interface RecordOpenEvent {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  detail: number;
  target: EventTarget | null;
}

/**
 * Hover-intent open state for a peek popover: opens after `enterMs`, and a
 * pointer travelling from the trigger into the content keeps it open.
 */
function useHoverPeek(enterMs: number, leaveMs = 120) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  return {
    open,
    setOpen,
    enter: () => {
      clear();
      timer.current = window.setTimeout(() => setOpen(true), enterMs);
    },
    leave: () => {
      clear();
      timer.current = window.setTimeout(() => setOpen(false), leaveMs);
    },
  };
}

// ── Checkbox ────────────────────────────────────────────────────────────────

/** The card's checkbox — also the one-row density's (`TriageRow`), so a check reads the same in both. */
export function CardCheck({
  checked,
  label,
  testId,
  onToggle,
}: {
  checked: boolean | 'mixed';
  label: string;
  testId: string;
  onToggle: (event: { shiftKey: boolean }) => void;
}) {
  const on = checked === true;
  const mixed = checked === 'mixed';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : on}
      aria-label={label}
      data-select-gutter=""
      data-testid={testId}
      onPointerDown={stop}
      onClick={(event) => {
        event.stopPropagation();
        onToggle({ shiftKey: event.shiftKey });
      }}
      // Hit box = the visible square (owner 2026-09-27): a near-miss lands on
      // the card, which opens the record instead of checking it.
      className={cn('group/check pointer-events-auto relative z-10 flex size-[18px] items-center justify-center rounded-[5px]', focusRing('control'))}
    >
      <motion.span
        animate={on || mixed ? { scale: [1, 1.22, 1] } : { scale: 1 }}
        transition={{ duration: 0.28, ease: [0.2, 0.9, 0.3, 1.3] }}
        className={cn(
          'flex size-[18px] items-center justify-center rounded-[5px] border transition-colors duration-150',
          on || mixed
            ? 'border-text-default bg-text-default text-surface-card'
            : 'border-border-strong bg-surface-card group-hover/check:border-text-muted',
        )}
      >
        <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
          {mixed ? (
            <motion.path d="M4 8h8" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />
          ) : (
            <motion.path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            />
          )}
        </svg>
      </motion.span>
    </button>
  );
}

// ── Photo (hover peek) ──────────────────────────────────────────────────────

function CardPhoto({ line, size }: { line: RecordCardLine; size: 'lg' | 'sm' }) {
  return (
    <PhotoHoverPeek
      src={line.photoUrl}
      alt={line.title}
      // A photo FILLS the square (owner 2026-09-29: never letterbox bars); the gray well is only the no-photo placeholder.
      className={cn(
        'relative z-10 block shrink-0 overflow-hidden ring-1 ring-inset ring-black/5',
        line.photoUrl ? 'bg-surface-card' : 'bg-surface-sunken',
        size === 'lg' ? 'size-12' : 'size-8',
      )}
    >
      {line.photoUrl ? (
        <motion.img
          variants={size === 'lg' ? PHOTO_VARIANTS : undefined}
          transition={SOFT_SPRING}
          src={line.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-text-faint" aria-hidden>
          <Package className={size === 'lg' ? 'size-5' : 'size-4'} />
        </span>
      )}
    </PhotoHoverPeek>
  );
}

/** One unfolded line: small photo (when the view declares one) · title · one cell per fact column, on the parent's subgrid. */
function MoreLineRow({
  line,
  photo,
  columns,
  testId,
  current,
  onOpen,
}: {
  line: RecordCardLine;
  photo: boolean;
  columns: readonly RecordFactColumn[];
  testId: string;
  /** This line is the open record (a family whose lines open on their own). */
  current: boolean;
  onOpen: (event: MouseEvent) => void;
}) {
  return (
    <div
      role="listitem"
      aria-current={current || undefined}
      data-testid={testId}
      className={cn('col-span-full grid min-h-9 grid-cols-subgrid items-center text-role-body text-text-muted', current && 'rounded-lg bg-surface-sunken')}
    >
      {photo ? (
        <span className="pointer-events-auto">
          <CardPhoto line={line} size="sm" />
        </span>
      ) : null}
      <HoverTooltip label={line.title} asChild>
        <span onClick={onOpen} className="pointer-events-auto min-w-0 cursor-pointer truncate text-sm font-medium text-text-default">
          {line.title}
        </span>
      </HoverTooltip>
      {columns.map((column) => {
        const face = line.facts[column.id];
        const painted = face ? <RecordFactPaint face={face} /> : null;
        const tierClass = TIER_SHOW_CLASS[column.tier];
        return (
          <span key={column.id} data-fact={column.id} className="min-w-0 whitespace-nowrap">
            {tierClass ? <span className={tierClass}>{painted}</span> : painted}
          </span>
        );
      })}
    </div>
  );
}

// ── Check + status — one slot ───────────────────────────────────────────────

/** At rest the status icon holds the slot; card hover / focus hands it to the checkbox. Shared with the bespoke cards (Labels & docs) that keep the gutter law. */
export const SLOT_REST_CLASS =
  'flex transition-opacity duration-150 group-hover/card:opacity-0 group-focus-within/card:opacity-0 [@media(hover:none)]:opacity-0';
export const SLOT_HOVER_CLASS =
  'absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100';

/**
 * The card's top-left slot: status and selection share ONE 18px box (owner
 * 2026-09-29 — the 2026-09-15 gutter law, "status at rest, checklist on hover",
 * on every card). Pointer hover or keyboard focus shows the checkbox; touch
 * (`hover: none`) always shows it; a checked card shows its check. With an alert
 * (orders: out of stock) hovering or focusing the slot also opens the line peek.
 */
function CheckStatusSlot({
  model,
  columns,
  checked,
  check,
  testId,
}: {
  model: RecordCardModel;
  columns: readonly RecordFactColumn[];
  checked: boolean | 'mixed';
  check: ReactNode;
  testId: string;
}) {
  const peek = useHoverPeek(140);
  const tone = STATE_TONE_CLASSES[model.state.tone];
  const Glyph = model.stateIcon;
  const resting = checked === false;
  const slot = (
    <span
      data-check-status-slot=""
      className="pointer-events-auto relative z-10 flex size-[18px] items-center justify-center"
      onPointerEnter={model.alert ? peek.enter : undefined}
      onPointerLeave={model.alert ? peek.leave : undefined}
      onFocus={model.alert ? () => peek.setOpen(true) : undefined}
      onBlur={model.alert ? () => peek.setOpen(false) : undefined}
    >
      {resting ? (
        <span
          data-testid={testId}
          role="img"
          aria-label={model.alert?.ariaLabel ?? model.stateMeaning}
          className={cn(SLOT_REST_CLASS, 'relative items-center justify-center', tone.text)}
        >
          <Glyph className="size-4" />
          {model.alert && model.alert.count > 0 && model.lines.length > 1 ? (
            <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-fill-danger text-[9px] font-bold leading-none text-white">
              {model.alert.count}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className={resting ? SLOT_HOVER_CLASS : 'flex'}>{check}</span>
    </span>
  );
  if (!model.alert) {
    return (
      <HoverTooltip label={model.stateMeaning} placement="right" asChild>
        {slot}
      </HoverTooltip>
    );
  }
  return (
    <Popover open={peek.open} onOpenChange={peek.setOpen}>
      <PopoverAnchor asChild>{slot}</PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={peek.enter}
        onPointerLeave={peek.leave}
        className="w-[23rem] overflow-hidden rounded-2xl p-0"
      >
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING}
          style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
        >
          <header className="flex items-center gap-2 border-b border-border-hairline px-3.5 py-2.5">
            <span className={cn('flex size-6 items-center justify-center rounded-md', tone.pill)}>
              <Glyph className="size-3.5" />
            </span>
            <span className="text-sm font-semibold text-text-default">{model.state.label}</span>
            <span className="ml-auto text-xs text-text-muted">{model.alert.summary}</span>
          </header>
          <ul className="max-h-80 overflow-y-auto p-1.5">
            {model.lines.map((line, i) => (
              <motion.li
                key={line.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: 0.03 * i }}
                className={cn('flex gap-2.5 rounded-xl px-2 py-2', line.alert && 'bg-surface-danger')}
              >
                <span className="size-9 shrink-0 overflow-hidden bg-surface-sunken ring-1 ring-inset ring-black/5">
                  {line.photoUrl ? <img src={line.photoUrl} alt="" className="size-full object-contain" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-text-default">{line.title}</span>
                  <RecordLineFacts line={line} columns={columns} className="mt-0.5 text-xs" />
                  {line.alertNote ? <span className="mt-0.5 block text-xs font-medium text-text-danger">{line.alertNote}</span> : null}
                </span>
              </motion.li>
            ))}
          </ul>
          {model.notes.fixed || model.notes.own ? (
            <div className="flex flex-col gap-1 border-t border-border-hairline px-3.5 py-2.5 text-xs text-text-muted">
              {model.notes.fixed ? (
                <p className="flex gap-2">
                  <MessageSquare className="mt-px size-3.5 shrink-0" aria-hidden />
                  <span className="line-clamp-3">{model.notes.fixed.text}</span>
                </p>
              ) : null}
              {model.notes.own ? (
                <p className="flex gap-2">
                  <MessageSquare className="mt-px size-3.5 shrink-0" aria-hidden />
                  <span className="line-clamp-3">{model.notes.own}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}

// ── Line 1 pieces ───────────────────────────────────────────────────────────

/**
 * Line 1's notes — read and written in line, calm muted ink (owner 2026-09-27:
 * "triageable and readable, easy on your eyes"; never orange, never a
 * drop-down). Takes only the room line 1 has left (flex basis 0), so it never
 * pushes the identity; full text on hover.
 * - `fixed` (orders: the buyer's words): speech icon + text, read-only.
 * - `own` (the team's note): chat icon + text; a click edits it in place.
 *   Empty → "Add note", shown on hover / focus so 40 empty cards stay quiet.
 * Enter or leaving the field saves; Escape cancels. Saves append (the notes
 * trail keeps history), so a blank save is a cancel.
 */
function CardNotes({
  notes,
  onSave,
  testId,
}: {
  notes: RecordCardModel['notes'];
  onSave: ((text: string) => void) | undefined;
  testId: (part: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // The saved text shows at once; the next read of the record replaces it.
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => setSaved(null), [notes.own]);
  const own = saved ?? notes.own;
  if (!notes.fixed && !own && !onSave) return null;

  const begin = () => {
    setDraft(own ?? '');
    setEditing(true);
  };
  const finish = (commit: boolean) => {
    setEditing(false);
    const text = draft.trim();
    if (!commit || !text || text === (own ?? '').trim() || !onSave) return;
    setSaved(text);
    onSave(text);
  };

  return (
    <span className={cn('pointer-events-auto flex h-6 min-w-4 flex-1 items-center gap-2 text-text-muted', recordNote)} onClick={stop} onPointerDown={stop}>
      {notes.fixed ? (
        <HoverTooltip label={`${notes.fixed.label}: ${notes.fixed.text}`} asChild>
          <span data-testid={testId('note-fixed')} className="inline-flex min-w-4 max-w-full shrink items-center gap-1">
            <MessageSquare className="size-3.5 shrink-0 text-text-faint" aria-label={notes.fixed.label} />
            <span className="min-w-0 truncate">{notes.fixed.text}</span>
          </span>
        </HoverTooltip>
      ) : null}
      {editing ? (
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the text the operator just clicked
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finish(true);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              finish(false);
            }
          }}
          onBlur={() => finish(true)}
          placeholder="Write a note — Enter saves, Esc cancels"
          aria-label="Note"
          data-testid={testId('note-input')}
          className={cn(
            'h-6 min-w-40 flex-1 rounded-md bg-surface-card px-1.5 text-text-default ring-1 ring-border-default placeholder:text-text-faint',
            recordNote,
            focusRing('field'),
          )}
        />
      ) : own ? (
        <HoverTooltip label={onSave ? `${own} — click to edit` : own} asChild>
          <button
            type="button"
            tabIndex={onSave ? 0 : -1}
            disabled={!onSave}
            data-testid={testId('note')}
            onClick={begin}
            className={cn(
              'ds-raw-button inline-flex h-6 min-w-4 shrink items-center gap-1 rounded-md px-1 text-left hover:bg-surface-sunken hover:text-text-default disabled:hover:bg-transparent',
              focusRing('control'),
            )}
          >
            <MessageSquare className="size-3.5 shrink-0 text-text-faint" aria-hidden />
            <span className="min-w-0 truncate">{own}</span>
          </button>
        </HoverTooltip>
      ) : onSave ? (
        <button
          type="button"
          data-testid={testId('note-add')}
          onClick={begin}
          className={cn(
            'ds-raw-button inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1 text-text-faint transition-opacity hover:bg-surface-sunken hover:text-text-default',
            'opacity-0 focus-visible:opacity-100 group-focus-within/card:opacity-100 group-hover/card:opacity-100',
            focusRing('control'),
          )}
        >
          <MessageSquare className="size-3.5" aria-hidden />
          Add note
        </button>
      ) : null}
    </span>
  );
}

function ChipFace({ chip }: { chip: RecordCardChip }) {
  return chip.long ? (
    <>
      <span className={CARD_DISCLOSE.label.hideAt}>{chip.short}</span>
      <span className={CARD_DISCLOSE.label.show}>{chip.long}</span>
    </>
  ) : (
    chip.short
  );
}

function Chip({ chip }: { chip: RecordCardChip }) {
  const onPress = chip.onPress;
  const face = onPress ? (
    <button
      type="button"
      data-testid={chip.testId}
      onPointerDown={stop}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className={cn('pointer-events-auto transition-transform hover:scale-105', CHIP_TONE_CLASS[chip.tone], CARD_CHIP, focusRing('control'))}
    >
      <ChipFace chip={chip} />
    </button>
  ) : (
    // A static chip is read, not pressed — the pointer only needs it for its tooltip.
    <span data-testid={chip.testId} className={cn(chip.tooltip && 'pointer-events-auto', CARD_CHIP, CHIP_TONE_CLASS[chip.tone])}>
      <ChipFace chip={chip} />
    </span>
  );
  return chip.tooltip ? (
    <HoverTooltip label={chip.tooltip} asChild>
      {face}
    </HoverTooltip>
  ) : (
    face
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

interface RecordCardOwnProps<V extends CardViewDecl> {
  /**
   * The view this card paints (`TriageViewDecl`): its `status` and `slots`
   * type `model` and `quickLook`, so a card cannot paint a status kind, a
   * channel, a person or a quick look its view does not declare.
   */
  view: V;
  model: ViewCardModel<V>;
  /** The family's fact columns, in order. */
  factColumns: readonly RecordFactColumn[];
  /** Prefix of every test id (`order-card` → `order-card-open`, `order-card-check`, …). */
  testIdPrefix: string;
  /** Extra `data-*` attributes on the card that the family's readers use. */
  rowAttrs?: Readonly<Record<`data-${string}`, string | number>>;
  /** Internal vertical rhythm. Dense keeps the same anatomy and selection axis with less air. */
  spacing?: 'default' | 'dense';
  /** Every line checked → true; some → 'mixed'. */
  checked: boolean | 'mixed';
  /** This record is the open one. */
  open: boolean;
  /** The other lines are unfolded. */
  expanded: boolean;
  /** The quick look (Space) is unfolded under this card. */
  peekOpen: boolean;
  /** Position in the first paint — staggers the arrival; null = no entrance. */
  enterIndex: number | null;
  /** The card body opens the record — never checks it (owner 2026-09-27). Only the checkbox checks. */
  onOpen: (event: RecordOpenEvent) => void;
  onToggleCheck: (event: { shiftKey: boolean }) => void;
  onToggleExpand: () => void;
  onTogglePeek: () => void;
  /** Family fact, top-left: the identity (number + its link / copy menu). */
  identity: Extract<RecordCardSlotFact, { role: 'identity' }>;
  /** Family fact before the one status; null when the family has none. */
  trailing: Extract<RecordCardSlotFact, { role: 'trailing' }> | null;
  /**
   * Family slot, the card's BOTTOM-RIGHT corner (after the next step): the
   * record's one resolve verb (Exceptions, owner 2026-09-29) — where the eye
   * lands after reading the card, never beside its identity.
   */
  action?: ReactNode;
  /** Saves the team's note from line 1 (`notes.own`); absent = notes are read-only. */
  onSaveNote?: (text: string) => void;
  /**
   * A family whose lines are records of their own (receiving: each line opens
   * alone): an unfolded line opens ITSELF instead of the card's record, and
   * `openLineId` marks the one that is open. Absent = a line opens the card.
   */
  onOpenLine?: (lineId: number, event: RecordOpenEvent) => void;
  openLineId?: number | null;
}

/** `quickLook` — the family slot under the lines while `peekOpen` (a `CollapseItem`) — is required iff the view declares a peek. */
export type RecordCardProps<V extends CardViewDecl = CardViewDecl> = RecordCardOwnProps<V> & ViewQuickLookProps<V>;

export function RecordCard<V extends CardViewDecl>({
  view,
  model: viewModel,
  factColumns,
  testIdPrefix,
  rowAttrs,
  spacing = 'default',
  checked,
  open,
  expanded,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  onTogglePeek,
  identity,
  trailing,
  action,
  quickLook,
  onSaveNote,
  onOpenLine,
  openLineId = null,
}: RecordCardProps<V>) {
  const model: RecordCardModel = viewModel;
  // The whole-card open target. Inner controls hand focus back to it after a
  // click, so the card's keys stay the card's: Enter opens, Space = quick look.
  const openRef = useRef<HTMLButtonElement>(null);
  const lead = model.lines[0];
  if (!lead) return null;
  const tone = STATE_TONE_CLASSES[model.state.tone];
  const selected = checked !== false;
  const id = (part: string) => `${testIdPrefix}-${part}`;
  const photo = view.slots.photo === 'line';

  // The card body's open — the full-card target, and the facts whose hover
  // tooltip needs the pointer (a click on them still opens the record).
  const openRecord = (event: MouseEvent) =>
    onOpen({ shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, detail: event.detail, target: event.target });

  const status = model.status;
  const statusNode: ReactNode =
    status.kind === 'none' ? null : status.kind === 'deadline' ? (
      <HoverTooltip label={status.tip} disabled={!status.tip} asChild>
        <span
          onClick={openRecord}
          className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto cursor-pointer gap-1.5 text-[13px] tabular-nums', RECORD_DEADLINE_TONE_CLASS[status.tone])}
        >
          <span className="relative flex size-2">
            {status.tone === 'late' ? (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-fill-danger"
                animate={{ scale: [1, 2.2], opacity: [0.55, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            ) : null}
            <span className={cn('relative size-2 rounded-full', RECORD_DEADLINE_DOT_CLASS[status.tone])} />
          </span>
          {status.face}
        </span>
      </HoverTooltip>
    ) : status.kind === 'date' ? (
      <HoverTooltip label={status.tip} disabled={!status.tip} asChild>
        <span
          data-testid={id('date')}
          onClick={openRecord}
          className={cn(
            CARD_FACT_BOX_CLASS,
            'pointer-events-auto cursor-pointer whitespace-nowrap text-[13px] tabular-nums',
            status.alert ? 'font-semibold text-text-danger' : 'text-text-muted',
          )}
        >
          {status.face}
        </span>
      </HoverTooltip>
    ) : status.kind === 'state' ? (
      <HoverTooltip label={status.tip} disabled={!status.tip} asChild>
        <span
          data-testid={id('state')}
          onClick={openRecord}
          className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto cursor-pointer gap-1.5 whitespace-nowrap text-role-data font-medium', STATE_TONE_CLASSES[status.tone].text)}
        >
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATE_TONE_CLASSES[status.tone].dot)} />
          {status.face}
        </span>
      </HoverTooltip>
    ) : null;

  // 2+ lines: the lead line is the face; "+N items" unfolds the rest (alert lines already first).
  const moreLines = model.lines.slice(1);
  const moreCount = moreLines.length;
  const moreAlerts = moreLines.filter((line) => line.alert).length;
  const refocusCard = () => openRef.current?.focus({ preventScroll: true });
  // Quick look, findable by pointer: the same toggle as Space, shown on hover / focus —
  // always at the far right of the lead's facts row, on every card. Not a tab stop:
  // keyboard reaches it as Space on the card, so Enter never lands on it.
  const detailsToggle = (
    <HoverTooltip label="Quick look" shortcut="Space" asChild>
      <button
        type="button"
        tabIndex={-1}
        aria-expanded={peekOpen}
        aria-label={peekOpen ? 'Close quick look' : 'Quick look'}
        data-testid={id('peek-toggle')}
        onPointerDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePeek();
          refocusCard();
        }}
        className={cn(
          CARD_FACT_BOX_CLASS,
          'ds-raw-button pointer-events-auto ml-auto gap-0.5 rounded-md px-1 text-xs font-medium text-text-muted transition-opacity hover:bg-surface-sunken hover:text-text-default',
          peekOpen ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-focus-within/card:opacity-100 group-hover/card:opacity-100',
          focusRing('control'),
        )}
      >
        Details
        <motion.span animate={{ rotate: peekOpen ? 180 : 0 }} transition={SPRING} className="inline-flex">
          <ChevronDown className="size-3.5" aria-hidden />
        </motion.span>
      </button>
    </HoverTooltip>
  );

  // The next workflow step — "→ Pack" — always the card's bottom-right corner: the
  // end of the lead's facts row on a one-line card, the end of the "+N items" row otherwise.
  const next = model.next;
  const nextNode = next ? (
    <HoverTooltip label={next.tip} asChild>
      <span
        data-testid={id('next')}
        aria-label={`Next step: ${next.label}`}
        onClick={openRecord}
        className={cn(
          CARD_FACT_BOX_CLASS,
          'pointer-events-auto shrink-0 cursor-pointer gap-1 whitespace-nowrap text-[13px]',
          next.blocked ? 'text-text-danger' : 'text-text-faint',
        )}
      >
        <ArrowRight className="size-3.5" aria-hidden />
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATE_TONE_CLASSES[next.tone].dot)} />
        <span className={cn('font-semibold', next.blocked ? 'text-text-danger' : 'text-text-default')}>{next.label}</span>
      </span>
    </HoverTooltip>
  ) : null;

  return (
    <motion.article
      {...rowAttrs}
      data-desk-record-key={model.leadId}
      data-state={model.state.id}
      data-testid={testIdPrefix}
      aria-label={model.aria.card}
      initial={enterIndex != null ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={enterIndex != null ? { ...SPRING, delay: Math.min(enterIndex, CARD_STAGGER_CAP) * CARD_STAGGER_S } : SPRING}
      whileHover="hover"
      variants={{ rest: {}, hover: {} }}
      className={cn(
        // Always a white card (owner 2026-09-27): state reads as an OUTLINE only.
        // The outline itself is a topmost child below. It is a real, absolutely
        // positioned border — never a ring/box-shadow — so the raised motion
        // frame and the list's x-clip cannot crop or leak its bottom/right edge.
        // `content-visibility` skips off-screen cards — but not inside a height
        // that is animating (`CollapseItem`): its clip hides the card, and a
        // skipped card measures as the 92px placeholder, so the height would
        // grow to the guess and snap to the real size at the end.
        'group/card @container/card relative isolate flex w-full max-w-full box-border overflow-clip rounded-2xl bg-surface-card pl-4 pr-4 transition-shadow duration-150 [content-visibility:auto] [[data-collapse-clip]_&]:[content-visibility:visible]',
        spacing === 'dense' ? 'py-1.5 [contain-intrinsic-size:auto_72px]' : 'py-2.5 [contain-intrinsic-size:auto_86px]',
      )}
    >
      <span
        aria-hidden
        className={recordCardOutlineClass({ selected, open })}
      />
      {/* The open target — the whole card. */}
      <button
        ref={openRef}
        type="button"
        aria-label={model.aria.open}
        aria-current={open || undefined}
        data-testid={id('open')}
        onClick={openRecord}
        // Space = quick look; Enter (the button's own key) opens the record.
        onKeyDown={(event) => {
          if (event.key !== ' ' || event.repeat) return;
          event.preventDefault();
          onTogglePeek();
        }}
        aria-expanded={peekOpen}
        className={cn('absolute inset-0 z-0 cursor-pointer rounded-2xl', focusRing('control'))}
      />

      {/* Status rail */}
      <motion.span
        aria-hidden
        variants={RAIL_VARIANTS}
        initial="rest"
        transition={SOFT_SPRING}
        style={model.state.hatched ? RECORD_RAIL_HATCH_STYLE : undefined}
        className={cn(
          'pointer-events-none absolute left-1.5 w-[3px] origin-left rounded-full',
          spacing === 'dense' ? 'bottom-1.5 top-1.5' : 'bottom-2.5 top-2.5',
          tone.dot,
        )}
      />

      {/* Top-left: status at rest, the checkbox on hover / focus / touch / check — one slot. */}
      <div className="pointer-events-none relative z-10 flex h-6 w-7 shrink-0 items-center justify-center">
        <CheckStatusSlot
          model={model}
          columns={factColumns}
          checked={checked}
          testId={id('status')}
          check={<CardCheck checked={checked} label={model.aria.check} testId={id('check')} onToggle={onToggleCheck} />}
        />
      </div>

      {/* Record facts */}
      <div className="pointer-events-none relative z-10 ml-2 flex min-w-0 flex-1 flex-col gap-1">
        {/* Line 1 — identity · channel · person · chips · note …… trailing · status. On a
            very narrow card (the split's list on a small screen) the right end wraps under
            instead of the order number running into the channel. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto min-w-0 shrink items-center gap-0.5 text-sm font-semibold tabular-nums text-text-default')}
            onClick={stop}
            onPointerDown={stop}
          >
            {identity.content}
          </span>
          {/* Platform is the compact label voice; buyer is a larger person voice. The faint
              separator and distinct weights keep the two names from reading as one. */}
          {model.channel ? (
            <HoverTooltip label={model.channel.tooltip} asChild>
              <span
                data-testid={id('platform')}
                onClick={openRecord}
                className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto cursor-pointer gap-1 whitespace-nowrap text-text-muted', recordPlatform)}
              >
                {model.channel.dot}
                {/* Under the `brand` tier the dot carries the channel; the name is in the tooltip and the quick look. */}
                <span className={CARD_DISCLOSE.brand.show}>{model.channel.label}</span>
                {model.channel.badge ? <span className="rounded-md bg-surface-sunken px-1 text-[11px] font-medium text-text-muted">{model.channel.badge}</span> : null}
              </span>
            </HoverTooltip>
          ) : null}
          {model.person ? (
            // Shown from the `detail` tier (the quick look always has it); then the first thing line 1 gives up — shrinks (×100) and truncates.
            <HoverTooltip label={model.person} asChild>
              <span
                data-testid={id('buyer')}
                onClick={openRecord}
                className={cn('pointer-events-auto h-6 min-w-0 shrink-[100] cursor-pointer items-center gap-1.5 text-text-muted', recordPerson, CARD_DISCLOSE.detail.inlineFlex)}
              >
                {model.channel ? <span aria-hidden className="text-text-faint">·</span> : null}
                <span className="min-w-0 truncate">{model.person}</span>
              </span>
            </HoverTooltip>
          ) : null}
          {model.chips.map((chip) => (
            <Chip key={chip.id} chip={chip} />
          ))}
          <CardNotes notes={model.notes} onSave={onSaveNote} testId={id} />
          <span className="ml-auto" />
          {trailing?.content}
          {statusNode}
        </div>

        {/* The lead line — the one face every card wears: photo spans title + facts; Details ends the facts row. */}
        <div className={cn('flex min-w-0 items-center', spacing === 'dense' ? 'gap-1.5' : 'gap-2')}>
          {photo ? (
            <span className="pointer-events-auto">
              <CardPhoto line={lead} size="lg" />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className={cn(denseRecordTitle, 'line-clamp-2 break-words text-text-default @xl/card:line-clamp-1')} title={lead.title}>
              {lead.title}
            </p>
            {/* items-end: Details and the next step sit on the facts' last line — the card's
                bottom-right. The facts keep ≥ 8rem; with less room the next step wraps under
                them (still right-aligned) instead of crushing them one per line. */}
            <div className="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-0.5">
              <RecordLineFacts line={lead} columns={factColumns} className="min-w-32 flex-1" />
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {detailsToggle}
                {moreCount ? null : nextNode}
                {moreCount ? null : action}
              </span>
            </div>
          </div>
        </div>

        {moreCount ? (
          // 2+ lines: the other lines fold behind one row; unfolded, they are columns.
          <div
            role="list"
            aria-label="More items"
            data-testid={id('lines')}
            className={(photo ? MORE_LINES_GRID_BY_FACTS : MORE_LINES_GRID_NO_PHOTO_BY_FACTS)[factColumns.length]}
          >
            <AnimatePresence initial={false}>
              {expanded
                ? moreLines.map((line, i) => (
                    <CollapseItem key={line.id} subgrid delay={0.04 * i}>
                      <MoreLineRow
                        line={line}
                        photo={photo}
                        columns={factColumns}
                        testId={id('line')}
                        current={openLineId === line.id}
                        onOpen={
                          onOpenLine
                            ? (event) =>
                                onOpenLine(line.id, { shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, detail: event.detail, target: event.target })
                            : openRecord
                        }
                      />
                    </CollapseItem>
                  ))
                : null}
            </AnimatePresence>
            <div className="col-span-full flex min-h-7 min-w-0 items-center gap-1.5 text-[13px]">
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? 'Show fewer items' : `Show ${moreCount} more item${moreCount === 1 ? '' : 's'}`}
                data-testid={id('expand')}
                onPointerDown={stop}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand();
                  // A click leaves the card's keys on the card (Enter opens); a keyboard press keeps focus here.
                  if (event.detail > 0) refocusCard();
                }}
                className={cn(
                  CARD_FACT_BOX_CLASS,
                  'ds-raw-button pointer-events-auto -ml-1 gap-0.5 rounded-md px-1 font-medium text-text-muted hover:bg-surface-sunken hover:text-text-default',
                  focusRing('control'),
                )}
              >
                {expanded ? 'Fewer items' : `+${moreCount} item${moreCount === 1 ? '' : 's'}`}
                <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={SPRING} className="inline-flex">
                  <ChevronDown className="size-3.5" aria-hidden />
                </motion.span>
              </button>
              {!expanded && moreAlerts ? (
                <>
                  <RecordFactSep />
                  <span className="font-medium text-text-danger">{model.hiddenAlertLabel(moreAlerts)}</span>
                </>
              ) : null}
              {nextNode || action ? (
                <span className="ml-auto flex items-center gap-3">
                  {nextNode}
                  {action}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <AnimatePresence initial={false}>{peekOpen ? quickLook : null}</AnimatePresence>
      </div>
    </motion.article>
  );
}
