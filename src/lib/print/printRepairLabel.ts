import { repairHandle } from '@/lib/barcode-routing';
import { escapeLabelHtml } from '@/lib/print/labelHtml';
import { reserveLegacyPrintPopup } from '@/lib/print/iframePrint';

// Repair metadata laid out top/middle/bottom in the shared label's info column.
const REPAIR_INFO_CSS = `
  .row{display:flex;justify-content:space-between;align-items:baseline;gap:4px;line-height:1}
  .platform{font-size:11px;font-weight:700;color:#374151;text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .notes{flex:1 1 auto;min-height:0;font-size:10px;font-weight:600;color:#111;text-transform:none;letter-spacing:0;text-align:center;line-height:1.12;overflow:hidden;padding:0 1px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow-wrap:anywhere;word-break:break-word;align-self:stretch;-webkit-hyphens:auto;hyphens:auto}
  .cond{font-size:11px;font-weight:700;color:#111;white-space:nowrap}
  .po{font-size:11px;font-weight:700;letter-spacing:0.3px;line-height:1.05;color:#111;white-space:nowrap;font-variant-numeric:tabular-nums}
  .date{font-size:11px;font-weight:700;color:#4b5563;white-space:nowrap;font-variant-numeric:tabular-nums}`;

export interface RepairLabelPayload {
  /** Numeric repair id — used to build the QR URL when qrValue is not provided. */
  repairId: number;
  /** Human-readable RS code, e.g. "RS-1234". Used as the bottom-right fallback when no ticket #. */
  rsCode: string;
  /** Customer first name only — shown top-left. */
  firstName: string;
  /** Optional Zendesk ticket — shown bottom-right when present, else RS code is repeated. */
  ticketNumber?: string;
  /** Pre-formatted intake/print date string shown top-right. */
  date: string;
  /** Pre-formatted due date shown bottom-left (when this repair should be completed by). */
  dueDate: string;
  /** Override the encoded URL. Defaults to the walk-in repair deep link. */
  qrValue?: string;
}

/**
 * The string actually encoded in the printed DataMatrix. Bare handle
 * `REP-{id}` — `routeScan()` parses the prefix and navigates to
 * /m/rs/{id} (the mobile repair-service detail page). No URL on the wire.
 */
export function resolveRepairQrValue(payload: RepairLabelPayload): string {
  if (payload.qrValue && payload.qrValue.trim()) return payload.qrValue.trim();
  return repairHandle(payload.repairId);
}

/** Bottom-right corner: prefer a Zendesk ticket, otherwise repeat the RS code. */
function repairLabelCornerDisplay(payload: RepairLabelPayload): string {
  const t = (payload.ticketNumber || '').trim();
  if (t && !/^RS-?\d+$/i.test(t)) return t.startsWith('#') ? t : `#${t}`;
  return payload.rsCode;
}

/**
 * Upper bound of the "3–10 working days" SLA the intake receipt promises. The
 * label's bottom-left date is that promise in the customer's hand, so the two
 * must be derived from one constant.
 */
export const REPAIR_LABEL_SLA_DAYS = 10;

/** 2-digit US date — the only date format the 2×1 face has room for. */
function labelDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
}

/** The label payload for a repair, from the facts every surface already has. */
export function buildRepairLabelPayload(args: {
  repairId: number;
  /** Either the raw `contact_info` blob or an already-clean customer name. */
  customerName?: string | null;
  ticketNumber?: string | null;
  /** When the device was taken in; the due date counts from here. */
  intakeAt?: string | Date | null;
}): RepairLabelPayload {
  const fullName = (args.customerName ?? '').split(',')[0]?.trim() ?? '';
  const firstName = fullName.split(/\s+/)[0] || 'Repair';
  const intakeSource = args.intakeAt ? new Date(args.intakeAt) : new Date();
  const intake = Number.isNaN(intakeSource.getTime()) ? new Date() : intakeSource;
  const due = new Date(intake.getTime());
  due.setDate(due.getDate() + REPAIR_LABEL_SLA_DAYS);

  return {
    repairId: args.repairId,
    rsCode: `RS-${args.repairId}`,
    firstName,
    ticketNumber: args.ticketNumber?.trim() || '',
    date: labelDate(new Date()),
    dueDate: labelDate(due),
  };
}

/**
 * Generate a 2×1" repair label with info on the left and a pre-rendered QR SVG
 * on the right. The QR encodes the walk-in repair deep link so a scanner / phone
 * opens RepairDetailsPanel for this repair without needing the app installed.
 */
export function printRepairLabel(payload: RepairLabelPayload): void {
  if (typeof window === 'undefined') return;
  const qrValue = resolveRepairQrValue(payload);
  if (!qrValue) return;

  const infoHtml = `
    <div class="row">
      <span class="platform">${escapeLabelHtml((payload.firstName || 'Repair').trim())}</span>
      <span class="date">${escapeLabelHtml(payload.date)}</span>
    </div>
    <div class="notes"></div>
    <div class="row">
      <span class="cond">${escapeLabelHtml(payload.dueDate)}</span>
      <span class="po">${escapeLabelHtml(repairLabelCornerDisplay(payload))}</span>
    </div>`;

  const legacyPopup = reserveLegacyPrintPopup();
  // DataMatrix (`REP-{id}` handle) — routeScan() routes to /m/rs/{id}.
  // Lazy: printLabel drags the bwip-js barcode engine; load on the actual print.
  void import('@/lib/print/printLabel').then(({ printLabel }) => {
    printLabel({
      name: 'Label',
      infoHtml,
      infoCss: REPAIR_INFO_CSS,
      dataMatrix: { value: qrValue, symbology: 'datamatrix', scale: 4 },
      legacyPopup,
    });
  });
}
