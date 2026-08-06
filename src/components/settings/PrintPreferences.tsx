'use client';

import { useEffect, useState } from 'react';
import {
  PAPER_SIZES,
  PRINTER_ROLES,
  deleteProfile,
  getRouting,
  isBrowserPrintSupported,
  isWebSerialSupported,
  isWebUsbSupported,
  listProfiles,
  newProfileId,
  printRawToProfile,
  profileSummary,
  requestSerialDevice,
  requestUsbDevice,
  resolvePaperSize,
  setRoute,
  upsertProfile,
  type LabelLanguage,
  type PrinterKind,
  type PrinterProfile,
  type PrinterRole,
} from '@/lib/print/browserPrint';
import { buildTestLabelCommands } from '@/lib/print/labelCommands';
import { isSilentPrintEnabled, setSilentPrintEnabled } from '@/lib/print/printMode';
import { friendlyPrintError } from '@/lib/print/printErrors';
import { Button, IconButton, Switch } from '@/design-system/primitives';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';

interface PrintPreferencesProps {
  onClose?: () => void;
}

const FIELD_CLS =
  'w-full rounded-xl border border-border-default bg-surface-card px-3 py-2 text-sm text-text-default ' +
  'placeholder:text-text-faint focus:border-blue-500 focus:outline-none focus:ring-2 ' +
  'focus:ring-blue-500/20';

const LANGUAGES: { id: LabelLanguage; label: string }[] = [
  { id: 'tspl', label: 'TSPL (TSC / generic thermal)' },
  { id: 'zpl', label: 'ZPL (Zebra)' },
  { id: 'escpos', label: 'ESC/POS (80mm receipt)' },
];

/**
 * Per-workstation switch: print labels silently (no dialog) vs. hand them to
 * the browser print dialog. Mirrors the app's house switch markup.
 */
function SilentPrintToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(isSilentPrintEnabled());
  }, []);
  const setSilent = (next: boolean) => {
    setOn(next);
    setSilentPrintEnabled(next);
  };
  return (
    <div className="mb-4 flex items-center gap-3 rounded-none border border-border-soft bg-surface-canvas px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-default">Silent printing</div>
        <p className="mt-0.5 text-xs text-text-soft">
          {on
            ? 'Labels print straight to the configured printer with no dialog.'
            : 'Labels open the browser print dialog so you can pick a printer / preview.'}
        </p>
      </div>
      <Switch
        checked={on}
        onCheckedChange={setSilent}
        aria-label="Toggle silent printing"
        checkedClassName="data-[state=checked]:bg-emerald-600"
      />
    </div>
  );
}

