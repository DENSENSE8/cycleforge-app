/** Station side of a phone-sent FNSKU reprint (`grain: 'fnsku'`), and the Print station's own "this computer" press. */

import type { StaffPrintFnskuPayload } from '@/lib/print/staff-print-bridge';
import { silentRawLabelProfile } from '@/lib/print/browserPrint';
import { beginWork } from '@/lib/background-work/store';

type FnskuCatalogRow = { fnsku: string; product_title: string | null; condition: string | null };

export interface FnskuStationJobOutcome {
  /** Stickers sent to the printer (the dialog counts every copy it was handed). */
  printed: number;
  /** Stopped between stickers by a cancel. */
  cancelled: boolean;
  /** Why nothing (or not all of it) printed, or that the print log missed it; null when clean. */
  failure: string | null;
}

export interface FnskuStationJobOptions {
  /** The header item's id — the station host keys it by request id so a sender's control finds it. */
  workId?: string;
  /** After each sticker leaves this computer. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Print one FNSKU's stickers on THIS computer. It is the FNSKU print choke
 * point, so it reports to the header's print list — pausable and cancellable
 * between stickers when they print silently (the dialog is one job: neither).
 * A test print marks its face and never writes the reprint log.
 */
export async function printFnskuStationJob(
  job: StaffPrintFnskuPayload,
  requestId: string,
  options: FnskuStationJobOptions = {},
): Promise<FnskuStationJobOutcome> {
  const controllable = silentRawLabelProfile() !== null;
  const work = beginWork({
    kind: 'print',
    label: job.test ? 'FNSKU test print' : 'FNSKU labels',
    total: job.copies,
    id: options.workId,
    detail: job.fnsku,
    ...(controllable ? { controls: { pause: true, cancel: true } } : {}),
  });
  try {
    const outcome = await printFnsku(job, requestId, {
      checkpoint: work.checkpoint,
      onPrinted: (done, total) => {
        work.progress(done, total);
        options.onProgress?.(done, total);
      },
    });
    if (outcome.cancelled) work.cancelled(`Cancelled · ${outcome.printed} of ${job.copies} printed`);
    else if (outcome.failure && outcome.printed === 0) work.fail(outcome.failure);
    else if (outcome.failure) work.finish(outcome.failure);
    else work.finish(job.test ? `Test print · ${job.copies} printed` : `${job.copies} printed`);
    return outcome;
  } catch (err) {
    work.fail(err instanceof Error ? err.message : 'The label did not print.');
    throw err;
  }
}

async function printFnsku(
  job: StaffPrintFnskuPayload,
  requestId: string,
  control: { checkpoint: () => Promise<boolean>; onPrinted: (done: number, total: number) => void },
): Promise<FnskuStationJobOutcome> {
  const refused = (failure: string): FnskuStationJobOutcome => ({ printed: 0, cancelled: false, failure });
  const res = await fetch(`/api/admin/fba-fnskus/${encodeURIComponent(job.fnsku)}`, { cache: 'no-store' });
  if (!res.ok) {
    return refused(
      res.status === 404
        ? `${job.fnsku} is not in the FBA catalog — nothing printed`
        : `Could not load ${job.fnsku} for its label (${res.status})`,
    );
  }
  const row = ((await res.json()) as { fnsku?: FnskuCatalogRow }).fnsku;
  if (!row?.fnsku) return refused(`Could not load ${job.fnsku} for its label`);

  // Dynamic on purpose: the bridge host mounts on every desk page, and a static
  // import would put bwip-js (~250 KB gz) in all of them — load it on the print.
  const { printFnskuLabelJob } = await import('@/lib/print/fnskuLabel');
  const run = await printFnskuLabelJob(
    {
      fnsku: row.fnsku,
      title: row.product_title ?? '',
      condition: row.condition ?? '',
      ...(job.test ? { mark: `TEST PRINT · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` } : {}),
    },
    job.copies,
    control,
  );

  // A test print is not a reprint: nothing is logged, so the reprint count stays true.
  if (job.test || run.printed === 0) return { printed: run.printed, cancelled: run.cancelled, failure: null };
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
          // A cancelled run logs the stickers that did print.
          copies: run.printed,
          isReprint: true,
          clientEventId: requestId,
        },
      ],
    }),
  });
  return {
    printed: run.printed,
    cancelled: run.cancelled,
    failure: ledger.ok ? null : `Printed ${row.fnsku}, but the print log did not record it (${ledger.status})`,
  };
}
