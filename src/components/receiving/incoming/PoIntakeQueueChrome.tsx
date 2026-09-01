'use client';

/**
 * Order-queue chips + pending screenshot strip for Incoming PO intake.
 * Keeps the band leaf readable; selection chrome stays local (not ops CTAs).
 */

import { Plus, Trash2, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  canConfirmPoIntake,
  poIntakeOrderChipLabel,
} from '@/lib/inbound/po-intake-draft';
import type {
  PoIntakePendingAttachment,
  PoIntakeQueuedOrder,
} from '@/lib/inbound/po-intake-store';
import { cn } from '@/utils/_cn';

export function PoIntakeOrderQueueBar({
  queue,
  activeOrderId,
  busy,
  onSelect,
  onAddOrder,
  onRemoveActive,
}: {
  queue: PoIntakeQueuedOrder[];
  activeOrderId: string;
  busy: boolean;
  onSelect: (orderId: string) => void;
  onAddOrder: () => void;
  onRemoveActive: () => void;
}) {
  const multiOrder = queue.length > 1;
  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="Purchase order drafts"
    >
      {queue.map((order, index) => {
        const isActive = order.id === activeOrderId;
        const orderReady = canConfirmPoIntake(order.draft);
        return (
          <button
            key={order.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`po-intake-order-chip-${index}`}
            disabled={busy}
            onClick={() => onSelect(order.id)}
            className={cn(
              cornerClass('surface'),
              'inline-flex max-w-[10rem] items-center gap-1 border px-2 py-1 text-role-micro transition-colors',
              isActive
                ? 'border-border-strong bg-surface-sunken text-text-default'
                : 'border-border-hairline bg-surface-card text-text-soft hover:bg-surface-sunken/60',
              orderReady && 'ring-1 ring-inset ring-emerald-500/40',
            )}
          >
            <span className="truncate">{poIntakeOrderChipLabel(order.draft, index)}</span>
          </button>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || queue.length >= 12}
        onClick={onAddOrder}
        icon={<Plus className="h-3.5 w-3.5" />}
        data-testid="po-intake-add-order"
      >
        Another order
      </Button>
      {multiOrder ? (
        <IconButton
          size="sm"
          tone="neutral"
          ariaLabel="Remove this order draft"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          disabled={busy}
          onClick={onRemoveActive}
        />
      ) : null}
    </div>
  );
}

export function PoIntakePendingStrip({
  pending,
  selectedIds,
  busy,
  onToggleSelect,
  onRemove,
  onExtractOneOrder,
  onExtractSeparate,
  onClear,
}: {
  pending: PoIntakePendingAttachment[];
  selectedIds: string[];
  busy: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onExtractOneOrder: () => void;
  onExtractSeparate: () => void;
  onClear: () => void;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="mb-2" data-testid="po-intake-pending-strip">
      <p className="mb-1 text-role-micro text-text-soft">
        Staged screenshots — select pages of one order, or extract each as its own PO
      </p>
      <ul className="flex flex-wrap gap-2">
        {pending.map((att) => {
          const selected = selectedIds.includes(att.id);
          return (
            <li key={att.id} className="relative">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Screenshot ${att.name}`}
                disabled={busy}
                onClick={() => onToggleSelect(att.id)}
                className={cn(
                  cornerClass('surface'),
                  'h-14 w-14 overflow-hidden border border-border-hairline',
                  selected && 'ring-2 ring-blue-500 ring-offset-1 ring-offset-surface-card',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={att.dataUrl} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                className={cn(
                  cornerClass('surface'),
                  'absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center border border-border-hairline bg-surface-card text-text-soft',
                )}
                aria-label={`Remove ${att.name}`}
                disabled={busy}
                onClick={() => onRemove(att.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={onExtractOneOrder}
          data-testid="po-intake-extract-one-order"
        >
          {selectedIds.length > 1
            ? `Extract ${selectedIds.length} as one order`
            : 'Extract as one order'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || pending.length < 2}
          onClick={onExtractSeparate}
          data-testid="po-intake-extract-separate"
        >
          Each as its own order
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>
          Clear staged
        </Button>
      </div>
    </div>
  );
}
