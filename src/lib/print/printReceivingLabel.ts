import { getLast8 } from '@/components/ui/CopyChip';
import { encodePrintMatrix, type PrintMatrix } from '@/lib/qr/platform-link';
import { type LabelFaceModel } from '@/lib/print/labelFace';
import { conditionLabel } from '@/lib/conditions';
// receivingLabelTypeDisplay moved to @/lib/receiving/receiving-type-display —
// it is a pure presentation mapper; keeping it here made every consumer's
// bundle inherit this module's print/bwip-js graph.
import { receivingLabelTypeDisplay } from '@/lib/receiving/receiving-type-display';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { builtinPlatformShortLabel } from '@/lib/platform-display';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';

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
  /**
   * Org-catalog dense face for `platform` (`short_label`, e.g. `AMZRN`). When
   * set it replaces the built-in compact in the top-left slot.
   */
  platformShortLabel?: string | null;
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
  /**
   * Org-catalog label face for `receivingType` (`types.short_label`, e.g.
   * `RTR`). When set it prints verbatim in place of the display label —
   * stickers say `RTR`, pickers say `Return`.
   */
  receivingTypeShortLabel?: string | null;
  date: string;
}


/** Compact platform name for small thermal labels where the full catalog name overflows the top-left slot (e.g. */
function receivingLabelPlatformName(platform: string): string {
  const meta = sourcePlatformMeta(platform);
  if (meta.value) return meta.label;
  return sentenceCaseLabel(platform);
}

function receivingLabelPlatformCompact(platform: string, shortLabel: string, type: string): string {
  if (shortLabel) return shortLabel;
  if (!type) return receivingLabelPlatformName(platform);
  return builtinPlatformShortLabel(platform) || receivingLabelPlatformName(platform);
}

/** Top-left label face — "Platform - Type" (e.g. */
export function receivingLabelPlatformDisplay(
  payload: Pick<
    ReceivingLabelPayload,
    'platform' | 'platformShortLabel' | 'receivingType' | 'receivingTypeLabel' | 'receivingTypeShortLabel'
  >,
): string {
  const platform = String(payload.platform ?? '').trim();
  const shortLabel = String(payload.platformShortLabel ?? '').trim();
  // The org's label face wins verbatim (`RTR`); else the org-catalog display
  // label (custom / renamed types); else the built-in map — sentence-cased.
  const type =
    String(payload.receivingTypeShortLabel ?? '').trim() ||
    sentenceCaseLabel(
      (payload.receivingTypeLabel ?? '').trim() || receivingLabelTypeDisplay(payload.receivingType),
    );
  const compact = receivingLabelPlatformCompact(platform, shortLabel, type);
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

/** Bottom‑right carton label preference order: */
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
function receivingLabelMatrix(payload: ReceivingLabelPayload): PrintMatrix {
  return encodePrintMatrix({
    kind: 'carton',
    orgSlug: payload.orgSlug,
    receivingId: payload.receivingId,
    override: payload.qrValue,
    fallbackValue: payload.scanValue,
  });
}

/** The string actually encoded in the carton DataMatrix — a platform Digital Link (`https://{slug}.app.cycleforge.ai/m/r/{id}/qc`) when the… */
export function resolveReceivingQrValue(payload: ReceivingLabelPayload): string {
  return receivingLabelMatrix(payload).value;
}

/**
 * Map a carton payload onto the shared {@link LabelFaceModel}. The single
 * source of truth for the carton label's geometry — consumed by both the
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
