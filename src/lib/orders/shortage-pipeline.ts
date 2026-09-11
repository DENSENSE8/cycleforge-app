/**
 * Pure projector: operator pipeline words for an item-level shortage.
 * Does not invent PO/receiving state — maps replenishment + inbound + allocate facts.
 *
 * Callers: ordersItemStatus / ordersGroupItemStatus. No API. No schema writes.
 */

export type ShortagePipelineStage = 'open' | 'ordered' | 'inbound' | 'received' | 'allocated';

export type ShortagePipelineView = {
  stage: ShortagePipelineStage;
  label: string;
  poNumber: string | null;
  qtyReserved: number;
  qtyReceived: number;
  qtyAllocated: number;
};

export type ShortagePipelineInput = {
  isOutOfStock?: boolean | null;
  replenishmentStatus?: string | null;
  poNumber?: string | null;
  linkStatus?: string | null;
  inboundWorkflow?: string | null;
  qtyShort?: number | null;
  qtyReserved?: number | null;
  qtyReceived?: number | null;
  qtyAllocated?: number | null;
};

const INBOUND_PRE_UNBOX = new Set(['EXPECTED', 'ARRIVED', 'MATCHED']);
const UNBOXED_PLUS = new Set([
  'UNBOXED',
  'AWAITING_TEST',
  'IN_TEST',
  'PASSED',
  'FAILED',
  'RTV',
  'SCRAP',
  'DONE',
]);

export function shortagePipelineFrom(input: ShortagePipelineInput): ShortagePipelineView | null {
  if (!input.isOutOfStock) return null;

  const qtyShort = positiveQty(input.qtyShort, 1);
  const qtyReserved = positiveQty(input.qtyReserved, 0);
  const qtyReceived = positiveQty(input.qtyReceived, 0);
  const qtyAllocated = positiveQty(input.qtyAllocated, 0);
  const poNumber = String(input.poNumber || '').trim() || null;
  const replenish = String(input.replenishmentStatus || '').trim().toLowerCase();
  const link = String(input.linkStatus || '').trim().toLowerCase();
  const workflow = String(input.inboundWorkflow || '').trim().toUpperCase();

  if (qtyAllocated >= qtyShort || link === 'allocated') {
    return {
      stage: 'allocated',
      label: poNumber ? `Allocated · PO ${poNumber}` : `Allocated ${qtyAllocated}/${qtyShort}`,
      poNumber,
      qtyReserved,
      qtyReceived,
      qtyAllocated,
    };
  }

  if (UNBOXED_PLUS.has(workflow) || link === 'unboxed' || link === 'received' || replenish === 'fulfilled') {
    return {
      stage: 'received',
      label: poNumber ? `Unboxed · PO ${poNumber}` : 'Unboxed',
      poNumber,
      qtyReserved,
      qtyReceived,
      qtyAllocated,
    };
  }

  if (INBOUND_PRE_UNBOX.has(workflow) || link === 'in_transit' || replenish === 'waiting_for_receipt') {
    return {
      stage: 'inbound',
      label: poNumber ? `Inbound · PO ${poNumber}` : 'Inbound',
      poNumber,
      qtyReserved,
      qtyReceived,
      qtyAllocated,
    };
  }

  if (replenish === 'po_created' || replenish === 'planned_for_po' || link === 'reserved') {
    return {
      stage: 'ordered',
      label: poNumber ? `Ordered · PO ${poNumber}` : 'Ordered',
      poNumber,
      qtyReserved,
      qtyReceived,
      qtyAllocated,
    };
  }

  return {
    stage: 'open',
    label: 'Out of stock',
    poNumber,
    qtyReserved,
    qtyReceived,
    qtyAllocated,
  };
}

function positiveQty(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}
