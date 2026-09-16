/**
 * Confirmed print-run dispatch for warehouse stickers.
 *
 * Location: register → printLocationLabelsJob → POST /api/label-print-jobs.
 * Tote:     mint     → printLabelFacesJob    → POST /api/label-print-jobs.
 *
 * Both shapes are the same law: the physical identity must EXIST before its
 * sticker leaves the printer, or the floor ends up holding paper that scans to
 * nothing. Locations register a code the builder derived; totes mint rows and
 * read `H-{id}` back, because that code is a database serial. The ledger POST
 * is best-effort in both cases — it runs after paper has already moved.
 *
 * Callers: LabelPrintRunSheet confirm; useBinLabelPrinter / useRackLabelPrinter
 * (single + bulk); the /m/print Totes grain.
 */

import type { LocationSegments, RackSegments } from '@/lib/barcode-routing';
import type { LabelFaceModel } from '@/lib/print/labelFace';
import { rackToLocation } from '@/lib/barcode-routing';
import { locationLabelToFace, printLocationLabelsJob } from '@/lib/print/printLocationLabel';
import {
  handlingUnitLabelToFace,
  type HandlingUnitLabelPayload,
} from '@/lib/print/printHandlingUnitLabel';
import { printLabelFacesJob } from '@/lib/print/printLabelFacesJob';
import { clampLabelCopies, platesPerTote, DEFAULT_TOTE_COPIES_PER_SIDE } from '@/lib/print/labelCopies';
import { safeRandomUUID } from '@/lib/safe-uuid';

export type PrintLabelRunResult = {
  status: 'printed' | 'skipped' | 'register_failed' | 'mint_failed';
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

/**
 * Bulk tote (handling-unit) print run — mint N boxes, then print their `H-{id}`
 * plates as ONE batched job.
 *
 * Minting is a callback rather than a fetch in here for the same reason
 * `register` is on the location runs: this module owns the print channel and
 * the ledger, not the warehouse's write API. It also keeps the whole run
 * honest — a mint failure returns `mint_failed` and NOTHING prints, so an
 * operator never peels a plate whose row does not exist.
 */
export async function printHandlingUnitLabelRun(input: {
  count?: number;
  /** Mints `count` boxes server-side and resolves to their label payloads. */
  mint?: (count: number) => Promise<readonly HandlingUnitLabelPayload[]>;
  /** Reprint — skip mint and print these identities. */
  boxes?: readonly HandlingUnitLabelPayload[];
  /** Identical stickers per tote identity (the Copies field). */
  copies?: number;
  onProgress?: PrintLabelRunProgress;
}): Promise<PrintLabelRunResult> {
  const copiesPerIdentity = clampLabelCopies(
    input.copies ?? platesPerTote(DEFAULT_TOTE_COPIES_PER_SIDE),
  );

  let boxes: readonly HandlingUnitLabelPayload[];
  if (input.boxes && input.boxes.length > 0) {
    boxes = input.boxes;
  } else {
    const count = input.count;
    const mint = input.mint;
    if (!mint || count == null || !Number.isFinite(count) || count < 1) {
      return { status: 'skipped', count: 0 };
    }
    try {
      boxes = await mint(Math.floor(count));
    } catch (err) {
      return {
        status: 'mint_failed',
        count: 0,
        error: err instanceof Error ? err.message : 'Could not mint totes for printing',
      };
    }
  }
  if (boxes.length === 0) {
    return { status: 'skipped', count: 0 };
  }

  const faces = boxes.map(handlingUnitLabelToFace);
  const channel = await printLabelFacesJob({
    faces,
    name: 'Tote labels',
    faceName: (face) => `Tote ${face.center}`.trim(),
    copies: copiesPerIdentity,
    onProgress: input.onProgress,
  });
  if (channel === 'skipped') {
    return { status: 'skipped', count: 0 };
  }

  void recordHandlingUnitPrintJobs(boxes, faces, copiesPerIdentity);

  return { status: 'printed', channel, count: boxes.length * copiesPerIdentity };
}

async function recordHandlingUnitPrintJobs(
  boxes: readonly HandlingUnitLabelPayload[],
  faces: readonly LabelFaceModel[],
  copies: number,
): Promise<void> {
  const batchId = safeRandomUUID();
  const jobs = boxes.map((box, i) => {
    const face = faces[i]!;
    return {
      jobType: 'HANDLING_UNIT' as const,
      handlingUnitId: box.handlingUnitId,
      qrPayload: face.matrix.value,
      symbology: face.matrix.symbology,
      templateId: 'handling_unit_lpn',
      unitUid: face.center,
      copies,
      clientEventId: `tote-print:${batchId}:${face.matrix.value}`,
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
