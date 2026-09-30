'use client';

/**
 * Every print station this staffer can send to — the org registry (HTTP; any
 * staffer's station) ∪ the staffer's own roster (Ably) — and which one prints
 * each stock: this device's per-stock pick › the org's assignment › this
 * computer. When the target is this computer the desk prints locally; any
 * other station gets a job over its org station channel (`documents` from the
 * desks, `fnsku` from the Print station).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { useStaffPrintBridgeClient } from '@/hooks/useStaffPrintBridgeClient';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import type { PrintStock } from '@/lib/label-prints/print-route';
import {
  PRINT_STATION_CHANGED_EVENT,
  printStationPickStorage,
  readPrintStation,
  readRememberedPrintStationId,
  rememberPrintStationId,
} from '@/lib/print/print-station';
import {
  fetchPrintStations,
  PRINT_STATIONS_QUERY_KEY,
  putPrintStationAssignment,
  putPrintStationName,
  renameThisPrintStation,
} from '@/lib/print/print-station-registry-client';
import type { PrintStationAssignment, PrintStationRegistry } from '@/lib/print/print-station-registry-contracts';
import { SILENT_PRINT_CHANGED_EVENT } from '@/lib/print/printMode';
import {
  STAFF_PRINT_CONTROL_EVENT,
  STAFF_PRINT_JOB_EVENT,
  STAFF_PRINT_PROGRESS_EVENT,
  STAFF_PRINT_STATUS_POLL_MS,
  UNNAMED_PRINT_STATION,
  isStaffPrintStationLive,
  parseStaffPrintProgress,
  roleReady,
  type StaffPrintControl,
  type StaffPrintJob,
  type StaffPrintJobBody,
  type StationDocumentRef,
} from '@/lib/print/staff-print-bridge';
import { getPrintStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { sendToDevice } from '@/lib/realtime/device-handshake';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { beginWork } from '@/lib/background-work/store';

type StockFace = { ready: boolean; printer: string | null };

export interface PrintStationEntry {
  stationId: string;
  stationName: string;
  thisComputer: boolean;
  /** Where this station was heard: the org registry, the staffer's own roster, or both. */
  sources: Array<'org' | 'staff'>;
  live: boolean;
  lastSeenAt: number | null;
  /** The staffer signed in on that computer at its last org heartbeat — who is at that table. */
  lastSeenStaffId: number | null;
  label: StockFace;
  paper: StockFace;
}

const NO_ASSIGNMENT: PrintStationAssignment = { label: null, paper: null };
const NO_PICKS: Record<PrintStock, string | null> = { label: null, paper: null };
/** How long a sender keeps listening for a station's progress after it acked. */
const PROGRESS_LISTEN_MS = 10 * 60_000;

/** This computer prints locally, so each stock is always printable here (the dialog is the floor). */
function localFaces(): Record<PrintStock, StockFace> {
  return {
    label: { ready: true, printer: currentPrintRoute('label').printerName },
    paper: { ready: true, printer: currentPrintRoute('paper').printerName },
  };
}

