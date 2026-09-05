'use client';

import { useCallback, useState } from 'react';
import {
  printStationLabel,
  type StationLabelJob,
  type StationLabelVia,
} from '@/lib/print/station-label-print';

/**
 * Station Print button → one USB/iframe label job.
 * QC, Unbox, and Triage (and any floor peer) must print through this hook
 * so the sticker is the same path as Settings → Hardware Test.
 */
export function useStationLabelPrint(): {
  print: (job: StationLabelJob) => Promise<StationLabelVia>;
  isPrinting: boolean;
} {
  const [isPrinting, setIsPrinting] = useState(false);
  const print = useCallback(async (job: StationLabelJob): Promise<StationLabelVia> => {
    setIsPrinting(true);
    try {
      return await printStationLabel(job);
    } finally {
      setIsPrinting(false);
    }
  }, []);
  return { print, isPrinting };
}
