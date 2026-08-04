'use client';

/**
 * Phase 4 — allowlisted Sheets-class row context menu for Unbox receiving.
 * Lane / open / copy only — not freeform cell paint. Location & condition edits
 * stay on the record plane until Horizon B unifies in-cell editors.
 */

import type { ReactNode } from 'react';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/design-system/primitives/ContextMenu';
import { toast } from '@/lib/toast';

const QUEUE_LANES = [
  { id: 'PO_STOCKOUT', label: 'Stockout' },
  { id: 'PO_STANDARD', label: 'Standard' },
  { id: 'RETURN', label: 'Return' },
  { id: 'HOLD', label: 'Hold' },
] as const;

export function ReceivingRowTriageContextMenu({
  row,
  children,
}: {
  row: ReceivingLineRow;
  children: ReactNode;
}) {
  const patch = async (body: Record<string, unknown>) => {
    if (!row.receiving_id) {
      toast.error('No carton to update');
      return;
    }
    const res = await fetch(`/api/receiving/${row.receiving_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error('Could not save triage field');
      return;
    }
    toast.success('Updated');
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent data-testid="receiving-row-triage-menu">
        <ContextMenuItem onSelect={() => dispatchSelectLine(row)}>
          Open record
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Set lane</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {QUEUE_LANES.map((l) => (
              <ContextMenuItem
                key={l.id}
                onSelect={() => void patch({ priority_lane: l.id })}
              >
                {l.label}
              </ContextMenuItem>
            ))}
            <ContextMenuItem
              onSelect={() => void patch({ priority_lane: null })}
            >
              Clear lane
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem
          onSelect={() => {
            const po = (row.zoho_purchaseorder_number || '').trim();
            const trk = (row.tracking_number || '').trim();
            const text = [po && `PO ${po}`, trk && `TRK ${trk}`]
              .filter(Boolean)
              .join(' · ');
            if (text) void navigator.clipboard?.writeText(text);
          }}
        >
          Copy PO / tracking
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
