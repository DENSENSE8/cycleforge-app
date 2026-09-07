'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_WORKSTATION,
  getWorkstation,
  normalizePackBenchLocationId,
  setWorkstation,
  type WorkstationRole,
  type WorkstationSettings,
} from '@/lib/settings/workstation';
import { packPlacementQuery } from '@/lib/queries/pack-placement-queries';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import { Download, Monitor, Smartphone } from '@/components/Icons';
import { PhoneSignInQrDialog } from '@/components/quick-access/PhoneSignInQrButton';
import { useAuth } from '@/contexts/AuthContext';
import { isDesktopHost } from '@/lib/desktop/desktop-host';
import { DESKTOP_DOWNLOAD_URL } from '@/lib/desktop/desktop-download';
import { openKioskShellPreview } from '@/lib/kiosk/preview-url';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';




const ROLES: { value: WorkstationRole; label: string }[] = [
  { value: '', label: '— No default role —' },
  { value: 'packer', label: 'Packer' },
  { value: 'tech', label: 'Technician' },
  { value: 'receiver', label: 'Receiver' },
  { value: 'admin', label: 'Admin' },
];

const FIELD_CLS = cn(
  'w-full rounded-xl border border-border-default bg-surface-card px-3 py-2 text-sm text-text-default',
  'placeholder:text-text-faint',
  focusRing('field', 'accent'),
);

const DEVICE_ACTION_CLS = cn(
  'ds-raw-button inline-flex w-full items-center gap-2 rounded-xl border border-border-soft bg-surface-card px-4 py-2 text-left text-xs font-semibold text-text-default hover:bg-surface-canvas',
  focusRing('control', 'accent'),
);

/**
 * Once-per-bench setup that used to live in the account ⋯ menu. Workstation
 * is "this station / this machine", so phone QR, kiosk preview, and the
 * desktop installer belong here — not beside Settings / clipboard / sign-out.
 */
function ThisDevicePanel() {
  const { user } = useAuth();
  const [phoneQrOpen, setPhoneQrOpen] = useState(false);
  const [inDesktopShell, setInDesktopShell] = useState(false);
  useEffect(() => setInDesktopShell(isDesktopHost()), []);

  return (
    <>
      <Panel radius="2xl" className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-text-default">This device</h3>
          <p className="mt-1 text-xs text-text-soft">
            Open this station on a phone, preview the kiosk shell, or install the desktop app.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={DEVICE_ACTION_CLS}
            onClick={() => setPhoneQrOpen(true)}
          >
            <Smartphone className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            Open on your phone
          </button>
          <button
            type="button"
            className={DEVICE_ACTION_CLS}
            onClick={() => openKioskShellPreview(user?.organizationSlug ?? undefined)}
          >
            <Monitor className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            Kiosk shell preview
          </button>
          {!inDesktopShell ? (
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={DEVICE_ACTION_CLS}
            >
              <Download className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              Download desktop app
            </a>
          ) : null}
        </div>
      </Panel>
      <PhoneSignInQrDialog open={phoneQrOpen} onOpenChange={setPhoneQrOpen} />
    </>
  );
}

export function WorkstationSection() {
  const [settings, setSettings] = useState<WorkstationSettings>(DEFAULT_WORKSTATION);
  const [status, setStatus] = useState('');
  // Bench list for the packing-bench binding. The `locations` row stays the SoT —
  // this setting only REFERENCES one, and never counts anything.
  const benchQuery = useQuery(packPlacementQuery());
  const benches = benchQuery.data?.locations ?? [];

  useEffect(() => { setSettings(getWorkstation()); }, []);

  function update<K extends keyof WorkstationSettings>(key: K, value: WorkstationSettings[K]) {
    const next = setWorkstation({ [key]: value } as Partial<WorkstationSettings>);
    setSettings(next);
    setStatus('Saved');
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="sr-only">Workstation</h2>
        <p className="mt-1 text-sm text-text-soft">
          Identifies which station this is so forms and filters can pre-fill. Local to this device.
        </p>
      </header>

      <Panel radius="2xl" className="space-y-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Station name</span>
          <input
            type="text"
            placeholder="e.g. Packing 02, Receiving Bay A"
            value={settings.stationName}
            onChange={(e) => update('stationName', e.target.value)}
            className={FIELD_CLS}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Default warehouse / location</span>
          <input
            type="text"
            placeholder="e.g. SAL, MAIN, TSN"
            value={settings.defaultWarehouse}
            onChange={(e) => update('defaultWarehouse', e.target.value.toUpperCase())}
            className={FIELD_CLS}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Default role</span>
          <select
            value={settings.defaultRole}
            onChange={(e) => update('defaultRole', e.target.value as WorkstationRole)}
            className={FIELD_CLS}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <span className="mt-1 block text-role-caption text-text-soft">
            Determines which dashboard opens by default when the app launches.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Packing bench</span>
          <select
            value={settings.packBenchLocationId == null ? '' : String(settings.packBenchLocationId)}
            onChange={(e) =>
              update('packBenchLocationId', normalizePackBenchLocationId(e.target.value))
            }
            disabled={benchQuery.isPending || benchQuery.isError}
            data-testid="workstation-pack-bench"
            className={FIELD_CLS}
          >
            <option value="">— No bench —</option>
            {benches.map((bench) => (
              // The FACE, not the warehouse name — an operator picking their
              // bench here should read the same word the floor chips show.
              <option key={bench.id} value={String(bench.id)}>
                {packBenchShortLabel({
                  locationName: bench.name,
                  locationDisplayName: bench.displayName,
                  locationKind: bench.locationKind,
                })}
                {bench.locationKind === 'STAGING' ? ' (staging)' : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-role-caption text-text-soft">
            {benchQuery.isPending
              ? 'Loading benches…'
              : benchQuery.isError
                ? "Couldn't load packing benches. The saved bench is unchanged."
                : benches.length === 0
                  ? 'No packing benches exist yet. Add a DESK or STAGING location under Inventory → Locations.'
                  : 'Ready to Pack arms this bench automatically when nothing is armed. Clearing the bench there wins for the rest of that session.'}
          </span>
        </label>

        {status && <span className="block text-xs text-text-soft">{status}</span>}
      </Panel>

      <ThisDevicePanel />
    </div>
  );
}
