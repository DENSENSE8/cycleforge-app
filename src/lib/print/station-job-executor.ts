/**
 * Station print executor — what THIS browser does with a staff print job, by
 * grain. Split out of the print-bridge host (mounted on every desktop page) and
 * loaded on the first job: the label pipelines pull the barcode renderer
 * (bwip-js, ~0.9 MB) that no page load should pay for.
 */

import { toast } from '@/lib/toast';
import type { RackSegments } from '@/lib/barcode-routing';
import { beginWork } from '@/lib/background-work/store';
import type { StaffPrintJob } from '@/lib/print/staff-print-bridge';
import { readPrintStation } from '@/lib/print/print-station';
import {
  printBinLabelRun,
  printHandlingUnitLabelRun,
  printRackLabelRun,
} from '@/lib/print/printLabelRun';
import { mintTotesForPrint, toteReprintFromTyped } from '@/lib/print/tote-mint-api';
import { platesPerTote } from '@/lib/print/labelCopies';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import { registerRackLocations } from '@/components/barcode/rack-printer/rack-printer-api';
import { triggerPackPrintBundle } from '@/lib/print/pack-print-bundle-client';
import { printRepairStationJob } from '@/lib/print/printRepairStationJob';
import { printFnskuStationJob } from '@/lib/print/printFnskuStationJob';
import { printQcLabelStationJob } from '@/lib/print/printQcLabel';
import { deskDocumentsFromStation } from '@/lib/print/print-station-documents';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import { printDocuments } from '@/lib/label-prints/print-labels';

export async function executeStationPrintJob(
  job: StaffPrintJob,
  { workId, onProgress }: { workId: string; onProgress: (done: number, total: number) => void },
): Promise<void> {
  // documents · tote · rack · bin · fnsku run through a print choke point
  // that reports to the header itself; papers and repair report here.
  if (job.grain === 'documents' && job.documents) {
    // The one desk pipeline: rebuilt from ids, routed and logged HERE, as this station.
    const docs = deskDocumentsFromStation(job.documents);
    const station = readPrintStation();
    const outcome = await printDocuments(docs, currentPrintRoute, { onProgress, station, workId });
    if (outcome.failed.length > 0) {
      const [first] = outcome.failed;
      toast.error(`${outcome.failed.length} of ${docs.length} did not print — ${first.doc.title}: ${first.reason}`);
    }
    if (outcome.logError) toast.error(outcome.logError);
    return;
  }

  if (job.grain === 'papers' && job.papers) {
    const { orderRowIds, packerLogId, reprint, documents, batchId } = job.papers;
    const work = beginWork({ kind: 'print', label: 'Order papers', total: orderRowIds.length });
    let failed = 0;
    // One order at a time, one tick each: the sender's progress is orders printed.
    for (const [i, orderRowId] of orderRowIds.entries()) {
      try {
        const result = await triggerPackPrintBundle({ orderRowId, packerLogId, reprint, documentTypes: documents, batchId });
        if (result.status === 'failed' || result.status === 'missing') {
          failed += 1;
          toast.error(result.message);
        }
      } catch (err) {
        failed += 1;
        toast.error(err instanceof Error ? err.message : 'Could not print the order papers');
      }
      work.progress(i + 1, orderRowIds.length);
      onProgress(i + 1, orderRowIds.length);
    }
    if (failed === orderRowIds.length) work.fail(`${failed} of ${orderRowIds.length} did not print`);
    else work.finish(failed > 0 ? `${orderRowIds.length - failed} printed, ${failed} failed` : `${orderRowIds.length} printed`);
    return;
  }

  if (job.grain === 'repair' && job.repair) {
    const work = beginWork({ kind: 'print', label: 'Repair label' });
    const error = await printRepairStationJob(job.repair, job.request_id).catch((err: unknown) =>
      err instanceof Error ? err.message : 'Could not print the repair label',
    );
    if (error) {
      work.fail(error);
      toast.error(error);
    } else work.finish('Printed');
    return;
  }

  if (job.grain === 'fnsku' && job.fnsku) {
    const outcome = await printFnskuStationJob(job.fnsku, job.request_id, { workId, onProgress });
    if (outcome.failure) toast.error(outcome.failure);
    return;
  }

  if (job.grain === 'qc_label' && job.qcLabel) {
    const error = await printQcLabelStationJob(job.qcLabel, job.request_id);
    if (error) toast.error(error);
    return;
  }

  if (job.grain === 'tote' && job.tote) {
    const copies = platesPerTote(job.tote.copiesPerSide);
    try {
      const result = job.tote.codes
        ? await printHandlingUnitLabelRun({
            copies,
            boxes: job.tote.codes.map(toteReprintFromTyped),
            onProgress,
          })
        : await printHandlingUnitLabelRun({
            count: job.tote.count,
            copies,
            mint: (n) => mintTotesForPrint(n, job.request_id),
            onProgress,
          });
      // A one-plate run prints without ticking; the sender still hears it finish.
      if (result.status === 'printed') onProgress(result.count, result.count);
      if (result.status === 'mint_failed') {
        toast.error(result.error || 'Could not mint totes — nothing printed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not print tote labels');
    }
    return;
  }

  const loc = job.location;
  if (!loc) return;

  if (job.grain === 'rack') {
    const racks: RackSegments[] = loc.segments.map((s) => ({
      zone: String(s.zone),
      aisle: Number(s.aisle),
      bay: Number(s.bay),
      level: Number(s.level),
    }));
    await printRackLabelRun({
      roomName: loc.roomName,
      racks,
      gln: loc.gln,
      orgSlug: loc.orgSlug,
      register: registerRackLocations,
      onProgress,
    });
    return;
  }

  await printBinLabelRun({
    roomName: loc.roomName,
    segments: loc.segments,
    gln: loc.gln,
    orgSlug: loc.orgSlug,
    register: registerLocations,
    onProgress,
  });
}
