'use client';

/**
 * One DELIVERY CARD on the Inbound triage list — the In place / Split face of
 * On the way (floor keeps the industrial `RecordLedger`). One card per
 * purchase, the receiving twin of the To-ship order card:
 *
 *   ┃ ☐  PO 21-15192-45235 · eBay aerodeals            ● Delivered · not scanned
 *   ┃ ⚠  [photo] Bose Lifestyle AV-18 Series Media Center Remote
 *   ┃           ×1 · TRK …4378113 · Exp Sep 30              Receive   +1 item ▾
 *
 * The rail and the status glyph wear the purchase's worst delivery state.
 * The card body opens the record; a line inside an unfolded card opens that
 * line. The check selects every line of the purchase.
 */

import { memo, type MouseEvent, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Package } from '@/components/Icons';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { cn } from '@/utils/_cn';
import { incomingDeliveryNextAction, purchaseExceptionReason, purchaseIdentity } from '../IncomingDeliveryRecord';

const SPRING = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 } as const;

/** Stops a nested control's press from reaching the card's open target. */
const stop = (event: MouseEvent | PointerEvent) => event.stopPropagation();

export interface IncomingDeliveryCardModel {
  /** The ledger's entry key for the purchase (`group` key, or `line:<id>` for a one-line purchase). */
  key: string;
  rows: readonly ReceivingLineRow[];
  /** The purchase's worst delivery state. */
  state: RecordStateFace;
}

function lineQty(row: ReceivingLineRow): number {
  return Number(row.quantity_expected ?? row.quantity_received ?? 0);
}

/** Tracking cut on its last delimiter-free run — never a blind slice that orphans a dash. */
function trackingTail(value: string | null): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  return raw.length > 10 ? `…${raw.slice(-8)}` : raw;
}

function sourceLabel(row: ReceivingLineRow): string {
  return (
    row.platform_account_label
    || row.vendor_name
    || (row.inbound_source_type || row.source_platform || '').trim()
    || ''
  );
}

function CardPhoto({ row, size }: { row: ReceivingLineRow; size: 'lg' | 'sm' }) {
  const box = size === 'lg' ? 'size-12 rounded-xl' : 'size-8 rounded-lg';
  return (
    <span className={cn('block shrink-0 overflow-hidden bg-surface-sunken ring-1 ring-inset ring-black/5', box)}>
      {row.image_url ? (
        <img src={row.image_url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-text-faint" aria-hidden>
          <Package className={size === 'lg' ? 'size-5' : 'size-4'} />
        </span>
      )}
    </span>
  );
}

function LineFacts({ row, className }: { row: ReceivingLineRow; className?: string }) {
  const tracking = trackingTail(row.tracking_number);
  const expected = row.expected_delivery_date || row.po_date || row.created_at;
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-text-muted [&>*]:whitespace-nowrap', className)}>
      <span className="font-medium tabular-nums text-text-default">×{lineQty(row)}</span>
      <span aria-hidden>·</span>
      {tracking ? (
        <span className="font-mono text-xs" title={row.tracking_number ?? undefined}>TRK {tracking}</span>
      ) : (
        <span className="font-medium text-text-warning">No tracking</span>
      )}
      {row.sku ? (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono text-xs">{row.sku}</span>
        </>
      ) : null}
      {expected ? (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums" title={fmtDate(expected)}>Exp {fmtDate(expected, 'MMM d')}</span>
        </>
      ) : null}
    </span>
  );
}

interface IncomingDeliveryCardProps {
  model: IncomingDeliveryCardModel;
  /** The open record is this purchase or one of its lines. */
  open: boolean;
  /** The open record's line id, when a single line is open. */
  openLineId: number | null;
  expanded: boolean;
  selectedIds: ReadonlySet<number>;
  onOpen: (key: string) => void;
  onToggleExpand: (key: string) => void;
  onToggleRow: (row: ReceivingLineRow) => void;
}

