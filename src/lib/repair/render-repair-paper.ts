/**
 * The printed repair-service paper — one renderer, two principals.
 *
 * Callers: `/api/repair-service/print/[id]` (staff session, `withAuth`,
 *   `repair.view`) and `/api/kiosk/repair/[id]/paperwork` (device cookie,
 *   `withKioskAuth`).
 * Affected API: both of those GETs; they differ only in who they let in, the
 *   id parse and the JSON error shapes. The document itself is this file.
 * Data schemas: `getRepairById` (`repair_service` row — ticket_number,
 *   product_title, serial_number, issue, price, contact_info, created_at,
 *   updated_at), `getOrganization` + `getOrgLetterhead` (letterhead),
 *   `documents` (signature_url per `document_type`: `intake_agreement` /
 *   `pickup_agreement`, older intake rows with NULL document_type), and
 *   `repair_actions` LEFT JOIN `staff` (the "Internal Use" table, capped at 6).
 *
 * WHY this is shared rather than copied: the same sheet of paper is asked for
 * by two different principals. At the desk it is a staff session clicking Print
 * on the repair details panel; on the counter tablet it is a device cookie —
 * the kiosk History face, which has no staff session at all — reprinting the
 * paperwork for a ticket it already lists and opens. A customer must not be
 * able to tell which machine printed their copy, and the legal wording, the
 * signature bands and the 30-day warranty line are the part that must not
 * drift. A second copy of this markup is exactly how it drifts: one route gets
 * the new warranty text, the other keeps printing last year's. So the document
 * lives here and the routes stay thin — they decide WHO may ask, never WHAT is
 * printed.
 */

import { getRepairById } from '@/lib/neon/repair-service-queries';
import { formatRepairPaperTicketNumber } from '@/lib/repair/repair-paper-ticket';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import {
  repairPaperLetterheadHtml,
  repairPaperTicketHeadingHtml,
  repairSignatureInkHtml,
  repairSignatureRowHtml,
} from '@/lib/repair/repair-paper-html';
import { formatPhoneNumber } from '@/utils/phone';
import pool from '@/lib/db';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getOrgLetterhead } from '@/lib/branding/letterhead';
import { parseOrgSettings } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Render the full printable HTML document for one repair.
 *
 * Returns `null` when the repair does not exist in `orgId` — the caller maps
 * that to its own 404 shape. `autoPrint` defaults to TRUE: every caller today
 * is a Print button, and both routes open the document in a tab expecting the
 * browser's print dialog to come up on its own. The flag is a seam for a
 * future silent render (preview pane, emailed copy), not a query knob — no
 * route reads it off the URL.
 */
