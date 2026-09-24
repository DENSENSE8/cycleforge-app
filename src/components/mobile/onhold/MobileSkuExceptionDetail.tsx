'use client';

/**
 * `/m/on-hold/[sku]` — one SKU exception (a floor-minted `TMP-…` placeholder).
 *
 * Everything the phone can do to the record short of pairing lives here:
 * rename and describe it, shoot more photos (or drop a bad one), count it into
 * a location, and share its link with whoever knows what it really is. The one
 * primary verb — pair to the real Zoho SKU — is the sticky CTA and has its own
 * screen, because it is the irreversible one.
 *
 * Live: desk edits, photos and stock moves elsewhere refetch this record.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Link2, Share2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { IconButton, TextField } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { OnHoldBadge } from '@/components/mobile/pair/OnHoldBadge';
import {
  invalidateSkuExceptions,
  useProvisionalSku,
  useSkuExceptionsRealtime,
} from '@/hooks/useProvisionalSkus';
import { mobileSkuExceptionHref, skuExceptionShareUrl } from '@/lib/inventory/sku-exception-links';
import { shareRecordLink } from '@/lib/share-link';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { SkuExceptionLocations } from './SkuExceptionLocations';
import { SkuExceptionPhotos } from './SkuExceptionPhotos';
import { SkuExceptionSection } from './SkuExceptionSection';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

export function MobileSkuExceptionDetail({ sku }: { sku: string }) {
  const router = useRouter();
  useSkuExceptionsRealtime();
  const { data: item, mergedInto, isPending, isError, refetch } = useProvisionalSku(sku);

  if (isPending) {
    return (
      <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
        <MobileDetailTopBar title="Loading…" subtitle="SKU exception" backHref="/m/on-hold" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
        <MobileDetailTopBar title={sku} subtitle="SKU exception" mono backHref="/m/on-hold" />
        <div className="flex flex-col items-start gap-3 px-4 py-6">
          {mergedInto ? (
            <p className="flex items-center gap-2 text-role-caption text-text-default">
              <Link2 className="h-4 w-4 shrink-0" />
              <span>
                Already paired to <span className="font-mono font-semibold">{mergedInto}</span>.
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {isError ? 'Could not load this SKU exception.' : 'This SKU exception does not exist.'}
            </p>
          )}
          {isError && (
            <Button variant="secondary" radius="flush" size="md" onClick={() => void refetch()}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
      <MobileDetailTopBar
        title={item.productTitle}
        subtitle="SKU exception"
        backHref="/m/on-hold"
        right={
          <IconButton
            size="touch"
            ariaLabel="Share link"
            icon={<Share2 className="h-5 w-5" />}
            onClick={() => void shareRecordLink(skuExceptionShareUrl(item.sku), item.productTitle)}
          />
        }
      />

      <div className="min-h-0 flex-1 pb-4">
        <section className="space-y-1 border-b border-border-hairline bg-surface-card px-4 py-3">
          <div className="flex items-center gap-2">
            <OnHoldBadge />
            <span className="font-mono text-role-caption text-text-soft">{item.sku}</span>
          </div>
          <p className="font-mono text-role-caption text-text-soft">Barcode {item.barcode}</p>
          <p className="text-role-caption text-text-default tabular-nums">
            {item.stock} on hand · {item.locations.length} location
            {item.locations.length === 1 ? '' : 's'}
          </p>
          {item.createdByName || item.createdAt ? (
            <p className="text-role-micro text-text-faint">
              Created
              {item.createdByName ? ` by ${item.createdByName}` : ''}
              {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
            </p>
          ) : null}
        </section>

        <SkuExceptionDetails item={item} />
        <SkuExceptionPhotos item={item} />
        <SkuExceptionLocations item={item} />
      </div>

      <footer className="sticky bottom-0 border-t border-border-soft bg-surface-card px-4 py-3">
        <Button
          variant="primary"
          size="lg"
          radius="flush"
          className="w-full"
          icon={<Link2 />}
          onClick={() => router.push(`${mobileSkuExceptionHref(item.sku)}/pair`)}
        >
          Pair to Zoho SKU
        </Button>
      </footer>
    </div>
  );
}

/** Title + description, PATCHed together. Drafts are `null` until touched so live refetches repaint. */
function SkuExceptionDetails({ item }: { item: ProvisionalSku }) {
  const queryClient = useQueryClient();
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title = titleDraft ?? item.productTitle;
  const description = descriptionDraft ?? item.description ?? '';
  const trimmedTitle = title.trim();
  const dirty =
    trimmedTitle !== item.productTitle || description.trim() !== (item.description ?? '').trim();
  const titleValid = trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX;

  const save = useCallback(async () => {
    if (!dirty || !titleValid || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(item.sku)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: trimmedTitle,
          description: description.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) throw new Error(data?.error || `Save failed (${res.status})`);
      await invalidateSkuExceptions(queryClient, item.sku);
      setTitleDraft(null);
      setDescriptionDraft(null);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [description, dirty, item.sku, queryClient, saving, titleValid, trimmedTitle]);

  return (
    <SkuExceptionSection id="sku-exception-details" heading="Details">
      <div className="flex flex-col gap-2 border-y border-border-hairline bg-surface-card px-3 py-3">
        <TextField
          label="Title"
          value={title}
          onChange={(next) => setTitleDraft(next.slice(0, TITLE_MAX))}
          maxLength={TITLE_MAX}
          autoComplete="off"
        />
        <TextField
          label="Description"
          value={description}
          onChange={(next) => setDescriptionDraft(next.slice(0, DESCRIPTION_MAX))}
          multiline
          rows={3}
          maxLength={DESCRIPTION_MAX}
          autoComplete="off"
        />
        {dirty && (
          <div className="flex items-stretch gap-2">
            <Button
              variant="secondary"
              size="lg"
              radius="flush"
              className="flex-1"
              disabled={saving}
              onClick={() => {
                setTitleDraft(null);
                setDescriptionDraft(null);
              }}
            >
              Discard
            </Button>
            <Button
              variant="secondary"
              size="lg"
              radius="flush"
              className="flex-1"
              loading={saving}
              disabled={!titleValid}
              onClick={() => void save()}
            >
              {titleValid ? 'Save' : `Title needs ${TITLE_MIN}+ characters`}
            </Button>
          </div>
        )}
      </div>
    </SkuExceptionSection>
  );
}
