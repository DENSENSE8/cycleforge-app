'use client';

/**
 * SKU-grain manuals for the To-ship paperwork walk.
 *
 * Resolves through `/api/manuals/resolve` (catalog id, then legacy item
 * number). Viewing uses {@link DocumentSlideOver}. Pairing from the testing
 * receiving-line API is the wrong grain — that route is `receivingLineId`.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DocumentSlideOver,
  type DocumentSlideItem,
} from '@/design-system/components/DocumentSlideOver';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';

type ResolvedManual = {
  id: number;
  displayName?: string | null;
  productTitle?: string | null;
  googleFileId?: string | null;
  previewUrl?: string | null;
  type?: string | null;
};

export function SkuManualsPanel({
  itemNumber,
  sku,
}: {
  itemNumber: string | null | undefined;
  sku: string | null | undefined;
}) {
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

  const manuals = query.data ?? [];
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerActiveId, setViewerActiveId] = useState<string | undefined>();

  const slideItems = useMemo((): DocumentSlideItem[] => {
    return manuals.map((m) => {
      const name = m.displayName || m.productTitle || `Manual #${m.id}`;
      const src = m.googleFileId
        ? productManualContentPath(m.id)
        : (m.previewUrl ?? null);
      return {
        id: `manual:${m.id}`,
        title: name,
        src,
        mimeHint: 'pdf',
        count: src ? 1 : undefined,
        emptyTitle: 'Manual file unavailable',
        emptyHint: 'Pair this SKU’s manuals from the product catalog.',
      };
    });
  }, [manuals]);

  if (!enabled) {
    return (
      <p className="text-role-caption text-text-soft">
        This order needs an item number or SKU before manuals can resolve.
      </p>
    );
  }

  if (query.isLoading) {
    return <p className="text-role-caption text-text-soft">Loading manuals…</p>;
  }

  if (query.isError) {
    return (
      <p className="text-role-caption text-text-danger">Could not load manuals.</p>
    );
  }

  if (manuals.length === 0) {
    return (
      <p className="text-role-caption text-text-soft">
        No manuals are linked to this item yet. Pack print will skip inserts
        unless you mark that this order needs none.
      </p>
    );
  }

  return (
    <div className="stack-section">
      <ul className="flex flex-col gap-1">
        {manuals.map((m) => {
          const name = m.displayName || m.productTitle || `Manual #${m.id}`;
          return (
            <li key={m.id}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => {
                  setViewerActiveId(`manual:${m.id}`);
                  setViewerOpen(true);
                }}
              >
                {name}
              </Button>
            </li>
          );
        })}
      </ul>
      <DocumentSlideOver
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title="Manuals"
        items={slideItems}
        activeId={viewerActiveId}
        onActiveIdChange={setViewerActiveId}
        showPrint={false}
        storageKey="paperwork-manuals-slide-over-width"
        aria-label="SKU manuals preview"
      />
    </div>
  );
}
