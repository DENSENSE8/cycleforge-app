'use client';

/** Time to pack, on the Products desk record — the SKU→standard-time control. */

import { useEffect, useState } from 'react';
import { Collapse } from '@/design-system/components/Collapse';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
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
  embedded = false,
}: {
  /** `sku_catalog.id` — the PATCH target. */
  catalogId: number;
  packProfile: ProductPackProfile;
  /** Receives the stored standard after a successful write. */
  onSaved: (next: ProductPackProfile) => void;
  className?: string;
  /** TriageSections already owns the card surface when embedded. */
  embedded?: boolean;
}) {
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');

  const [draft, setDraft] = useState(packProfile.minutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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
      setEditing(false);
    } catch {
      setError('Could not save time to pack.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={cn(
        !embedded && 'border border-border-soft bg-surface-card p-4',
        !embedded && cornerClass('surface'),
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {!embedded ? <h2 className="text-role-caption font-semibold text-text-default">Time to pack</h2> : null}
          <p className="text-role-body font-semibold text-text-default">{formatPackMinutes(packProfile.minutes)}</p>
          <p className="text-role-micro text-text-soft">
            {packProfile.source === 'profile' ? 'Set by an operator' : 'Guessed from the title'}
          </p>
        </div>
        {canManage ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
            {editing ? 'Close' : 'Adjust'}
          </Button>
        ) : null}
      </div>

      <Collapse open={editing} className="mt-4 border-t border-border-hairline pt-4">
        <PackTimeSlider minutes={draft} onMinutes={setDraft} disabled={!canManage || saving} />
        <p className="mt-3 text-role-micro text-text-soft">
          Every pack of this SKU is weighted at this standard in the packer report.
          {dirty ? ` Stored: ${formatPackMinutes(packProfile.minutes)}.` : ''}
        </p>
        {error ? <p role="alert" className="mt-2 text-role-caption text-text-muted">{error}</p> : null}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={!dirty || saving} loading={saving} onClick={save}>Save</Button>
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
      </Collapse>

      {!canManage ? (
        <p className="mt-3 text-role-micro text-text-faint">
          Read-only — editing needs catalog manage permission.
        </p>
      ) : null}
    </section>
  );
}
