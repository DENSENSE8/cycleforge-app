'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Printer } from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DocumentPreviewFrame } from '@/design-system/components/DocumentPreviewFrame';
import { Button, SearchField } from '@/design-system/primitives';
import { useOrderPackChecklist } from '@/hooks/useOrderPackChecklist';
import { outboundDocumentContentSrc, outboundDocumentMimeHint } from '@/lib/documents/outbound-document-display';
import type { OutboundDocument } from '@/lib/documents/types';
import {
  printDocument,
  useOrderDocuments,
  useOrderManuals,
  useOrderPaperworkActions,
  type OrderManual,
} from '@/lib/orders/order-paperwork-client';
import { kitPartDocumentContentPath } from '@/lib/packing/kit-part-document';
import { triggerPackPrintBundle } from '@/lib/print/pack-print-bundle-client';

type Paper = {
  id: string;
  title: string;
  src: string | null;
  mimeHint: 'pdf' | 'image' | 'unknown';
  source: string;
};

type LibraryManual = {
  id: number;
  display_name: string | null;
  product_title: string | null;
  item_number: string | null;
  file_name: string | null;
};

function documentPaper(doc: OutboundDocument): Paper {
  return {
    id: `doc:${doc.id}`,
    title: doc.documentType === 'shipping_label' ? 'Shipping label' : 'Packing slip',
    src: outboundDocumentContentSrc(doc),
    mimeHint: outboundDocumentMimeHint(doc),
    source: `Order document #${doc.id}`,
  };
}

function manualPaper(manual: OrderManual): Paper {
  const file = manual.fileName || manual.contentUrl || '';
  return {
    id: `manual:${manual.id}`,
    title: manual.displayName,
    src: manual.contentUrl || manual.externalUrl,
    mimeHint: /\.(png|jpe?g|webp)(\?|$)/i.test(file) ? 'image' : 'pdf',
    source: `Paperwork · ${manual.source === 'item_number' ? 'item number' : manual.source || 'order'}`,
  };
}

