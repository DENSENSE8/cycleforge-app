import type { ReceivingLabelPayload } from '@/lib/print/printReceivingLabel';
import type { LabelEditDraft } from './LabelEditPopover';

export interface CartonPayloadContext {
  /** Carton receiving id — drives the Digital Link + the `RCV-{id}` fallback. */
  receivingId: number | null;
  /** Tenant slug for platform Digital Link minting (`{slug}.app.cycleforge.ai`). */
  orgSlug?: string | null;
  /** Carton primary tracking (`row.tracking_number` || `core.trackingEdit`). */
  trackingHint: string;
  /** useReceivingTypeLabel() resolver — type code → catalog label. */
  resolveTypeLabel: (code: string | null | undefined) => string;
  /** usePlatformShortLabelLookup() — platform slug/label → org `short_label`. */
  resolvePlatformShortLabel: (platform: string | null | undefined) => string | null;
}

/** Assemble a carton-label payload from a (default or hand-edited) label draft — the single carton payload builder shared by the label… */
export function buildCartonLabelPayloadFromDraft(
  draft: LabelEditDraft,
  ctx: CartonPayloadContext,
): ReceivingLabelPayload {
  const rcv = ctx.receivingId != null ? `RCV-${ctx.receivingId}` : '';
  const base = {
    receivingId: ctx.receivingId ?? null,
    orgSlug: ctx.orgSlug ?? null,
    platform: draft.platform,
    // Org dense face (`AMZRN`) for the 2x1 top-left slot; a hand-typed
    // platform that names no catalog row prints as typed.
    platformShortLabel: ctx.resolvePlatformShortLabel(draft.platform),
    notes: draft.notes.trim(),
    conditionCode: draft.conditionCode,
    receivingType: draft.receivingType || null,
    // Catalog label so a renamed/custom type prints correctly on the face.
    receivingTypeLabel: ctx.resolveTypeLabel(draft.receivingType) || null,
    date: draft.date,
  };
  // Bottom-right corner is operator-chosen — steer the label-corner helper:
  if (draft.cornerMode === 'ticket') {
    return {
      ...base,
      scanValue: draft.reference.trim() || rcv,
      zendeskTicket: draft.ticket.trim() || undefined,
      trackingNumber: ctx.trackingHint || null,
    };
  }
  if (draft.cornerMode === 'tracking') {
    return {
      ...base,
      scanValue: rcv,
      zendeskTicket: undefined,
      trackingNumber: draft.tracking.trim() || ctx.trackingHint || null,
    };
  }
  return {
    ...base,
    scanValue: draft.reference.trim() || rcv,
    zendeskTicket: undefined,
    trackingNumber: ctx.trackingHint || null,
  };
}