/** Where each stock prints, the roster to pick from, and the one way to send a station a batch. */
export interface PrintStations {
  /** This computer first, then the org registry ∪ the staffer's own roster, deduped by id. */
  stations: PrintStationEntry[];
  thisStationId: string;
  /** Per stock: this staffer's pick on this device › the org assignment › this computer. */
  target: Record<PrintStock, PrintStationEntry | null>;
  orgAssignment: PrintStationAssignment;
  pick: (stock: PrintStock, stationId: string | null) => void;
  setOrgAssignment: (stock: PrintStock, stationId: string | null) => Promise<void>;
  /** May this staffer rename OTHER computers (Hardware settings)? Anyone may name this one. */
  canRenameOthers: boolean;
  /** Rename a station for the whole org (empty = unnamed); rejects with the server's reason. */
  rename: (stationId: string, name: string) => Promise<void>;
  /** Why a stock cannot go to its target right now; null when it can. */
  blockedReason: (stock: PrintStock) => string | null;
  /** One bridge job to a named station; resolves true when that station acked it. */
  sendDocuments: (
    stationId: string,
    stock: PrintStock,
    batchId: string,
    items: StationDocumentRef[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<boolean>;
  /**
   * `copies` (1–99) FBA labels of one FNSKU at a named station; resolves true when it acked.
   * `test`: a test print — marked face, no reprint logged.
   */
  sendFnsku: (stationId: string, fnsku: string, copies: number, options?: { test?: boolean }) => Promise<boolean>;
  /** One unit's QC label (`unitKey` = `qcLabelWireKey`) at a named station; resolves true when it acked. */
  sendQcLabel: (stationId: string, unitKey: string) => Promise<boolean>;
}

/** @param active poll the org registry and the staff roster while true. */
export function usePrintStations({ active = true }: { active?: boolean } = {}): PrintStations {
  const { user, has } = useAuth();
  const { getClient } = useAblyClient();
  const queryClient = useQueryClient();
  const orgId = user?.organizationId ?? '';
  const staffId = user?.staffId ?? 0;
  // The org registry and station channels share one grant (`print.label`).
  const orgEnabled = staffId > 0 && has('print.label');

  const bridge = useStaffPrintBridgeClient({ active });
  const registryQuery = useQuery({
    queryKey: PRINT_STATIONS_QUERY_KEY,
    queryFn: fetchPrintStations,
    enabled: active && orgEnabled,
    refetchInterval: STAFF_PRINT_STATUS_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const registry = registryQuery.data;

  // This computer's station + local routes are browser storage: read after mount, re-read on change.
  const [self, setSelf] = useState<{ id: string; name: string }>({ id: '', name: UNNAMED_PRINT_STATION });
  const [local, setLocal] = useState<Record<PrintStock, StockFace> | null>(null);
  useEffect(() => {
    const refresh = () => {
      setSelf(readPrintStation());
      setLocal(localFaces());
    };
    refresh();
    window.addEventListener(PRINT_STATION_CHANGED_EVENT, refresh);
    window.addEventListener(SILENT_PRINT_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(PRINT_STATION_CHANGED_EVENT, refresh);
      window.removeEventListener(SILENT_PRINT_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // The per-stock pick belongs to the staffer on this device; a staff switch reloads it.
  const [picks, setPicks] = useState<Record<PrintStock, string | null>>(NO_PICKS);
  useEffect(() => {
    const storage = printStationPickStorage();
    setPicks({
      label: readRememberedPrintStationId(storage, orgId, staffId, 'label'),
      paper: readRememberedPrintStationId(storage, orgId, staffId, 'paper'),
    });
  }, [orgId, staffId]);

  const stations = useMemo<PrintStationEntry[]>(() => {
    const byId = new Map<string, PrintStationEntry>();
    for (const s of registry?.stations ?? []) {
      byId.set(s.stationId, {
        stationId: s.stationId,
        stationName: s.name,
        thisComputer: false,
        sources: ['org'],
        live: s.online,
        lastSeenAt: Date.parse(s.lastSeenAt),
        lastSeenStaffId: s.lastSeenStaffId,
        label: s.label,
        paper: s.paper,
      });
    }
    for (const s of bridge.stations) {
      const { status } = s;
      const heard: PrintStationEntry = {
        stationId: status.stationId,
        stationName: status.stationName,
        thisComputer: false,
        sources: ['staff'],
        live: isStaffPrintStationLive(s, bridge.now),
        lastSeenAt: s.lastSeenAt,
        lastSeenStaffId: null,
        label: { ready: roleReady(status, 'label'), printer: status.label.name },
        paper: { ready: roleReady(status, 'paper'), printer: status.paper.name },
      };
      const org = byId.get(status.stationId);
      if (!org) {
        byId.set(status.stationId, heard);
        continue;
      }
      // Both heard it: the fresher report names it and says what it can print.
      const fresher = s.lastSeenAt >= (org.lastSeenAt ?? 0) ? heard : org;
      byId.set(status.stationId, {
        ...fresher,
        sources: ['org', 'staff'],
        live: org.live || heard.live,
        lastSeenAt: Math.max(org.lastSeenAt ?? 0, s.lastSeenAt),
        lastSeenStaffId: org.lastSeenStaffId,
      });
    }
    const heardSelf = byId.get(self.id);
    byId.delete(self.id);
    const others = [...byId.values()].sort(
      (a, b) => a.stationName.localeCompare(b.stationName) || a.stationId.localeCompare(b.stationId),
    );
    if (!self.id) return others;
    const faces = local ?? { label: { ready: true, printer: null }, paper: { ready: true, printer: null } };
    const me: PrintStationEntry = {
      stationId: self.id,
      stationName: self.name,
      thisComputer: true,
      sources: heardSelf?.sources ?? [],
      live: true,
      lastSeenAt: heardSelf?.lastSeenAt ?? null,
      lastSeenStaffId: staffId || null,
      label: faces.label,
      paper: faces.paper,
    };
    return [me, ...others];
  }, [registry, bridge.stations, bridge.now, self, local, staffId]);

  const orgAssignment = registry?.assignment ?? NO_ASSIGNMENT;

  const target = useMemo<Record<PrintStock, PrintStationEntry | null>>(() => {
    const byId = (id: string | null) => (id ? (stations.find((s) => s.stationId === id) ?? null) : null);
    const thisComputer = stations.find((s) => s.thisComputer) ?? null;
    return {
      label: byId(picks.label) ?? byId(orgAssignment.label) ?? thisComputer,
      paper: byId(picks.paper) ?? byId(orgAssignment.paper) ?? thisComputer,
    };
  }, [stations, picks, orgAssignment]);

  const pick = useCallback(
    (stock: PrintStock, stationId: string | null) => {
      setPicks((prev) => ({ ...prev, [stock]: stationId?.trim() || null }));
      rememberPrintStationId(printStationPickStorage(), orgId, staffId, stationId, stock);
    },
    [orgId, staffId],
  );

  const setOrgAssignment = useCallback(
    async (stock: PrintStock, stationId: string | null) => {
      const assignment = await putPrintStationAssignment(stock, stationId);
      queryClient.setQueryData<PrintStationRegistry>(PRINT_STATIONS_QUERY_KEY, (prev) =>
        prev ? { ...prev, assignment } : prev,
      );
    },
    [queryClient],
  );

  const rename = useCallback(
    async (stationId: string, name: string) => {
      if (stationId === self.id) await renameThisPrintStation(name);
      else await putPrintStationName(stationId, name);
      await queryClient.invalidateQueries({ queryKey: PRINT_STATIONS_QUERY_KEY });
    },
    [self.id, queryClient],
  );

  const blockedReason = useCallback(
    (stock: PrintStock): string | null => {
      const station = target[stock];
      if (!station) return 'Choose a print station.';
      if (station.thisComputer) return null;
      if (!orgEnabled) return 'You cannot send prints to another station.';
      if (!station.live) return `${station.stationName} is offline.`;
      if (!station[stock].ready) return `${station.stationName} has no ${stock} printer set up.`;
      return null;
    },
    [target, orgEnabled],
  );

  // Progress listeners outlive the ack; the hook's unmount stops them all.
  const progressStops = useRef(new Set<() => void>());
  useEffect(() => {
    const stops = progressStops.current;
    return () => {
      for (const stop of [...stops]) stop();
    };
  }, []);

  // A sent job names its station in the header's print list; the roster re-renders every tick, the sender reads it at send time.
  const stationsRef = useRef(stations);
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  /** One job to one station over its org channel; true when the station acked it. */
  const sendStationJob = useCallback(
    async (stationId: string, body: StaffPrintJobBody, onProgress?: (done: number, total: number) => void): Promise<boolean> => {
      const channelName = orgEnabled ? safeChannelName(() => getPrintStationChannelName(orgId, stationId)) : '';
      const client = channelName ? await getClient() : null;
      const channel = client?.channels.get(channelName);
      if (!channel) return false;
      const requestId = safeRandomUUID();
      const job = { ...body, type: 'staff.print_job', request_id: requestId, targetStationId: stationId } as StaffPrintJob;
      const stationName = stationsRef.current.find((s) => s.stationId === stationId)?.stationName || UNNAMED_PRINT_STATION;
      const what =
        body.grain === 'documents'
          ? body.role === 'paper'
            ? 'Paperwork'
            : 'Labels'
          : body.grain === 'fnsku'
            ? body.fnsku?.test
              ? 'FNSKU test print'
              : 'FNSKU labels'
            : body.grain === 'qc_label'
              ? 'QC label'
              : 'Print job';
      // Documents and FNSKU runs print unit by unit at the station, so they tick back and obey pause / cancel.
      const reportsProgress = body.grain === 'documents' || body.grain === 'fnsku';
      const work = beginWork({
        kind: 'print',
        label: `${what} → ${stationName}`,
        total: body.documents?.items.length ?? body.fnsku?.copies,
        target: stationName,
        ...(body.fnsku ? { detail: body.fnsku.fnsku } : {}),
        ...(reportsProgress
          ? {
              controls: { pause: true, cancel: true },
              // The station's own item obeys; its next tick confirms (or corrects) what this one shows.
              onControl: (action) => {
                const control: StaffPrintControl = { type: 'staff.print_control', request_id: requestId, targetStationId: stationId, action };
                void channel.publish(STAFF_PRINT_CONTROL_EVENT, control).catch(() => {
                  /* best-effort — the station's ticks say where the job really stands */
                });
              },
            }
          : {}),
      });

      let stopProgress = () => {};
      if (reportsProgress) {
        const handler = (message: { data?: unknown }) => {
          const progress = parseStaffPrintProgress(message.data);
          if (!progress || progress.request_id !== requestId) return;
          work.progress(progress.done, progress.total);
          onProgress?.(progress.done, progress.total);
          const printed = `${progress.done} of ${progress.total} printed at ${stationName}`;
          switch (progress.state) {
            case 'paused':
            case 'running':
              work.setPaused(progress.state === 'paused');
              break;
            case 'cancelled':
              work.cancelled(`Cancelled · ${printed}`);
              stopProgress();
              return;
            case 'failed':
              work.fail(progress.message ?? `${stationName} could not print it`);
              stopProgress();
              return;
            case 'done':
              work.finish(`${progress.message ?? `${progress.total} printed`} at ${stationName}`);
              stopProgress();
              return;
          }
          if (progress.done >= progress.total) {
            work.finish(`${progress.total} printed at ${stationName}`);
            stopProgress();
          }
        };
        const timer = window.setTimeout(() => stopProgress(), PROGRESS_LISTEN_MS);
        // Timed out, unmounted, or refused: the listen ends, so does the header's row (a no-op once settled).
        stopProgress = () => {
          window.clearTimeout(timer);
          work.finish(`Sent to ${stationName}`);
          progressStops.current.delete(stopProgress);
          try {
            channel.unsubscribe(STAFF_PRINT_PROGRESS_EVENT, handler);
          } catch {
            /* channel already torn down */
          }
        };
        progressStops.current.add(stopProgress);
        // Listening before the job goes out: a fast station's first tick is never missed.
        try {
          await channel.subscribe(STAFF_PRINT_PROGRESS_EVENT, handler);
        } catch {
          /* progress is best-effort; the ack still decides */
        }
      }

      try {
        const acked = await sendToDevice({
          channel,
          requestId,
          publish: () => channel.publish(STAFF_PRINT_JOB_EVENT, job),
        });
        if (!acked) {
          work.fail(`${stationName} did not answer`);
          stopProgress();
        } else if (!reportsProgress) work.finish(`Sent to ${stationName}`);
        return acked;
      } catch {
        work.fail(`Could not reach ${stationName}`);
        stopProgress();
        return false;
      }
    },
    [getClient, orgEnabled, orgId],
  );

  const sendDocuments = useCallback(
    (
      stationId: string,
      stock: PrintStock,
      batchId: string,
      items: StationDocumentRef[],
      onProgress?: (done: number, total: number) => void,
    ): Promise<boolean> =>
      sendStationJob(stationId, { grain: 'documents', role: stock, documents: { stock, batchId, items } }, onProgress),
    [sendStationJob],
  );

  const sendFnsku = useCallback(
    (stationId: string, fnsku: string, copies: number, options?: { test?: boolean }): Promise<boolean> =>
      sendStationJob(stationId, {
        grain: 'fnsku',
        role: 'label',
        fnsku: options?.test ? { fnsku, copies, test: true } : { fnsku, copies },
      }),
    [sendStationJob],
  );

  const sendQcLabel = useCallback(
    (stationId: string, unitKey: string): Promise<boolean> =>
      sendStationJob(stationId, { grain: 'qc_label', role: 'label', qcLabel: { unitKey } }),
    [sendStationJob],
  );

  return {
    stations,
    thisStationId: self.id,
    target,
    orgAssignment,
    pick,
    setOrgAssignment,
    canRenameOthers: has('settings.hardware'),
    rename,
    blockedReason,
    sendDocuments,
    sendFnsku,
    sendQcLabel,
  };
}
