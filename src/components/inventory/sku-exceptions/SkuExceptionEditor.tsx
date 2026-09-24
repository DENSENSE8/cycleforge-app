'use client';

/**
 * The SKU-exception record — one placeholder SKU, beside the queue rail.
 *
 * Four sections, in the order a desk resolves one: what it is (Product), what
 * it looks like (Photos), where it sits and how many (Locations & count), and
 * what it really is (Pair to Zoho SKU). Every write goes through the same
 * endpoints the phone uses and then invalidates the shared queries, so the
 * phone and this desk repaint each other.
 *
 * Owns its Escape (→ `onExit`); the host keys it on the SKU.
 */

import { useCallback, useEffect, useId, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Link2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { CopyChip } from '@/components/ui/CopyChip';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { CONTEXT_PANEL_HOST_CLASS } from '@/components/sidebar/context-panel-column';
import { ExceptionsWalkSidebar } from '@/components/outbound/orders/exceptions/ExceptionsWalkSidebar';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { skuExceptionShareUrl } from '@/lib/inventory/sku-exception-links';
import { shareRecordLink } from '@/lib/share-link';
import { skuExceptionTitle } from '@/lib/tables/field-catalog/sku-exceptions-resolve';
import { SkuExceptionProductFields } from './SkuExceptionProductFields';
import { SkuExceptionPhotos } from './SkuExceptionPhotos';
import { SkuExceptionLocations } from './SkuExceptionLocations';
import { SkuExceptionPairing } from './SkuExceptionPairing';

export function SkuExceptionEditor({
  item,
  queue,
  onExit,
}: {
  item: ProvisionalSkuDetail;
  /** The queue rail — walks the other exceptions while this one is open. */
  queue: ReactNode;
  /** Leave the record — ◁ Queue, Escape, and a completed pairing land here. */
  onExit: () => void;
}) {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const title = skuExceptionTitle(item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.blur();
        return;
      }
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const refresh = useCallback(
    () => invalidateSkuExceptions(queryClient),
    [item.sku, queryClient],
  );

  // Leave first: the record no longer exists once the merge lands.
  const paired = useCallback(async () => {
    onExit();
    await refresh();
  }, [onExit, refresh]);

  return (
    <div className={CONTEXT_PANEL_HOST_CLASS} data-testid="sku-exception-editor">
      <ExceptionsWalkSidebar>{queue}</ExceptionsWalkSidebar>
      <TriageScrollLayout
        className="min-h-0 min-w-0 flex-1"
        header={
          <div className="flex items-center gap-3 border-b border-border-hairline px-6 py-3">
            <Button variant="ghost" size="sm" icon={<ChevronLeft />} onClick={onExit}>
              Queue
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h2 className="truncate text-role-body font-semibold text-text-default" title={title}>
                {title}
              </h2>
              <CopyChip value={item.sku} display={item.sku} tone="sku" fitDisplayWidth />
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Link2 />}
              onClick={() => void shareRecordLink(skuExceptionShareUrl(item.sku), `SKU exception — ${title}`)}
              data-testid="sku-exception-share"
            >
              Share link
            </Button>
          </div>
        }
        sections={[
          {
            id: 'sku-exception-product',
            label: 'Product',
            children: <SkuExceptionProductFields fieldId={fieldId} item={item} onSaved={refresh} />,
          },
          {
            id: 'sku-exception-photos',
            label: `Photos (${item.photos.length})`,
            children: <SkuExceptionPhotos item={item} onChanged={refresh} />,
          },
          {
            id: 'sku-exception-locations',
            label: 'Locations & count',
            children: <SkuExceptionLocations item={item} onChanged={refresh} />,
          },
          {
            id: 'sku-exception-pair',
            label: 'Pair to Zoho SKU',
            children: <SkuExceptionPairing fieldId={fieldId} item={item} onPaired={paired} />,
          },
        ]}
      />
    </div>
  );
}
