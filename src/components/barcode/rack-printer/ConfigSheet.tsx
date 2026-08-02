import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { QR_BASE_URL } from '@/lib/barcode-routing';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { DEFAULT_CONFIG, clampMax, type PrinterConfig } from './rack-printer-config';

interface ConfigSheetProps {
  open: boolean;
  onClose: () => void;
  config: PrinterConfig;
  onSave: (next: PrinterConfig) => void;
}

/** Bottom-sheet editor for the per-warehouse counts (localStorage-backed). */
export function ConfigSheet({ open, onClose, config, onSave }: ConfigSheetProps) {
  const [draft, setDraft] = useState<PrinterConfig>(config);
  const { identity } = useOrgGs1();
  useEffect(() => { if (open) setDraft(config); }, [open, config]);

  const set = (k: keyof PrinterConfig) => (v: string) => {
    setDraft({ ...draft, [k]: clampMax(v, (DEFAULT_CONFIG as unknown as Record<string, number>)[k]) });
  };

  const handleSave = () => {
    onSave({
      maxAisles: clampMax(draft.maxAisles, DEFAULT_CONFIG.maxAisles),
      maxBays: clampMax(draft.maxBays, DEFAULT_CONFIG.maxBays),
      maxLevels: clampMax(draft.maxLevels, DEFAULT_CONFIG.maxLevels),
    });
  };

  const handleReset = () => setDraft({ ...DEFAULT_CONFIG });

  return (
    <BottomSheet open={open} onClose={onClose} title="Configure counts">
      <p className="mb-4 text-center text-role-caption text-text-soft">
        Match these to your warehouse layout. Saved locally — no rebuild required.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <NumField label="Aisles" value={draft.maxAisles} onChange={set('maxAisles')} />
        <NumField label="Bays" value={draft.maxBays} onChange={set('maxBays')} />
        <NumField label="Levels" value={draft.maxLevels} onChange={set('maxLevels')} />
      </div>

      {/*
        Read-only on purpose — the GLN is a licensed, workspace-wide identifier
        (Settings → Organization → Product identity), not a per-browser
        preference. See the bin printer's ConfigSheet for the full note.
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
          icon={<Check />}
          onClick={handleSave}
          className="h-12 w-full rounded-2xl sm:flex-1"
        >
          Save
        </Button>
        <Button
          variant="ghost"
          onClick={handleReset}
          className="h-12 w-full rounded-2xl sm:flex-1"
        >
          Reset
        </Button>
      </div>
    </BottomSheet>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">{label}</label>
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
