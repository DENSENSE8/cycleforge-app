'use client';

/**
 * Every label of an uploaded PDF, inline — the only place an operator sees a
 * label before it prints once silent printing is on. One tile per page:
 *
 *   ☐ Page 3 · ● 5010                         [Reprint]
 *   ┌──────────┐
 *   │  4×6     │   rastered exactly as it prints, when it scrolls into view
 *   └──────────┘
 *   PRINTED ×2 · Sep 28, 2:14 PM · Michael · Thermal bench     History ▾
 *
 * The print badge is the record (owner 2026-09-28): never printed reads loud,
 * every print after the first counts up, and History lists each print — when,
 * who, which station, first or reprint.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, RotateCcw } from '@/components/Icons';
import { OrderNumberIdentity } from '@/components/ui/OrderIdentityChips';
import { Button, Checkbox } from '@/design-system/primitives';
import { useOrderChannel } from '@/hooks/useCatalog';
import type { LabelBatchPage } from '@/lib/label-batches/contracts';
import { fetchLabelPrintHistory, labelPdfSrc, labelPrintHistoryKey } from '@/lib/label-prints/http-client';
import { rasterizeDocument } from '@/lib/label-prints/label-raster';
import { SHIPPING_LABEL_PAPER } from '@/lib/label-prints/print-route';
import { statusPillLabel } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';
import { CHANNEL_FACE } from './print-faces';

const WHEN = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The label as it prints — rastered only once the tile nears the viewport. */
function PagePreview({ page }: { page: LabelBatchPage }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || near) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return undefined;
    let live = true;
    rasterizeDocument(labelPdfSrc(page.id), SHIPPING_LABEL_PAPER).then(
      (pages) => live && setImage(pages[0] ?? null),
      (error: unknown) => live && setFailure(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      live = false;
    };
  }, [near, page.id]);

  return (
    <div
      ref={host}
      // Square corners: a label is a sheet — rounding would clip its printed border and corner marks.
      className="flex aspect-[4/6] w-full items-center justify-center overflow-hidden border border-border-hairline bg-surface-card"
      data-testid="batch-page-preview"
    >
      {image ? (
        <img src={image} alt={`Label, page ${page.pageNumber}`} className="h-full w-full object-contain" />
      ) : (
        <span className="px-3 text-center text-role-caption text-text-muted">{failure ?? 'Rendering…'}</span>
      )}
    </div>
  );
}

function PrintHistory({ id }: { id: number }) {
  const history = useQuery({ queryKey: labelPrintHistoryKey(id), queryFn: () => fetchLabelPrintHistory(id) });
  if (history.isPending) return <p className="text-role-caption text-text-muted">Reading the print log…</p>;
  if (history.isError) return <p className="text-role-caption text-text-danger">{history.error.message}</p>;
  return (
    <ol className="flex flex-col gap-0.5" data-testid="batch-page-history">
      {history.data.map((event, index) => (
        <li key={event.id} className="flex min-w-0 gap-2 text-role-caption tabular-nums text-text-default">
          <span className="w-6 shrink-0 text-text-muted">#{history.data.length - index}</span>
          <span className="min-w-0 truncate">
            {WHEN.format(new Date(event.printedAt))} · {event.printedBy ?? 'Unknown'} ·{' '}
            {event.stationName ?? event.printerName ?? CHANNEL_FACE[event.channel]}
            {event.isReprint ? ' · reprint' : ' · first print'}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PageTile({
  page,
  checked,
  onCheck,
  onPrint,
  printing,
}: {
  page: LabelBatchPage;
  checked: boolean;
  onCheck: (next: boolean) => void;
  onPrint: () => void;
  printing: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const channel = useOrderChannel()(page.orderRef ?? '', page.orderAccountSource);
  const printed = page.printCount > 0;
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-2xl bg-surface-card p-3 ring-1 ring-inset',
        checked ? 'ring-2 ring-fill-info' : 'ring-border-hairline',
      )}
      data-testid="batch-page"
      data-printed={printed ? page.printCount : 0}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={(next) => onCheck(next === true)} aria-label={`Include page ${page.pageNumber} in the next print`} />
        <span className="shrink-0 text-sm font-semibold tabular-nums text-text-default">Page {page.pageNumber}</span>
        <span className="min-w-0 truncate text-sm">
          {page.orderId != null && page.orderRef ? (
            <OrderNumberIdentity orderId={page.orderRef} platformLabel={channel.label || page.orderAccountSource} />
          ) : (
            <span className="font-mono text-xs text-text-muted">{page.trackingNumber ?? 'No order'}</span>
          )}
        </span>
        <Button
          variant={printed ? 'secondary' : 'ink'}
          size="sm"
          radius="control"
          className="ml-auto shrink-0"
          icon={printed ? <RotateCcw /> : <Printer />}
          disabled={printing}
          onClick={onPrint}
          data-testid="batch-page-print"
        >
          {printed ? 'Reprint' : 'Print'}
        </Button>
      </div>
      <PagePreview page={page} />
      <div className="flex min-w-0 items-center gap-2">
        {printed ? (
          <span className={cn('shrink-0 rounded-md bg-fill-success/15 px-2 py-0.5 text-text-success', statusPillLabel)} data-testid="batch-page-badge">
            Printed ×{page.printCount}
          </span>
        ) : (
          <span className={cn('shrink-0 rounded-md bg-fill-warning/15 px-2 py-0.5 text-text-warning', statusPillLabel)} data-testid="batch-page-badge">
            Not printed
          </span>
        )}
        {printed && page.lastPrintedAt ? (
          <span className="min-w-0 truncate text-role-caption tabular-nums text-text-muted">
            {WHEN.format(new Date(page.lastPrintedAt))}
            {page.lastPrintedBy ? ` · ${page.lastPrintedBy}` : ''}
            {page.lastStationName ? ` · ${page.lastStationName}` : ''}
          </span>
        ) : null}
        {printed ? (
          <Button
            variant="ghost"
            size="sm"
            radius="control"
            className="ml-auto shrink-0"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            data-testid="batch-page-history-toggle"
          >
            History
          </Button>
        ) : null}
      </div>
      {historyOpen ? <PrintHistory id={page.id} /> : null}
    </li>
  );
}

export function BatchPages({
  pages,
  included,
  onInclude,
  onPrintPage,
  printing,
}: {
  pages: readonly LabelBatchPage[];
  included: ReadonlySet<number>;
  onInclude: (id: number, next: boolean) => void;
  onPrintPage: (page: LabelBatchPage) => void;
  printing: boolean;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @6xl:grid-cols-3" data-testid="batch-pages">
      {pages.map((page) => (
        <PageTile
          key={page.id}
          page={page}
          checked={included.has(page.id)}
          onCheck={(next) => onInclude(page.id, next)}
          onPrint={() => onPrintPage(page)}
          printing={printing}
        />
      ))}
    </ul>
  );
}
