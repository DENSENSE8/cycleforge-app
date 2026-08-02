'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { QR_BASE_URL } from '@/lib/barcode-routing';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { DEFAULT_CONFIG, type PrinterConfig } from './types';
import { clampMax } from './storage';

interface ConfigSheetProps {
  open: boolean;
  onClose: () => void;
  config: PrinterConfig;
  onSave: (next: PrinterConfig) => void;
}

export function ConfigSheet({ open, onClose, config, onSave }: ConfigSheetProps) {
  const [draft, setDraft] = useState<PrinterConfig>(config);
  const { identity } = useOrgGs1();
  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  const set = (k: keyof PrinterConfig) => (v: string) => {
    setDraft({
      ...draft,
      [k]: clampMax(v, (DEFAULT_CONFIG as unknown as Record<string, number>)[k]),
    });
  };

  const handleSave = () => {
    onSave({
      maxAisles: clampMax(draft.maxAisles, DEFAULT_CONFIG.maxAisles),
      maxBays: clampMax(draft.maxBays, DEFAULT_CONFIG.maxBays),
      maxLevels: clampMax(draft.maxLevels, DEFAULT_CONFIG.maxLevels),
      maxPositions: clampMax(draft.maxPositions, DEFAULT_CONFIG.maxPositions),
    });
  };

  const handleReset = () => setDraft({ ...DEFAULT_CONFIG });

  return (
    <BottomSheet open={open} onClose={onClose} title="Configure counts">
      <p className="mb-4 text-center text-role-caption text-text-soft">
        Match these to your warehouse layout. Saved locally — no rebuild required.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <NumField label="Aisles" value={draft.maxAisles} onChange={set('maxAisles')} />
        <NumField label="Bays" value={draft.maxBays} onChange={set('maxBays')} />
        <NumField label="Levels" value={draft.maxLevels} onChange={set('maxLevels')} />
        <NumField label="Positions" value={draft.maxPositions} onChange={set('maxPositions')} />
      </div>

      {/*
        Read-only on purpose. A GLN is a LICENSED identifier belonging to the
        company, so it is workspace-wide (Settings → Organization → Product
        identity) rather than a per-browser preference. Editing it here used to
        let two operators print the same rack with different GLNs, neither of
        them the value the rest of the app reads.
      */}
      <div className="mt-4">
        <span className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">
          GLN (Global Location Number)
        </span>
        <p className="mt-1 font-mono text-sm font-semibold text-text-default">
          {identity.gln || 'None'}
        </p>
        <p className="mt-1 text-role-micro text-text-faint">
          {identity.gln
            ? 'Licensed GLN for this workspace — labels print as a GS1 DataMatrix carrying (414). An admin can change it in Settings → Organization.'
            : 'This workspace holds no GLN, so labels carry the bare location code — which scans exactly the same here. An admin can add one in Settings → Organization once you register with GS1.'}
        </p>
      </div>

      <div className="mt-3 text-role-micro text-text-faint">
        Domain in QR: <span className="font-mono">{QR_BASE_URL}</span>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse sm:gap-3">
        <Button
          variant="primary"
          onClick={handleSave}
          icon={<Check className="h-4 w-4" />}
          className="h-12 w-full sm:flex-1"
        >
          Save
        </Button>
        <Button
          variant="ghost"
          onClick={handleReset}
          className="h-12 w-full sm:flex-1"
        >
          Reset
        </Button>
      </div>
    </BottomSheet>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">
        {label}
      </label>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-12 w-full rounded-2xl border border-border-default bg-surface-canvas px-4 text-center text-lg font-semibold tabular-nums text-text-default outline-none focus:border-blue-500 focus:bg-surface-card focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );
}
