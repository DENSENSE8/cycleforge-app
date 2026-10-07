'use client';

/**
 * The paperwork tab's library search, under the suggestions (operator
 * 2026-10-06; replaces the order pane's `LibraryPairPicker` dropdown on this
 * surface). Debounced over `/api/product-manuals/search` (name, title, SKU,
 * item #, file). Pressing a result PREVIEWS it in the viewer — nothing links
 * on click; the viewer's Link pairs it.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SearchField } from '@/design-system/primitives/SearchField';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import type { OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import { isPreviewing, type PreviewManual, type ViewerItem } from './doc-selection';
import { SheetRow, SheetThumb } from './SheetRow';

/** `/api/product-manuals/search` row (`normalizeRow`). */
interface LibraryManual {
  id: number;
  sku: string | null;
  item_number: string | null;
  product_title: string | null;
  display_name: string | null;
  google_file_id: string;
  source_url: string | null;
  thumbnail_url: string | null;
  status: string;
  type: string | null;
}

const RESULT_LIMIT = 12;

export function LibrarySearch({
  line,
  current,
  onPreview,
}: {
  line: OrderPacketLine;
  current: ViewerItem | null;
  onPreview: (manual: PreviewManual) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const library = useQuery({
    queryKey: ['paperwork-library-search', q],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/product-manuals/search?${new URLSearchParams({ q, limit: String(RESULT_LIMIT) })}`, {
        credentials: 'same-origin',
        signal,
      });
      const body = (await res.json().catch(() => ({}))) as { manuals?: LibraryManual[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Library search failed (${res.status}).`);
      return body.manuals ?? [];
    },
    enabled: q.length > 0,
    staleTime: 60_000,
  });
  const paired = new Set(line.documents.flatMap((doc) => (doc.manualId != null ? [doc.manualId] : [])));
  const results = library.data ?? [];

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1" data-testid="paperwork-library-search">
      <SearchField
        value={query}
        onChange={setQuery}
        debounceMs={250}
        size="compact"
        tone="neutral"
        isSearching={library.isFetching}
        placeholder="Search the library — name, SKU or item #"
      />
      {q.length === 0 ? null : library.isError ? (
        <p className="text-role-caption text-text-danger">{library.error.message}</p>
      ) : library.isPending ? null : results.length === 0 ? (
        <p className="text-role-caption text-text-muted">Nothing in the library matches “{q}”. Upload it below.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-0.5" aria-label="Library results">
          {results.map((manual) => {
            const title = manual.display_name || manual.product_title || `Manual #${manual.id}`;
            const detail = [
              manual.sku ? `SKU ${manual.sku}` : null,
              manual.item_number ? `Item # ${manual.item_number}` : null,
              manual.type,
              paired.has(manual.id) ? 'already linked' : manual.status === 'unassigned' ? 'unassigned' : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <SheetRow
                key={manual.id}
                testId="paperwork-library-result"
                selected={isPreviewing(current, line.orderLineId, manual.id)}
                onSelect={() =>
                  onPreview({
                    manualId: manual.id,
                    title,
                    src: String(manual.source_url ?? '').startsWith('http') ? productManualContentPath(manual.id) : null,
                    driveUrl: manual.google_file_id ? `https://docs.google.com/document/d/${manual.google_file_id}/preview` : null,
                    detail: detail || null,
                    origin: 'search',
                  })
                }
                thumb={<SheetThumb src={manual.thumbnail_url} alt="" />}
                title={title}
                meta={detail}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
