'use client';

/** Silent-print host — this browser's print station. */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  getPrintStationChannelName,
  getStaffPrintBridgeChannelName,
  printBridgeStaffId,
  safeChannelName,
} from '@/lib/realtime/channels';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import {
  STAFF_PRINT_JOB_EVENT,
  STAFF_PRINT_OPTIONS_PATCH_EVENT,
  STAFF_PRINT_PROGRESS_EVENT,
  STAFF_PRINT_STATUS_EVENT,
  STAFF_PRINT_STATUS_POLL_MS,
  STAFF_PRINT_STATUS_REQUEST_EVENT,
  parseStaffPrintJob,
  parseStaffPrintOptionsPatch,
  thisDeviceCanFulfillPrintJob,
  isPrintStation,
  type StaffPrintJob,
  type StaffPrintStatus,
} from '@/lib/print/staff-print-bridge';
import { getProfileForRole, listProfiles, setRoute } from '@/lib/print/browserPrint';
import { isSilentPrintEnabled, setSilentPrintEnabled, SILENT_PRINT_CHANGED_EVENT } from '@/lib/print/printMode';
import { PRINT_STATION_CHANGED_EVENT, readPrintStation, runPrintJobOnce } from '@/lib/print/print-station';
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
import { deskDocumentsFromStation } from '@/lib/print/print-station-documents';
import { sendPrintStationHeartbeat } from '@/lib/print/print-station-registry-client';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import { printDocuments } from '@/lib/label-prints/print-labels';
import type { RackSegments } from '@/lib/barcode-routing';
import { toast } from '@/lib/toast';

/** A desk browser (fine pointer) can always print through its own print path: */
function deskBrowserCanPrint(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true;
}

function snapshotStatus(): StaffPrintStatus {
  const label = getProfileForRole('label');
  const paper = getProfileForRole('paper');
  const silent = isSilentPrintEnabled();
  const station = readPrintStation();
  const labelUsb =
    !!label && label.kind !== 'os' && label.language !== 'none';
  const browserPrint = deskBrowserCanPrint();
  return {
    type: 'staff.print_status',
    stationId: station.id,
    stationName: station.name,
    silent,
    label: {
      ready: silent && (labelUsb || browserPrint),
      name: label?.name ?? null,
      kind: label?.kind ?? null,
      profileId: label?.id ?? null,
    },
    paper: {
      ready: silent && (!!paper || browserPrint),
      name: paper?.name ?? null,
      kind: paper?.kind ?? null,
      profileId: paper?.id ?? null,
    },
    profiles: listProfiles().map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      kind: p.kind,
    })),
  };
}

