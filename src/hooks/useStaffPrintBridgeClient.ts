'use client';

/** Phone side of the staff print bridge: */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStaffPrintBridgeChannelName, printBridgeStaffId, safeChannelName } from '@/lib/realtime/channels';
import { sendToDevice, type SendToDeviceState } from '@/lib/realtime/device-handshake';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  STAFF_PRINT_JOB_EVENT,
  STAFF_PRINT_OPTIONS_PATCH_EVENT,
  STAFF_PRINT_PROGRESS_EVENT,
  STAFF_PRINT_STATUS_EVENT,
  STAFF_PRINT_STATUS_POLL_MS,
  STAFF_PRINT_STATUS_REQUEST_EVENT,
  parseStaffPrintStatus,
  resolveStaffPrintTarget,
  upsertStaffPrintStation,
  type StaffPrintJob,
  type StaffPrintJobBody,
  type StaffPrintOptionsPatch,
  type StaffPrintProgress,
  type StaffPrintStation,
} from '@/lib/print/staff-print-bridge';
import {
  printStationPickStorage,
  readRememberedPrintStationId,
  rememberPrintStationId,
} from '@/lib/print/print-station';

type StaffPrintPatch = Omit<StaffPrintOptionsPatch, 'type' | 'targetStationId'>;

/**
 * @param active poll the stations while true (a screen that only needs the
 * roster on some steps passes false elsewhere).
 */
export function useStaffPrintBridgeClient({ active = true }: { active?: boolean } = {}) {
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId ?? '';
  const staffId = user?.staffId ?? 0;
  const channelName = safeChannelName(() => getStaffPrintBridgeChannelName(orgId, printBridgeStaffId(staffId)));
  const enabled = !!channelName && staffId > 0;

  const [stations, setStations] = useState<StaffPrintStation[]>([]);
  const [rememberedId, setRememberedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<SendToDeviceState>('idle');
  const [progress, setProgress] = useState<StaffPrintProgress | null>(null);
  const requestIdRef = useRef<string | null>(null);

  // The pick belongs to the staffer on this device; a staff switch reloads it.
  useEffect(() => {
    setRememberedId(readRememberedPrintStationId(printStationPickStorage(), orgId, staffId));
  }, [orgId, staffId]);

  useAblyChannel(
    channelName,
    STAFF_PRINT_STATUS_EVENT,
    (message) => {
      const next = parseStaffPrintStatus(message?.data);
      if (!next) return;
      const at = Date.now();
      setNow(at);
      setStations((prev) => upsertStaffPrintStation(prev, next, at));
    },
    enabled,
  );

  useAblyChannel(
    channelName,
    STAFF_PRINT_PROGRESS_EVENT,
    (message) => {
      const data = message?.data as StaffPrintProgress | undefined;
      if (data?.type === 'staff.print_progress' && data.request_id === requestIdRef.current) setProgress(data);
    },
    enabled,
  );

  const publish = useCallback(
    async (event: string, data: object) => {
      const client = await getClient();
      const channel = client?.channels.get(channelName);
      if (!channel) throw new Error('print channel unavailable');
      await channel.publish(event, data);
    },
    [channelName, getClient],
  );

  const requestStatus = useCallback(async () => {
    if (!enabled) return;
    setNow(Date.now());
    try {
      await publish(STAFF_PRINT_STATUS_REQUEST_EVENT, { type: 'staff.print_status_request' });
    } catch {
      /* best-effort — the picker keeps showing who it last heard */
    }
  }, [enabled, publish]);

  useEffect(() => {
    if (!active) return;
    void requestStatus();
    const timer = window.setInterval(() => void requestStatus(), STAFF_PRINT_STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, requestStatus]);

  const target = resolveStaffPrintTarget(stations, rememberedId, now);
  const targetStationId = target?.status.stationId ?? null;

  const pickStation = useCallback(
    (stationId: string | null) => {
      setRememberedId(stationId);
      rememberPrintStationId(printStationPickStorage(), orgId, staffId, stationId);
    },
    [orgId, staffId],
  );

  /** Change the picked station's silent flag / printer routing, then re-read it. */
  const patchStation = useCallback(
    async (patch: StaffPrintPatch): Promise<boolean> => {
      if (!targetStationId) return false;
      const wire: StaffPrintOptionsPatch = { type: 'staff.print_options_patch', targetStationId, ...patch };
      try {
        await publish(STAFF_PRINT_OPTIONS_PATCH_EVENT, wire);
      } catch {
        return false;
      }
      await requestStatus();
      return true;
    },
    [publish, requestStatus, targetStationId],
  );

  /** Send one job to the picked station; resolves true when that station acked it. */
  const sendJob = useCallback(
    async (body: StaffPrintJobBody): Promise<boolean> => {
      const client = enabled && targetStationId ? await getClient() : null;
      const channel = client?.channels.get(channelName);
      if (!channel || !targetStationId) {
        setState('timed_out');
        return false;
      }
      const requestId = safeRandomUUID();
      const job: StaffPrintJob = { ...body, type: 'staff.print_job', request_id: requestId, targetStationId };
      requestIdRef.current = requestId;
      setProgress(null);
      setState('request_sent');
      try {
        const acked = await sendToDevice({
          channel,
          requestId,
          publish: () => channel.publish(STAFF_PRINT_JOB_EVENT, job),
        });
        setState(acked ? 'peer_active' : 'timed_out');
        return acked;
      } catch {
        setState('timed_out');
        return false;
      }
    },
    [channelName, enabled, getClient, targetStationId],
  );

  return {
    /** Every station heard from, this device excluded, sorted by name. */
    stations,
    /** The station this staffer last picked on this device (may be unheard yet). */
    rememberedId,
    /** The station jobs go to right now (remembered pick, else the only live one). */
    target,
    /** Clock the roster's liveness is judged against; advances on each poll. */
    now,
    state,
    pending: state === 'request_sent',
    progress,
    pickStation,
    requestStatus,
    patchStation,
    sendJob,
  };
}
