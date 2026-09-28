import { scanDeskSku } from '@/lib/picking/desk-scan-client';
import { toast } from '@/lib/toast';
import type { ScanHandlerContext } from './types';

/** Handles colon-format SKU scans (e.g. `1809:A03`) against the active card. */
export async function handleSkuScan(input: string, ctx: ScanHandlerContext): Promise<void> {
  const contextOrder = ctx.reopenScanContextOrder();
  if (contextOrder) ctx.setIsLoading(true);
  try {
    const result = await scanDeskSku({
      input,
      contextOrder,
      scanSessionId: ctx.scanSessionIdRef.current,
      idempotencyKey: ctx.newIdempotencyKey(),
    });
    if (!result.ok) {
      ctx.setErrorMessage(result.error);
      return;
    }
    ctx.syncActiveOrderState(result.order);
    ctx.setSuccessMessage(result.message);
    const { notes } = result;
    if (notes) setTimeout(() => toast.info(`Notes for SKU: ${notes}`), 150);

    ctx.queryClient.invalidateQueries({ queryKey: ['desk-pick-logs'] });
    ctx.triggerGlobalRefresh();
  } finally {
    ctx.setIsLoading(false);
    ctx.setInputValue('');
    ctx.inputRef.current?.focus();
  }
}
