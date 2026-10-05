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
  putPrintStationPaused,
  postPrintStationEnroll,
  postPrintStationRePair,
  postPrintStationRevoke,
  renameThisPrintStation,
} from '@/lib/print/print-station-registry-client';
import type {
  PrintStationAssignment,
  PrintStationEnrollment,
  PrintStationKind,
  PrintStationRegistry,
} from '@/lib/print/print-station-registry-contracts';
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
  type StaffPrintLocationPayload,
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
  /** `enrolled`: an org-owned computer paired with a code · `browser`: a staff browser's own station. */
  kind: PrintStationKind;
  /** Paused from Stations: it refuses jobs until resumed. */
  paused: boolean;
  /** Where this station was heard: the org registry, the staffer's own roster, or both. */
  sources: Array<'org' | 'staff'>;
  live: boolean;
  lastSeenAt: number | null;
  /** The staffer signed in on that computer at its last org heartbeat — who is at that table. */
  lastSeenStaffId: number | null;
  /** When it last logged a print (the registry's job log); null = none. */
  lastJobAt: number | null;
  label: StockFace;
  paper: StockFace;
}

const NO_ASSIGNMENT: PrintStationAssignment = { label: null, paper: null };
const NO_PICKS: Record<PrintStock, string | null> = { label: null, paper: null };
/** How long a sender keeps listening for a station's progress after it acked. */
const PROGRESS_LISTEN_MS = 10 * 60_000;
/** One product label should settle quickly; do not leave the prepack button spinning indefinitely. */
const QC_PROGRESS_LISTEN_MS = 60_000;

