import confetti from 'canvas-confetti';
import { classifyInput, findSerialInCatalog, looksLikeFnsku } from '@/lib/scan-resolver';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { appendSerialToSkuGroups, initSkuSerialGroups } from '@/lib/tech/sku-serial-groups';
import type { ScanHandlerContext } from './types';

export async function handleSerialScan(input: string, ctx: ScanHandlerContext): Promise<void> {
  const contextOrder = ctx.reopenScanContextOrder();

  /** The serial as it should be STORED. */
  const scanned = unwrapScannedSerial(input);

  if (!contextOrder) {
    // No active order — add the serial to the last scanned tracking via SAL resolution.
    // The endpoint finds the most recent TRACKING_SCANNED SAL for this tech, inserts
    // the serial into tech_serial_numbers, and returns the order info to restore the card.
    ctx.setIsLoading(true);
    try {
      const res = await fetch('/api/tech/add-serial-to-last', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: scanned.toUpperCase(),
          techId: ctx.userId,
          scanSessionId: ctx.scanSessionIdRef.current || undefined,
          idempotencyKey: ctx.newIdempotencyKey(),
        }),
      });
      const data = await res.json();

      if (!data.success) {
        ctx.setErrorMessage(data.error || 'Failed to add serial');
        return;
      }

      const restoredSerials = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
      // The serial is persisted server-side regardless; only card restoration
      // depends on the resolved `order`. Degrade-not-block if it's absent.
      const order = data.order;
      const attachedToOrder = data.attachedToOrder !== false;
      if (order) {
        ctx.syncActiveOrderState({
          id: order.id ?? null,
          orderId: order.orderId,
          productTitle: order.productTitle,
          itemNumber: order.itemNumber ?? null,
          sku: order.sku,
          condition: order.condition,
          notes: order.notes,
          tracking: order.tracking,
          serialNumbers: restoredSerials,
          skuSerialGroups: initSkuSerialGroups(order.sku, restoredSerials),
          testDateTime: null,
          testedBy: null,
          quantity: order.quantity || 1,
          shipByDate: order.shipByDate ?? null,
          createdAt: order.createdAt ?? null,
          orderFound: order.orderFound !== false && attachedToOrder,
          sourceType: attachedToOrder ? undefined : 'exception',
          inlineMicrocopy:
            typeof data.warning === 'string' ? data.warning : undefined,
          scanSessionId:
            typeof data.scanSessionId === 'string'
              ? data.scanSessionId
              : ctx.scanSessionIdRef.current,
        });
      }

      ctx.setSuccessMessage(
        attachedToOrder
          ? `Serial ${scanned.toUpperCase()} added ✓ (${restoredSerials.length} total)`
          : `Serial ${scanned.toUpperCase()} held on exception (${restoredSerials.length} total)`,
      );
      // Fire-and-forget: if the raw scan is a printed unit label, request phone
      // photos for that unit. Gated + resolved by the host; no-op otherwise.
      ctx.onUnitLabelScanned?.(input);
      if (data.isComplete && attachedToOrder) {
        confetti({ particleCount: 100, spread: 70 });
      }
      ctx.queryClient.invalidateQueries({ queryKey: ['tech-logs'] });
      ctx.triggerGlobalRefresh();
    } catch (err) {
      console.error('Add serial to last error:', err);
      ctx.setErrorMessage('Network error occurred');
    } finally {
      ctx.setIsLoading(false);
      ctx.setInputValue('');
      ctx.inputRef.current?.focus();
    }
    return;
  }

  // ── Partial serial resolution ──────────────────────────────────────────────── classifyInput returns serial_partial for ≤10-char inputs.
  const { type: scanKind } = classifyInput(scanned);
  let finalSerial = scanned.toUpperCase();
  if (scanKind === 'serial_partial' && contextOrder.serialNumbers.length > 0) {
    const { matchType, matches } = findSerialInCatalog(scanned, contextOrder.serialNumbers);
    if (matchType !== 'none' && matches.length === 1) {
      finalSerial = matches[0].toUpperCase();
      ctx.setSuccessMessage(`Partial matched → ${finalSerial}`);
    } else if (matches.length > 1) {
      ctx.setErrorMessage(`Partial "${scanned}" is ambiguous — ${matches.length} serials match. Scan the full serial.`);
      ctx.setInputValue('');
      ctx.inputRef.current?.focus();
      return;
    }
  }

  const trk = String(contextOrder.tracking || '').trim();
  const isFbaDuplicateAllowedTracking = looksLikeFnsku(trk) || /^FBA/i.test(trk);

  ctx.setIsLoading(true);
  try {
    const sessionForSerial = (contextOrder.scanSessionId ?? ctx.scanSessionIdRef.current) || undefined;
    const res = await fetch('/api/tech/add-serial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracking: contextOrder.tracking,
        serial: finalSerial,
        techId: ctx.userId,
        allowFbaDuplicates: isFbaDuplicateAllowedTracking,
        scanSessionId: sessionForSerial,
        idempotencyKey: ctx.newIdempotencyKey(),
      }),
    });

    const data = await res.json();

    if (!data.success) {
      ctx.setErrorMessage(data.error || 'Failed to add serial');
      return;
    }

    const nextSerials = Array.isArray(data.serialNumbers) ? data.serialNumbers : contextOrder.serialNumbers;
    const attachedToOrder = data.attachedToOrder !== false;
    const nextOrder = {
      ...contextOrder,
      serialNumbers: nextSerials,
      skuSerialGroups: appendSerialToSkuGroups(
        contextOrder.skuSerialGroups,
        contextOrder.sku,
        finalSerial,
      ),
      orderFound: attachedToOrder ? contextOrder.orderFound : false,
      sourceType: attachedToOrder ? contextOrder.sourceType : 'exception' as const,
      inlineMicrocopy:
        typeof data.warning === 'string' ? data.warning : contextOrder.inlineMicrocopy,
      scanSessionId:
        typeof data.scanSessionId === 'string'
          ? data.scanSessionId
          : contextOrder.scanSessionId ?? ctx.scanSessionIdRef.current,
    };

    ctx.syncActiveOrderState(nextOrder);

    ctx.setSuccessMessage(
      attachedToOrder
        ? `Serial ${finalSerial} added ✓ (${data.serialNumbers.length} total)`
        : `Serial ${finalSerial} held on exception (${data.serialNumbers.length} total)`,
    );
    // Fire-and-forget: if the raw scan is a printed unit label, request phone
    // photos for that unit. Gated + resolved by the host; no-op otherwise.
    ctx.onUnitLabelScanned?.(input);

    if (data.isComplete && attachedToOrder) {
      confetti({ particleCount: 100, spread: 70 });
    }

    ctx.queryClient.invalidateQueries({ queryKey: ['tech-logs'] });
    ctx.triggerGlobalRefresh();
  } catch (e) {
    console.error('Add serial error:', e);
    ctx.setErrorMessage('Network error occurred');
  } finally {
    ctx.setIsLoading(false);
    ctx.setInputValue('');
    ctx.inputRef.current?.focus();
  }
}