function useStaffPrintBridgeHost() {
  const { user, has } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const channelName = safeChannelName(() =>
    getStaffPrintBridgeChannelName(orgId ?? '', printBridgeStaffId(staffId)),
  );
  // The org registry + per-station channel: anyone who may print reaches THIS
  // computer by its station id. The id is minted once per browser and never changes.
  const orgStations = staffId > 0 && has('print.label');
  const [stationId] = useState(() => readPrintStation().id);
  const stationChannelName =
    orgStations && stationId ? safeChannelName(() => getPrintStationChannelName(orgId ?? '', stationId)) : '';
  const busyRef = useRef(false);

  const publishStatus = async () => {
    if (!channelName) return;
    const status = snapshotStatus();
    // Not a station (a phone with nothing paired): say nothing, so a desk tab
    // sharing this browser's station id is never shadowed by it.
    if (!isPrintStation(status)) return;
    try {
      const client = await getClient();
      const channel = client?.channels.get(channelName);
      await channel?.publish(STAFF_PRINT_STATUS_EVENT, status);
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    void publishStatus();
    const republish = () => void publishStatus();
    window.addEventListener(SILENT_PRINT_CHANGED_EVENT, republish);
    window.addEventListener(PRINT_STATION_CHANGED_EVENT, republish);
    return () => {
      window.removeEventListener(SILENT_PRINT_CHANGED_EVENT, republish);
      window.removeEventListener(PRINT_STATION_CHANGED_EVENT, republish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);

  /** Tell the org registry this computer is a print station, and what it can print now. */
  const heartbeat = async () => {
    const status = snapshotStatus();
    if (!status.stationId || !isPrintStation(status)) return;
    try {
      await sendPrintStationHeartbeat({
        stationId: status.stationId,
        stationName: status.stationName,
        label: { ready: status.label.ready, printer: status.label.name?.trim().slice(0, 120) || null },
        paper: { ready: status.paper.ready, printer: status.paper.name?.trim().slice(0, 120) || null },
      });
    } catch {
      /* best-effort — the registry shows it offline until the next beat lands */
    }
  };

  useEffect(() => {
    if (!orgStations) return;
    const beat = () => void heartbeat();
    beat();
    window.addEventListener(SILENT_PRINT_CHANGED_EVENT, beat);
    window.addEventListener(PRINT_STATION_CHANGED_EVENT, beat);
    const timer = window.setInterval(beat, STAFF_PRINT_STATUS_POLL_MS);
    return () => {
      window.removeEventListener(SILENT_PRINT_CHANGED_EVENT, beat);
      window.removeEventListener(PRINT_STATION_CHANGED_EVENT, beat);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgStations]);

  useAblyChannel(
    channelName,
    STAFF_PRINT_STATUS_REQUEST_EVENT,
    () => {
      void publishStatus();
    },
    !!channelName && staffId > 0,
  );

  useAblyChannel(
    channelName,
    STAFF_PRINT_OPTIONS_PATCH_EVENT,
    (message) => {
      const patch = parseStaffPrintOptionsPatch(message?.data);
      // Routing is per station: only the addressed computer changes its printers.
      if (!patch || patch.targetStationId !== readPrintStation().id) return;
      if (typeof patch.silent === 'boolean') setSilentPrintEnabled(patch.silent);
      if (patch.routing) {
        if ('label' in patch.routing) setRoute('label', patch.routing.label ?? null);
        if ('paper' in patch.routing) setRoute('paper', patch.routing.paper ?? null);
      }
      void publishStatus();
    },
    !!channelName && staffId > 0,
  );

  useAblyChannel(
    channelName,
    STAFF_PRINT_JOB_EVENT,
    (message) => {
      const job = parseStaffPrintJob(message?.data);
      if (!job || busyRef.current) return;
      void runJob(job, channelName);
    },
    !!channelName && staffId > 0,
  );

  // Jobs any staffer addressed to this station by name, over the org channel.
  useAblyChannel(
    stationChannelName,
    STAFF_PRINT_JOB_EVENT,
    (message) => {
      const job = parseStaffPrintJob(message?.data);
      if (!job || busyRef.current) return;
      void runJob(job, stationChannelName);
    },
    !!stationChannelName,
  );

  /** `via` is the channel the job came in on — its ack and progress go back there. */
  async function runJob(job: StaffPrintJob, via: string) {
    if (!thisDeviceCanFulfillPrintJob(job, snapshotStatus())) return;
    // Every tab of this browser is this station; only the one that claims the
    // job acks and prints it.
    await runPrintJobOnce(job.request_id, () => printJob(job, via));
  }

  async function printJob(job: StaffPrintJob, via: string) {
    busyRef.current = true;
    try {
      const client = await getClient();
      const channel = client?.channels.get(via) ?? null;
      await publishDeviceAck(channel, job.request_id, 'print_job');

      const onProgress = (done: number, total: number) => {
        void channel?.publish(STAFF_PRINT_PROGRESS_EVENT, {
          type: 'staff.print_progress',
          request_id: job.request_id,
          done,
          total,
        });
      };

      if (job.grain === 'documents' && job.documents) {
        // The one desk pipeline: rebuilt from ids, routed and logged HERE, as this station.
        const docs = deskDocumentsFromStation(job.documents);
        const station = readPrintStation();
        const outcome = await printDocuments(docs, currentPrintRoute, { onProgress, station });
        if (outcome.failed.length > 0) {
          const [first] = outcome.failed;
          toast.error(`${outcome.failed.length} of ${docs.length} did not print — ${first.doc.title}: ${first.reason}`);
        }
        if (outcome.logError) toast.error(outcome.logError);
        return;
      }

      if (job.grain === 'papers' && job.papers) {
        const { orderRowIds, packerLogId, reprint, documents, batchId } = job.papers;
        // One order at a time, one tick each: the sender's progress is orders printed.
        for (const [i, orderRowId] of orderRowIds.entries()) {
          try {
            const result = await triggerPackPrintBundle({ orderRowId, packerLogId, reprint, documentTypes: documents, batchId });
            if (result.status === 'failed' || result.status === 'missing') toast.error(result.message);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not print the order papers');
          }
          onProgress(i + 1, orderRowIds.length);
        }
        return;
      }

      if (job.grain === 'repair' && job.repair) {
        const error = await printRepairStationJob(job.repair, job.request_id);
        if (error) toast.error(error);
        return;
      }

      if (job.grain === 'fnsku' && job.fnsku) {
        const error = await printFnskuStationJob(job.fnsku, job.request_id);
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
    } finally {
      busyRef.current = false;
    }
  }
}

export function StaffPrintBridgeMount() {
  useStaffPrintBridgeHost();
  return null;
}
