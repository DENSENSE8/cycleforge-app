'use client';

/** Time to pack, on the Products desk record — the SKU→standard-time control. */

import { useEffect, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { PackTimeSlider } from '@/components/packing/PackTimeSlider';
import { useAuth } from '@/contexts/AuthContext';
import {
  packProfileSaveError,
  savePackStandardMinutes,
} from '@/lib/packing/pack-profile-client';
import { formatPackMinutes, tierForMinutes } from '@/lib/packing/pack-standard-stops';
import type { ProductPackProfile } from '@/components/products/types';
import { cn } from '@/utils/_cn';

export function ProductPackTimeCard({
  catalogId,
  packProfile,
  onSaved,
  className,
}: {
  /** `sku_catalog.id` — the PATCH target. */
  catalogId: number;
  packProfile: ProductPackProfile;
  /** Receives the stored standard after a successful write. */
  onSaved: (next: ProductPackProfile) => void;
  className?: string;
}) {
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');

  const [draft, setDraft] = useState(packProfile.minutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when the record reloads (SKU change / post-save payload refresh).
  useEffect(() => {
    setDraft(packProfile.minutes);
  }, [packProfile.minutes]);

  const dirty = draft !== packProfile.minutes;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await savePackStandardMinutes({ skuCatalogId: catalogId, minutes: draft });
      if (!res.ok) {
        setError(packProfileSaveError(res));
        return;
      }
      onSaved({ minutes: res.minutes, tier: tierForMinutes(res.minutes), source: 'profile' });
    } catch {
      setError('Could not save time to pack.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cn('rounded-mode border border-border-soft bg-surface-card p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-role-caption font-semibold text-text-default">Time to pack</h2>
        <span className="text-role-micro text-text-soft">
          {packProfile.source === 'profile' ? 'Set by an operator' : 'Guessed from the title'}
        </span>
      </div>

      <PackTimeSlider minutes={draft} onMinutes={setDraft} disabled={!canManage || saving} />

      <p className="mt-3 text-role-micro text-text-soft">
        Every pack of this SKU is weighted at this standard in the packer report.
        {dirty ? ` Stored: ${formatPackMinutes(packProfile.minutes)}.` : ''}
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-role-caption text-text-muted">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || saving}
            loading={saving}
            onClick={save}
          >
            Save
          </Button>
          {dirty ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDraft(packProfile.minutes);
                setError(null);
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-role-micro text-text-faint">
          Read-only — editing needs catalog manage permission.
        </p>
      )}
    </section>
  );
}
