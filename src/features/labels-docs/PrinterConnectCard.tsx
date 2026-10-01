'use client';

/**
 * Printers — the rail card that makes THIS workstation print silently without
 * leaving the desk. It writes the same workstation printer profiles the
 * settings page does (`browserPrint` store), shaped for this job:
 *
 * - Silent printing on / off (the per-workstation switch every print path reads).
 * - Connect a 4×6 thermal label printer over USB or serial: a `label` profile
 *   on 4×6 stock, routed as this workstation's label printer. TSPL or ZPL.
 * - Test prints one sticker through the raw path.
 * - The desktop app (Electron / Tauri) is detected, not configured here.
 *
 * Each line shows where the NEXT press goes for labels and for paperwork.
 */

import { useState } from 'react';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, Switch } from '@/design-system/primitives';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { Printer } from '@/components/Icons';
import type { LabelPrintRoute } from '@/lib/label-prints/print-route';
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
import { desktopPrintHost } from '@/lib/print/desktop-print-host';
import { buildTestLabelCommands } from '@/lib/print/labelCommands';
import { isSilentPrintEnabled, setSilentPrintEnabled } from '@/lib/print/printMode';
import { cn } from '@/utils/_cn';
import { CHANNEL_FACE } from './print-faces';

const LANGUAGES: readonly LabelLanguage[] = ['tspl', 'zpl'];
const LANGUAGE_TABS = LANGUAGES.map((id) => ({ id, label: id.toUpperCase() }));
const TERM_CLASS = cn(RECORD_LABEL_CLASS, 'text-mode-faint');

function Line({ term, children }: { term: string; children: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-2">
      <span className={TERM_CLASS}>{term}</span>
      <span className="truncate text-role-caption text-mode-ink">{children}</span>
    </div>
  );
}

const routeFace = (route: LabelPrintRoute | undefined) =>
  route ? `${CHANNEL_FACE[route.channel]}${route.printerName ? ` · ${route.printerName}` : ''}` : '—';

export function PrinterConnectCard({
  routes,
  onChanged,
}: {
  routes: { label: LabelPrintRoute; paper: LabelPrintRoute } | null;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const silent = routes ? isSilentPrintEnabled() : true;
  const thermal = routes?.label.channel === 'THERMAL_USB' || routes?.label.channel === 'THERMAL_SERIAL' ? routes.label.profile : null;
  const host = routes ? desktopPrintHost() : null;
  const canPair = routes ? isBrowserPrintSupported() : false;

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
      onChanged();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connection cancelled.');
    } finally {
      setBusy(false);
    }
  };

  const setLanguage = (language: LabelLanguage) => {
    if (!thermal) return;
    upsertProfile({ ...thermal, language });
    onChanged();
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

  return (
    <RecordGroup
      title="Printers"
      testId="printer-connect-card"
      action={
        <label className="flex items-center gap-2">
          <span className={TERM_CLASS}>Silent</span>
          <Switch
            checked={silent}
            onCheckedChange={(next) => {
              setSilentPrintEnabled(next);
              onChanged();
            }}
            aria-label="Silent printing"
          />
        </label>
      }
    >
      <div className="flex flex-col gap-1.5 px-4 pb-3 pt-1">
        <Line term="Labels">{routeFace(routes?.label)}</Line>
        <Line term="Paperwork">{routeFace(routes?.paper)}</Line>
        <Line term="Desktop app">{host ? `Connected · ${host.kind === 'tauri' ? 'Tauri' : 'Electron'}` : 'Not detected'}</Line>
        {thermal ? (
          <div className="flex items-center gap-2">
            <span className={TERM_CLASS}>Language</span>
            <TabSwitch tabs={LANGUAGE_TABS} activeTab={thermal.language} onTabChange={(id) => setLanguage(id as LabelLanguage)} size="sm" fit="hug" />
            <Button variant="secondary" size="sm" radius="control" className="ml-auto" icon={<Printer />} disabled={busy} onClick={test}>
              Test
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" radius="control" disabled={busy || !canPair} onClick={() => connect('usb')}>
            {thermal ? 'Replace · USB' : 'Connect USB'}
          </Button>
          <Button variant="secondary" size="sm" radius="control" disabled={busy || !canPair} onClick={() => connect('serial')}>
            {thermal ? 'Replace · serial' : 'Connect serial'}
          </Button>
        </div>
        {!canPair && routes ? (
          <p className="text-role-caption text-mode-muted">This browser cannot reach USB or serial printers — use Chrome or Edge, or the desktop app.</p>
        ) : null}
        {status ? <p aria-live="polite" className="text-role-caption text-mode-muted">{status}</p> : null}
        <p className="text-role-caption text-mode-faint">{routes ? listProfiles().length : 0} printer profile(s) on this workstation.</p>
      </div>
    </RecordGroup>
  );
}
