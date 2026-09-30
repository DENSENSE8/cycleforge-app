'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { useLocations } from '@/hooks/useLocations';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { useAuth } from '@/contexts/AuthContext';
import {
  useRackPrinterStore,
  patchRackPrinterState,
  resetRackPrinterState,
} from '@/hooks/useLabelPrinterStore';
import type { RackSegments } from '@/lib/barcode-routing';
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  type PrinterConfig,
  type Step,
} from './rack-printer-config';
import { registerRackLocations } from './rack-printer-api';
import { printRackLabelRun } from '@/lib/print/printLabelRun';

/** Controller for the rack label printer. */
export function useRackLabelPrinter() {
  const { rooms, roomNames, loading } = useLocations();

  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);

  // The GLN is org-level, not part of `config` — see rack-printer-config.ts.
  // Resolved, so a placeholder or malformed value on file arrives here as ''
  // and the label falls back to the bare rack code.
  const { identity: orgGs1 } = useOrgGs1();
  const { user } = useAuth();

  const stored = useRackPrinterStore();
  const selectedRoom = stored.room;
  const aisle = stored.aisle;
  const bay = stored.bay;
  const level = stored.level;

  const [isPrinting, setIsPrinting] = useState(false);
  const [overrideStep, setOverrideStep] = useState<Step | null>(null);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

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

  const pickRoom = useCallback((name: string) => {
    if (selectedRoom !== name) {
      patchRackPrinterState({ room: name, aisle: undefined, bay: undefined, level: undefined });
    } else {
      patchRackPrinterState({ room: name });
    }
    setOverrideStep(null);
  }, [selectedRoom]);

  const pickAisle = useCallback((n: number) => {
    if (aisle !== n) {
      patchRackPrinterState({ aisle: n, bay: undefined, level: undefined });
    } else {
      patchRackPrinterState({ aisle: n });
    }
    setOverrideStep(null);
  }, [aisle]);

  const pickBay = useCallback((n: number) => {
    if (bay !== n) {
      patchRackPrinterState({ bay: n, level: undefined });
    } else {
      patchRackPrinterState({ bay: n });
    }
    setOverrideStep(null);
  }, [bay]);

  const pickLevel = useCallback((n: number) => {
    patchRackPrinterState({ level: n });
    setOverrideStep(null);
  }, []);

  const resetAll = useCallback(() => {
    resetRackPrinterState();
    setOverrideStep(null);
  }, []);

  const computedStep: Step = useMemo(() => {
    if (!selectedRoom) return 'zone';
    if (aisle == null) return 'aisle';
    if (bay == null) return 'bay';
    return 'level';
  }, [selectedRoom, aisle, bay]);

  const activeStep: Step = overrideStep ?? computedStep;

  const handlePillClick = useCallback((step: Step) => {
    const done: Record<Step, boolean> = {
      zone: !!selectedRoom,
      aisle: aisle != null,
      bay: bay != null,
      level: level != null,
    };
    if (!done[step] && step !== computedStep) return;
    if (step === activeStep) return;
    setOverrideStep(step);
  }, [selectedRoom, aisle, bay, level, computedStep, activeStep]);

  const allSelected = selectedRoom != null && aisle != null && bay != null && level != null;
  const zoneLetter = selectedRoom ? zoneMap[selectedRoom] : undefined;

  const currentSegments: RackSegments | null = allSelected && zoneLetter
    ? { zone: zoneLetter, aisle: aisle!, bay: bay!, level: level! }
    : null;

  const missingLetter = !!selectedRoom && !zoneLetter;

  // Register the rack row (position=0) before the 2×1 print job so scans of the
  // printed QR resolve to a real row in the locations table.
  const printRun = useCallback(
    async (labels: RackSegments[]): Promise<boolean> => {
      if (labels.length === 0) return false;
      if (!selectedRoom) {
        toast.error('Pick a room first.');
        return false;
      }
      setIsPrinting(true);
      try {
        const result = await printRackLabelRun({
          roomName: selectedRoom,
          racks: labels,
          gln: orgGs1.gln,
          orgSlug: user?.organizationSlug,
          register: registerRackLocations,
        });
        if (result.status === 'register_failed') {
          toast.error(result.error || 'Could not register bay for printing');
          return false;
        }
        if (result.status === 'printed') {
          toast.success(
            `Printed ${result.count} bay label${result.count === 1 ? '' : 's'}`,
          );
          return true;
        }
        return false;
      } finally {
        setIsPrinting(false);
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
    // data
    loading,
    allRoomNames,
    zoneMap,
    config,
    /** Workspace GLN for the printed matrix. '' = none on file. */
    gln: orgGs1.gln,
    // selection
    selectedRoom,
    aisle,
    bay,
    level,
    zoneLetter,
    activeStep,
    allSelected,
    missingLetter,
    currentSegments,
    isPrinting,
    // config sheet
    configOpen,
    setConfigOpen,
    handleConfigSave,
    // actions
    setOverrideStep,
    pickRoom,
    pickAisle,
    pickBay,
    pickLevel,
    resetAll,
    handlePillClick,
    handlePrintOne,
    printRun,
  };
}

export type RackLabelPrinterController = ReturnType<typeof useRackLabelPrinter>;
