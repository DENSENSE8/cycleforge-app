'use client';

/**
 * This workstation's print routing, live: where a 4×6 label and a letter page
 * go right now. Printer profiles, routing and the silent switch live in the
 * workstation's storage, so they are read after mount and re-read when the
 * silent switch changes, this computer's printers change (any mounted
 * Printers control announces it), the window regains focus, or `refresh`.
 */

import { useCallback, useEffect, useState } from 'react';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import type { LabelPrintRoute, PrintStock } from '@/lib/label-prints/print-route';
import { PRINT_STATION_CHANGED_EVENT } from '@/lib/print/print-station';
import { SILENT_PRINT_CHANGED_EVENT } from '@/lib/print/printMode';

export function usePrintRoutes(): { routes: Record<PrintStock, LabelPrintRoute> | null; refresh: () => void } {
  const [routes, setRoutes] = useState<Record<PrintStock, LabelPrintRoute> | null>(null);
  const refresh = useCallback(() => setRoutes({ label: currentPrintRoute('label'), paper: currentPrintRoute('paper') }), []);
  useEffect(() => {
    refresh();
    window.addEventListener(SILENT_PRINT_CHANGED_EVENT, refresh);
    window.addEventListener(PRINT_STATION_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(SILENT_PRINT_CHANGED_EVENT, refresh);
      window.removeEventListener(PRINT_STATION_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  return { routes, refresh };
}
