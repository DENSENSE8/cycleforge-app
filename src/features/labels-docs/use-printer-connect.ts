'use client';

/**
 * This workstation's printers, headless: the silent switch, pairing a 4×6
 * thermal label printer over USB or serial, its command language, and one test
 * sticker. It writes the same workstation printer profiles the settings page
 * does (`browserPrint` store); the Printers rail card and the printer settings
 * gear both drive it, so the two never fork.
 *
 * `print` is the caller's `usePrintRoutes()`: routes are null until the
 * workstation's storage has been read after mount. Every write refreshes it and
 * announces `PRINT_STATION_CHANGED_EVENT`, so other mounted route readers and
 * this computer's station face repaint without a reload.
 */

import { useState } from 'react';
import type { LabelPrintRoute, PrintStock } from '@/lib/label-prints/print-route';
import { SHIPPING_LABEL_PAPER } from '@/lib/label-prints/print-route';
import {
  isBrowserPrintSupported,
  listProfiles,
  newProfileId,
  printRawToProfile,
  requestSerialDevice,
  requestUsbDevice,
  setRoute,
  upsertProfile,
  type LabelLanguage,
  type PrinterProfile,
} from '@/lib/print/browserPrint';
import { desktopPrintHost, type DesktopPrintHost } from '@/lib/print/desktop-print-host';
import { buildTestLabelCommands } from '@/lib/print/labelCommands';
import { PRINT_STATION_CHANGED_EVENT } from '@/lib/print/print-station';
import { isSilentPrintEnabled, setSilentPrintEnabled } from '@/lib/print/printMode';

export type PrintRoutes = Record<PrintStock, LabelPrintRoute>;

export interface PrinterConnect {
  routes: PrintRoutes | null;
  /** Silent printing on this workstation (true until storage is read). */
  silent: boolean;
  setSilent: (next: boolean) => void;
  /** The raw thermal profile the 4×6 label route uses, if any. */
  thermal: PrinterProfile | null;
  /** The desktop app hosting this page, once known. */
  host: DesktopPrintHost | null;
  /** This browser can pair USB / serial printers. */
  canPair: boolean;
  /** Printer profiles stored on this workstation. */
  profileCount: number;
  busy: boolean;
  /** The last pairing / test outcome, in words. */
  status: string | null;
  connect: (kind: 'usb' | 'serial') => Promise<void>;
  setLanguage: (language: LabelLanguage) => void;
  /** One test sticker through the raw path to `thermal`. */
  test: () => Promise<void>;
}

export function usePrinterConnect(print: { routes: PrintRoutes | null; refresh: () => void }): PrinterConnect {
  const { routes, refresh } = print;
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const thermal =
    routes?.label.channel === 'THERMAL_USB' || routes?.label.channel === 'THERMAL_SERIAL' ? routes.label.profile : null;

  const changed = () => {
    refresh();
    window.dispatchEvent(new CustomEvent(PRINT_STATION_CHANGED_EVENT, { detail: { printers: true } }));
  };

  const setSilent = (next: boolean) => {
    setSilentPrintEnabled(next);
    refresh();
  };

  const connect = async (kind: 'usb' | 'serial') => {
    setBusy(true);
    setStatus('Pick the printer in the browser dialog…');
    try {
      const device = kind === 'usb' ? await requestUsbDevice() : await requestSerialDevice();
      const profile: PrinterProfile = {
        id: newProfileId(),
        name: device.suggestedName,
        role: 'label',
        kind: device.kind,
        vendorId: device.vendorId,
        productId: device.productId,
        serialNumber: device.serialNumber,
        language: 'tspl',
        paperSizeId: SHIPPING_LABEL_PAPER.id,
        baudRate: kind === 'serial' ? 9600 : undefined,
        copies: 1,
      };
      upsertProfile(profile);
      setRoute('label', profile.id);
      if (!isSilentPrintEnabled()) setSilentPrintEnabled(true);
      setStatus(`Connected ${profile.name} for 4×6 labels. Press Test to check it.`);
      changed();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connection cancelled.');
    } finally {
      setBusy(false);
    }
  };

  const setLanguage = (language: LabelLanguage) => {
    if (!thermal) return;
    upsertProfile({ ...thermal, language });
    changed();
  };

  const test = async () => {
    if (!thermal) return;
    setBusy(true);
    const sent = await printRawToProfile(
      buildTestLabelCommands(thermal.language, SHIPPING_LABEL_PAPER, thermal.name, new Date().toLocaleString()),
      thermal,
    );
    setStatus(sent.success ? `Test sent to ${thermal.name}.` : (sent.reason ?? 'The printer refused the test.'));
    setBusy(false);
  };

  return {
    routes,
    silent: routes ? isSilentPrintEnabled() : true,
    setSilent,
    thermal,
    host: routes ? desktopPrintHost() : null,
    canPair: routes ? isBrowserPrintSupported() : false,
    profileCount: routes ? listProfiles().length : 0,
    busy,
    status,
    connect,
    setLanguage,
    test,
  };
}
