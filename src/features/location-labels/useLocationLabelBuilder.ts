'use client';

/**
 * The one controller behind `LocationLabelBuilder`. A label with no position
 * reads `C-03-10-3`; there is no separate bay label.
 *
 * The address lives in the per-browser store (`useLabelPrinterStore`) so the
 * desk tab and the phone pick up where the operator left off. Printing goes to
 * the label station this staffer picked (`usePrintStations().target.label`):
 * this computer prints here through `printLocationLabelRun` (registration
 * included); any other station is sent the job after this screen registers
 * the stickers itself, so a refused code reads here, not over there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/hooks/useLocations';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { patchLabelPrinterState, resetLabelPrinterState, useLabelPrinterStore } from '@/hooks/useLabelPrinterStore';
import { usePrintStations, type PrintStationEntry, type PrintStations } from '@/hooks/usePrintStations';
import type { LocationSegments } from '@/lib/barcode-routing';
import { printLocationLabelRun } from '@/lib/print/printLabelRun';
import { toast } from '@/lib/toast';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import {
  labelFace,
  labelSegments,
  nextLabelStep,
  parseLabelCode,
  roomsForZone,
  type LabelSelection,
  type LabelStep,
} from './location-label-model';

const DEEPER: Record<LabelStep, (keyof LabelSelection)[]> = {
  zone: ['aisle', 'bay', 'level', 'position'],
  aisle: ['bay', 'level', 'position'],
  bay: ['level', 'position'],
  level: ['position'],
  position: [],
};

const FIELD: Record<Exclude<LabelStep, 'zone'>, keyof LabelSelection> = {
  aisle: 'aisle',
  bay: 'bay',
  level: 'level',
  position: 'position',
};

function plural(n: number): string {
  return `${n} label${n === 1 ? '' : 's'}`;
}

/** What the builder reads and drives. */
export interface LocationLabelBuilderController {
  loading: boolean;
  /** Room names in room order. */
  rooms: string[];
  /** Zone letter by room name (rooms without one are absent). */
  zoneMap: Record<string, string>;
  /** Workspace GLN for the printed matrix; '' = none on file. */
  gln: string;
  selection: LabelSelection;
  zoneLetter: string | undefined;
  missingLetter: boolean;
  step: LabelStep;
  /** The one label the address names, or null until it is complete. */
  single: LocationSegments | null;
  singleFace: string | null;
  pickRoom: (room: string) => void;
  pickNumber: (step: Exclude<LabelStep, 'zone'>, n: number) => void;
  clearPosition: () => void;
  openStep: (step: LabelStep) => void;
  reset: () => void;
  applyCode: (raw: string) => boolean;
  /** Why the last scan or typed code did not fill the address. */
  scanNote: string | null;
  printing: boolean;
  /** The last print's refusal (registration, station silence), shown inline. */
  error: string | null;
  clearError: () => void;
  stations: PrintStations;
  /** Where labels print: this staffer's label pick › the org's label station › this computer. */
  station: PrintStationEntry | null;
  printerBlocked: string | null;
  print: (labels: LocationSegments[]) => Promise<boolean>;
}