export async function renderRepairPaperHtml(
  orgId: OrgId,
  repairId: number,
  opts?: { autoPrint?: boolean },
): Promise<string | null> {
  const [repair, org] = await Promise.all([
    getRepairById(repairId, orgId),
    getOrganization(orgId),
  ]);
  const letterhead = getOrgLetterhead({
    name: org?.name ?? '',
    settings: org?.settings ?? parseOrgSettings(undefined),
  });

  if (!repair) return null;

  // Format date
  let startDateTime = '';
  try {
    if (repair.created_at) {
      const date = new Date(repair.created_at);
      startDateTime = date.toLocaleString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric'
      });
    } else {
      const now = new Date();
      startDateTime = now.toLocaleString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric'
      });
    }
  } catch {
    const now = new Date();
    startDateTime = now.toLocaleString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric'
    });
  }

  // Pickup date — today (printed at pickup); falls back to repair.updated_at
  // when available so a late reprint still shows the original pickup day.
  const pickupDateTime = (() => {
    const fmt = (d: Date) =>
      d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    try {
      if (repair.updated_at) {
        const u = new Date(repair.updated_at);
        if (!Number.isNaN(u.getTime())) return fmt(u);
      }
    } catch { /* ignore */ }
    return fmt(new Date());
  })();

  const repairServiceId = repair.id.toString();
  const repairServiceCode = `RS-${repairServiceId}`;
  const canonicalRsCode = `RS-${String(repair.id).padStart(4, '0')}`;
  const unpaddedRsCode = `RS-${repair.id}`;
  const displayTicket = formatRepairPaperTicketNumber(repair.ticket_number);
  const productTitle = repair.product_title || '';
  const issue = repair.issue || '';
  const serialNumber = repair.serial_number || '';
  const price = repair.price || '';

  // ── Who this ticket belongs to ─────────────────────────────────────────────
  //
  // One rule, shared with the ticket reader, the payment link, the field
  // catalog and the two repair panes: `src/lib/repair/contact-info.ts`. The
  // joined `customers` row wins; `contact_info` is an index-free fallback for
  // rows that predate the link.
  //
  // Note the previous local copy only consulted the fallback when ALL THREE
  // fields were empty, so a linked customer with a blank phone printed no
  // phone even when the intake string held one. The shared rule fills each
  // field independently.
  const contact = resolveRepairContact(repair);
  const name = contact.name ?? '';
  const phoneNumber = formatPhoneNumber(contact.phone ?? '');
  const email = contact.email ?? '';

  // Format contact as "Name, Phone, Email"
  const contactDisplay = [name, phoneNumber, email].filter(Boolean).join(', ');

  // Capture the DB id outside the closure — TS narrowing of `repair`
  // doesn't carry into the nested async function.
  const repairDbId = repair.id;

  // Resolve drop-off (intake) and pickup signatures separately by document_type.
  // The intake row uses blob path "{RS-####}_<ts>.png" while pickup uses
  // "{RS-####}_pickup_<ts>.png" — older intake rows may pre-date document_type
  // discrimination, so the intake query also accepts NULL document_type.
  async function resolveSignatureUrl(
    docTypeFilter: 'intake_agreement' | 'pickup_agreement',
  ): Promise<string> {
    const blobMarker =
      docTypeFilter === 'pickup_agreement' ? '_pickup_' : '_';
    try {
      const result = await pool.query(
        `SELECT d.signature_url
           FROM documents d
           WHERE d.entity_type = 'REPAIR'
             AND d.signature_url IS NOT NULL
             AND (
               d.document_type = $5
               OR (d.document_type IS NULL AND $5 = 'intake_agreement')
             )
             AND (
               d.entity_id = $1
               OR COALESCE(d.document_data->>'ticketNumber', '') = $2
               OR d.signature_url ILIKE $3
               OR d.signature_url ILIKE $4
             )
           ORDER BY
             CASE
               WHEN d.signature_url ILIKE '%' || $6 || '%' THEN 0
               WHEN COALESCE(d.document_data->>'ticketNumber', '') = $2 THEN 1
               WHEN d.signature_url ILIKE $3 THEN 2
               WHEN d.signature_url ILIKE $4 THEN 3
               WHEN d.entity_id = $1 THEN 4
               ELSE 5
             END,
             d.created_at DESC
           LIMIT 1`,
        [
          repairDbId,
          canonicalRsCode,
          `%/${canonicalRsCode}_%`,
          `%/${unpaddedRsCode}_%`,
          docTypeFilter,
          blobMarker,
        ],
      );
      return String(result.rows[0]?.signature_url || '').trim();
    } catch (err) {
      console.warn(
        `Failed to resolve repair ${docTypeFilter} signature for RS ${canonicalRsCode}:`,
        err,
      );
      return '';
    }
  }

  const [dropoffSignatureUrl, pickupSignatureUrl] = await Promise.all([
    resolveSignatureUrl('intake_agreement'),
    resolveSignatureUrl('pickup_agreement'),
  ]);

  // Pull what was physically done on this repair (oldest-first so it reads
  // top→bottom like the work was performed). Cap at 6 rows — the printed
  // table has fixed height and more than 6 looks cramped.
  interface ActionRow {
    action_type: string;
    part_name: string | null;
    old_sku: string | null;
    new_sku: string | null;
    staff_name: string | null;
    created_at: string;
  }
  let actions: ActionRow[] = [];
  try {
    const r = await pool.query<ActionRow>(
      `SELECT a.action_type, a.part_name, a.old_sku, a.new_sku,
              s.name AS staff_name, a.created_at
         FROM repair_actions a
         LEFT JOIN staff s ON s.id = a.staff_id
        WHERE a.repair_id = $1
          AND a.deleted_at IS NULL
        ORDER BY a.created_at ASC, a.id ASC
        LIMIT 6`,
      [repair.id],
    );
    actions = r.rows;
  } catch (err) {
    console.warn(`Failed to load repair_actions for RS ${canonicalRsCode}:`, err);
  }

  const ACTION_LABEL: Record<string, string> = {
    replaced:      'Replaced',
    repaired:      'Repaired',
    cleaned:       'Cleaned',
    tested:        'Tested',
    no_fix:        'No fix',
    awaiting_part: 'Awaiting part',
  };
  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const actionRowsHtml = actions.length
    ? actions
        .map((a) => {
          const what = a.part_name
            ? `${ACTION_LABEL[a.action_type] || a.action_type}: ${a.part_name}`
            : ACTION_LABEL[a.action_type] || a.action_type;
          const detail =
            a.action_type === 'replaced' && (a.old_sku || a.new_sku)
              ? `${a.old_sku || '—'} → ${a.new_sku || '—'}`
              : '';
          const who = a.staff_name || '';
          const when = a.created_at
            ? new Date(a.created_at).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: '2-digit',
              })
            : '';
          return `<div class="flex border-b border-r border-black">${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2">${escapeHtml(what)}</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2">${escapeHtml(detail)}</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2">${escapeHtml(who)}</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2">${escapeHtml(when)}</div>${'' /* ds-allow-raw-neutral: print ink */}
          </div>`;
        })
        .join('')
    : `<div class="flex border-b border-r border-black">${'' /* ds-allow-raw-neutral: print ink */}
        <div class="flex-1 border-r border-black p-2">&nbsp;</div>${'' /* ds-allow-raw-neutral: print ink */}
        <div class="flex-1 border-r border-black p-2">&nbsp;</div>${'' /* ds-allow-raw-neutral: print ink */}
        <div class="flex-1 border-r border-black p-2">&nbsp;</div>${'' /* ds-allow-raw-neutral: print ink */}
        <div class="flex-1 border-r border-black p-2">&nbsp;</div>${'' /* ds-allow-raw-neutral: print ink */}
      </div>`;

  // Generate HTML matching Repair Service Paper exactly
  const formHtml = `
      <div class="bg-surface-card text-text-default font-sans p-6">

        ${repairPaperLetterheadHtml(letterhead)}

        ${repairPaperTicketHeadingHtml(displayTicket, escapeHtml)}

        <!-- Information Table -->
        <div class="border-t border-l border-black mb-6">${'' /* ds-allow-raw-neutral: print ink */}
          <div class="flex border-b border-r border-black">${'' /* ds-allow-raw-neutral: print ink */}
            <div class="w-40 p-2 font-semibold bg-surface-canvas border-r border-black">Product Title:</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 p-2">${productTitle}</div>
          </div>
          <div class="flex border-b border-r border-black">${'' /* ds-allow-raw-neutral: print ink */}
            <div class="w-40 p-2 font-semibold bg-surface-canvas border-r border-black">SN & Issues:</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 p-2">${serialNumber}, ${issue}</div>
          </div>
          <div class="flex border-b border-r border-black">${'' /* ds-allow-raw-neutral: print ink */}
            <div class="w-40 p-2 font-semibold bg-surface-canvas border-r border-black">Contact Info:</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 p-2">${contactDisplay}</div>
          </div>
        </div>

        <!-- Price Section -->
        <div class="mb-6">
          <p class="text-lg font-medium mb-2">
            <span class="font-semibold text-emerald-600">$${price}</span> - Price Paid at Pick-up
          </p>
          <p class="text-base font-medium">
            Card / Cash - Payment Method
          </p>
        </div>

        <!-- Terms & Warranty -->
        <div class="mb-2 text-sm leading-relaxed">
          <p class="mb-2">
            Your Bose product has been received into our repair center. Under normal circumstances it will 
            be repaired within the next 3-10 working days and returned to you at the address above.
          </p>
          <p class="font-semibold border-b border-black inline-block">${'' /* ds-allow-raw-neutral: print ink */}
            There is a 30 day Warranty on all our repair services.
          </p>
        </div>

        <!-- Drop Off Section -->
        <div class="mb-3 mt-2">
          ${repairSignatureRowHtml({
            label: 'Drop Off X',
            dateText: `Date: ${startDateTime}`,
            borderClass: 'border-b-2 border-black', // ds-allow-raw-neutral: print ink
            innerHtml: dropoffSignatureUrl
              ? repairSignatureInkHtml(
                  dropoffSignatureUrl,
                  `Drop off signature for ${canonicalRsCode}`,
                )
              : '',
          })}
          <p class="text-xs italic">
            By signing above you agree to the listed price and any unexpected delays in the repair process.
          </p>
        </div>

        <!-- Internal Use Table -->
        <div class="border-t border-l border-black mb-3">${'' /* ds-allow-raw-neutral: print ink */}
          <div class="flex border-b border-r border-black bg-surface-canvas">${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2 font-semibold">Part Repaired</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2 font-semibold">Detail</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2 font-semibold">Who</div>${'' /* ds-allow-raw-neutral: print ink */}
            <div class="flex-1 border-r border-black p-2 font-semibold">Date</div>${'' /* ds-allow-raw-neutral: print ink */}
          </div>
          ${actionRowsHtml}
        </div>

        <!-- Pick Up Section -->
        <div class="mt-4">
          ${repairSignatureRowHtml({
            label: 'Pick Up X',
            dateText: `Date: ${pickupDateTime}`,
            borderClass: 'border-b-2 border-black', // ds-allow-raw-neutral: print ink
            innerHtml: pickupSignatureUrl
              ? repairSignatureInkHtml(
                  pickupSignatureUrl,
                  `Pickup signature for ${canonicalRsCode}`,
                )
              : '',
          })}
          <p class="text-center font-semibold text-xl mt-4">Enjoy your repaired unit!</p>
        </div>

      </div>
    `;

  // The on-load print hook. Default-on: the desk's Print buttons and the
  // tablet's History reprint both want the dialog without a second click.
  const autoPrintScript = (opts?.autoPrint ?? true)
    ? `
  <script>
    window.onload = function() { window.print(); };
  </script>`
    : '';

  // Return full HTML page with print styles
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Repair Service - ${repairServiceCode}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 210mm;
      min-height: 297mm;
      margin: 0;
      padding: 0;
    }
    @media print {
      html, body {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        padding: 0;
      }
      @page {
        size: A4;
        margin: 0;
      }
    }
  </style>${autoPrintScript}
</head>
<body>
  ${formHtml}
</body>
</html>
    `;

  return html;
}