async function searchLibrary(query: string): Promise<LibraryManual[]> {
  const params = new URLSearchParams({ q: query, limit: '30' });
  const res = await fetch(`/api/product-manuals/search?${params}`, { credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as { manuals?: Array<LibraryManual & { id: number | string }>; error?: string };
  if (!res.ok) throw new Error(body.error || 'Could not search paperwork');
  return (body.manuals ?? []).map((manual) => ({ ...manual, id: Number(manual.id) }));
}

/**
 * Every paper for one order — label, slip, paired manuals, kit inserts — with
 * a preview, Open / Print per paper, and a library search that pairs a manual
 * to the order's item number. `pack` adds the bench print-bundle verbs (the
 * same `POST /documents/print` the desk pack station uses; never re-buys).
 *
 * Role `dock-verb` (`mobile-sheet-roles.ts`): opened by a Paperwork verb from
 * the pick screen, the pack job, the pack camera or a pack history entry.
 */
export function MobileOrderPaperworkSheet({
  open,
  onClose,
  orderId,
  orderRef,
  pack,
}: {
  open: boolean;
  onClose: () => void;
  /** `orders.id`. */
  orderId: number;
  orderRef: string;
  /** Packing context: enables Print / Reprint of the whole bundle. */
  pack?: { packerLogId: number | null };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printMessage, setPrintMessage] = useState<string | null>(null);

  const documents = useOrderDocuments(open ? orderId : 0);
  const manuals = useOrderManuals(open ? orderId : 0);
  const checklist = useOrderPackChecklist({ orderRowId: orderId, enabled: open });
  const { pairManual } = useOrderPaperworkActions(orderId, orderRef);
  const trimmedQuery = query.trim();
  const library = useQuery({
    queryKey: ['paperwork-manual-library', trimmedQuery],
    queryFn: () => searchLibrary(trimmedQuery),
    enabled: open && trimmedQuery.length > 0,
    staleTime: 60_000,
  });

  const papers: Paper[] = [
    ...(documents.data?.documents ?? []).map(documentPaper),
    ...(manuals.data?.manuals ?? []).map(manualPaper),
    ...(checklist.data?.lines ?? []).flatMap((line) =>
      line.kitParts.flatMap((part) =>
        part.document
          ? [{
              id: `part:${part.id}`,
              title: part.document.title,
              src: kitPartDocumentContentPath(part.id),
              mimeHint: part.document.mime ?? 'unknown',
              source: `Kit insert · ${line.productTitle}`,
            } satisfies Paper]
          : [],
      ),
    ),
  ];
  const active = papers.find((paper) => paper.id === selected) ?? papers[0] ?? null;
  const loading = documents.isPending || manuals.isPending || checklist.isPending;
  const loadFailed = documents.isError || manuals.isError || checklist.isError;
  const itemNumber = manuals.data?.itemNumber ?? null;
  const pairedIds = new Set(manuals.data?.manuals.map((manual) => manual.id) ?? []);
  const candidates = (library.data ?? []).filter((manual) => !pairedIds.has(manual.id));

  const printBundle = async (reprint: boolean) => {
    if (!pack) return;
    setPrinting(true);
    try {
      const result = await triggerPackPrintBundle({ orderRowId: orderId, packerLogId: pack.packerLogId, reprint });
      setPrintMessage(result.message || (result.status === 'failed' ? 'Print failed.' : 'Print request sent.'));
    } catch (error) {
      setPrintMessage(error instanceof Error ? error.message : 'Print failed.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Order paperwork" forceVariant="sheet" fullScreen level={1}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <p className="text-role-caption text-text-muted">Check every label, slip, manual and kit insert before packing.</p>

        {pack ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" icon={<Printer />} loading={printing} onClick={() => void printBundle(false)}>
              Print pack papers + label
            </Button>
            <Button variant="secondary" size="sm" disabled={printing} onClick={() => void printBundle(true)}>
              Reprint bundle
            </Button>
            {printMessage ? <p role="status" className="w-full text-role-caption text-text-muted">{printMessage}</p> : null}
          </div>
        ) : null}

        {papers.length > 0 ? (
          <div role="group" aria-label="Order documents" className="flex flex-wrap gap-2">
            {papers.map((paper) => (
              <Button
                key={paper.id}
                variant={active?.id === paper.id ? 'primarySoft' : 'secondary'}
                size="sm"
                onClick={() => setSelected(paper.id)}
              >
                {paper.title}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-role-caption text-text-muted">{loading ? 'Loading paperwork…' : 'No paperwork attached to this order.'}</p>
        )}
        {loadFailed ? (
          <p role="alert" className="text-role-caption text-text-danger">Some paperwork could not be loaded. Reopen before confirming.</p>
        ) : null}

        {active ? (
          <div className="border border-border-soft bg-surface-card">
            <div className="flex items-center justify-between gap-2 border-b border-border-soft p-2">
              <p className="min-w-0 truncate text-role-caption text-text-muted">{active.source}</p>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" icon={<Printer />} disabled={!active.src} onClick={() => active.src && printDocument(active.src)}>
                  Print
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ExternalLink />}
                  disabled={!active.src}
                  onClick={() => active.src && window.open(active.src, '_blank', 'noopener,noreferrer')}
                >
                  Open
                </Button>
              </div>
            </div>
            <DocumentPreviewFrame title={active.title} src={active.src} mimeHint={active.mimeHint} className="min-h-[42dvh]" />
          </div>
        ) : null}

        <div className="border-t border-border-soft pt-3">
          <p className="mb-2 text-role-data font-semibold text-text-default">Pair existing paperwork to item # {itemNumber || '—'}</p>
          <SearchField
            value={query}
            onChange={setQuery}
            size="compact"
            placeholder="Search manuals by name or item #"
            isSearching={library.isFetching}
          />
          {!itemNumber && !manuals.isPending ? (
            <p className="mt-2 text-role-caption text-text-muted">This order needs an item number before an item-level pairing.</p>
          ) : null}
          {library.isError ? <p role="alert" className="mt-2 text-role-caption text-text-danger">Could not search the manual library.</p> : null}
          {trimmedQuery && library.isSuccess && candidates.length === 0 ? (
            <p className="mt-2 text-role-caption text-text-muted">No matching paperwork.</p>
          ) : null}
          <ul className="mt-2 flex flex-col gap-1">
            {candidates.map((manual) => (
              <li key={manual.id} className="flex items-center justify-between gap-2 border border-border-soft p-2">
                <div className="min-w-0">
                  <p className="truncate text-role-data text-text-default">
                    {manual.display_name || manual.product_title || manual.file_name || `Manual #${manual.id}`}
                  </p>
                  <p className="text-role-caption text-text-muted">{manual.item_number ? `Item #${manual.item_number}` : 'Unpaired item'}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pairManual.isPending && pairManual.variables?.manualId === manual.id}
                  disabled={!itemNumber || pairManual.isPending}
                  onClick={() => pairManual.mutate({ manualId: manual.id, pairTo: 'item_number' })}
                >
                  Pair
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </BottomSheet>
  );
}
