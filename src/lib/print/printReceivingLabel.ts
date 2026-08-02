import { getLast8 } from '@/components/ui/CopyChip';
import { receivingHandle } from '@/lib/barcode-routing';
import { type LabelFaceModel } from '@/lib/print/labelFace';
import { conditionLabel } from '@/lib/conditions';
// receivingLabelTypeDisplay moved to @/lib/receiving/receiving-type-display —
// it is a pure presentation mapper; keeping it here made every consumer's
// bundle inherit this module's print/bwip-js graph.
import { receivingLabelTypeDisplay } from '@/lib/receiving/receiving-type-display';

export interface ReceivingLabelPayload {
  /** Numeric receiving id — used to build the QR URL when qrValue is not provided. */
  receivingId?: number | null;
  /** Human-readable PO/RCV id; corner shows last‑4 unless `zendeskTicket` yields a ticket #. */
  scanValue: string;
  /** Override the encoded URL. Defaults to `${origin}/m/r/{receivingId}`. */
  qrValue?: string;
  platform: string;
  /** Sidebar Zendesk field — only an all‑digits ticket (# optional) replaces PO last‑4; URLs/other text uses PO shorthand. */
  zendeskTicket?: string;
  /**
   * Carton's carrier tracking number. Used as the corner-display fallback
   * when there's no PO (scanValue is an internal `RCV-{id}` handle).
   */
  trackingNumber?: string | null;
  /** Support / line notes shown in the center of the label (any free text). */
  notes: string;
  conditionCode: string;
  /** Receiving type (PO / RETURN / TRADE_IN / PICKUP) — shown after the platform as "Platform - Type". */
  receivingType?: string | null;
  /**
   * Org-catalog-resolved label for `receivingType` (custom / renamed types).
   * When set, it overrides the built-in slug→label map on the printed face.
   */
  receivingTypeLabel?: string | null;
  date: string;
}


/**
 * Compact platform name for small thermal labels where the full catalog name
 * overflows the top-left slot (e.g. "Amazon - Return" → "AMZ - Return").
 */
function receivingLabelPlatformCompact(platform: string, type: string): string {
  if (!type) return platform;
  if (platform.trim().toLowerCase() === 'amazon') return 'AMZ';
  return platform;
}

/**
 * Top-left label face — "Platform - Type" (e.g. "eBay - Return"), or just
 * the platform when no receiving type is set.
 */
export function receivingLabelPlatformDisplay(
  payload: Pick<ReceivingLabelPayload, 'platform' | 'receivingType' | 'receivingTypeLabel'>,
): string {
  const platform = String(payload.platform ?? '').trim();
  // Prefer the org-catalog label (custom / renamed types); else the built-in map.
  const type = (payload.receivingTypeLabel ?? '').trim() || receivingLabelTypeDisplay(payload.receivingType);
  const compact = receivingLabelPlatformCompact(platform, type);
  return type ? `${compact} - ${type}` : compact;
}

/**
 * Parses the sidebar Zendesk field for label print: **only** a plain ticket #
 * — optional leading `#`, optional spaces, digits only everywhere else.
 * Any URL or free text yields null; corner then shows PO last‑4 shorthand.
 */
function zendeskTicketNumberForLabel(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;

  if (/https?:\/\//i.test(t) || /\.zendesk\./i.test(t) || /\/(?:agent\/)?tickets\//i.test(t)) {
    return null;
  }

  const compact = t.replace(/\s+/g, '');
  const digitsOnly = /^#?(\d+)$/.exec(compact);
  return digitsOnly ? digitsOnly[1] : null;
}

/**
 * Ticket digits for the label bottom-right (corner mode "ticket"). Uses the
 * Zendesk/provider id (#9395), not the internal support_tickets registry id.
 */
export function labelCornerTicketDigits(args: {
  providerTicketId?: number | null;
  externalTicketId?: string | null;
  zendeskField?: string | null;
}): string {
  if (
    args.providerTicketId != null &&
    Number.isFinite(args.providerTicketId) &&
    args.providerTicketId > 0
  ) {
    return String(args.providerTicketId);
  }
  const fromRegistry = zendeskTicketNumberForLabel(args.externalTicketId);
  if (fromRegistry) return fromRegistry;
  const fromField = zendeskTicketNumberForLabel(args.zendeskField);
  return fromField ?? '';
}

/**
 * Bottom‑right carton label preference order:
 *   1. `#ticket` for a numeric Zendesk id
 *   2. Last‑4 of the PO# / scanValue (matched cartons)
 *   3. Last‑4 of the carton tracking number (unmatched cartons — scanValue
 *      is `RCV-{id}` which is meaningless to the operator)
 */
export function receivingLabelPoCornerDisplay(payload: ReceivingLabelPayload): string {
  const fromZk = zendeskTicketNumberForLabel(payload.zendeskTicket);
  if (fromZk) return `#${fromZk}`;
  const sv = String(payload.scanValue || '').trim();
  const isInternalRcv = /^RCV-\d+$/i.test(sv);
  if (isInternalRcv) {
    const tracking = String(payload.trackingNumber || '').trim();
    if (tracking) return getLast8(tracking);
  }
  return getLast8(sv);
}

/**
 * The string actually encoded in the carton DataMatrix. Prefers an
 * explicit qrValue override (legacy callsites still pass a full URL),
 * then derives the bare handle `R-{id}` via {@link receivingHandle},
 * then falls back to the human-readable scanValue for back-compat.
 *
 * Industry-standard for internal warehouse handles: no URL, no host. The
 * internal scanner recognises the `R-{id}` prefix in `routeScan()` and
 * navigates to `/m/r/{id}`. Consumer phone cameras see opaque text.
 */
export function resolveReceivingQrValue(payload: ReceivingLabelPayload): string {
  if (payload.qrValue && payload.qrValue.trim()) return payload.qrValue.trim();
  if (payload.receivingId != null && Number.isFinite(payload.receivingId)) {
    return receivingHandle(payload.receivingId);
  }
  return payload.scanValue.trim();
}

/**
 * Map a carton payload onto the shared {@link LabelFaceModel}. The single
 * source of truth for the carton label's slot layout — consumed by both the
 * on-screen `ReceivingPoLabelPreview` and every print path, so they can't drift.
 */
export function receivingPayloadToFace(payload: ReceivingLabelPayload): LabelFaceModel {
  const qrValue = resolveReceivingQrValue(payload);
  // HRI = the typeable `R-{id}` handle, shown under the matrix the way a barcode
  // prints its digits. Only for the internal receiving handle, not arbitrary URLs.
  const hri = /^(?:R|RCV)-\d+$/i.test(qrValue) ? qrValue.toUpperCase() : undefined;
  return {
    topLeft: receivingLabelPlatformDisplay(payload),
    topRight: payload.date,
    center: (payload.notes || '').trim(),
    bottomLeft: conditionLabel(payload.conditionCode, 'label'),
    bottomRight: receivingLabelPoCornerDisplay(payload),
    matrix: { value: qrValue, symbology: 'datamatrix', scale: 4 },
    hri,
  };
}
