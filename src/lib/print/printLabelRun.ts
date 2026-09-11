/**
 * Confirmed print-run dispatch for warehouse location stickers.
 *
 * register → printLocationLabelsJob (USB sequential or multi-page iframe) →
 * POST /api/label-print-jobs (LOCATION). Ledger is best-effort after paper leaves.
 *
 * Callers: LabelPrintRunSheet confirm; useBinLabelPrinter / useRackLabelPrinter
 * (single + bulk). User: implement print-run plan §4.
 */

import type { LocationSegments, RackSegments } from '@/lib/barcode-routing';
import { rackToLocation } from '@/lib/barcode-routing';
import { locationLabelToFace, printLocationLabelsJob } from '@/lib/print/printLocationLabel';
import { safeRandomUUID } from '@/lib/safe-uuid';

export type PrintLabelRunResult = {
  status: 'printed' | 'skipped' | 'register_failed';
  channel?: 'usb' | 'iframe';
  count: number;
  error?: string;
};

export type PrintLabelRunProgress = (done: number, total: number) => void;

async function recordLocationPrintJobs(input: {
  segments: readonly LocationSegments[];
  roomName: string;
  gln: string;
  orgSlug?: string | null;
  templateId: 'location_bin' | 'location_rack';
}): Promise<void> {
  const batchId = safeRandomUUID();
  const jobs = input.segments.map((segments) => {
    const face = locationLabelToFace({
      segments,
      roomName: input.roomName,
      gln: input.gln,
      orgSlug: input.orgSlug,
    });
    const code = face.hri ?? face.matrix.value;
    return {
      jobType: 'LOCATION' as const,
      qrPayload: face.matrix.value,
      symbology: face.matrix.symbology,
      templateId: input.templateId,
      unitUid: code,
      copies: 1,
      clientEventId: `location-print:${batchId}:${code}`,
    };
  });
  if (jobs.length === 0) return;
  try {
    await fetch('/api/label-print-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs }),
    });
  } catch {
    /* ledger is best-effort; never block the physical print */
  }
}

/** Bin / qty-bin print run — register then silent 2×1 pipeline. */
export async function printBinLabelRun(input: {
  roomName: string;
  segments: readonly LocationSegments[];
  gln: string;
  orgSlug?: string | null;
  register: (room: string, segments: LocationSegments[]) => Promise<unknown>;
  onProgress?: PrintLabelRunProgress;
}): Promise<PrintLabelRunResult> {
  if (input.segments.length === 0) {
    return { status: 'skipped', count: 0 };
  }
  try {
    await input.register(input.roomName, [...input.segments]);
  } catch (err) {
    return {
      status: 'register_failed',
      count: 0,
      error: err instanceof Error ? err.message : 'Could not register location for printing',
    };
  }

  const channel = await printLocationLabelsJob({
    segments: input.segments,
    roomName: input.roomName,
    gln: input.gln,
    orgSlug: input.orgSlug,
    onProgress: input.onProgress,
  });
  if (channel === 'skipped') {
    return { status: 'skipped', count: 0 };
  }

  void recordLocationPrintJobs({
    segments: input.segments,
    roomName: input.roomName,
    gln: input.gln,
    orgSlug: input.orgSlug,
    templateId: 'location_bin',
  });

  return { status: 'printed', channel, count: input.segments.length };
}

/** Rack print run — position=0 segments. */
export async function printRackLabelRun(input: {
  roomName: string;
  racks: readonly RackSegments[];
  gln: string;
  orgSlug?: string | null;
  register: (room: string, racks: RackSegments[]) => Promise<unknown>;
  onProgress?: PrintLabelRunProgress;
}): Promise<PrintLabelRunResult> {
  if (input.racks.length === 0) {
    return { status: 'skipped', count: 0 };
  }
  try {
    await input.register(input.roomName, [...input.racks]);
  } catch (err) {
    return {
      status: 'register_failed',
      count: 0,
      error: err instanceof Error ? err.message : 'Could not register rack for printing',
    };
  }

  const segments = input.racks.map(rackToLocation);
  const channel = await printLocationLabelsJob({
    segments,
    roomName: input.roomName,
    gln: input.gln,
    orgSlug: input.orgSlug,
    onProgress: input.onProgress,
  });
  if (channel === 'skipped') {
    return { status: 'skipped', count: 0 };
  }

  void recordLocationPrintJobs({
    segments,
    roomName: input.roomName,
    gln: input.gln,
    orgSlug: input.orgSlug,
    templateId: 'location_rack',
  });

  return { status: 'printed', channel, count: segments.length };
}
