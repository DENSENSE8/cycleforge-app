'use client';

/**
 * Where Inventory › Stock labels print and the one way to send them — shared
 * by the record's Print label and the list's selection bar. The label
 * station (this device's pick › the org default › this computer; Change picks
 * another for this run) prints silently; Browser print opens the 4 × 6 dialog
 * here. Both go through `printStockLabels` / `sendStockLabels`.
 */

import { useState } from 'react';
import { stationHandle } from '@/features/print-station/station-faces';
import { resolvePrintStation, stationBlocked } from '@/features/print-station/StationPicker';
import { usePrintStations, type PrintStationEntry, type PrintStations } from '@/hooks/usePrintStations';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { isStockLabelImagePath } from '@/lib/print/staff-print-bridge';
import type { StockLabelFace } from '@/lib/print/stockLabel';
import { toast } from '@/lib/toast';

/** A record image a label may print (same-origin, full size), or null. */
export function printableLabelImage(url: string | null): string | null {
  const path = (url ?? '').replace(/\?variant=thumb$/, '');
  return isStockLabelImagePath(path) ? path : null;
}

/** A record's primary photo for its label: the SKU's own cover, else its product image — when either may print. */
export function recordLabelImage(row: Pick<LocationStockTableRow, 'cover_photo_url' | 'image_url'>): string | null {
  return printableLabelImage(row.cover_photo_url) ?? printableLabelImage(row.image_url);
}

/** Where a run of stock labels prints, and the press that prints it. */
export interface StockLabelPrint {
  stations: PrintStations;
  /** The station a press sends to, or null with none. */
  station: PrintStationEntry | null;
  /** Why that station cannot take labels now; null when it can. */
  blocked: string | null;
  /** Its name, `this computer`, or null with none. */
  where: string | null;
  busy: 'station' | 'dialog' | null;
  /** The last press's failure, shown under Print at. */
  error: string | null;
  /** Send this run elsewhere (never written back as the default). */
  chooseStation: (stationId: string) => void;
  /** Print the run (one 4 × 6 page per face) at the station, or in the dialog; true once it printed or the dialog opened. */
  print: (faces: readonly StockLabelFace[], dialog: boolean) => Promise<boolean>;
}

export function useStockLabelPrint(): StockLabelPrint {
  const stations = usePrintStations({ active: true });
  const [chosenStationId, setChosenStationId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'station' | 'dialog' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const station = resolvePrintStation(stations, chosenStationId);
  const blocked = station ? stationBlocked(station) : 'No print station';
  const where = station ? (station.thisComputer ? 'this computer' : stationHandle(station)) : null;

  const print = async (faces: readonly StockLabelFace[], dialog: boolean): Promise<boolean> => {
    if (busy || faces.length === 0) return false;
    setBusy(dialog ? 'dialog' : 'station');
    setError(null);
    try {
      const failure =
        dialog || station?.thisComputer
          ? // Loaded on press: the label renderer and 4 × 6 raster stay out of the stock page's bundle.
            await import('@/lib/print/stockLabel').then(({ printStockLabels }) => printStockLabels(faces, { dialog }))
          : station
            ? await stations.sendStockLabels(station.stationId, faces)
            : 'No print station';
      if (failure) {
        setError(failure);
        return false;
      }
      if (!dialog) toast.success(`${faces.length === 1 ? `${faces[0].sku} label` : `${faces.length} labels`} sent to ${where}`);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The labels did not print.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { stations, station, blocked, where, busy, error, chooseStation: setChosenStationId, print };
}

