/** Pure draft + completeness helpers for Incoming PO screenshot/text intake. */

export type PoIntakeConfidence = 'high' | 'medium' | 'low';

export type PoIntakeFieldConfidence = {
  value: string;
  confidence: PoIntakeConfidence;
};

export type PoIntakeLineDraft = {
  sku: string;
  itemName: string;
  /** Explicit qty string — empty means "still need quantity". */
  quantity: string;
  lineItemId: string;
  listingUrl: string;
};

export type PoIntakeDraft = {
  platform: string;
  orderId: string;
  seller: string;
  accountName: string;
  trackingNumber: string;
  carrierCode: string;
  priority: string;
  lines: PoIntakeLineDraft[];
  /** Freeform notes from the model (not persisted). */
  notes: string;
};

export type PoIntakeMissingField =
  | 'order_id'
  | 'platform'
  | 'line_identity'
  | 'quantity'
  | 'tracking_number'
  | 'empty_lines';

export const EMPTY_PO_INTAKE_LINE = (): PoIntakeLineDraft => ({
  sku: '',
  itemName: '',
  quantity: '',
  lineItemId: '',
  listingUrl: '',
});

export const EMPTY_PO_INTAKE_DRAFT = (): PoIntakeDraft => ({
  platform: 'amazon',
  orderId: '',
  seller: '',
  accountName: '',
  trackingNumber: '',
  carrierCode: '',
  priority: 'auto',
  lines: [EMPTY_PO_INTAKE_LINE()],
  notes: '',
});

export function lineHasIdentity(line: PoIntakeLineDraft): boolean {
  return Boolean(line.sku.trim() || line.itemName.trim());
}

export function parseExplicitQuantity(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 10_000) return null;
  return n;
}

/**
 * Fields still required before commit. Tracking is strongly required so Unbox
 * can match at the door; order-id lookup is a backup, not a substitute when
 * the operator can still supply tracking from the screenshot.
 */
export function missingPoIntakeFields(
  draft: PoIntakeDraft,
  opts: { requireTracking?: boolean } = {},
): PoIntakeMissingField[] {
  const requireTracking = opts.requireTracking !== false;
  const missing: PoIntakeMissingField[] = [];
  if (!draft.platform.trim()) missing.push('platform');
  if (!draft.orderId.trim()) missing.push('order_id');

  const lines = draft.lines.filter((l) => lineHasIdentity(l) || l.quantity.trim());
  if (lines.length === 0) {
    missing.push('empty_lines');
    return missing;
  }

  if (lines.some((l) => !lineHasIdentity(l))) missing.push('line_identity');
  if (lines.some((l) => parseExplicitQuantity(l.quantity) == null)) missing.push('quantity');
  if (requireTracking && !draft.trackingNumber.trim()) missing.push('tracking_number');

  return missing;
}

export function canConfirmPoIntake(draft: PoIntakeDraft): boolean {
  return missingPoIntakeFields(draft).length === 0;
}

