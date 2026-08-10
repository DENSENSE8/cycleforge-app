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

const ROLES: { value: WorkstationRole; label: string }[] = [
  { value: '', label: '— No default role —' },
  { value: 'packer', label: 'Packer' },
  { value: 'tech', label: 'Technician' },
  { value: 'receiver', label: 'Receiver' },
  { value: 'admin', label: 'Admin' },
];

const FIELD_CLS =
  'w-full rounded-xl border border-border-default bg-surface-card px-3 py-2 text-sm text-text-default ' +
  'placeholder:text-text-faint focus:border-blue-500 focus:outline-none focus:ring-2 ' +
  'focus:ring-blue-500/20';

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

      <div className="space-y-5 rounded-2xl border border-border-soft bg-surface-card p-5 shadow-sm">
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
              <option key={bench.id} value={String(bench.id)}>
                {bench.name}
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
      </div>
    </div>
  );
}
