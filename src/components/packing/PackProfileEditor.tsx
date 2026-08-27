'use client';

/**
 * Shared dialog to set a SKU catalog pack-profile override (S/M/L + minutes).
 * Writes via PATCH /api/sku-catalog/[id] → upsertSkuPackProfileLink.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives';
import { DEFAULT_TIER_MINUTES, type PackTier } from '@/lib/packing/pack-tier-classifier';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

const TIERS: PackTier[] = ['SMALL', 'MEDIUM', 'LARGE'];

type PackProfileEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skuCatalogId: number | null;
  /** Optional display label (SKU / title). */
  label?: string | null;
  initialTier?: PackTier | null;
  initialMinutes?: number | null;
  onSaved?: () => void;
};

async function patchPackProfile(args: {
  skuCatalogId: number;
  packTier: PackTier;
  estimatedPackMinutes: number;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(`/api/sku-catalog/${args.skuCatalogId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packTier: args.packTier,
      estimatedPackMinutes: args.estimatedPackMinutes,
    }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  return {
    ok: res.ok && body?.success !== false,
    status: res.status,
    error: body?.error,
  };
}

export function PackProfileEditor({
  open,
  onOpenChange,
  skuCatalogId,
  label,
  initialTier,
  initialMinutes,
  onSaved,
}: PackProfileEditorProps) {
  const queryClient = useQueryClient();
  const [tier, setTier] = useState<PackTier>(initialTier ?? 'MEDIUM');
  const [minutes, setMinutes] = useState<number>(
    initialMinutes ?? DEFAULT_TIER_MINUTES[initialTier ?? 'MEDIUM'],
  );

  useEffect(() => {
    if (!open) return;
    const nextTier = initialTier ?? 'MEDIUM';
    setTier(nextTier);
    setMinutes(initialMinutes ?? DEFAULT_TIER_MINUTES[nextTier]);
  }, [open, initialTier, initialMinutes]);

  const save = useMutation({
    mutationFn: async () => {
      if (skuCatalogId == null || !Number.isFinite(skuCatalogId)) {
        throw new Error('missing catalog');
      }
      return patchPackProfile({
        skuCatalogId,
        packTier: tier,
        estimatedPackMinutes: minutes,
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(
          res.status === 403
            ? 'You need catalog manage permission to edit pack size.'
            : res.error || 'Could not save pack size.',
        );
        return;
      }
      toast.success('Pack size saved — future packs use this profile.');
      queryClient.invalidateQueries({ queryKey: ['packing-kpi'] });
      queryClient.invalidateQueries({ queryKey: ['packing-kpi-items'] });
      queryClient.invalidateQueries({ queryKey: ['pack-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pack-review-row'] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: () => toast.error('Could not save pack size.'),
  });

  const canSave = skuCatalogId != null && Number.isFinite(skuCatalogId) && minutes >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit pack size</DialogTitle>
        </DialogHeader>
        {label ? <p className="text-role-caption text-text-muted truncate">{label}</p> : null}
        {skuCatalogId == null ? (
          <p className="text-sm text-text-muted">
            This pack is not linked to a catalog SKU. Link the listing in Packing Review › Catalog
            link, then set the pack size.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-role-eyebrow uppercase tracking-widest text-text-soft">Tier</p>
              <div className="inline-flex items-center rounded-lg border border-border-soft bg-surface-canvas p-0.5">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    // ds-raw-button — segmented tier control (same pattern as Ops Segmented)
                    className={cn(
                      'ds-raw-button rounded-md px-2.5 py-1 text-role-eyebrow uppercase tracking-widest transition-colors',
                      tier === t
                        ? 'bg-surface-card text-text-default shadow-sm'
                        : 'text-text-soft hover:text-text-default',
                    )}
                    onClick={() => {
                      setTier(t);
                      setMinutes(DEFAULT_TIER_MINUTES[t]);
                    }}
                  >
                    {t === 'SMALL' ? 'Small' : t === 'MEDIUM' ? 'Medium' : 'Large'}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1.5">
              <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                Estimated minutes
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className={cn(
                  'w-full rounded-xl border border-border-soft bg-surface-canvas px-3 py-2 text-sm tabular-nums text-text-default',
                  focusRing('field', 'accent'),
                )}
              />
              <span className="text-role-micro text-text-soft">
                Defaults: Small {DEFAULT_TIER_MINUTES.SMALL} · Medium {DEFAULT_TIER_MINUTES.MEDIUM} ·
                Large {DEFAULT_TIER_MINUTES.LARGE}
              </span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {skuCatalogId == null ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                if (typeof window !== 'undefined') {
                  window.location.href = '/review?mode=catalog-link';
                }
              }}
            >
              Link catalog
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={!canSave || save.isPending}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