export function poIntakeMissingPrompt(missing: readonly PoIntakeMissingField[]): string {
  if (missing.length === 0) return '';
  const labels: Record<PoIntakeMissingField, string> = {
    order_id: 'purchase order / order number',
    platform: 'platform (Amazon, eBay, …)',
    line_identity: 'SKU or item title on each line',
    quantity: 'quantity on each line',
    tracking_number: 'tracking number (so Unbox can find the carton)',
    empty_lines: 'at least one line item',
  };
  const parts = missing.map((m) => labels[m]);
  if (parts.length === 1) return `Still need: ${parts[0]}.`;
  if (parts.length === 2) return `Still need: ${parts[0]} and ${parts[1]}.`;
  return `Still need: ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

/** Apply a single operator reply into the highest-priority missing slot. */
export function applyPoIntakeReply(
  draft: PoIntakeDraft,
  reply: string,
  missing: readonly PoIntakeMissingField[],
): PoIntakeDraft {
  const text = reply.trim();
  if (!text || missing.length === 0) return draft;
  const next = { ...draft, lines: draft.lines.map((l) => ({ ...l })) };
  const target = missing[0]!;

  switch (target) {
    case 'order_id':
      next.orderId = text;
      break;
    case 'platform':
      next.platform = text.toLowerCase().replace(/\s+/g, '');
      break;
    case 'tracking_number':
      next.trackingNumber = text;
      break;
    case 'quantity': {
      const qty = parseExplicitQuantity(text);
      if (qty != null) {
        for (const line of next.lines) {
          if (parseExplicitQuantity(line.quantity) == null && lineHasIdentity(line)) {
            line.quantity = String(qty);
            break;
          }
        }
      }
      break;
    }
    case 'line_identity': {
      for (const line of next.lines) {
        if (!lineHasIdentity(line)) {
          if (/^[A-Z0-9][-A-Z0-9._]{2,}$/i.test(text) && !text.includes(' ')) {
            line.sku = text;
          } else {
            line.itemName = text;
          }
          break;
        }
      }
      break;
    }
    case 'empty_lines':
      next.lines = [{ ...EMPTY_PO_INTAKE_LINE(), itemName: text, quantity: '1' }];
      break;
    default:
      break;
  }
  return next;
}

export type PoIntakeImportBody = {
  kind: 'purchase';
  source_type: string;
  source_platform: string | null;
  receiving_type: string;
  priority_tier: number | null;
  order_id: string;
  line_item_id?: string;
  sku?: string;
  item_name?: string;
  quantity: number;
  tracking_number?: string;
  carrier_code?: string;
  seller?: string;
  listing_url?: string;
  account_name?: string;
};

export function addPoIntakeLine(draft: PoIntakeDraft): PoIntakeDraft {
  return {
    ...draft,
    lines: [...draft.lines, EMPTY_PO_INTAKE_LINE()],
  };
}

export function removePoIntakeLine(draft: PoIntakeDraft, index: number): PoIntakeDraft {
  if (draft.lines.length <= 1) {
    return { ...draft, lines: [EMPTY_PO_INTAKE_LINE()] };
  }
  return {
    ...draft,
    lines: draft.lines.filter((_, i) => i !== index),
  };
}

export function updatePoIntakeLine(
  draft: PoIntakeDraft,
  index: number,
  patch: Partial<PoIntakeLineDraft>,
): PoIntakeDraft {
  return {
    ...draft,
    lines: draft.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
  };
}

/** Chip / tab label for a queued order draft. */
export function poIntakeOrderChipLabel(draft: PoIntakeDraft, index: number): string {
  const id = draft.orderId.trim();
  if (id) {
    return id.length > 14 ? `…${id.slice(-12)}` : id;
  }
  return `Order ${index + 1}`;
}

export function countReadyPoIntakeOrders(drafts: readonly PoIntakeDraft[]): number {
  return drafts.filter((d) => canConfirmPoIntake(d)).length;
}

/** One import-purchase body per draft line (multi-line → N posts). */
export function buildPoIntakeImportBodies(
  draft: PoIntakeDraft,
  mapPlatform: (platform: string) => { sourceType: string; sourcePlatform: string | null },
): PoIntakeImportBody[] {
  const { sourceType, sourcePlatform } = mapPlatform(draft.platform);
  const priorityTier =
    draft.priority === 'auto' || !draft.priority.trim()
      ? null
      : Number(draft.priority);
  const lines = draft.lines.filter((l) => lineHasIdentity(l));
  return lines.map((line, index) => {
    const qty = parseExplicitQuantity(line.quantity);
    if (qty == null) {
      throw new Error(`Line ${index + 1} is missing an explicit quantity`);
    }
    const body: PoIntakeImportBody = {
      kind: 'purchase',
      source_type: sourceType,
      source_platform: sourcePlatform,
      receiving_type: 'PO',
      priority_tier:
        priorityTier != null && Number.isFinite(priorityTier) ? priorityTier : null,
      order_id: draft.orderId.trim(),
      quantity: qty,
    };
    if (line.lineItemId.trim()) body.line_item_id = line.lineItemId.trim();
    if (line.sku.trim()) body.sku = line.sku.trim();
    if (line.itemName.trim()) body.item_name = line.itemName.trim();
    if (draft.trackingNumber.trim()) body.tracking_number = draft.trackingNumber.trim();
    if (draft.carrierCode.trim()) body.carrier_code = draft.carrierCode.trim();
    if (draft.seller.trim()) body.seller = draft.seller.trim();
    if (line.listingUrl.trim()) body.listing_url = line.listingUrl.trim();
    if (draft.accountName.trim()) body.account_name = draft.accountName.trim();
    return body;
  });
}
