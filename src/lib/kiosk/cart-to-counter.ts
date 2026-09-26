/** Map polymorphic kiosk cart lines → `CounterTransactionInput` parts. */

import type { KioskCartLine, LinePriceAdjustment } from '@/lib/kiosk/cart-line';
import {
  isBuybackPayload,
  isRepairPayload,
  isRetailPayload,
} from '@/lib/kiosk/cart-line';
import type {
  CounterLinkedRepairInput,
  CounterPriceAdjustment,
  CounterRetailLine,
  CounterServiceLine,
} from '@/lib/counter/counter-transaction-types';

/**
 * The adjustment as the counter carries it: the display-only staff name stays
 * on the tablet, the signed approval travels (the kiosk route verifies it and
 * rebuilds the rest from its claims).
 */
function counterAdjustment(a: LinePriceAdjustment | null | undefined): CounterPriceAdjustment | null {
  if (!a) return null;
  return {
    kind: a.kind,
    originalUnitAmountCents: a.originalUnitAmountCents,
    reason: a.reason,
    staffId: a.staffId,
    approval: a.approval,
  };
}

interface KioskCartMappedParts {
  retailLines: CounterRetailLine[];
  /** Every REPAIR line, in cart order. */
  services: CounterServiceLine[];
  /**
   * REPAIR lines that point at an existing ticket. Only the id travels: the
   * server reads the quote and device from the ticket itself, and a linked
   * line in `services` would be taken in (and signed for) a second time.
   */
  linkedRepairs: CounterLinkedRepairInput[];
}

export function mapKioskCartToCounterParts(
  lines: readonly KioskCartLine[],
): KioskCartMappedParts {
  const retailLines: CounterRetailLine[] = [];
  const services: CounterServiceLine[] = [];
  const linkedRepairs: CounterLinkedRepairInput[] = [];

  for (const line of lines) {
    if (line.type === 'RETAIL' && isRetailPayload(line.payload)) {
      retailLines.push({
        variationId: line.payload.variationId,
        sku: line.payload.sku,
        productTitle: line.title,
        quantity: Math.max(1, Math.trunc(line.quantity) || 1),
        unitAmountCents: Math.max(0, Math.trunc(line.unitAmountCents)),
        priceAdjustment: counterAdjustment(line.payload.priceAdjustment),
        note: line.payload.note?.trim() || null,
      });
      continue;
    }

    if (line.type === 'BUYBACK' && isBuybackPayload(line.payload)) {
      const credit = Math.abs(Math.trunc(line.unitAmountCents));
      retailLines.push({
        variationId: null,
        sku: line.payload.imei ? `BUYBACK-${line.payload.imei}` : 'BUYBACK',
        productTitle: line.title,
        quantity: 1,
        // Negative credit — computeCounterTotals must honor the sign.
        unitAmountCents: -credit,
      });
      continue;
    }

    if (line.type === 'REPAIR' && isRepairPayload(line.payload)) {
      const p = line.payload;
      if (p.linkedRepairId != null && p.linkedRepairId > 0) {
        linkedRepairs.push({ repairId: p.linkedRepairId });
        continue;
      }
      const mapped: CounterServiceLine = {
        productType: p.productType ?? null,
        productModel: p.productModel,
        sourceSku: p.sourceSku ?? null,
        repairReasons: p.repairReasons ?? [],
        repairNotes: [p.repairNotes, p.passcode ? `Passcode: ${p.passcode}` : null, p.imei ? `IMEI: ${p.imei}` : null]
          .filter(Boolean)
          .join('\n') || null,
        serialNumber: p.serialNumber,
        price: p.price,
        // Was discarded here until 2026-08-22, which meant every kiosk-cart repair's money could only reach the header/staged-order total by a…
        unitAmountCents: Math.max(0, Math.trunc(line.unitAmountCents)),
        notes: p.notes ?? null,
        signatureDataUrl: p.signatureDataUrl ?? null,
        signatureStrokes: p.signatureStrokes,
        priceAdjustment: counterAdjustment(p.priceAdjustment),
      };
      services.push(mapped);
    }
  }

  return { retailLines, services, linkedRepairs };
}
