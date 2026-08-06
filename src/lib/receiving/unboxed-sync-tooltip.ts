/**
 * Unboxed → inventory-provider sync tip — shared by History grid chips, sidebar
 * rails, mobile rows, and station identity lifecycle chips.
 *
 * Fine `UNBOXED` / coarse `UNBOXED` mean local floor work is done but the
 * inventory receive is still pending. Never hardcode a vendor product name —
 * pass the connected provider label from `useCapabilityProviderLabel('inventory')`.
 */

import type { ReceivingLineStatus } from '@/lib/receiving/workflow-stages';

function providerLabelOrFallback(inventoryProviderLabel: string | null | undefined): string {
  return String(inventoryProviderLabel ?? '').trim() || 'Inventory';
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
  return `Awaiting confirmation in ${providerLabelOrFallback(inventoryProviderLabel)}`;
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
  return `Awaiting confirmation in ${providerLabelOrFallback(inventoryProviderLabel)}`;
}
