'use client';

import { useCallback, useMemo, useState } from 'react';
import { ExternalLink, FileText, Plus, Unlink } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import {
  DocumentSlideOver,
  type DocumentSlideItem,
} from '@/design-system/components/DocumentSlideOver';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { toast } from '@/lib/toast';
import { pairManual, unpairManual } from './sku-testing-api';
import { EYEBROW, SECTION, type Bundle } from './sku-testing-types';
import { ManualPicker } from './ManualPicker';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';

/**
 * Paired SKU manuals — view in DocumentSlideOver, unpair, and pair from library.
 *
 * View only: the tech reads the manual to test the unit. Paper output is a
 * pack-time concern, so the viewer is opened with `showPrint={false}`.
 */
export function ManualsSection({
  receivingLineId,
  bundle,
  onChanged,
  embedded = false,
}: {
  receivingLineId: number;
  bundle: Bundle;
  onChanged: () => Promise<void>;
  /** Bare body for tab panels — drops the card chrome + section eyebrow. */
  embedded?: boolean;
}) {
  const [pairing, setPairing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerActiveId, setViewerActiveId] = useState<string | undefined>();
  const manuals = bundle.manuals;

  const unpair = useCallback(
    async (manualId: number) => {
      try {
        await unpairManual(receivingLineId, manualId);
        await onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not unpair manual');
      }
    },
    [receivingLineId, onChanged],
  );

  const slideItems = useMemo((): DocumentSlideItem[] => {
    return manuals.map((m) => {
      const name = m.display_name || m.file_name || `Manual #${m.id}`;
      // Same-origin content proxy — Vercel Blob CSP blanks PDFs in iframes.
      // `/api/documents/:id/content` still needs orders.view; only use it when
      // there is no product-manuals blob.
      const src =
        m.source_url
          ? productManualContentPath(m.id)
          : m.document_id != null && m.document_id > 0
            ? `/api/documents/${m.document_id}/content`
            : null;
      return {
        id: `manual:${m.id}`,
        title: name,
        src,
        mimeHint: 'pdf',
        count: src ? 1 : undefined,
        emptyTitle: 'Manual file unavailable',
        emptyHint: 'Re-pair from the library or open the Products manuals library.',
        meta: m.type ? (
          <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">
            {m.type}
          </span>
        ) : null,
      };
    });
  }, [manuals]);

  const openViewer = (manualId?: number) => {
    if (manualId != null) setViewerActiveId(`manual:${manualId}`);
    else if (manuals[0]) setViewerActiveId(`manual:${manuals[0].id}`);
    setViewerOpen(true);
  };

  const Wrapper = embedded ? 'div' : 'section';

  return (
    <Wrapper className={embedded ? undefined : SECTION}>
      <div className={`mb-3 flex items-center ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded ? <h3 className={EYEBROW}>Manuals</h3> : null}
        <div className="flex items-center gap-1">
          {manuals.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<FileText />}
              onClick={() => openViewer()}
              data-testid="open-manuals-slide-over"
              className="text-text-soft hover:bg-blue-50 hover:text-blue-700"
            >
              View
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus />}
            onClick={() => setPairing((v) => !v)}
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          >
            Pair
          </Button>
        </div>
      </div>

      {pairing ? (
        <ManualPicker
          onPair={(manualId) => pairManual(receivingLineId, manualId)}
          onPaired={async () => {
            setPairing(false);
            await onChanged();
          }}
        />
      ) : null}

      {manuals.length === 0 ? (
        <p className="text-role-caption text-text-faint">No manuals paired to this SKU yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {manuals.map((m) => {
            const name = m.display_name || m.file_name || `Manual #${m.id}`;
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-none border border-border-soft/70 bg-surface-card px-3 py-2">
                {m.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnail_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border-soft" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-faint">
                    <FileText className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-role-caption font-semibold text-text-default">{name}</span>
                  {m.type ? (
                    <span className="block text-role-micro font-medium uppercase tracking-wide text-text-faint">{m.type}</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {m.source_url || m.document_id ? (
                    <HoverTooltip label="View manual" asChild>
                      <IconButton
                        icon={<FileText className="h-4 w-4" />}
                        onClick={() => openViewer(m.id)}
                        ariaLabel="View manual"
                        className="rounded-md p-1.5 text-text-soft hover:bg-blue-50 hover:text-blue-600"
                      />
                    </HoverTooltip>
                  ) : null}
                  {m.source_url ? (
                    <HoverTooltip label="Open in new tab" asChild>
                      <a
                        href={productManualContentPath(m.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open in new tab"
                        className="rounded-md p-1.5 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </HoverTooltip>
                  ) : null}
                  <HoverTooltip label="Unpair manual" asChild>
                    <IconButton
                      icon={<Unlink className="h-4 w-4" />}
                      onClick={() => void unpair(m.id)}
                      ariaLabel="Unpair manual"
                      className="rounded-md p-1.5 text-text-faint hover:bg-rose-50 hover:text-rose-600"
                    />
                  </HoverTooltip>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <DocumentSlideOver
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title="Manuals"
        items={slideItems}
        activeId={viewerActiveId}
        onActiveIdChange={setViewerActiveId}
        showPrint={false}
        storageKey="testing-manuals-slide-over-width"
        aria-label="SKU manuals preview"
      />
    </Wrapper>
  );
}
