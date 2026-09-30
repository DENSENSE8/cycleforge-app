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
  STAFF_PRINT_CONTROL_EVENT,
  STAFF_PRINT_JOB_EVENT,
  STAFF_PRINT_OPTIONS_PATCH_EVENT,
  STAFF_PRINT_PROGRESS_EVENT,
  STAFF_PRINT_STATUS_EVENT,
  STAFF_PRINT_STATUS_POLL_MS,
  STAFF_PRINT_STATUS_REQUEST_EVENT,
  parseStaffPrintControl,
  parseStaffPrintJob,
  parseStaffPrintOptionsPatch,
  thisDeviceCanFulfillPrintJob,
  isPrintStation,
  UNNAMED_PRINT_STATION,
  type StaffPrintJob,
  type StaffPrintProgress,
  type StaffPrintStatus,
} from '@/lib/print/staff-print-bridge';
import { getProfileForRole, listProfiles, setRoute } from '@/lib/print/browserPrint';
import { isSilentPrintEnabled, setSilentPrintEnabled, SILENT_PRINT_CHANGED_EVENT } from '@/lib/print/printMode';
import { PRINT_STATION_CHANGED_EVENT, readPrintStation, runPrintJobOnce, setPrintStationName } from '@/lib/print/print-station';
import { sendPrintStationHeartbeat } from '@/lib/print/print-station-registry-client';
import { cancelWork, isLiveWork, pauseWork, readWork, resumeWork, watchWork } from '@/lib/background-work/store';

/** The header item of a job this station prints for a sender, keyed so the sender's controls find it. */
const stationWorkId = (requestId: string) => `print:station:${requestId}`;

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
      const { name } = await sendPrintStationHeartbeat({
        stationId: status.stationId,
        stationName: status.stationName,
        label: { ready: status.label.ready, printer: status.label.name?.trim().slice(0, 120) || null },
        paper: { ready: status.paper.ready, printer: status.paper.name?.trim().slice(0, 120) || null },
      });
      // The registry owns the name (an org rename lands here); adopting it fires
      // PRINT_STATION_CHANGED, so the bridge status carries it too. Same name → no event, no loop.
      if (name !== status.stationName) setPrintStationName(name === UNNAMED_PRINT_STATION ? '' : name);
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

  // A sender pausing, resuming or cancelling a job it sent here. Only the tab
  // printing it holds the item; every other tab finds nothing and stays quiet.
  const onControl = (message: { data?: unknown } | undefined) => {
    const control = parseStaffPrintControl(message?.data);
    if (!control || control.targetStationId !== readPrintStation().id) return;
    const id = stationWorkId(control.request_id);
    if (control.action === 'pause') pauseWork(id);
    else if (control.action === 'resume') resumeWork(id);
    else cancelWork(id);
  };
  useAblyChannel(channelName, STAFF_PRINT_CONTROL_EVENT, onControl, !!channelName && staffId > 0);
  useAblyChannel(stationChannelName, STAFF_PRINT_CONTROL_EVENT, onControl, !!stationChannelName);

  /** `via` is the channel the job came in on — its ack and progress go back there. */
  async function runJob(job: StaffPrintJob, via: string) {
    if (!thisDeviceCanFulfillPrintJob(job, snapshotStatus())) return;
    // Every tab of this browser is this station; only the one that claims the
    // job acks and prints it.
    await runPrintJobOnce(job.request_id, () => printJob(job, via));
  }

  async function printJob(job: StaffPrintJob, via: string) {
    busyRef.current = true;
    const workId = stationWorkId(job.request_id);
    let stopMirror = () => {};
    try {
      const client = await getClient();
      const channel = client?.channels.get(via) ?? null;
      await publishDeviceAck(channel, job.request_id, 'print_job');

      const publishProgress = (progress: Omit<StaffPrintProgress, 'type' | 'request_id'>) => {
        void channel?.publish(STAFF_PRINT_PROGRESS_EVENT, { type: 'staff.print_progress', request_id: job.request_id, ...progress });
      };
      // Every tick carries where the job stands, so a sender that paused before the job landed here re-syncs.
      const onProgress = (done: number, total: number) => {
        const item = readWork(workId);
        publishProgress({ done, total, ...(item && isLiveWork(item.status) ? { state: item.status } : {}) });
      };
      // A pause, resume, cancel or finish of the job's header item reaches the sender as it happens.
      let lastState = 'running';
      stopMirror = watchWork(workId, (item) => {
        if (item.status === lastState) return;
        lastState = item.status;
        publishProgress({
          done: item.done ?? 0,
          total: item.total ?? 0,
          state: item.status,
          ...(item.message && !isLiveWork(item.status) ? { message: item.message } : {}),
        });
      });

      // documents · tote · rack · bin · fnsku · papers · repair · qc — one executor,
      // loaded on the first job (it carries the label renderers).
      const { executeStationPrintJob } = await import('@/lib/print/station-job-executor');
      await executeStationPrintJob(job, { workId, onProgress });
    } finally {
      stopMirror();
      busyRef.current = false;
    }
  }
}

export function StaffPrintBridgeMount() {
  useStaffPrintBridgeHost();
  return null;
}