type StationSendOutcome = {
  acked: boolean;
  completed?: boolean;
  message?: string;
};

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
  /** Hardware settings: may this staffer rename OTHER computers and set the org's default station? Anyone may name this one. */
  canManage: boolean;
  /** Rename a station for the whole org (empty = unnamed); rejects with the server's reason. */
  rename: (stationId: string, name: string) => Promise<void>;
  /** Hardware settings: enrol a new org-owned station; resolves its single-use pairing code. */
  enroll: (name: string) => Promise<PrintStationEnrollment>;
  /** Hardware settings: replace an enrolled station's credential without replacing the station. */
  rePair: (stationId: string) => Promise<PrintStationEnrollment>;
  /** Hardware settings: pause (it refuses jobs) or resume a station. */
  setPaused: (stationId: string, paused: boolean) => Promise<void>;
  /** Hardware settings: revoke an enrolled station / forget a browser one. */
  revoke: (stationId: string) => Promise<void>;
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
   * `test`: a test print — the same face, no reprint logged.
   */
  sendFnsku: (stationId: string, fnsku: string, copies: number, options?: { test?: boolean }) => Promise<boolean>;
  /** One unit's QC label at a named station; null after print + ledger, otherwise the operator-facing failure. */
  sendQcLabel: (stationId: string, unitKey: string) => Promise<string | null>;
  /** Location (`bin`) or bay (`rack`) stickers at a named station — it registers and prints them; true when it acked. */
  sendLocationLabels: (stationId: string, grain: 'bin' | 'rack', location: StaffPrintLocationPayload) => Promise<boolean>;
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
        kind: s.kind,
        paused: s.paused,
        sources: ['org'],
        live: s.online,
        lastSeenAt: s.lastSeenAt ? Date.parse(s.lastSeenAt) : null,
        lastSeenStaffId: s.lastSeenStaffId,
        lastJobAt: s.lastJobAt ? Date.parse(s.lastJobAt) : null,
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
        kind: 'browser',
        paused: false,
        sources: ['staff'],
        live: isStaffPrintStationLive(s, bridge.now),
        lastSeenAt: s.lastSeenAt,
        lastSeenStaffId: null,
        lastJobAt: null,
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
        kind: org.kind,
        paused: org.paused,
        sources: ['org', 'staff'],
        live: org.live || heard.live,
        lastSeenAt: Math.max(org.lastSeenAt ?? 0, s.lastSeenAt),
        lastSeenStaffId: org.lastSeenStaffId,
        lastJobAt: org.lastJobAt,
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
      kind: 'browser',
      paused: false,
      sources: heardSelf?.sources ?? [],
      live: true,
      lastSeenAt: heardSelf?.lastSeenAt ?? null,
      lastSeenStaffId: staffId || null,
      lastJobAt: heardSelf?.lastJobAt ?? null,
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

  const refreshRegistry = useCallback(
    () => queryClient.invalidateQueries({ queryKey: PRINT_STATIONS_QUERY_KEY }),
    [queryClient],
  );
  const enroll = useCallback(
    async (name: string) => {
      const enrollment = await postPrintStationEnroll(name);
      await refreshRegistry();
      return enrollment;
    },
    [refreshRegistry],
  );
  const setPaused = useCallback(
    async (stationId: string, paused: boolean) => {
      await putPrintStationPaused(stationId, paused);
      await refreshRegistry();
    },
    [refreshRegistry],
  );
  const rePair = useCallback(
    async (stationId: string) => {
      const enrollment = await postPrintStationRePair(stationId);
      await refreshRegistry();
      return enrollment;
    },
    [refreshRegistry],
  );
  const revoke = useCallback(
    async (stationId: string) => {
      await postPrintStationRevoke(stationId);
      await refreshRegistry();
    },
    [refreshRegistry],
  );

  const blockedReason = useCallback(
    (stock: PrintStock): string | null => {
      const station = target[stock];
      if (!station) return 'Choose a print station.';
      if (station.thisComputer) return null;
      if (!orgEnabled) return 'You cannot send prints to another station.';
      if (station.paused) return `${station.stationName} is paused.`;
      // An enrolled station prints FBA (FNSKU) labels only — the FNSKU picker sends there; documents, locations and QC never do.
      if (station.kind === 'enrolled') return `${station.stationName} prints FBA labels only.`;
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

  /** One job to one station over its org channel. QC waits for the terminal print result. */
  const sendStationJob = useCallback(
    async (
      stationId: string,
      body: StaffPrintJobBody,
      options: { onProgress?: (done: number, total: number) => void; waitForTerminal?: boolean } = {},
    ): Promise<StationSendOutcome> => {
      const channelName = orgEnabled ? safeChannelName(() => getPrintStationChannelName(orgId, stationId)) : '';
      const client = channelName ? await getClient() : null;
      const channel = client?.channels.get(channelName);
      if (!channel) return { acked: false, completed: false, message: 'The print station channel is unavailable.' };
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
              : body.grain === 'bin'
                ? 'Location labels'
                : body.grain === 'rack'
                  ? 'Bay labels'
                  : 'Print job';
      // Product labels also report their terminal ledger result; only multi-item
      // document/FNSKU runs expose pause and cancel controls.
      const reportsProgress = body.grain === 'documents' || body.grain === 'fnsku' || body.grain === 'qc_label';
      const controllable = body.grain === 'documents' || body.grain === 'fnsku';
      const waitsForTerminal = options.waitForTerminal === true;
      const work = beginWork({
        kind: 'print',
        label: `${what} → ${stationName}`,
        total: body.documents?.items.length ?? body.fnsku?.copies ?? (body.qcLabel ? 1 : body.location?.segments.length),
        target: stationName,
        ...(body.fnsku ? { detail: body.fnsku.fnsku } : {}),
        ...(controllable
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
      let settleTerminal = (_outcome: StationSendOutcome) => {};
      let terminalSettled = false;
      const terminal = new Promise<StationSendOutcome>((resolve) => {
        settleTerminal = (outcome) => {
          if (terminalSettled) return;
          terminalSettled = true;
          resolve(outcome);
        };
      });
      if (reportsProgress) {
        const handler = (message: { data?: unknown }) => {
          const progress = parseStaffPrintProgress(message.data);
          if (!progress || progress.request_id !== requestId) return;
          work.progress(progress.done, progress.total);
          options.onProgress?.(progress.done, progress.total);
          const printed = `${progress.done} of ${progress.total} printed at ${stationName}`;
          switch (progress.state) {
            case 'paused':
            case 'running':
              work.setPaused(progress.state === 'paused');
              break;
            case 'cancelled':
              work.cancelled(`Cancelled · ${printed}`);
              settleTerminal({ acked: true, completed: false, message: progress.message ?? `Cancelled at ${stationName}.` });
              stopProgress();
              return;
            case 'failed':
              work.fail(progress.message ?? `${stationName} could not print it`);
              settleTerminal({ acked: true, completed: false, message: progress.message ?? `${stationName} could not print it.` });
              stopProgress();
              return;
            case 'done':
              work.finish(`${progress.message ?? `${progress.total} printed`} at ${stationName}`);
              settleTerminal({ acked: true, completed: true, message: progress.message });
              stopProgress();
              return;
          }
          if (progress.done >= progress.total) {
            work.finish(`${progress.total} printed at ${stationName}`);
            settleTerminal({ acked: true, completed: true });
            stopProgress();
          }
        };
        const timer = window.setTimeout(() => {
          if (waitsForTerminal) {
            const message = `${stationName} accepted the label but did not confirm the print.`;
            work.fail(message);
            settleTerminal({ acked: true, completed: false, message });
          } else {
            work.finish(`Sent to ${stationName}`);
          }
          stopProgress();
        }, waitsForTerminal ? QC_PROGRESS_LISTEN_MS : PROGRESS_LISTEN_MS);
        // Timed out, unmounted, refused or settled: release the listener.
        stopProgress = () => {
          window.clearTimeout(timer);
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
          const message = `${stationName} did not answer. Nothing was printed.`;
          work.fail(message);
          settleTerminal({ acked: false, completed: false, message });
          stopProgress();
          return { acked: false, completed: false, message };
        }
        if (!reportsProgress) {
          work.finish(`Sent to ${stationName}`);
          return { acked: true };
        }
        if (waitsForTerminal) return await terminal;
        return { acked: true };
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : `Could not reach ${stationName}`;
        work.fail(message);
        settleTerminal({ acked: false, completed: false, message });
        stopProgress();
        return { acked: false, completed: false, message };
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
      sendStationJob(
        stationId,
        { grain: 'documents', role: stock, documents: { stock, batchId, items } },
        { onProgress },
      ).then((outcome) => outcome.acked),
    [sendStationJob],
  );

  const sendFnsku = useCallback(
    (stationId: string, fnsku: string, copies: number, options?: { test?: boolean }): Promise<boolean> =>
      sendStationJob(stationId, {
        grain: 'fnsku',
        role: 'label',
        fnsku: options?.test ? { fnsku, copies, test: true } : { fnsku, copies },
      }).then((outcome) => outcome.acked),
    [sendStationJob],
  );

  const sendQcLabel = useCallback(
    async (stationId: string, unitKey: string): Promise<string | null> => {
      const outcome = await sendStationJob(
        stationId,
        { grain: 'qc_label', role: 'label', qcLabel: { unitKey } },
        { waitForTerminal: true },
      );
      return outcome.acked && outcome.completed ? null : (outcome.message ?? `${stationId} did not print the label.`);
    },
    [sendStationJob],
  );

  const sendLocationLabels = useCallback(
    (stationId: string, grain: 'bin' | 'rack', location: StaffPrintLocationPayload): Promise<boolean> =>
      sendStationJob(stationId, { grain, role: 'label', location }).then((outcome) => outcome.acked),
    [sendStationJob],
  );

  return {
    stations,
    thisStationId: self.id,
    target,
    orgAssignment,
    pick,
    setOrgAssignment,
    canManage: has('settings.hardware'),
    rename,
    enroll,
    rePair,
    setPaused,
    revoke,
    blockedReason,
    sendDocuments,
    sendFnsku,
    sendQcLabel,
    sendLocationLabels,
  };
}
