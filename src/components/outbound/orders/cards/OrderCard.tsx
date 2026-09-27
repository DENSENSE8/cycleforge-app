'use client';

/**
 * One ORDER CARD on the To-ship triage list (owner 2026-09-27, BRIEF §13).
 *
 *   ┃ ☐  #114-2233445-6677889 · eBay cyclegear              ● Due today
 *   ┃ ⚠  [photo] Shimano Deore XT M8100 12-speed rear derailleur
 *   ┃           ×1 · Used – Good · Stock 3 · Bin A-14 · $89.00   +2 items ▾ (MG)
 *
 * The rail and the status icon wear the order's worst lifecycle state.
 * Hovering the status icon lists every line (what is short, where it sits);
 * hovering the photo peeks it large. The card body opens the record — or,
 * while anything is checked, toggles the card (Shopify index semantics).
 */

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { ChevronDown, MapPin, MessageSquare, Package } from '@/components/Icons';
import { Popover, PopoverAnchor, PopoverContent } from '@/design-system/primitives/radix-popover';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { StaffAvatar } from '@/components/identity';
import { LIFECYCLE_GLYPH } from '@/design-system/components/record-ledger/LifecycleCode';
import { LIFECYCLE, LIFECYCLE_CLASSES, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useOrderChannel } from '@/hooks/useCatalog';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
import { platformMetaBrandDot } from '@/lib/source-platform';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrderRecordMode } from '@/lib/selection-context/order-inspector-context';
import type { OrderCardLine, OrderCardModel, OrderCardSlaTone } from '@/lib/orders/order-card-model';
import type { QueueRowClickEvent } from '@/components/dashboard/orders-queue/queue-row-click';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { cn } from '@/utils/_cn';
import { OrderCardActionMenu } from './OrderCardActionMenu';

const SPRING = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 } as const;
const SOFT_SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const;

/** Propagated from the card's `whileHover` — the photo breathes, the rail thickens, the glyph nods. */
const RAIL_VARIANTS: Variants = { rest: { scaleX: 1 }, hover: { scaleX: 1.75 } };
const PHOTO_VARIANTS: Variants = { rest: { scale: 1 }, hover: { scale: 1.07 } };
const GLYPH_VARIANTS: Variants = { rest: { rotate: 0, scale: 1 }, hover: { rotate: [0, -10, 8, 0], scale: 1.08 } };

const SLA_TONE_CLASS: Readonly<Record<OrderCardSlaTone, string>> = {
  late: 'text-text-danger font-semibold',
  today: 'text-text-warning font-semibold',
  soon: 'text-text-default font-medium',
  later: 'text-text-muted',
  none: 'text-text-faint',
};

const SLA_DOT_CLASS: Readonly<Record<OrderCardSlaTone, string>> = {
  late: 'bg-fill-danger',
  today: 'bg-fill-warning',
  soon: 'bg-fill-info',
  later: 'bg-border-strong',
  none: 'bg-border-default',
};

/** Hatched rail for out of stock — red reads on white without washing the card. */
const HATCH_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / 0.55) 3px 5px)',
} as const;

