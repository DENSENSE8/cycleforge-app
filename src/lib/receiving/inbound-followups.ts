/**
 * Inbound follow-ups — the staff verdict on one pasted inbound number
 * (the old "Unreceived Tracking" sheet's 'Check and resolve' column + its
 * NEED CLAIM / DOUBLE CHECK color tags). Pure and client-safe: the DB side
 * lives in `inbound-followups-store.ts`.
 */

import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

export const INBOUND_FOLLOWUP_TAGS = ['need_claim', 'double_check', 'chasing_seller', 'acknowledged'] as const;
export type InboundFollowupTag = (typeof INBOUND_FOLLOWUP_TAGS)[number];

export const INBOUND_FOLLOWUP_LABELS: Readonly<Record<InboundFollowupTag, string>> = {
  need_claim: 'Need claim',
  double_check: 'Double check',
  chasing_seller: 'Chasing seller',
  acknowledged: 'Acknowledged',
};

export interface InboundFollowup {
  /** Canonical key — see `inboundFollowupKey`. */
  key: string;
  tag: InboundFollowupTag;
  note: string | null;
  setBy: number | null;
  setByName: string | null;
  /** ISO timestamp. */
  setAt: string;
}

/**
 * One key per inbound purchase: the PO number when the pasted ref resolved to
 * one (so tagging survives re-pasting by tracking OR by PO), else the pasted
 * ref itself. Upper-alnum so "1Z 999-aa1" and "1Z999AA1" are the same row.
 */
export function inboundFollowupKey(input: { poNumber?: string | null; ref: string }): string {
  return canonicalizeTrackingKey(input.poNumber) || canonicalizeTrackingKey(input.ref);
}
