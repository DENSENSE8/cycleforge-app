/**
 * Station side of a phone-sent FNSKU reprint (`grain: 'fnsku'` on the staff
 * print bridge): read the org's catalog row, print `job.copies` FBA unit
 * labels on this computer's label printer, then ledger ONE `label_print_jobs`
 * REPRINT row carrying that count (`symbology: 'code128'`,
 * `templateId: 'fba_fnsku'`, idempotent on the bridge's request id).
 *
 * Callers: `useStaffPrintBridgeHost`. Returns an operator-facing error or null.
 */

import type { StaffPrintFnskuPayload } from '@/lib/print/staff-print-bridge';

type FnskuCatalogRow = { fnsku: string; product_title: string | null; condition: string | null };

export async function printFnskuStationJob(
  job: StaffPrintFnskuPayload,
  requestId: string,
): Promise<string | null> {
  const res = await fetch(`/api/admin/fba-fnskus/${encodeURIComponent(job.fnsku)}`, { cache: 'no-store' });
  if (!res.ok) {
    return res.status === 404
      ? `${job.fnsku} is not in the FBA catalog — nothing printed`
      : `Could not load ${job.fnsku} for its label (${res.status})`;
  }
  const row = ((await res.json()) as { fnsku?: FnskuCatalogRow }).fnsku;
  if (!row?.fnsku) return `Could not load ${job.fnsku} for its label`;

  // Dynamic on purpose: the bridge host mounts on every desk page, and a static
  // import would put bwip-js (~250 KB gz) in all of them — load it on the print.
  const { printFnskuLabelJob } = await import('@/lib/print/fnskuLabel');
  await printFnskuLabelJob(
    { fnsku: row.fnsku, title: row.product_title ?? '', condition: row.condition ?? '' },
    job.copies,
  );

  const ledger = await fetch('/api/label-print-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobs: [
        {
          jobType: 'REPRINT',
          qrPayload: row.fnsku,
          symbology: 'code128',
          templateId: 'fba_fnsku',
          copies: job.copies,
          isReprint: true,
          clientEventId: requestId,
        },
      ],
    }),
  });
  return ledger.ok ? null : `Printed ${row.fnsku}, but the print log did not record it (${ledger.status})`;
}
