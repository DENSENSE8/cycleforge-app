/**
 * Vendor-receipt DISPLAY face for a purchasing-source PO status.
 *
 * The display half of {@link isZohoReceivedLikeStatus} — label, tone and tip
 * for the grid's `zoho` chip. It **composes** both status lists and re-types
 * neither: `zoho-received-status.ts` answers "received?", `ZOHO_TERMINAL_STATUSES`
 * answers "still incoming?", and a fourth hand-typed copy is exactly the drift
 * those two modules were split to end.
 *
 * It stays OUT of `zoho-received-status.ts`, which must remain dependency-free
 * for every altitude; a module carrying tone classes is a display concern
 * (`build-gotchas.md` → bundle altitude).
 *
 * **`null` is not "Open".** No mirror row means the PO has never been synced,
 * which is a different fact from the vendor reporting it open. The caller
 * renders `GridCellDash` for `null` — honest absence, never a COALESCE.
 */

import {
  isZohoReceivedLikeStatus,
  ZOHO_TERMINAL_STATUSES,
} from '@/lib/receiving/zoho-received-status';

type ZohoReceiptTone = 'received' | 'cancelled' | 'open';

interface ZohoReceiptFace {
  label: string;
  tone: ZohoReceiptTone;
  /** Chip classes (bg · text · ring) from house semantic tokens. */
  className: string;
  /** `HoverTooltip` body — the tip states the fact, never a policy. */
  tip: string;
}

/**
 * The terminal statuses that are NOT received — derived by subtracting the
 * received-like list from the terminal list, so adding a status to either SoT
 * lands here automatically instead of needing a third edit.
 */
const CANCELLED_LIKE: ReadonlySet<string> = new Set(
  ZOHO_TERMINAL_STATUSES.filter((s) => !isZohoReceivedLikeStatus(s)),
);

const FACE: Record<ZohoReceiptTone, Omit<ZohoReceiptFace, 'tone'>> = {
  received: {
    label: 'Received',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    tip: 'The purchasing source reports this PO received, billed or closed.',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    tip: 'The purchasing source reports this PO cancelled or rejected — nothing is coming against it.',
  },
  open: {
    label: 'Open',
    className: 'bg-surface-canvas text-text-muted ring-border-soft',
    tip: 'The purchasing source still reports this PO open.',
  },
};

/**
 * PO mirror status → chip face. `null` for an absent status: the cell renders
 * the honest dash rather than claiming the vendor said anything.
 */
export function zohoReceiptFace(status: string | null | undefined): ZohoReceiptFace | null {
  const raw = String(status ?? '').trim();
  if (!raw) return null;
  const tone: ZohoReceiptTone = isZohoReceivedLikeStatus(raw)
    ? 'received'
    : CANCELLED_LIKE.has(raw.toLowerCase())
      ? 'cancelled'
      : 'open';
  return { tone, ...FACE[tone] };
}
