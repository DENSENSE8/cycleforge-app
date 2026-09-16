'use client';

/**
 * Shared dialog to set a SKU catalog pack-profile override — ONE control.
 *
 * Was a tier-segmented control PLUS a free-text minutes input, which could
 * disagree (LARGE at 3 minutes). Now the operator drags `PackTimeSlider` and
 * the tier follows from the number (`tierForMinutes`), so the dialog and the
 * Products desk record set the same fact the same way.
 *
 * Writes via `savePackStandardMinutes` → PATCH /api/sku-catalog/[id] →
 * `upsertSkuPackProfileLink`.
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
import { PackTimeSlider } from '@/components/packing/PackTimeSlider';
import { DEFAULT_TIER_MINUTES, type PackTier } from '@/lib/packing/pack-tier-classifier';
import { snapMinutes } from '@/lib/packing/pack-standard-stops';
import {
  packProfileSaveError,
  savePackStandardMinutes,
} from '@/lib/packing/pack-profile-client';
import { toast } from '@/lib/toast';

type PackProfileEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skuCatalogId: number | null;
  /** Optional display label (SKU / title). */
  label?: string | null;
  /** Seeds the slider when the SKU has no stored minutes yet. */
  initialTier?: PackTier | null;
  initialMinutes?: number | null;
  onSaved?: () => void;
};

/** The standard time the slider opens on: stored minutes, else the tier default. */
function seedMinutes(tier: PackTier | null | undefined, minutes: number | null | undefined): number {
  return snapMinutes(minutes ?? DEFAULT_TIER_MINUTES[tier ?? 'MEDIUM']);
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
  const [minutes, setMinutes] = useState<number>(() => seedMinutes(initialTier, initialMinutes));

  useEffect(() => {
    if (!open) return;
    setMinutes(seedMinutes(initialTier, initialMinutes));
  }, [open, initialTier, initialMinutes]);

  const save = useMutation({
    mutationFn: async () => {
      if (skuCatalogId == null || !Number.isFinite(skuCatalogId)) {
        throw new Error('missing catalog');
      }
      return savePackStandardMinutes({ skuCatalogId, minutes });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(packProfileSaveError(res));
        return;
      }
      toast.success('Time to pack saved — future packs use this standard.');
      queryClient.invalidateQueries({ queryKey: ['packing-kpi'] });
      queryClient.invalidateQueries({ queryKey: ['packing-kpi-items'] });
      queryClient.invalidateQueries({ queryKey: ['pack-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pack-review-row'] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: () => toast.error('Could not save time to pack.'),
  });

  const canSave = skuCatalogId != null && Number.isFinite(skuCatalogId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Time to pack</DialogTitle>
        </DialogHeader>
        {label ? <p className="text-role-caption text-text-muted truncate">{label}</p> : null}
        {skuCatalogId == null ? (
          <p className="text-sm text-text-muted">
            This pack is not linked to a catalog SKU. Link the listing in Packing Review › Catalog
            link, then set the time to pack.
          </p>
        ) : (
          <PackTimeSlider minutes={minutes} onMinutes={setMinutes} className="pt-1" />
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
