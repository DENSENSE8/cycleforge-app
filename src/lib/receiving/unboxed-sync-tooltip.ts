/** Inventory-provider sync tip — shared by History grid chips, sidebar rails, mobile rows, and station identity lifecycle chips. */

import type { ReceivingLineStatus } from '@/lib/receiving/workflow-stages';

function providerLabelOrFallback(inventoryProviderLabel: string | null | undefined): string {
  return String(inventoryProviderLabel ?? '').trim() || 'Inventory';
}

export function receivingProviderPendingTooltip(inventoryProviderLabel: string): string {
  return `Awaiting confirmation in ${providerLabelOrFallback(inventoryProviderLabel)}`;
}

/** Tip for fine-grained `workflow_status === 'UNBOXED'`; else null. */
export function receivingUnboxedSyncTooltip({
  workflowStatus,
  inventoryProviderLabel,
}: {
  workflowStatus: string | null | undefined;
  inventoryProviderLabel: string;
}): string | null {
  const s = String(workflowStatus ?? '').trim().toUpperCase();
  if (s !== 'UNBOXED') return null;
  return receivingProviderPendingTooltip(inventoryProviderLabel);
}

/** Tip for coarse rail/lifecycle status `UNBOXED`; else null. */
export function receivingCoarseUnboxedSyncTooltip({
  coarse,
  inventoryProviderLabel,
}: {
  coarse: ReceivingLineStatus | string | null | undefined;
  inventoryProviderLabel: string;
}): string | null {
  const s = String(coarse ?? '').trim().toUpperCase();
  if (s !== 'UNBOXED') return null;
  return receivingProviderPendingTooltip(inventoryProviderLabel);
}
