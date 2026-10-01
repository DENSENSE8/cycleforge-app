'use client';

import { MessageSquare } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { cn } from '@/utils/_cn';
import { requestOrderNoteFocus } from './order-note-focus';

/** Header top-right chip: this order carries a buyer or internal note — click jumps to the composer. */
export function OrderNoteChip({ record }: { record: ShippedOrder }) {
  const buyer = record.buyer_note?.trim();
  const internal = record.notes?.trim();
  if (!buyer && !internal) return null;
  const label = buyer ? 'Buyer note — jump to notes' : 'Note — jump to notes';
  return (
    <HoverTooltip label={label} asChild placement="above">
      <button
        type="button"
        aria-label={label}
        data-testid="order-note-chip"
        onClick={() => requestOrderNoteFocus(Number(record.id))}
        className={cn(
          'ds-raw-button inline-flex items-center gap-1 rounded-mode-control border border-mode-edge px-1.5 py-0.5 hover:bg-mode-hover',
          RECORD_LABEL_CLASS,
          buyer ? 'text-mode-warn' : 'text-mode-muted',
          focusRing('control'),
        )}
      >
        <MessageSquare className="h-3 w-3 shrink-0" />
        Note
      </button>
    </HoverTooltip>
  );
}
