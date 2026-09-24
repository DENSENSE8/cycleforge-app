'use client';

/**
 * SKU-grain manuals for the To-ship paperwork walk.
 *
 * Resolves through `/api/manuals/resolve` (catalog id, then legacy item
 * number). Pairing from the testing receiving-line API is the wrong grain —
 * that route is `receivingLineId`. The editor owns the ONE manuals viewer
 * (`DocumentSlideOver`, no print: pack prints inserts) so the walk's MANUALS
 * bar segment and a row here open the same frame.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from '@/components/Icons';
import type { DocumentSlideItem } from '@/design-system/components/DocumentSlideOver';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import { cn } from '@/utils/_cn';
import { LEDGER_HIT_CLASS } from '../outbound-orders-ledger-geometry';

type ResolvedManual = {
  id: number;
  displayName?: string | null;
  productTitle?: string | null;
  googleFileId?: string | null;
  previewUrl?: string | null;
  type?: string | null;
};

/** What the walk knows about one order's SKU manuals. */
export interface SkuManuals {
  /** An item number or SKU exists to resolve against. */
  enabled: boolean;
  isLoading: boolean;
  isError: boolean;
  /** Viewer frames, one per manual, in list order. */
  slideItems: DocumentSlideItem[];
}

export function useSkuManuals(
  itemNumber: string | null | undefined,
  sku: string | null | undefined,
): SkuManuals {
  const item = (itemNumber ?? '').trim();
  const skuKey = (sku ?? '').trim();
  const enabled = Boolean(item || skuKey);
  const query = useQuery({
    queryKey: ['paperwork-manuals', item, skuKey],
    enabled,
    queryFn: async (): Promise<ResolvedManual[]> => {
      const params = new URLSearchParams();
      if (item) params.set('itemNumber', item);
      if (skuKey) params.set('sku', skuKey);
      const res = await fetch(`/api/manuals/resolve?${params}`, {
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as {
        manuals?: ResolvedManual[];
      };
      if (!res.ok) throw new Error('Could not load manuals.');
      return data.manuals ?? [];
    },
  });

  const slideItems = useMemo((): DocumentSlideItem[] => {
    return (query.data ?? []).map((m) => {
      const src = m.googleFileId
        ? productManualContentPath(m.id)
        : (m.previewUrl ?? null);
      return {
        id: `manual:${m.id}`,
        title: m.displayName || m.productTitle || `Manual #${m.id}`,
        src,
        mimeHint: 'pdf',
        count: src ? 1 : undefined,
        emptyTitle: 'Manual file unavailable',
        emptyHint: 'Pair this SKU’s manuals from the product catalog.',
      };
    });
  }, [query.data]);

  return {
    enabled,
    isLoading: query.isLoading,
    isError: query.isError,
    slideItems,
  };
}

/** The Manuals fact's value: one flush row per linked manual, or why there is none. */
export function SkuManualsList({
  state,
  onOpen,
}: {
  state: SkuManuals;
  onOpen: (slideId: string) => void;
}) {
  if (!state.enabled) {
    return (
      <p className="text-role-caption text-mode-muted">
        This order needs an item number or SKU before manuals can resolve.
      </p>
    );
  }

  if (state.isLoading) {
    return <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Loading manuals…</p>;
  }

  if (state.isError) {
    return (
      <p className={cn(RECORD_LABEL_CLASS, STATE_TONE_CLASSES.danger.text)}>
        Could not load manuals.
      </p>
    );
  }

  if (state.slideItems.length === 0) {
    return (
      <p className="text-role-caption text-mode-muted">
        No manuals are linked to this item yet. Pack print will skip inserts
        unless you mark that this order needs none.
      </p>
    );
  }

  return (
    <ul className="flex flex-col border-t border-mode-edge">
      {state.slideItems.map((manual) => (
        <li key={manual.id} className="border-b border-mode-edge">
          <button
            type="button"
            data-testid="paperwork-manual"
            onClick={() => onOpen(manual.id)}
            className={cn(
              'ds-raw-button flex w-full min-w-0 items-center gap-2 px-2 text-left text-role-data text-mode-ink hover:bg-mode-hover',
              LEDGER_HIT_CLASS,
              focusRing('cell'),
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-mode-muted" aria-hidden />
            <span className="min-w-0 truncate">{manual.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