/** Stops a nested control's press from reaching the card's open target. */
const stop = (event: MouseEvent | PointerEvent) => event.stopPropagation();

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
  onToggle,
}: {
  checked: boolean | 'mixed';
  label: string;
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
      data-testid="order-card-check"
      onPointerDown={stop}
      onClick={(event) => {
        event.stopPropagation();
        onToggle({ shiftKey: event.shiftKey });
      }}
      className={cn('group/check relative z-10 -m-1.5 flex size-8 items-center justify-center rounded-lg', focusRing('control'))}
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

function CardPhoto({ line, size }: { line: OrderCardLine; size: 'lg' | 'sm' }) {
  const peek = useHoverPeek(320);
  const box = size === 'lg' ? 'size-12 rounded-xl' : 'size-8 rounded-lg';
  return (
    <Popover open={peek.open && Boolean(line.thumbUrl)} onOpenChange={peek.setOpen}>
      <PopoverAnchor asChild>
        <span
          onPointerEnter={peek.enter}
          onPointerLeave={peek.leave}
          className={cn('relative z-10 block shrink-0 overflow-hidden bg-surface-sunken ring-1 ring-inset ring-black/5', box)}
        >
          {line.thumbUrl ? (
            <motion.img
              variants={size === 'lg' ? PHOTO_VARIANTS : undefined}
              transition={SOFT_SPRING}
              src={line.thumbUrl}
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
        <motion.figure
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={SPRING}
          style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
          className="w-72"
        >
          {line.thumbUrl ? <img src={line.thumbUrl} alt={line.title} className="aspect-square w-full bg-surface-sunken object-contain" /> : null}
          <figcaption className="space-y-0.5 px-3 py-2.5">
            <p className="line-clamp-2 text-sm font-medium text-text-default">{line.title}</p>
            {line.sku ? <p className="font-mono text-xs text-text-muted">{line.sku}</p> : null}
          </figcaption>
        </motion.figure>
      </PopoverContent>
    </Popover>
  );
}

// ── Line facts (line 3) ─────────────────────────────────────────────────────

function Sep() {
  return <span aria-hidden className="text-text-faint">·</span>;
}

function LineFacts({ line, className }: { line: OrderCardLine; className?: string }) {
  const low = line.stock != null && line.stock < line.qty;
  return (
    // Wraps on a narrow card (phone, the split's list) — each fact stays whole.
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-text-muted [&>*]:whitespace-nowrap', className)}>
      <span className={cn('font-semibold tabular-nums', line.qty > 1 ? orderRowQtyTone(line.qty) : 'text-text-default')}>
        ×{line.qty}
      </span>
      {line.condition ? (
        <>
          <Sep />
          <span className={cn('font-medium', conditionGradeTextClass(line.conditionCode))}>{line.condition}</span>
        </>
      ) : null}
      <Sep />
      {line.outOfStock ? (
        <span className="font-semibold text-text-danger">Out of stock</span>
      ) : (
        <span
          title={line.stock == null ? 'No stock record for this SKU' : undefined}
          className={cn('tabular-nums', low ? 'font-semibold text-text-danger' : line.stock == null ? 'text-text-faint' : undefined)}
        >
          Stock {line.stock ?? '—'}
        </span>
      )}
      <Sep />
      <span className={cn('inline-flex min-w-0 items-center gap-1', !line.bin.path && 'text-text-faint')} title={line.bin.path ?? undefined}>
        <MapPin className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{line.bin.path ?? 'No bin'}</span>
      </span>
      {line.price ? (
        <>
          <Sep />
          <span className="font-medium tabular-nums text-text-success" title={line.priceEstimate ? 'Estimate from the listing price' : undefined}>
            {line.priceEstimate ? '~' : ''}
            {line.price}
          </span>
        </>
      ) : null}
    </span>
  );
}

// ── Status icon ─────────────────────────────────────────────────────────────

/** What each status icon means — the plain tooltip on every icon but out of stock. */
const STATUS_MEANING: Readonly<Record<LifecycleState, string>> = {
  ready: 'Ready — waiting to be picked',
  urgent: 'Urgent — ship this one first',
  packed: 'Packed — needs a label and scan out',
  outOfStock: 'Out of stock — an item on this order is short',
  shipped: 'Shipped — scanned out',
  onHold: 'On hold — cannot be picked yet',
};

/**
 * Out of stock: an animated hover card naming exactly which lines are short.
 * Every other state: a still icon with a one-line explanation.
 */
function StatusGlyph({ model }: { model: OrderCardModel }) {
  const peek = useHoverPeek(140);
  const spec = LIFECYCLE[model.state];
  const tone = LIFECYCLE_CLASSES[model.state];
  const Glyph = LIFECYCLE_GLYPH[spec.icon];
  if (model.outOfStockCount === 0) {
    return (
      <HoverTooltip label={STATUS_MEANING[model.state]} placement="right" asChild>
        <span
          data-testid="order-card-status"
          role="img"
          aria-label={STATUS_MEANING[model.state]}
          className={cn('relative z-10 -m-1 flex size-7 items-center justify-center', tone.text)}
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
          aria-label={`${spec.label}${model.outOfStockCount ? `, ${model.outOfStockCount} of ${model.lines.length} lines out of stock` : ''}`}
          data-testid="order-card-status"
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
          className={cn('relative z-10 -m-1 flex size-7 items-center justify-center rounded-lg', tone.text, focusRing('control'))}
        >
          <Glyph className="size-4" />
          {model.outOfStockCount > 0 && model.lines.length > 1 ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-fill-danger text-[9px] font-bold leading-none text-white">
              {model.outOfStockCount}
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
            <span className="text-sm font-semibold text-text-default">{spec.label}</span>
            <span className="ml-auto text-xs text-text-muted">
              {model.outOfStockCount > 0
                ? `${model.outOfStockCount} of ${model.lines.length} out of stock`
                : `${model.lines.length} line${model.lines.length === 1 ? '' : 's'} · ${model.units} unit${model.units === 1 ? '' : 's'}`}
            </span>
          </header>
          <ul className="max-h-80 overflow-y-auto p-1.5">
            {model.lines.map((line, i) => (
              <motion.li
                key={line.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: 0.03 * i }}
                className={cn('flex gap-2.5 rounded-xl px-2 py-2', line.outOfStock && 'bg-surface-danger')}
              >
                <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-inset ring-black/5">
                  {line.thumbUrl ? <img src={line.thumbUrl} alt="" className="size-full object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-text-default">{line.title}</span>
                  <LineFacts line={line} className="mt-0.5 text-xs" />
                  {line.shortNote ? <span className="mt-0.5 block text-xs font-medium text-text-danger">{line.shortNote}</span> : null}
                </span>
              </motion.li>
            ))}
          </ul>
          {model.buyerNote ? (
            <p className="flex gap-2 border-t border-border-hairline px-3.5 py-2.5 text-xs text-text-muted">
              <MessageSquare className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-3">{model.buyerNote}</span>
            </p>
          ) : null}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

export interface OrderCardProps {
  model: OrderCardModel;
  /** Every line checked → true; some → 'mixed'. */
  checked: boolean | 'mixed';
  /** This order is the open record. */
  open: boolean;
  expanded: boolean;
  /** Exactly this card is checked — its actions drop down from the right edge. */
  menuOpen: boolean;
  /** Position in the first paint — staggers the arrival; null = no entrance. */
  enterIndex: number | null;
  mode: OrderRecordMode;
  packer: { id: number | null; name: string | null; colorHex: string | null };
  onRowAction: (record: ShippedOrder, event?: QueueRowClickEvent) => void;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
  onToggleExpand: (key: string) => void;
  onMenuDone: () => void;
  onOpenLabels?: (record: ShippedOrder) => void;
}

export const OrderCard = memo(function OrderCard({
  model,
  checked,
  open,
  expanded,
  menuOpen,
  enterIndex,
  mode,
  packer,
  onRowAction,
  onToggleSelect,
  onToggleGroup,
  onToggleExpand,
  onMenuDone,
  onOpenLabels,
}: OrderCardProps) {
  const [lead, ...rest] = model.lines;
  const channel = useOrderChannel()(model.orderId, model.accountSource);
  const tone = LIFECYCLE_CLASSES[model.state];
  const spec = LIFECYCLE[model.state];
  const multi = model.lines.length > 1;
  const selected = checked !== false;

  const toggleCheck = useCallback(
    (event: { shiftKey: boolean }) => {
      if (!multi) onToggleSelect(model.lead, event);
      else onToggleGroup(model.ids, checked !== true);
    },
    [multi, onToggleSelect, onToggleGroup, model.lead, model.ids, checked],
  );

  if (!lead) return null;

  const platformFace = channel.shortLabel || channel.label;
  const slaNode: ReactNode = (
    <span title={model.sla.tip ?? undefined} className={cn('flex shrink-0 items-center gap-1.5 text-[13px] tabular-nums', SLA_TONE_CLASS[model.sla.tone])}>
      <span className="relative flex size-2">
        {model.sla.tone === 'late' ? (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-fill-danger"
            animate={{ scale: [1, 2.2], opacity: [0.55, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        ) : null}
        <span className={cn('relative size-2 rounded-full', SLA_DOT_CLASS[model.sla.tone])} />
      </span>
      {model.sla.face}
    </span>
  );

  return (
    <Popover open={menuOpen} modal={false}>
      <motion.article
        data-order-row-id={model.lead.id}
        data-desk-record-key={model.lead.id}
        data-state={model.state}
        data-testid="order-card"
        aria-label={`Order ${model.orderId}, ${spec.label}, ${lead.title}`}
        initial={enterIndex != null ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={enterIndex != null ? { ...SPRING, delay: Math.min(enterIndex, 14) * 0.028 } : SPRING}
        whileHover="hover"
        variants={{ rest: {}, hover: {} }}
        className={cn(
          'group/card @container/card relative isolate flex rounded-2xl py-3 pl-4 pr-4 transition-colors duration-150 [contain-intrinsic-size:auto_92px] [content-visibility:auto]',
          selected
            ? 'bg-surface-info/60'
            : open
              ? 'bg-surface-sunken'
              : 'hover:bg-surface-sunken/70',
          open && 'ring-1 ring-inset ring-border-strong',
        )}
      >
        {/* The open target — the whole card. */}
        <button
          type="button"
          aria-label={`Open order ${model.orderId}`}
          aria-current={open || undefined}
          data-testid="order-card-open"
          onClick={(event) =>
            onRowAction(model.lead, {
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
              detail: event.detail,
              target: event.target,
            })
          }
          className={cn('absolute inset-0 z-0 cursor-pointer rounded-2xl', focusRing('control'))}
        />

        {/* Status rail */}
        <motion.span
          aria-hidden
          variants={RAIL_VARIANTS}
          initial="rest"
          transition={SOFT_SPRING}
          style={model.state === 'outOfStock' ? HATCH_STYLE : undefined}
          className={cn('pointer-events-none absolute bottom-3 left-1.5 top-3 w-[3px] origin-left rounded-full', tone.dot)}
        />

        {/* Checkbox, status icon beneath */}
        <div className="relative z-10 flex w-7 shrink-0 flex-col items-center gap-3 pt-px">
          <CardCheck checked={checked} label={`Select order ${model.orderId}`} onToggle={toggleCheck} />
          <StatusGlyph model={model} />
        </div>

        {/* Order facts */}
        <div className="pointer-events-none relative z-10 ml-3 flex min-w-0 flex-1 flex-col gap-2">
          {/* Line 1 — order number · platform …… SLA */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="pointer-events-auto min-w-0 shrink text-sm font-semibold tabular-nums text-text-default" onClick={stop} onPointerDown={stop}>
              <OrderNumberMenuChip
                value={model.orderId}
                platformLabel={channel.meta.value ? channel.meta.label : null}
                openHref={marketplaceOrderUrl(model.orderId, model.accountSource)}
                face="full"
                plain
                dense
              />
            </span>
            {platformFace ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-text-muted" title={channel.connectionName ?? channel.label}>
                <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />
                <span className="truncate">{platformFace}</span>
                {model.fba ? <span className="rounded-md bg-surface-sunken px-1 text-[11px] font-medium text-text-muted">FBA</span> : null}
              </span>
            ) : null}
            {model.urgent && model.state !== 'urgent' ? (
              <span className="rounded-full bg-surface-warning px-1.5 py-px text-[11px] font-semibold text-text-warning">Urgent</span>
            ) : null}
            {model.buyerNote ? (
              <span className="pointer-events-auto text-text-muted" title={model.buyerNote}>
                <MessageSquare className="size-3.5" aria-label="Buyer note" />
              </span>
            ) : null}
            <span className="ml-auto" />
            {slaNode}
          </div>

          {/* Lines 2–3 — photo spans both */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="pointer-events-auto">
              <CardPhoto line={lead} size="lg" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-text-default @xl/card:line-clamp-1" title={lead.title}>
                {lead.title}
              </p>
              <div className="flex min-w-0 items-center gap-3">
                <LineFacts line={lead} className="min-w-0 flex-1" />
                {multi ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    data-testid="order-card-expand"
                    onPointerDown={stop}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExpand(model.key);
                    }}
                    className={cn(
                      'pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border-soft bg-surface-card px-2 py-0.5 text-xs font-medium text-text-default shadow-elev-soft transition-colors hover:border-border-strong',
                      focusRing('control'),
                    )}
                  >
                    +{rest.length} item{rest.length === 1 ? '' : 's'}
                    <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={SPRING} className="inline-flex">
                      <ChevronDown className="size-3.5" aria-hidden />
                    </motion.span>
                  </button>
                ) : null}
                {packer.id != null ? (
                  <span title={packer.name ? `Packer: ${packer.name}` : undefined} className="shrink-0">
                    <StaffAvatar staffId={packer.id} name={packer.name} colorHex={packer.colorHex} size="xs" />
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* The other lines, unfolded in place */}
          <AnimatePresence initial={false}>
            {multi && expanded ? (
              <motion.ul
                key="lines"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ height: SPRING, opacity: { duration: 0.18 } }}
                className="overflow-hidden"
              >
                {rest.map((line, i) => (
                  <motion.li
                    key={line.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.04 * (i + 1) }}
                    className="flex min-w-0 items-center gap-3 border-t border-border-hairline pt-2 first:mt-0.5 [&+&]:mt-2"
                  >
                    <span className="pointer-events-auto ml-2">
                      <CardPhoto line={line} size="sm" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm text-text-default" title={line.title}>{line.title}</p>
                      <LineFacts line={line} className="text-xs" />
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>

        {/* One checked card: its actions drop down from the right edge. */}
        <PopoverAnchor asChild>
          <span aria-hidden className="pointer-events-none absolute bottom-0 right-3 size-px" />
        </PopoverAnchor>
      </motion.article>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={onMenuDone}
        className="w-64 overflow-hidden rounded-2xl p-0"
        data-testid="order-card-menu"
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING}
          style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
        >
          <OrderCardActionMenu record={model.lead} mode={mode} onOpenLabels={onOpenLabels} onDone={onMenuDone} />
        </motion.div>
      </PopoverContent>
    </Popover>
  );
});
