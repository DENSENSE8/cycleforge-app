'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { useLocations } from '@/hooks/useLocations';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { useAuth } from '@/contexts/AuthContext';
import {
  useLabelPrinterStore,
  patchLabelPrinterState,
  resetLabelPrinterState,
} from '@/hooks/useLabelPrinterStore';
import type { LocationSegments } from '@/lib/barcode-routing';
import { DEFAULT_CONFIG, loadConfig, saveConfig, type PrinterConfig, type Step } from './index';
import { registerLocations } from './bin-printer-api';
import { printBinLabelRun } from '@/lib/print/printLabelRun';

/**
 * Controller for the bin (location) label printer. Owns the five-step builder
 * (zone → aisle → bay → level → optional position), the per-warehouse config, and the
 * register-then-print flow. Bulk ranges open LabelPrintRunSheet; confirm calls printRun.
 * The selection lives in the shared `useLabelPrinterStore` so the main-pane preview
 * stays in lock-step with the sidebar picker.
 *
 * Returns one bag consumed by the layout components so the views stay
 * presentational.
 *
 * Callers: BinLabelPrinter. User: implement print-run plan — wire printBinLabelRun.
 */
export function useBinLabelPrinter() {
  const { rooms, roomNames, loading } = useLocations();

  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);

  // The GLN is org-level, not part of `config` — see types.ts. Resolved, so a
  // placeholder or malformed value on file arrives here as '' and the label
  // falls back to the bare location code.
  const { identity: orgGs1 } = useOrgGs1();
  const { user } = useAuth();

  const stored = useLabelPrinterStore();
  const selectedRoom = stored.room;
  const aisle = stored.aisle;
  const bay = stored.bay;
  const level = stored.level;
  const position = stored.position;

  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [overrideStep, setOverrideStep] = useState<Step | null>(null);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  // Server-of-record zone-letter map.
  const zoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rooms) {
      const key = (r.room || r.name)?.trim();
      if (!key) continue;
      if (r.zone_letter && /^[A-Z]$/.test(r.zone_letter)) map[key] = r.zone_letter;
    }
    return map;
  }, [rooms]);

  const allRoomNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) {
      const key = (r.room || r.name)?.trim();
      if (key) set.add(key);
    }
    for (const n of roomNames) if (n) set.add(n);
    return Array.from(set).sort((a, b) => {
      const sa = rooms.find((r) => (r.room || r.name) === a)?.sort_order ?? 0;
      const sb = rooms.find((r) => (r.room || r.name) === b)?.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b);
    });
  }, [rooms, roomNames]);

  // ─── Selection handlers ─────────────────────────────────────────────────
  const pickRoom = useCallback((name: string) => {
    if (selectedRoom !== name) {
      patchLabelPrinterState({ room: name, aisle: undefined, bay: undefined, level: undefined, position: undefined });
    } else {
      patchLabelPrinterState({ room: name });
    }
    setOverrideStep(null);
  }, [selectedRoom]);

  const pickAisle = useCallback((n: number) => {
    if (aisle !== n) {
      patchLabelPrinterState({ aisle: n, bay: undefined, level: undefined, position: undefined });
    } else {
      patchLabelPrinterState({ aisle: n });
    }
    setOverrideStep(null);
  }, [aisle]);

  const pickBay = useCallback((n: number) => {
    if (bay !== n) {
      patchLabelPrinterState({ bay: n, level: undefined, position: undefined });
    } else {
      patchLabelPrinterState({ bay: n });
    }
    setOverrideStep(null);
  }, [bay]);

  const pickLevel = useCallback((n: number) => {
    if (level !== n) {
      patchLabelPrinterState({ level: n, position: undefined });
    } else {
      patchLabelPrinterState({ level: n });
    }
    setOverrideStep(null);
  }, [level]);

  const pickPosition = useCallback((n: number) => {
    if (position === n) {
      patchLabelPrinterState({ position: undefined });
    } else {
      patchLabelPrinterState({ position: n });
    }
    setOverrideStep(null);
  }, [position]);

  const clearPosition = useCallback(() => {
    patchLabelPrinterState({ position: undefined });
    setOverrideStep(null);
  }, []);

  const resetAll = useCallback(() => {
    resetLabelPrinterState();
    setOverrideStep(null);
  }, []);

  const computedStep: Step = useMemo(() => {
    if (!selectedRoom) return 'zone';
    if (aisle == null) return 'aisle';
    if (bay == null) return 'bay';
    if (level == null) return 'level';
    return 'position';
  }, [selectedRoom, aisle, bay, level]);

  const activeStep: Step = overrideStep ?? computedStep;

  const handlePillClick = useCallback((step: Step) => {
    const done: Record<Step, boolean> = {
      zone: !!selectedRoom,
      aisle: aisle != null,
      bay: bay != null,
      level: level != null,
      position: position != null,
    };
    const positionReady = step === 'position' && level != null;
    if (!done[step] && step !== computedStep && !positionReady) return;
    if (step === activeStep) return;
    setOverrideStep(step);
  }, [selectedRoom, aisle, bay, level, position, computedStep, activeStep]);

  // Zone + aisle + bay + level is enough to print. Position is optional —
  // omitted encodes as `position: 0` so the 2×1 face has no slot suffix.
  const allSelected =
    selectedRoom != null && aisle != null && bay != null && level != null;
  const zoneLetter = selectedRoom ? zoneMap[selectedRoom] : undefined;

  const currentSegments: LocationSegments | null = allSelected && zoneLetter
    ? { zone: zoneLetter, aisle: aisle!, bay: bay!, level: level!, position: position ?? 0 }
    : null;

  const missingLetter = !!selectedRoom && !zoneLetter;

  // Register every label before the 2×1 print job; abort the print on failure.
  const printRun = useCallback(
    async (labels: LocationSegments[]): Promise<boolean> => {
      if (labels.length === 0) return false;
      if (!selectedRoom) {
        toast.error('Pick a room first.');
        return false;
      }
      setIsPrinting(true);
      setPrintProgress(null);
      try {
        const result = await printBinLabelRun({
          roomName: selectedRoom,
          segments: labels,
          gln: orgGs1.gln,
          orgSlug: user?.organizationSlug,
          register: registerLocations,
          onProgress: (done, total) => setPrintProgress({ done, total }),
        });
        if (result.status === 'register_failed') {
          toast.error(result.error || 'Could not register location for printing');
          return false;
        }
        if (result.status === 'printed') {
          toast.success(
            `Printed ${result.count} label${result.count === 1 ? '' : 's'}`,
          );
          return true;
        }
        return false;
      } finally {
        setIsPrinting(false);
        setPrintProgress(null);
      }
    },
    [orgGs1.gln, selectedRoom, user?.organizationSlug],
  );

  const handlePrintOne = useCallback(() => {
    if (!currentSegments) return;
    void printRun([currentSegments]);
  }, [currentSegments, printRun]);

  const handleConfigSave = useCallback((next: PrinterConfig) => {
    setConfig(next);
    saveConfig(next);
    toast.success('Configuration saved');
    setConfigOpen(false);
  }, []);

  // ⌘/Ctrl+P prints the current single label.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        if (!currentSegments) return;
        e.preventDefault();
        handlePrintOne();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [currentSegments, handlePrintOne]);

  return {
    loading,
    allRoomNames,
    zoneMap,
    config,
    /** Workspace GLN for the printed matrix. '' = none on file. */
    gln: orgGs1.gln,
    selectedRoom,
    aisle,
    bay,
    level,
    position,
    zoneLetter,
    activeStep,
    allSelected,
    missingLetter,
    isPrinting,
    printProgress,
    configOpen,
    setConfigOpen,
    handleConfigSave,
    setOverrideStep,
    pickRoom,
    pickAisle,
    pickBay,
    pickLevel,
    pickPosition,
    clearPosition,
    resetAll,
    handlePillClick,
    handlePrintOne,
    printRun,
  };
}

export type BinLabelPrinterController = ReturnType<typeof useBinLabelPrinter>;