export function PrintPreferences({ onClose }: PrintPreferencesProps) {
  const webAvail = isBrowserPrintSupported();

  return (
    <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-default">Print preferences</h3>
          <p className="text-xs text-text-soft">Profiles apply to this workstation only.</p>
        </div>
        {onClose && (
          <IconButton
            type="button"
            onClick={onClose}
            ariaLabel="Close"
            className="rounded-xl border border-border-default bg-surface-card px-2 py-1.5 text-xs text-text-muted hover:bg-surface-hover"
            icon={<span aria-hidden>✕</span>}
          />
        )}
      </div>

      <SilentPrintToggle />

      {webAvail ? (
        <BrowserProfiles />
      ) : (
        <div className="rounded-none border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Silent printing isn&rsquo;t available in this browser.</p>
          <p className="mt-1 text-amber-800">
            Use Chrome or Edge to pair wired label printers on Windows or macOS.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browser — multiple printer profiles (label / paper / receipt)
// ---------------------------------------------------------------------------
function BrowserProfiles() {
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [routing, setRouting] = useState<Partial<Record<PrinterRole, string>>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    reload();
  }, []);

  function reload() {
    setProfiles(listProfiles());
    setRouting(getRouting());
  }

  async function pair(kind: 'usb' | 'serial') {
    setBusy(true);
    setStatus('Pick the printer in the browser dialog…');
    try {
      const dev = kind === 'usb' ? await requestUsbDevice() : await requestSerialDevice();
      const profile: PrinterProfile = {
        id: newProfileId(),
        name: dev.suggestedName,
        role: profiles.some((p) => p.role === 'label') ? 'receipt' : 'label',
        kind: dev.kind,
        vendorId: dev.vendorId,
        productId: dev.productId,
        serialNumber: dev.serialNumber,
        language: kind === 'serial' ? 'escpos' : 'tspl',
        paperSizeId: '2x1',
        baudRate: kind === 'serial' ? 9600 : undefined,
        copies: 1,
      };
      upsertProfile(profile);
      reload();
      setStatus(
        kind === 'usb'
          ? `Paired: ${profile.name}. If its Test says “Access denied”, this USB printer is driver-owned — pair it as a serial port instead.`
          : `Paired: ${profile.name}. Set the language to match your printer, then hit Test.`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Pairing cancelled');
    } finally {
      setBusy(false);
    }
  }

  function addOsPrinter() {
    const profile: PrinterProfile = {
      id: newProfileId(),
      name: 'Office printer',
      role: 'paper',
      kind: 'os',
      deviceName: '',
      language: 'none',
      paperSizeId: 'letter',
      copies: 1,
    };
    upsertProfile(profile);
    reload();
    setStatus('Added a paper/office profile — set its name to the OS printer.');
  }

  return (
    <div className="space-y-4">
      <div className="rounded-none border border-border-soft bg-surface-canvas px-3 py-2 text-xs text-text-muted">
        Pair a printer for each role. Labels &amp; receipts print silently from the browser (raw
        TSPL/ZPL/ESC-POS). Paper/office printers use the browser print dialog.
        <span className="mt-1 block text-text-soft">
          If a vendor driver already owns the USB printer, WebUSB can’t reach it (“Access denied”).
          Pair it as a <strong>serial port</strong> for reliable silent printing, or remove the driver to use USB.
        </span>
      </div>

      {profiles.length === 0 ? (
        <p className="rounded-none border border-dashed border-border-default bg-surface-card px-3 py-6 text-center text-sm text-text-soft">
          No printers paired yet.
        </p>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              isDefaultForRole={routing[p.role] === p.id}
              onChange={(next) => {
                upsertProfile(next);
                reload();
              }}
              onMakeDefault={() => {
                setRoute(p.role, p.id);
                reload();
              }}
              onRemove={() => {
                deleteProfile(p.id);
                reload();
              }}
              onStatus={setStatus}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border-soft pt-4">
        {isWebUsbSupported() && (
          <Button type="button" variant="secondary" size="sm" onClick={() => pair('usb')} disabled={busy}>
            + Pair USB printer
          </Button>
        )}
        {isWebSerialSupported() && (
          <Button type="button" variant="secondary" size="sm" onClick={() => pair('serial')} disabled={busy}>
            + Pair serial printer
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={addOsPrinter}>
          + Add paper / office printer
        </Button>
      </div>
      {status && <p className="text-xs text-text-soft">{status}</p>}
    </div>
  );
}

function ProfileCard({
  profile,
  isDefaultForRole,
  onChange,
  onMakeDefault,
  onRemove,
  onStatus,
}: {
  profile: PrinterProfile;
  isDefaultForRole: boolean;
  onChange: (p: PrinterProfile) => void;
  onMakeDefault: () => void;
  onRemove: () => void;
  onStatus: (s: string) => void;
}) {
  const sizes = PAPER_SIZES.filter((s) => s.kinds.includes(profile.kind as PrinterKind));
  const set = <K extends keyof PrinterProfile>(key: K, value: PrinterProfile[K]) =>
    onChange({ ...profile, [key]: value });

  async function onTest() {
    if (profile.kind === 'os') {
      onStatus('Paper/office printers use the browser print dialog when a job runs — no silent test here.');
      return;
    }
    onStatus('Sending test label…');
    const commands = buildTestLabelCommands(
      profile.language,
      resolvePaperSize(profile.paperSizeId),
      profile.name,
      new Date().toLocaleString(),
      profile.copies,
    );
    const res = await printRawToProfile(commands, profile);
    onStatus(res.success ? `Test sent to ${profile.name} ✓` : friendlyPrintError(res.reason));
  }

  return (
    <div className="rounded-none border border-border-soft bg-surface-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          value={profile.name}
          onChange={(e) => set('name', e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-text-default hover:border-border-default focus:border-blue-500 focus:outline-none"
        />
        <span className="shrink-0 text-role-caption text-text-faint">{profileSummary(profile)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-role-caption font-medium text-text-muted">Role</span>
          <select value={profile.role} onChange={(e) => set('role', e.target.value as PrinterRole)} className={FILTER_DROPDOWN_SELECT_CLASS}>
            {PRINTER_ROLES.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
          </select>
        </label>

        {profile.kind !== 'os' ? (
          <label className="block">
            <span className="mb-1 block text-role-caption font-medium text-text-muted">Language</span>
            <select value={profile.language} onChange={(e) => set('language', e.target.value as LabelLanguage)} className={FILTER_DROPDOWN_SELECT_CLASS}>
              {LANGUAGES.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-role-caption font-medium text-text-muted">OS printer name</span>
            <input value={profile.deviceName ?? ''} onChange={(e) => set('deviceName', e.target.value)} placeholder="System default" className={`${FIELD_CLS} px-2 py-1.5`} />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-role-caption font-medium text-text-muted">Paper size</span>
          <select value={profile.paperSizeId} onChange={(e) => set('paperSizeId', e.target.value)} className={FILTER_DROPDOWN_SELECT_CLASS}>
            {sizes.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
          </select>
        </label>

        {profile.kind === 'serial' && (
          <label className="block">
            <span className="mb-1 block text-role-caption font-medium text-text-muted">Baud</span>
            <select value={profile.baudRate ?? 9600} onChange={(e) => set('baudRate', Number(e.target.value))} className={FILTER_DROPDOWN_SELECT_CLASS}>
              {[9600, 19200, 38400, 57600, 115200].map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-role-caption font-medium text-text-muted">Copies</span>
          <input type="number" min={1} max={20} value={profile.copies} onChange={(e) => set('copies', Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className={`${FIELD_CLS} px-2 py-1.5`} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-hairline pt-3">
        <Button type="button" variant="primary" size="sm" onClick={onTest}>Test</Button>
        {isDefaultForRole ? (
          <span className="rounded-lg bg-green-50 px-2 py-1 text-role-caption font-medium text-green-700">Default for {profile.role}</span>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={onMakeDefault}>Make default for {profile.role}</Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={onRemove} className="ml-auto">Remove</Button>
      </div>
    </div>
  );
}
