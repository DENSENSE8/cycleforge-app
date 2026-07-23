/**
 * Pure ticket↔receiving reference helpers — client-safe.
 *
 * Split out of `tickets.ts` (which owns the DB reads/writes via `tenancy/db`)
 * so client hooks like `useEntitySupportTicket` can normalize refs without
 * dragging the server-only Neon driver into their bundle. `tickets.ts`
 * re-exports everything here, so server callers keep their import path.
 */

import { getLast4 } from '@/lib/copy-chip-format';

/** Internal registry label — `#42`. The operator PRIMARY ticket id. Client-safe. */
export function formatSupportTicketLabel(ticketId: number): string {
  return `#${ticketId}`;
}

/**
 * Operator PRIMARY ticket label — always the internal registry id (`#42`),
 * platform-agnostic. What an operator scans/reads first on the Support station;
 * the provider-native id is the SECONDARY chip. Pure; client-safe.
 */
export function primaryTicketLabel(supportTicketId: number): string {
  return formatSupportTicketLabel(supportTicketId);
}

/**
 * Provider-native SECONDARY label — `#9395` for a ticket that carries an external
 * (provider) id, or `null` for an internal ticket (no external conversation).
 * Vendor-neutral: any helpdesk provider's id renders the same way; the provider
 * NAME comes from the capability-label SoT, never hardcoded here.
 */
export function secondaryProviderLabel(args: {
  provider: string;
  externalTicketId: string | null;
}): string | null {
  const trimmed = args.externalTicketId?.replace(/^#/, '').trim();
  return trimmed ? `#${trimmed}` : null;
}

/**
 * Operator-facing display `#` for Support station chrome — provider / URL first.
 * Never prefers the internal registry id when a provider id (or `?ticket=`
 * fallback) is available. Pure; client-safe.
 */
export function resolveSupportTicketDisplayLabel(args: {
  id?: number | null;
  label?: string | null;
  provider?: string | null;
  externalTicketId?: string | null;
  providerTicketId?: number | null;
  fallbackId: number;
}): string {
  const fromExternal = secondaryProviderLabel({
    provider: args.provider ?? 'zendesk',
    externalTicketId: args.externalTicketId ?? null,
  });
  if (fromExternal) return fromExternal;

  if (args.providerTicketId != null && args.providerTicketId > 0) {
    return formatSupportTicketLabel(args.providerTicketId);
  }

  const internal =
    args.id != null && args.id > 0 ? formatSupportTicketLabel(args.id) : null;
  const label = args.label?.trim() || null;
  // Prefer a non-registry label; otherwise the durable URL / fallback id.
  if (label && label !== internal) return label;

  return formatSupportTicketLabel(args.fallbackId);
}

/**
 * Compact ticket id face for Support station chrome — strip `#`, show last 4.
 * Copy value stays the full numeric id. Pure; client-safe.
 */
export function supportTicketIdFace(label: string): { value: string; display: string } {
  const value = label.replace(/^#/, '').trim();
  const digits = value.replace(/\D/g, '') || value;
  return {
    value: value || digits,
    display: getLast4(digits || value),
  };
}

export interface TicketReceivingRef {
  receivingId: number;
  lineId?: number;
  supportTicketId: number;
}

/** Synthetic line id (`-receiving_id`) for unfound cartons with no receiving_line row. */
function isPlaceholderReceivingLineId(lineId: number | null | undefined): boolean {
  return lineId != null && lineId <= 0;
}

/** Map placeholder line ids to the real carton id for ticket resolution / linking.
 *  Unmatched stubs use `id = -receiving_id` with `receiving_id` already set.
 *  Pending scan stubs (`scan:…`) use a hashed negative id with `receiving_id`
 *  null — never invent a carton id from that hash. */
export function normalizeReceivingTicketEntityRefs(args: {
  lineId?: number | null;
  receivingId?: number | null;
}): { lineId: number | null; receivingId: number | null } {
  let lineId = args.lineId ?? null;
  const receivingId = args.receivingId ?? null;
  if (isPlaceholderReceivingLineId(lineId)) {
    lineId = null;
  }
  return { lineId, receivingId };
}

export type TicketLinkEntityType = 'SHIPMENT' | 'RECEIVING' | 'RECEIVING_LINE';

export interface TicketLinkAnchor {
  entityType: TicketLinkEntityType;
  entityId: number;
}

/**
 * Pick the single primary ticket_links entity for a Zendesk ticket.
 * One ticket → one entity (UNIQUE on org + zendesk_ticket_id).
 *
 * Priority: line > carton > shipment (STN). Prefer the richest receiving
 * context when a carton is open; fall back to SHIPMENT for pre-intake
 * tracking links (support / packing surfaces).
 */
export function pickTicketLinkAnchor(args: {
  lineId?: number | null;
  receivingId?: number | null;
  shipmentId?: number | null;
}): TicketLinkAnchor | null {
  const { lineId, receivingId } = normalizeReceivingTicketEntityRefs({
    lineId: args.lineId ?? null,
    receivingId: args.receivingId ?? null,
  });
  if (lineId != null) {
    return { entityType: 'RECEIVING_LINE', entityId: lineId };
  }
  if (receivingId != null) {
    return { entityType: 'RECEIVING', entityId: receivingId };
  }
  const shipmentId = args.shipmentId ?? null;
  if (shipmentId != null && Number.isFinite(shipmentId) && shipmentId > 0) {
    return { entityType: 'SHIPMENT', entityId: shipmentId };
  }
  return null;
}

/** Entity ref written to ticket_links when filing a claim. */
export function claimTicketLinkEntity(
  lineId: number | null | undefined,
  receivingId: number,
): { entityType: 'RECEIVING' | 'RECEIVING_LINE'; entityId: number } {
  const picked = pickTicketLinkAnchor({ lineId, receivingId });
  if (picked && (picked.entityType === 'RECEIVING' || picked.entityType === 'RECEIVING_LINE')) {
    return { entityType: picked.entityType, entityId: picked.entityId };
  }
  return { entityType: 'RECEIVING', entityId: receivingId };
}
