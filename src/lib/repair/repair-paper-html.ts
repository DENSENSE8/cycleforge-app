/** HTML fragments shared with `/api/repair-service/print/[id]`. */

import type { OrgLetterhead } from '@/lib/branding/letterhead';
import { REPAIR_PRINT_SIGNATURE_BAND } from './signature-geometry';

/** Matches `MM/DD/YYYY` width for drop-off / pick-up alignment on blank forms. */
export const REPAIR_PICKUP_DATE_PLACEHOLDER = 'Date: __/__/____';

export const REPAIR_SIGNATURE_ROW_GRID_STYLE =
  'grid-template-columns: 5.75rem minmax(0, 1fr) 11rem';

/**
 * The captured signature as it prints inside a {@link repairSignatureRowHtml}
 * band. ONE fragment: drop-off and pick-up carried byte-identical copies of
 * this inline style, so a geometry fix could land on one row and miss the
 * other.
 *
 * `object-fit:contain` + `max-width:100%` is the DEFENSIVE half of the
 * 2026-09-15 floating-ink defect and is deliberately unchanged — the capture
 * aspect was the wrong end of the pipe (`src/lib/repair/signature-geometry.ts`).
 * The filter flattens anti-aliased finger strokes to printable ink.
 */
export function repairSignatureInkHtml(dataUrl: string, alt: string): string {
  return `<img src="${dataUrl}" alt="${alt}" style="position:absolute;bottom:2px;left:0;height:${REPAIR_PRINT_SIGNATURE_BAND.inkHeightPx}px;max-width:100%;width:auto;object-fit:contain;filter:contrast(2.2) brightness(0.55) saturate(0);" />`;
}

export function repairSignatureRowHtml(options: {
  label: string;
  dateText: string;
  /** Defaults to the band the ink is sized against — pass one only to differ. */
  lineHeightPx?: number;
  borderClass?: string;
  innerHtml?: string;
}): string {
  const {
    label,
    dateText,
    lineHeightPx = REPAIR_PRINT_SIGNATURE_BAND.lineHeightPx,
    borderClass = 'border-b border-black', // ds-allow-raw-neutral: print ink
    innerHtml = '',
  } = options;

  return `
          <div class="mb-2 grid items-end gap-x-4" style="${REPAIR_SIGNATURE_ROW_GRID_STYLE}">
            <span class="whitespace-nowrap font-bold">${label}</span>
            <div class="${borderClass} relative overflow-hidden" style="height: ${lineHeightPx}px;">${innerHtml}</div>
            <span class="whitespace-nowrap text-right font-bold tabular-nums">${dateText}</span>
          </div>`;
}

function escapeLetterheadHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function repairPaperLetterheadHtml(letterhead: OrgLetterhead): string {
  const lines = [letterhead.addressLine1, letterhead.addressLine2]
    .filter(Boolean)
    .map((line) => `<p class="text-sm">${escapeLetterheadHtml(line)}</p>`)
    .join('');
  const phone = letterhead.phone
    ? `<p class="text-sm">Tel: ${escapeLetterheadHtml(letterhead.phone)}</p>`
    : '';
  return `
        <div class="text-right mb-8">
          <h2 class="font-bold text-lg">${escapeLetterheadHtml(letterhead.name)}</h2>
          ${lines}
          ${phone}
        </div>`;
}

export function repairPaperTicketHeadingHtml(
  displayTicket: string,
  escapeHtml: (value: string) => string,
): string {
  return `
        <div class="mb-6 min-w-0">
          <h1 class="text-3xl font-bold mb-2">Repair Service</h1>
          <p class="text-lg font-semibold flex flex-wrap items-baseline gap-x-2">
            ${displayTicket ? `<span class="font-bold">${escapeHtml(displayTicket)}</span>` : ''}
            <span>Repair Ticket Number</span>
          </p>
        </div>`;
}
