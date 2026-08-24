import { getLast8 } from '@/lib/copy-chip-format';
import { encodePrintMatrix, type PrintMatrix } from '@/lib/qr/platform-link';
import { type LabelFaceModel } from '@/lib/print/labelFace';
import { conditionLabel } from '@/lib/conditions';
// receivingLabelTypeDisplay moved to @/lib/receiving/receiving-type-display —
// it is a pure presentation mapper; keeping it here made every consumer's
// bundle inherit this module's print/bwip-js graph.
import { receivingLabelTypeDisplay } from '@/lib/receiving/receiving-type-display';

export interface ReceivingLabelPayload {
  /** Numeric receiving id — used to build the QR URL when qrValue is not provided. */
  receivingId?: number | null;
  /**
   * Tenant slug for platform Digital Link minting
   * (`https://{slug}.app.cycleforge.ai/m/r/{id}`). When missing, falls back to
   * the bare `R-{id}` handle so previews still render offline.
   */
  orgSlug?: string | null;
  /** Human-readable PO/RCV id; corner shows last‑4 unless `zendeskTicket` yields a ticket #. */
  scanValue: string;
  /** Override the encoded URL. Defaults to platform Digital Link when orgSlug is set. */
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
 * overflows the top-left slot (e.g. "Amazon - Return" → "AMZ - Return",
 * "Unfound - Return" → "UNF - Return"). Without this the 2×1" `.tl` ellipsis
 * clips the type to "… - Re…".
 */
function receivingLabelPlatformCompact(platform: string, type: string): string {
  if (!type) return platform;
  const key = platform.trim().toLowerCase();
  if (key === 'amazon') return 'AMZ';
  if (key === 'unfound') return 'UNF';
  return platform;
}

/**
 * Top-left label face — "Platform - Type" (e.g. "eBay - Return"), or just
 * the platform when no receiving type is set.
 *
 * When the type label already carries the platform (org catalog slugs like
 * `ECWID-RS`), print the type alone — `ECWID - ECWID-RS` truncates to ellipsis
 * ("…") on the 2×1" face.
 */
export function receivingLabelPlatformDisplay(
  payload: Pick<ReceivingLabelPayload, 'platform' | 'receivingType' | 'receivingTypeLabel'>,
): string {
  const platform = String(payload.platform ?? '').trim();
  // Prefer the org-catalog label (custom / renamed types); else the built-in map.
  const type = (payload.receivingTypeLabel ?? '').trim() || receivingLabelTypeDisplay(payload.receivingType);
  const compact = receivingLabelPlatformCompact(platform, type);
  if (!type) return compact;
  const typeU = type.toUpperCase();
  const compactU = compact.toUpperCase();
  if (
    typeU === compactU ||
    typeU.startsWith(`${compactU}-`) ||
    typeU.startsWith(`${compactU} `)
  ) {
    return type;
  }
  return `${compact} - ${type}`;
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
 * Carton matrix — value + symbology + HRI, resolved by the encode SoT
 * ({@link encodePrintMatrix}). Every carton print path (face preview, HTML,
 * raw TSPL/ZPL) reads this, so none of them can encode a different string.
 */
export function receivingLabelMatrix(payload: ReceivingLabelPayload): PrintMatrix {
  return encodePrintMatrix({
    kind: 'carton',
    orgSlug: payload.orgSlug,
    receivingId: payload.receivingId,
    override: payload.qrValue,
    fallbackValue: payload.scanValue,
  });
}

/**
 * The string actually encoded in the carton DataMatrix — a platform Digital
 * Link (`https://{slug}.app.cycleforge.ai/m/r/{id}`) when the slug is known,
 * else the bare `R-{id}` handle.
 *
 * Staff wedge ignores the host and parses the path / bare handle in
 * `routeScan()`. Consumer phones open the platform URL → public interstitial.
 */
export function resolveReceivingQrValue(payload: ReceivingLabelPayload): string {
  return receivingLabelMatrix(payload).value;
}

/**
 * Map a carton payload onto the shared {@link LabelFaceModel}. The single
 * source of truth for the carton label's slot layout — consumed by both the
 * on-screen `ReceivingPoLabelPreview` and every print path, so they can't drift.
 */
export function receivingPayloadToFace(payload: ReceivingLabelPayload): LabelFaceModel {
  // HRI = the typeable `R-{id}` handle under the matrix (even when the matrix
  // encodes the absolute platform Digital Link URL) — resolved by the SoT.
  const { value, symbology, hri } = receivingLabelMatrix(payload);
  return {
    topLeft: receivingLabelPlatformDisplay(payload),
    topRight: payload.date,
    center: (payload.notes || '').trim(),
    bottomLeft: conditionLabel(payload.conditionCode, 'label'),
    bottomRight: receivingLabelPoCornerDisplay(payload),
    matrix: { value, symbology, scale: 4 },
    hri,
  };
}