export function useLocationLabelBuilder({
  initialCode,
}: {
  initialCode?: string | null;
}): LocationLabelBuilderController {
  const { rooms, roomNames, loading } = useLocations();
  const { identity: orgGs1 } = useOrgGs1();
  const { user } = useAuth();
  const stations = usePrintStations();
  const selection = useLabelPrinterStore();

  const [overrideStep, setOverrideStep] = useState<LabelStep | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [automaticallyAssignedZones, setAutomaticallyAssignedZones] = useState<Record<string, string>>({});
  const zoneRepairAttempted = useRef(false);

  // Server-of-record zone letters, keyed by room name.
  const storedZoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rooms) {
      const key = (r.room || r.name)?.trim();
      if (key && r.zone_letter && /^[A-Z]$/.test(r.zone_letter)) map[key] = r.zone_letter;
    }
    return map;
  }, [rooms]);

  const roomList = useMemo(() => {
    const order = new Map<string, number>();
    for (const r of rooms) {
      const key = (r.room || r.name)?.trim();
      if (key && !order.has(key)) order.set(key, r.sort_order ?? 0);
    }
    for (const n of roomNames) if (n && !order.has(n)) order.set(n, 0);
    return [...order.keys()].sort((a, b) => (order.get(a)! - order.get(b)!) || a.localeCompare(b));
  }, [rooms, roomNames]);

  const zoneMap = useMemo(
    () => ({ ...storedZoneMap, ...automaticallyAssignedZones }),
    [automaticallyAssignedZones, storedZoneMap],
  );

  // Legacy rooms are repaired as one idempotent server operation. New rooms
  // receive a letter at creation, so this normally makes no request at all.
  useEffect(() => {
    if (loading || zoneRepairAttempted.current || !roomList.some((room) => !zoneMap[room])) return;
    zoneRepairAttempted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/rooms/ensure-zone-letters', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.zoneMap && typeof data.zoneMap === 'object') {
          setAutomaticallyAssignedZones(data.zoneMap as Record<string, string>);
        }
        if (!response.ok) {
          setError(data?.error || 'Could not assign room zones automatically.');
        }
      } catch {
        if (!cancelled) setError('Could not assign room zones automatically.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, roomList, zoneMap]);

  const zoneLetter = selection.room ? zoneMap[selection.room] : undefined;
  const missingLetter = !!selection.room && !zoneLetter;
  const step = overrideStep ?? nextLabelStep(selection);
  const single = labelSegments(zoneLetter, selection);

  const pickRoom = useCallback(
    (room: string) => {
      patchLabelPrinterState(room === selection.room ? { room } : { room, aisle: undefined, bay: undefined, level: undefined, position: undefined });
      setOverrideStep(null);
      setError(null);
    },
    [selection.room],
  );

  /** A number for one step; a new value clears every deeper step. Tapping the picked position again clears it (no position). */
  const pickNumber = useCallback(
    (at: Exclude<LabelStep, 'zone'>, n: number) => {
      const field = FIELD[at];
      if (at === 'position' && selection.position === n) {
        patchLabelPrinterState({ position: undefined });
      } else if (selection[field] === n) {
        patchLabelPrinterState({ [field]: n });
      } else {
        const cleared = Object.fromEntries(DEEPER[at].map((k) => [k, undefined]));
        patchLabelPrinterState({ ...cleared, [field]: n });
      }
      setOverrideStep(null);
      setError(null);
    },
    [selection],
  );

  const clearPosition = useCallback(() => {
    patchLabelPrinterState({ position: undefined });
    setOverrideStep(null);
  }, []);

  /** Jump back to a finished step (or the next open one); the position step opens once a level is picked. */
  const openStep = useCallback(
    (target: LabelStep) => {
      const done: Record<LabelStep, boolean> = {
        zone: !!selection.room,
        aisle: selection.aisle != null,
        bay: selection.bay != null,
        level: selection.level != null,
        position: selection.position != null || selection.level != null,
      };
      if (!done[target] && target !== nextLabelStep(selection)) return;
      setOverrideStep(target);
    },
    [selection],
  );

  const reset = useCallback(() => {
    resetLabelPrinterState();
    setOverrideStep(null);
    setError(null);
    setScanNote(null);
  }, []);

  /** A scanned or typed sticker fills the whole address. False (with a note) when it is not a room-coded location. */
  const applyCode = useCallback(
    (raw: string): boolean => {
      const segments = parseLabelCode(raw);
      if (!segments) {
        setScanNote(`${raw.trim()} is not a location sticker`);
        return false;
      }
      const zone = String(segments.zone);
      const [room] = selection.room && zoneMap[selection.room] === zone ? [selection.room] : roomsForZone(roomList, zoneMap, zone);
      if (!room) {
        setScanNote(`No room wears zone ${zone} yet`);
        return false;
      }
      const position = Number(segments.position);
      patchLabelPrinterState({
        room,
        aisle: Number(segments.aisle),
        bay: Number(segments.bay),
        level: Number(segments.level),
        position: position > 0 ? position : undefined,
      });
      setOverrideStep(null);
      setScanNote(null);
      setError(null);
      return true;
    },
    [roomList, selection.room, zoneMap],
  );

  // The location the operator came from prefills the address once its room is known.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !initialCode || loading || roomList.length === 0) return;
    prefilled.current = true;
    applyCode(initialCode);
  }, [applyCode, initialCode, loading, roomList.length]);

  const station = stations.target.label;
  const printerBlocked = stations.blockedReason('label');

  const print = useCallback(
    async (labels: LocationSegments[]): Promise<boolean> => {
      const room = selection.room;
      if (labels.length === 0 || !room || !station || printerBlocked) return false;
      setPrinting(true);
      setError(null);
      const reprint = { label: 'Reprint', onClick: () => void print(labels) };
      try {
        if (station.thisComputer) {
          const common = { roomName: room, gln: orgGs1.gln, orgSlug: user?.organizationSlug };
          const result = await printLocationLabelRun({ ...common, segments: labels, register: registerLocations });
          if (result.status === 'register_failed' || result.status === 'mint_failed') {
            setError(result.error || 'Could not register these locations for printing.');
            return false;
          }
          if (result.status !== 'printed') return false;
          toast.success(`Printed ${plural(result.count)}`, { action: reprint });
          return true;
        }
        // Registered here first: a refused code is this screen's error; the station's own register is then a no-op.
        try {
          await registerLocations(room, labels);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not register these locations for printing.');
          return false;
        }
        const acked = await stations.sendLocationLabels(station.stationId, {
          roomName: room,
          gln: orgGs1.gln,
          orgSlug: user?.organizationSlug,
          segments: labels,
        });
        if (!acked) {
          setError(`${station.stationName} did not answer — is CycleForge open there? Nothing was printed.`);
          return false;
        }
        toast.success(`Sent ${plural(labels.length)} to ${station.stationName}`, { action: reprint });
        return true;
      } finally {
        setPrinting(false);
      }
    },
    [orgGs1.gln, printerBlocked, selection.room, station, stations, user?.organizationSlug],
  );

  return {
    loading,
    rooms: roomList,
    zoneMap,
    gln: orgGs1.gln,
    selection,
    zoneLetter,
    missingLetter,
    step,
    single,
    singleFace: single ? labelFace(single) : null,
    pickRoom,
    pickNumber,
    clearPosition,
    openStep,
    reset,
    applyCode,
    scanNote,
    printing,
    error,
    clearError: () => setError(null),
    stations,
    station,
    printerBlocked,
    print,
  };
}
