'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { packProfileSaveError, savePackStandardMinutes } from '@/lib/packing/pack-profile-client';
import {
  MAX_PACK_STOP_INDEX,
  PACK_STANDARD_MINUTE_STOPS,
  formatPackMinutes,
  minutesForStopIndex,
  stopIndexForMinutes,
  tierForMinutes,
} from '@/lib/packing/pack-standard-stops';
import type { ProductPackProfile } from '@/lib/products/product-detail';
import { cn } from '@/utils/_cn';

const TIER_LABEL = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large' } as const;

export function MobileProductPackTimeCard({
  catalogId,
  packProfile,
  onSaved,
}: {
  catalogId: number;
  packProfile: ProductPackProfile;
  onSaved: (next: ProductPackProfile) => void;
}) {
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const [draft, setDraft] = useState(packProfile.minutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(packProfile.minutes), [packProfile.minutes]);
  const index = stopIndexForMinutes(draft);
  const minutes = minutesForStopIndex(index);
  const dirty = minutes !== packProfile.minutes;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await savePackStandardMinutes({ skuCatalogId: catalogId, minutes });
      if (!result.ok) {
        setError(packProfileSaveError(result));
        return;
      }
      onSaved({ minutes: result.minutes, tier: tierForMinutes(result.minutes), source: 'profile' });
    } catch {
      setError('Could not save time to pack.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-mode-panel px-mode-page py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-role-caption font-semibold text-mode-ink">Time to pack</h2>
        <span className="text-role-micro text-mode-muted">
          {packProfile.source === 'profile' ? 'Operator standard' : 'Catalog estimate'}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg font-semibold tabular-nums text-mode-ink">{formatPackMinutes(minutes)}</span>
        <span className="text-role-eyebrow text-mode-muted">{TIER_LABEL[tierForMinutes(minutes)]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={MAX_PACK_STOP_INDEX}
        step={1}
        value={index}
        disabled={!canManage || saving}
        aria-label="Time to pack"
        aria-valuetext={formatPackMinutes(minutes)}
        onChange={(event) => setDraft(minutesForStopIndex(Number(event.target.value)))}
        className={cn(
          'h-11 w-full min-w-0 cursor-pointer accent-[var(--ds-color-accent-text)]',
          focusRing('field', 'accent'),
          (!canManage || saving) && 'cursor-not-allowed opacity-50',
        )}
      />
      <div className="flex justify-between text-role-micro tabular-nums text-mode-muted">
        <span>{formatPackMinutes(PACK_STANDARD_MINUTE_STOPS[0])}</span>
        <span>{formatPackMinutes(PACK_STANDARD_MINUTE_STOPS[MAX_PACK_STOP_INDEX])}</span>
      </div>

      <p className="mt-3 text-role-micro text-mode-muted">
        Every completed pack for this SKU contributes this standard to packer KPIs.
      </p>
      {error ? <p role="alert" className="mt-2 text-role-caption text-text-danger">{error}</p> : null}
      {canManage ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" radius="flush" size="lg" disabled={!dirty || saving} loading={saving} onClick={save}>Save standard</Button>
          <Button variant="secondary" radius="flush" size="lg" disabled={!dirty || saving} onClick={() => { setDraft(packProfile.minutes); setError(null); }}>Reset</Button>
        </div>
      ) : (
        <p className="mt-3 text-role-micro text-mode-muted">Read-only — catalog manage permission is required.</p>
      )}
    </section>
  );
}