export const IncomingDeliveryCard = memo(function IncomingDeliveryCard({
  model,
  open,
  openLineId,
  expanded,
  selectedIds,
  onOpen,
  onToggleExpand,
  onToggleRow,
}: IncomingDeliveryCardProps) {
  const [lead, ...rest] = model.rows;
  if (!lead) return null;
  const multi = rest.length > 0;
  const tone = STATE_TONE_CLASSES[model.state.tone];
  const checkedCount = model.rows.filter((row) => selectedIds.has(row.id)).length;
  const checked = checkedCount === 0 ? false : checkedCount === model.rows.length ? true : 'mixed';
  const selected = checkedCount > 0;
  const identity = purchaseIdentity(lead);
  const title = multi ? `${model.rows.length} items · ${displayReceivingProductTitle(lead)}` : displayReceivingProductTitle(lead);
  const source = sourceLabel(lead);
  const next = incomingDeliveryNextAction(model.state.id);
  // Exceptions view: every card says why it needs a person, and what to do.
  const exception = purchaseExceptionReason(model.rows);

  return (
    <motion.article
      data-testid="incoming-delivery-card"
      data-desk-record-key={model.key}
      data-state={model.state.id}
      aria-label={`PO ${identity}, ${model.state.label}, ${title}`}
      layout="position"
      transition={SPRING}
      className={cn(
        'group/card @container/card relative isolate flex rounded-2xl py-3 pl-4 pr-4 transition-colors duration-150 [contain-intrinsic-size:auto_92px] [content-visibility:auto]',
        selected ? 'bg-surface-info/60' : open ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/70',
        open && 'ring-1 ring-inset ring-border-strong',
      )}
    >
      {/* The open target — the whole card; Enter opens. */}
      <button
        type="button"
        aria-label={`Open PO ${identity}`}
        aria-current={open || undefined}
        data-testid="incoming-delivery-card-open"
        onClick={() => onOpen(model.key)}
        className={cn('absolute inset-0 z-0 cursor-pointer rounded-2xl active:scale-[0.998]', focusRing('control'))}
      />

      {/* Status rail — thickens on hover. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-3 left-1.5 top-3 w-[3px] origin-left rounded-full transition-transform duration-150 group-hover/card:scale-x-[1.75]',
          tone.dot,
        )}
      />

      {/* Check */}
      <div className="pointer-events-none relative z-10 flex w-7 shrink-0 flex-col items-center pt-px">
        <span className="pointer-events-auto" onPointerDown={stop}>
          <GridRowCheckbox
            checked={checked}
            label={`Select PO ${identity}`}
            onToggle={() => {
              const turnOn = checked !== true;
              for (const row of model.rows) {
                if (selectedIds.has(row.id) !== turnOn) onToggleRow(row);
              }
            }}
            chrome="always"
          />
        </span>
      </div>

      <div className="pointer-events-none relative z-10 ml-3 flex min-w-0 flex-1 flex-col gap-2">
        {/* Line 1 — PO · source …… state */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 shrink truncate font-mono text-sm font-semibold tabular-nums text-text-default" title={identity}>
            PO {identity}
          </span>
          {source ? <span className="min-w-0 truncate text-[13px] text-text-muted">{source}</span> : null}
          <span className="ml-auto" />
          <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium', tone.text)} title={model.state.label}>
            <span className={cn('size-2 rounded-full', tone.dot)} />
            {model.state.label}
          </span>
        </div>

        {exception ? (
          <p data-testid="incoming-delivery-card-exception" className="-mt-1 text-xs leading-snug text-text-danger">
            <span className="font-semibold">{exception.why}</span>
            <span className="text-text-muted"> → {exception.next}</span>
          </p>
        ) : null}

        {/* Lines 2–3 — photo spans both */}
        <div className="flex min-w-0 items-center gap-3">
          <CardPhoto row={lead} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-text-default @xl/card:line-clamp-1" title={title}>
              {title}
            </p>
            <div className="flex min-w-0 items-center gap-3">
              <LineFacts row={lead} className="min-w-0 flex-1" />
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                  model.state.tone === 'danger' ? tone.pill : 'bg-surface-sunken text-text-default',
                )}
              >
                {next}
              </span>
              {multi ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  data-testid="incoming-delivery-card-expand"
                  onPointerDown={stop}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleExpand(model.key);
                  }}
                  className={cn(
                    'pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border-soft bg-surface-card px-2 py-0.5 text-xs font-medium text-text-default shadow-elev-soft transition-[border-color,transform] hover:border-border-strong active:translate-y-px',
                    focusRing('control'),
                  )}
                >
                  +{rest.length} item{rest.length === 1 ? '' : 's'}
                  <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={SPRING} className="inline-flex">
                    <ChevronDown className="size-3.5" aria-hidden />
                  </motion.span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Every line, unfolded in place — each opens its own record. */}
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
              {model.rows.map((row) => (
                <li key={row.id} className="border-t border-border-hairline pt-1.5 first:mt-0.5 [&+&]:mt-1.5">
                  <button
                    type="button"
                    aria-current={openLineId === row.id || undefined}
                    onPointerDown={stop}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(`line:${row.id}`);
                    }}
                    className={cn(
                      'pointer-events-auto flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-surface-card active:translate-y-px',
                      openLineId === row.id && 'bg-surface-card ring-1 ring-border-soft',
                      focusRing('control'),
                    )}
                  >
                    <CardPhoto row={row} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-text-default">{displayReceivingProductTitle(row)}</span>
                      <LineFacts row={row} className="text-xs" />
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.article>
  );
});
