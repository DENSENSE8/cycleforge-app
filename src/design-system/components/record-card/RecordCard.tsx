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
 * `trailing` and `quickLook` — plus the single-card `menu`.
 */

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { ChevronDown, MessageSquare, Package } from '@/components/Icons';
import { Popover, PopoverAnchor, PopoverContent } from '@/design-system/primitives/radix-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CollapseItem } from '@/design-system/components/Collapse';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CARD_DISCLOSE, CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { cn } from '@/utils/_cn';
import { RecordFactPaint, type RecordFactColumn } from './record-fact';
import type { CardDisclosureTier, RecordCardChip, RecordCardLine, RecordCardModel, RecordDeadlineTone } from './record-card-types';

const SPRING = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 } as const;
const SOFT_SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const;

/** The cards' arrival: each card waits its turn (capped), then springs up. */
const CARD_STAGGER_S = 0.028;
const CARD_STAGGER_CAP = 14;
/**
 * When the last staggered card has landed — the list's chrome (section
 * headers) rises only after this, so text never travels with the cards.
 */
export const CARD_LIST_SETTLE_S = CARD_STAGGER_S * CARD_STAGGER_CAP + 0.3;

/** Propagated from the card's `whileHover` — the photo breathes, the rail thickens, the glyph nods. */
const RAIL_VARIANTS: Variants = { rest: { scaleX: 1 }, hover: { scaleX: 1.75 } };
const PHOTO_VARIANTS: Variants = { rest: { scale: 1 }, hover: { scale: 1.07 } };
const GLYPH_VARIANTS: Variants = { rest: { rotate: 0, scale: 1 }, hover: { rotate: [0, -10, 8, 0], scale: 1.08 } };

const DEADLINE_TONE_CLASS: Readonly<Record<RecordDeadlineTone, string>> = {
  late: 'text-text-danger font-semibold',
  today: 'text-text-warning font-semibold',
  soon: 'text-text-default font-medium',
  later: 'text-text-muted',
  none: 'text-text-faint',
};

const DEADLINE_DOT_CLASS: Readonly<Record<RecordDeadlineTone, string>> = {
  late: 'bg-fill-danger',
  today: 'bg-fill-warning',
  soon: 'bg-fill-info',
  later: 'bg-border-strong',
  none: 'bg-border-default',
};

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
 * Literal per fact count — Tailwind only generates classes it can read.
 */
const MORE_LINES_GRID_BY_FACTS: Readonly<Record<number, string>> = {
  1: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(1,auto)_1fr] items-center gap-x-3',
  2: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(2,auto)_1fr] items-center gap-x-3',
  3: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(3,auto)_1fr] items-center gap-x-3',
  4: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(4,auto)_1fr] items-center gap-x-3',
  5: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(5,auto)_1fr] items-center gap-x-3',
  6: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(6,auto)_1fr] items-center gap-x-3',
  7: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(7,auto)_1fr] items-center gap-x-3',
  8: 'grid min-w-0 grid-cols-[auto_minmax(0,max-content)_repeat(8,auto)_1fr] items-center gap-x-3',
};

/** An unfolded column below its tier keeps its cell but empties it. */
const TIER_SHOW_CLASS: Readonly<Record<CardDisclosureTier, string | null>> = {
  always: null,
  brand: CARD_DISCLOSE.brand.show,
  label: CARD_DISCLOSE.label.show,
  detail: 'hidden @2xl/card:inline',
};

/** Hatched rail — a state that must read on white without washing the card. */
const HATCH_STYLE = {
  backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / 0.55) 3px 5px)',
} as const;

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

