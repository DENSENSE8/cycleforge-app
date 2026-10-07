'use client';

/**
 * A line still owed product paperwork: the library's three most likely
 * documents first (operator 2026-10-06 — suggestions, then search, then
 * upload). Ranked on the server (`GET /api/orders/[id]/paperwork-suggestions`):
 * the line's SKU / item # / title part number first, then name similarity.
 * Pressing one PREVIEWS it in the sheet's viewer — nothing links on click;
 * the viewer's Link pairs it (ruling: preview, then Link).
 */

import { useQuery } from '@tanstack/react-query';
import type { OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import { fetchPaperworkSuggestions, paperworkSuggestionsKey } from '@/lib/manuals/paperwork-suggest-contracts';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import { isPreviewing, type PreviewManual, type ViewerItem } from './doc-selection';
import { SheetRow, SheetThumb } from './SheetRow';

export function PaperworkSuggestions({
  line,
  current,
  onPreview,
}: {
  line: OrderPacketLine;
  /** What the viewer shows now — the previewed suggestion is pressed. */
  current: ViewerItem | null;
  onPreview: (manual: PreviewManual) => void;
}) {
  const read = useQuery({
    queryKey: paperworkSuggestionsKey(line.orderLineId),
    queryFn: () => fetchPaperworkSuggestions(line.orderLineId),
    staleTime: 60_000,
  });
  const paired = new Set(line.documents.flatMap((doc) => (doc.manualId != null ? [doc.manualId] : [])));
  const shown = (read.data ?? []).filter((s) => !paired.has(s.manualId));

  if (read.isPending) return <p className="mt-2 text-role-caption text-text-faint">Searching the library…</p>;
  if (read.isError) return <p className="mt-2 text-role-caption text-text-danger">{read.error.message}</p>;
  if (shown.length === 0) {
    return <p className="mt-2 text-role-caption text-text-muted">Nothing in the library looks like this item — search below or upload it.</p>;
  }
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1" data-testid="paperwork-suggestions">
      <p className="text-role-caption font-semibold text-text-muted">Suggested from the library</p>
      <ul className="flex min-w-0 flex-col gap-0.5">
        {shown.map((s) => {
          const detail = [s.type, s.why].filter(Boolean).join(' · ');
          return (
            <SheetRow
              key={s.manualId}
              testId="paperwork-suggestion"
              selected={isPreviewing(current, line.orderLineId, s.manualId)}
              onSelect={() =>
                onPreview({
                  manualId: s.manualId,
                  title: s.name,
                  // A suggestion carries no storage facts; the content route answers 404 for a file it does not hold, and the frame says so.
                  src: productManualContentPath(s.manualId),
                  driveUrl: null,
                  detail: detail || null,
                  origin: 'suggestion',
                })
              }
              thumb={<SheetThumb alt="" />}
              title={s.name}
              meta={detail}
            />
          );
        })}
      </ul>
    </div>
  );
}
