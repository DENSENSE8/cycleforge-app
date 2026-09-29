'use client';

/**
 * One card in the Labels & docs rail — what the order IS, nothing else:
 *
 *   ☐  ● 5010  eBay                                    2 labels
 *      ×2  Shimano XT rear derailleur
 *      ×1  Brake pads
 *
 * The order number top-left in the house identity face (`OrderNumberIdentity`:
 * the platform's brand dot to its left, copy / open menu on hover — the same
 * face To ship wears) with the platform NAME beside it (the dot alone is not
 * enough — owner 2026-09-29), the order's products with quantities beneath; "N
 * labels" only when one order ships more than one. No status column, no next
 * step, no carrier line, no details disclosure (owner 2026-09-27) — carrier,
 * tracking and the print log live on the open record. An unpaired label reads
 * "No order" with its tracking; a label the ledger could not resolve says why
 * in one danger line.
 */

import { memo, type MouseEvent } from 'react';
import { OrderNumberIdentity } from '@/components/ui/OrderIdentityChips';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { Checkbox } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useOrderChannel } from '@/hooks/useCatalog';
import { resolveMarketplaceChipIdentity } from '@/lib/marketplace-order-id';
import { cn } from '@/utils/_cn';
import type { DeskCardModel, DeskRow } from './desk-rows';

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

/** Lines the card shows before "+N more" — the record lists them all. */
const LINES_SHOWN = 3;

export const LabelCard = memo(function LabelCard({
  model,
  checked,
  open,
  onOpen,
  onToggleCheck,
  testIdPrefix,
}: TriageCardSlotProps<DeskRow, DeskCardModel> & { testIdPrefix: string }) {
  const channel = useOrderChannel()(model.orderRef ?? '', model.accountSource);
  const platformLabel = channel.label || model.accountSource;
  // Same resolver the dot uses, so the name and the dot never disagree.
  const platformName = model.orderRef ? (resolveMarketplaceChipIdentity(model.orderRef, platformLabel).platformLabel ?? platformLabel) : null;
  const name = model.orderRef ?? 'No order';
  const lead = model.labels[0] ?? null;
  const tracking = lead?.trackingNumber ?? null;
  const shown = model.lines.slice(0, LINES_SHOWN);
  const more = model.lines.length - shown.length;
  const openCard = (event: MouseEvent) =>
    onOpen(model.lead, { shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, detail: event.detail, target: event.target });

  return (
    <article
      {...{ [DESK_RECORD_KEY_ATTR]: model.lead.id }}
      data-testid={testIdPrefix}
      aria-label={model.orderRef ? `Order ${name}` : `Label ${tracking ?? lead?.fileBasename ?? ''}, no order`}
      className={cn(
        'relative isolate flex gap-3 rounded-2xl bg-surface-card px-4 py-3 transition-shadow duration-150',
        checked !== false
          ? 'ring-2 ring-inset ring-fill-info'
          : open
            ? 'ring-1 ring-inset ring-border-strong'
            : 'hover:ring-1 hover:ring-inset hover:ring-border-soft',
      )}
    >
      {/* The whole card opens the label's documents; only the checkbox checks. */}
      <button
        type="button"
        aria-label={`Open ${model.orderRef ? `order ${name}` : 'label'}`}
        aria-current={open || undefined}
        data-testid={`${testIdPrefix}-open`}
        onClick={openCard}
        className={cn('absolute inset-0 z-0 cursor-pointer rounded-2xl', focusRing('control'))}
      />
      <span className="relative z-10 flex h-6 items-center">
        <Checkbox
          checked={checked === 'mixed' ? 'indeterminate' : checked}
          onCheckedChange={() => onToggleCheck(model, { shiftKey: false })}
          aria-label={`Select ${model.orderRef ? `order ${name}` : 'label'}`}
          data-testid={`${testIdPrefix}-check`}
        />
      </span>
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-6 min-w-0 items-center gap-2">
          {model.orderRef ? (
            <>
              <span className="pointer-events-auto min-w-0 text-sm font-semibold tabular-nums" onClick={stop} onPointerDown={stop}>
                <OrderNumberIdentity orderId={model.orderRef} platformLabel={platformLabel} />
              </span>
              {platformName ? (
                <span className="shrink-0 truncate text-xs font-medium text-text-muted" data-testid={`${testIdPrefix}-platform`}>
                  {platformName}
                </span>
              ) : null}
            </>
          ) : (
            <span className="min-w-0 truncate text-sm font-semibold text-text-muted">No order</span>
          )}
          {model.labels.length > 1 ? (
            <span className="ml-auto shrink-0 rounded-md bg-surface-sunken px-1.5 text-[11px] font-medium tabular-nums text-text-muted">
              {model.labels.length} labels
            </span>
          ) : null}
        </div>
        {shown.map((line, index) => (
          <div key={index} className="flex min-w-0 items-baseline gap-2 text-[13px]">
            <span className={cn('w-6 shrink-0 font-semibold tabular-nums', line.quantity > 1 ? 'text-text-warning' : 'text-text-muted')}>
              ×{line.quantity}
            </span>
            <span className="min-w-0 truncate text-text-default" title={line.title}>
              {line.title}
            </span>
          </div>
        ))}
        {more > 0 ? <span className="pl-8 text-xs text-text-muted">+{more} more</span> : null}
        {!model.orderRef && tracking ? (
          <span className="truncate font-mono text-xs text-text-muted" title={tracking}>
            {tracking}
          </span>
        ) : null}
        {model.problem ? <span className="text-xs font-medium text-text-danger">{model.problem}</span> : null}
      </div>
    </article>
  );
});