function CardCheck({
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
  const peek = useHoverPeek(320);
  const box = size === 'lg' ? 'size-12 rounded-xl' : 'size-8 rounded-lg';
  return (
    <Popover open={peek.open && Boolean(line.photoUrl)} onOpenChange={peek.setOpen}>
      <PopoverAnchor asChild>
        <span
          onPointerEnter={peek.enter}
          onPointerLeave={peek.leave}
          className={cn('relative z-10 block shrink-0 overflow-hidden bg-surface-sunken ring-1 ring-inset ring-black/5', box)}
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
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={peek.enter}
        onPointerLeave={peek.leave}
        className="w-auto overflow-hidden rounded-2xl border-0 p-0 shadow-elev-overlay"
      >
        {/* The photo alone (owner 2026-09-27): no caption, and the box takes the image's own aspect — no letterbox bars. */}
        <motion.img
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={SPRING}
          style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
          src={line.photoUrl ?? undefined}
          alt={line.title}
          className="block h-auto max-h-80 w-auto max-w-72"
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Line facts ──────────────────────────────────────────────────────────────

function Sep() {
  return <span aria-hidden className="text-text-faint">·</span>;
}

/** A line's facts as one sentence, in column order — every fact at every width (the sentence wraps). */
function LineFacts({ line, columns, className }: { line: RecordCardLine; columns: readonly RecordFactColumn[]; className?: string }) {
  const faces = columns.flatMap((column) => {
    const face = line.facts[column.id];
    return face ? [{ id: column.id, face }] : [];
  });
  return (
    // Wraps on a narrow card (phone, the split's list) — each fact stays whole.
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-text-muted [&>*]:whitespace-nowrap', className)}>
      {faces.flatMap(({ id, face }, i) => {
        const painted = <RecordFactPaint key={id} face={face} />;
        return i > 0 ? [<Sep key={`${id}:sep`} />, painted] : [painted];
      })}
    </span>
  );
}

/** One unfolded line: small photo · title · one cell per fact column, on the parent's subgrid. */
function MoreLineRow({
  line,
  columns,
  testId,
  onOpen,
}: {
  line: RecordCardLine;
  columns: readonly RecordFactColumn[];
  testId: string;
  onOpen: (event: MouseEvent) => void;
}) {
  return (
    <div role="listitem" data-testid={testId} className="col-span-full grid min-h-9 grid-cols-subgrid items-center text-[13px] text-text-muted">
      <span className="pointer-events-auto">
        <CardPhoto line={line} size="sm" />
      </span>
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

// ── Status icon ─────────────────────────────────────────────────────────────

/**
 * With an alert (orders: out of stock): a hover card naming exactly which
 * lines need attention. Otherwise a still icon with a one-line meaning.
 */
function StatusGlyph({ model, columns, testId }: { model: RecordCardModel; columns: readonly RecordFactColumn[]; testId: string }) {
  const peek = useHoverPeek(140);
  const tone = STATE_TONE_CLASSES[model.state.tone];
  const Glyph = model.stateIcon;
  if (!model.alert) {
    return (
      <HoverTooltip label={model.stateMeaning} placement="right" asChild>
        <span
          data-testid={testId}
          role="img"
          aria-label={model.stateMeaning}
          className={cn('pointer-events-auto relative z-10 -m-1 flex size-7 items-center justify-center', tone.text)}
        >
          <Glyph className="size-4" />
        </span>
      </HoverTooltip>
    );
  }
  return (
    <Popover open={peek.open} onOpenChange={peek.setOpen}>
      <PopoverAnchor asChild>
        <motion.button
          type="button"
          aria-label={model.alert.ariaLabel}
          data-testid={testId}
          onPointerEnter={peek.enter}
          onPointerLeave={peek.leave}
          onFocus={() => peek.setOpen(true)}
          onBlur={() => peek.setOpen(false)}
          onPointerDown={stop}
          onClick={(event) => {
            event.stopPropagation();
            peek.setOpen((v) => !v);
          }}
          variants={GLYPH_VARIANTS}
          transition={{ duration: 0.45 }}
          className={cn('pointer-events-auto relative z-10 -m-1 flex size-7 items-center justify-center rounded-lg', tone.text, focusRing('control'))}
        >
          <Glyph className="size-4" />
          {model.alert.count > 0 && model.lines.length > 1 ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-fill-danger text-[9px] font-bold leading-none text-white">
              {model.alert.count}
            </span>
          ) : null}
        </motion.button>
      </PopoverAnchor>
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
                <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-inset ring-black/5">
                  {line.photoUrl ? <img src={line.photoUrl} alt="" className="size-full object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-text-default">{line.title}</span>
                  <LineFacts line={line} columns={columns} className="mt-0.5 text-xs" />
                  {line.alertNote ? <span className="mt-0.5 block text-xs font-medium text-text-danger">{line.alertNote}</span> : null}
                </span>
              </motion.li>
            ))}
          </ul>
          {model.note ? (
            <p className="flex gap-2 border-t border-border-hairline px-3.5 py-2.5 text-xs text-text-muted">
              <MessageSquare className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-3">{model.note.text}</span>
            </p>
          ) : null}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}

// ── Line 1 pieces ───────────────────────────────────────────────────────────

function Chip({ chip }: { chip: RecordCardChip }) {
  if (!chip.onPress) return <span className={cn(CARD_CHIP, CHIP_TONE_CLASS[chip.tone])}>{chip.short}</span>;
  const onPress = chip.onPress;
  const button = (
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
      {chip.long ? (
        <>
          <span className={CARD_DISCLOSE.label.hideAt}>{chip.short}</span>
          <span className={CARD_DISCLOSE.label.show}>{chip.long}</span>
        </>
      ) : (
        chip.short
      )}
    </button>
  );
  return chip.tooltip ? (
    <HoverTooltip label={chip.tooltip} asChild>
      {button}
    </HoverTooltip>
  ) : (
    button
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

export interface RecordCardProps {
  model: RecordCardModel;
  /** The family's fact columns, in order. */
  factColumns: readonly RecordFactColumn[];
  /** Prefix of every test id (`order-card` → `order-card-open`, `order-card-check`, …). */
  testIdPrefix: string;
  /** Extra `data-*` attributes on the card that the family's readers use. */
  rowAttrs?: Readonly<Record<`data-${string}`, string | number>>;
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
  /** Family slot, top-left: the identity (number + its link / copy menu). */
  identity: ReactNode;
  /** Family slot, before the status: a trailing link (the listing) or its editor. */
  trailing: ReactNode;
  /** Family slot under the lines while `peekOpen` — a `CollapseItem`. */
  quickLook: ReactNode;
  /** The single-card menu, anchored at the card's bottom-right. */
  menu: { open: boolean; onDone: () => void; content: ReactNode } | null;
}

export function RecordCard({
  model,
  factColumns,
  testIdPrefix,
  rowAttrs,
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
  quickLook,
  menu,
}: RecordCardProps) {
  const lead = model.lines[0];
  if (!lead) return null;
  const tone = STATE_TONE_CLASSES[model.state.tone];
  const selected = checked !== false;
  const id = (part: string) => `${testIdPrefix}-${part}`;

  // The card body's open — the full-card target, and the facts whose hover
  // tooltip needs the pointer (a click on them still opens the record).
  const openRecord = (event: MouseEvent) =>
    onOpen({ shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, detail: event.detail, target: event.target });

  const status = model.status;
  const statusNode: ReactNode = (
    <HoverTooltip label={status.tip} disabled={!status.tip} asChild>
      <span
        onClick={openRecord}
        className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto cursor-pointer gap-1.5 text-[13px] tabular-nums', DEADLINE_TONE_CLASS[status.tone])}
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
          <span className={cn('relative size-2 rounded-full', DEADLINE_DOT_CLASS[status.tone])} />
        </span>
        {status.face}
      </span>
    </HoverTooltip>
  );

  // 2+ lines: the lead line is the face; "+N items" unfolds the rest (alert lines already first).
  const moreLines = model.lines.slice(1);
  const moreCount = moreLines.length;
  const moreAlerts = moreLines.filter((line) => line.alert).length;
  // Quick look, findable by pointer: the same toggle as Space, shown on hover / focus —
  // always at the far right of the lead's facts row, on every card.
  const detailsToggle = (
    <HoverTooltip label="Quick look" shortcut="Space" asChild>
      <button
        type="button"
        aria-expanded={peekOpen}
        aria-label={peekOpen ? 'Close quick look' : 'Quick look'}
        data-testid={id('peek-toggle')}
        onPointerDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePeek();
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

  const article = (
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
        'group/card @container/card relative isolate flex rounded-2xl py-3 pl-4 pr-4 transition-colors duration-150 [contain-intrinsic-size:auto_92px] [content-visibility:auto]',
        selected ? 'bg-surface-info/60' : open ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/70',
        open && 'ring-1 ring-inset ring-border-strong',
      )}
    >
      {/* The open target — the whole card. */}
      <button
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
        style={model.state.hatched ? HATCH_STYLE : undefined}
        className={cn('pointer-events-none absolute bottom-3 left-1.5 top-3 w-[3px] origin-left rounded-full', tone.dot)}
      />

      {/* Checkbox, status icon beneath */}
      <div className="pointer-events-none relative z-10 flex w-7 shrink-0 flex-col items-center gap-3 pt-px">
        <CardCheck checked={checked} label={model.aria.check} testId={id('check')} onToggle={onToggleCheck} />
        <StatusGlyph model={model} columns={factColumns} testId={id('status')} />
      </div>

      {/* Record facts */}
      <div className="pointer-events-none relative z-10 ml-3 flex min-w-0 flex-1 flex-col gap-2">
        {/* Line 1 — identity · channel · person · chips · note …… trailing · status */}
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto min-w-0 shrink gap-0.5 text-sm font-semibold tabular-nums text-text-default')} onClick={stop} onPointerDown={stop}>
            {identity}
          </span>
          {/* Channel: brand dot, medium-weight ink. Person: regular weight, muted, after a faint
              separator — two faces so the two names never read as one. */}
          {model.channel ? (
            <HoverTooltip label={model.channel.tooltip} asChild>
              <span
                data-testid={id('platform')}
                onClick={openRecord}
                className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto cursor-pointer gap-1.5 whitespace-nowrap text-[13px] font-medium text-text-default')}
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
                className={cn('pointer-events-auto h-6 min-w-0 shrink-[100] cursor-pointer items-center gap-2 text-[13px] font-normal text-text-muted', CARD_DISCLOSE.detail.inlineFlex)}
              >
                {model.channel ? <span aria-hidden className="text-text-faint">·</span> : null}
                <span className="min-w-0 truncate">{model.person}</span>
              </span>
            </HoverTooltip>
          ) : null}
          {model.chips.map((chip) => (
            <Chip key={chip.id} chip={chip} />
          ))}
          {model.note ? (
            <HoverTooltip label={model.note.text} asChild>
              <span className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto text-text-muted')}>
                <MessageSquare className="size-3.5" aria-label={model.note.label} />
              </span>
            </HoverTooltip>
          ) : null}
          <span className="ml-auto" />
          {trailing}
          {statusNode}
        </div>

        {/* The lead line — the one face every card wears: photo spans title + facts; Details ends the facts row. */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="pointer-events-auto">
            <CardPhoto line={lead} size="lg" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-text-default @xl/card:line-clamp-1" title={lead.title}>
              {lead.title}
            </p>
            <div className="flex min-w-0 items-center gap-3">
              <LineFacts line={lead} columns={factColumns} className="min-w-0 flex-1" />
              {detailsToggle}
            </div>
          </div>
        </div>

        {moreCount ? (
          // 2+ lines: the other lines fold behind one row; unfolded, they are columns.
          <div role="list" aria-label="More items" data-testid={id('lines')} className={MORE_LINES_GRID_BY_FACTS[factColumns.length]}>
            <AnimatePresence initial={false}>
              {expanded
                ? moreLines.map((line, i) => (
                    <CollapseItem key={line.id} subgrid delay={0.04 * i}>
                      <MoreLineRow line={line} columns={factColumns} testId={id('line')} onOpen={openRecord} />
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
                  <Sep />
                  <span className="font-medium text-text-danger">{model.hiddenAlertLabel(moreAlerts)}</span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        <AnimatePresence initial={false}>{peekOpen ? quickLook : null}</AnimatePresence>
      </div>

      {/* The single-card menu drops down from the right edge. */}
      {menu ? (
        <PopoverAnchor asChild>
          <span aria-hidden className="pointer-events-none absolute bottom-0 right-3 size-px" />
        </PopoverAnchor>
      ) : null}
    </motion.article>
  );

  if (!menu) return article;
  return (
    <Popover open={menu.open} modal={false}>
      {article}
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={menu.onDone}
        className="w-64 overflow-hidden rounded-2xl p-0"
        data-testid={id('menu')}
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING}
          style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
        >
          {menu.content}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
