import confetti from 'canvas-confetti';
import { addDeskSerial } from '@/lib/picking/desk-scan-client';
import { toast } from '@/lib/toast';
import type { ScanHandlerContext } from './types';

/**
 * Serial scan on the Picker desk. With a card in hand the serial joins it;
 * without one the server adds it to the staffer's latest desk anchor and
 * restores that card (`add-to-last`). Both pick the unit's allocation.
 */
export async function handleSerialScan(input: string, ctx: ScanHandlerContext): Promise<void> {
  ctx.setIsLoading(true);
  try {
    const result = await addDeskSerial({
      input,
      contextOrder: ctx.reopenScanContextOrder(),
      scanSessionId: ctx.scanSessionIdRef.current,
      idempotencyKey: ctx.newIdempotencyKey(),
    });
    if (!result.ok) {
      ctx.setErrorMessage(result.error);
      return;
    }
    if (result.order) ctx.syncActiveOrderState(result.order);
    ctx.setSuccessMessage(result.message);
    // Non-blocking: the serial is saved; its unit just wasn't picked.
    if (result.pickWarning) toast.warning(result.pickWarning);
    // Fire-and-forget: if the raw scan is a printed unit label, request phone
    // photos for that unit. Gated + resolved by the host; no-op otherwise.
    ctx.onUnitLabelScanned?.(input);
    if (result.isComplete) confetti({ particleCount: 100, spread: 70 });

    ctx.queryClient.invalidateQueries({ queryKey: ['desk-pick-logs'] });
    ctx.triggerGlobalRefresh();
  } finally {
    ctx.setIsLoading(false);
    ctx.setInputValue('');
    ctx.inputRef.current?.focus();
  }
}
