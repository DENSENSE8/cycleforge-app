'use client';

/**
 * The docs sheet's viewer — full height, portrait, right of the work column
 * (operator 2026-10-06, round 2). It shows the ONE selected thing
 * (`ViewerItem`): a document on file, or a library document BEFORE it is
 * linked. Caption: title and facts; Fit page / Fit width and Open in a new
 * tab; the PDF's own toolbar pages and zooms. Its verbs: Link for a preview
 * (pairs at the line's default scope, naming its reach), the document's own
 * verbs otherwise. With nothing selected it says what is missing and how to
 * get it. A selection change cross-fades.
 */

import { useState } from 'react';
import { ArrowRight, ExternalLink, FileSearch, MoveHorizontal, Scan } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DocumentPreviewFrame } from '@/design-system/components/DocumentPreviewFrame';
import { resolveDocumentPreviewMime } from '@/design-system/components/document-preview-mime';
import type { PdfFit } from '@/design-system/components/FetchedPdfFrame';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { Button } from '@/design-system/primitives/Button';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import type { LabelUploads } from '@/features/labels-docs/upload/use-label-uploads';
import type { ViewerItem } from './doc-selection';
import { DOC_TAB_LABEL, docTabState, type DocTab } from './doc-tabs';
import { DocVerbs } from './doc-verbs';
import { AlsoLinkVerb, LinkVerb } from './link-verbs';
import { itemFacts } from './item-facts';
import { nextOwed, sameSkuOwing, type SheetPlace } from './sheet-model';

/** What the tab is missing and where to get it — the viewer with nothing to show. */
function emptyCopy(packet: OrderPacket, tab: DocTab): { title: string; description: string } {
  const exempt = docTabState(packet, tab) === 'not_required';
  if (tab === 'label') {
    return exempt
      ? { title: 'Pickup order — no shipping label', description: 'Nothing to link here.' }
      : {
          title: 'No shipping label on this order yet',
          description: 'Accept a suggested label, pair one already uploaded, upload the PDF or buy a label — on the left. It shows here once it is on file.',
        };
  }
  if (tab === 'slip') {
    return exempt
      ? { title: 'This order needs no packing slip', description: 'It is marked as needing no paperwork.' }
      : { title: 'No packing slip on this order yet', description: 'Fetch it from the channel or upload the PDF — on the left.' };
  }
  if (packet.lines.length === 0) return { title: 'No product lines on this order', description: 'There is no product to pair paperwork to.' };
  return exempt
    ? { title: 'No product paperwork needed', description: 'Every line’s SKU ships without paperwork.' }
    : {
        title: 'No product paperwork linked yet',
        description: 'Press a suggestion or a library search result on the left to see it here, then Link it. Not in the library? Upload it.',
      };
}

/** What a document with no viewable bytes is, and where it can be seen. */
function noBytesCopy(item: ViewerItem): { title: string; hint: string } {
  if (item.kind === 'preview') {
    return item.manual.driveUrl
      ? { title: 'Stored on Drive only — no preview here', hint: 'Open it in a new tab to check it before linking.' }
      : { title: 'This library entry has no stored file', hint: 'Upload the file instead, or pick another result.' };
  }
  return { title: 'Stored on Drive only — no preview', hint: 'It is listed for the order but cannot be printed from here.' };
}

export function DocViewer({
  item,
  tab,
  packet,
  rows,
  uploads,
  justLinked,
  onLinked,
  registerLink,
  onGo,
}: {
  item: ViewerItem | null;
  tab: DocTab;
  packet: OrderPacket;
  /** Every order of the selection, rail order — the also-link offer and Next owed read them. */
  rows: readonly OrderPacket[];
  uploads: LabelUploads;
  /** A Link landed in this sheet since the selection last changed: offer Next owed. */
  justLinked: boolean;
  onLinked: () => void;
  registerLink: (run: (() => void) | null) => void;
  onGo: (place: SheetPlace) => void;
}) {
  const [fit, setFit] = useState<PdfFit>('page');
  const presence = useMotionPresence(motionPresence.detailStackPush);
  const transition = useMotionTransition(motionTransition.workbenchPaneMount);
  const openHref = item ? (item.src ?? (item.kind === 'preview' ? item.manual.driveUrl : null)) : null;
  const paged = item?.src != null && resolveDocumentPreviewMime(item.src) !== 'image';
  const noBytes = item && !item.src ? noBytesCopy(item) : null;

  return (
    <section aria-label="Document viewer" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas" data-testid="docs-viewer">
      <header className="flex min-h-12 min-w-0 items-center gap-2 border-b border-border-soft bg-surface-card px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 truncate text-role-data font-semibold text-text-default" title={item?.title}>
            {item?.title ?? DOC_TAB_LABEL[tab]}
          </span>
          <span className="min-w-0 truncate text-role-caption text-text-muted" data-testid="docs-viewer-facts">
            {item ? itemFacts(item).join(' · ') : 'Nothing selected'}
          </span>
        </div>
        {paged ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            radius="control"
            icon={fit === 'page' ? <MoveHorizontal /> : <Scan />}
            onClick={() => setFit(fit === 'page' ? 'width' : 'page')}
            data-testid="docs-viewer-fit"
          >
            {fit === 'page' ? 'Fit width' : 'Fit page'}
          </Button>
        ) : null}
        {openHref ? (
          <Button variant="ghost" size="sm" radius="control" icon={<ExternalLink />} href={openHref} data-testid="docs-viewer-open">
            Open in new tab
          </Button>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false}>
          <motion.div
            key={item?.key ?? `empty:${tab}`}
            className="absolute inset-0 flex min-h-0 min-w-0"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
          >
            {item ? (
              <DocumentPreviewFrame
                title={item.title}
                src={item.src}
                emptyTitle={noBytes?.title}
                emptyHint={noBytes?.hint}
                pdfFit={fit}
                className="min-w-0"
              />
            ) : (
              <EmptyState {...emptyCopy(packet, tab)} icon={<FileSearch className="size-7 text-text-faint" />} className="m-auto px-8" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {item || justLinked ? (
        <footer className="flex min-h-12 min-w-0 flex-wrap items-center gap-2 border-t border-border-soft bg-surface-card px-4 py-2" data-testid="docs-viewer-verbs">
          {item?.kind === 'preview' ? (
            <>
              <LinkVerb item={item} register={registerLink} onLinked={onLinked} />
              <span className="min-w-0 truncate text-role-caption text-text-muted">Nothing is linked until you press Link.</span>
            </>
          ) : item ? (
            <>
              <DocVerbs item={item} packet={packet} uploads={uploads} face="viewer" />
              {item.kind === 'paperwork' && item.doc.manualId != null && item.line.sku ? (
                <AlsoLinkVerb
                  manualId={item.doc.manualId}
                  sku={item.line.sku}
                  others={sameSkuOwing(rows, packet.orderId, item.line, item.doc.manualId)}
                />
              ) : null}
            </>
          ) : null}
          {justLinked ? <NextOwed rows={rows} from={{ orderId: packet.orderId, tab }} onGo={onGo} /> : null}
        </footer>
      ) : null}
    </section>
  );
}

/** After a link: jump to the next order or tab still owed — or say the selection is complete. */
function NextOwed({ rows, from, onGo }: { rows: readonly OrderPacket[]; from: SheetPlace; onGo: (place: SheetPlace) => void }) {
  const next = nextOwed(rows, from);
  if (!next) {
    return (
      <span className="ml-auto text-role-caption font-semibold text-text-success" data-testid="docs-viewer-complete">
        Every order in this selection is complete.
      </span>
    );
  }
  const ref = rows.find((each) => each.orderId === next.orderId)?.orderRef ?? '';
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      radius="control"
      iconRight={<ArrowRight />}
      onClick={() => onGo(next)}
      className="ml-auto"
      data-testid="docs-viewer-next-owed"
    >
      Next owed · {next.orderId === from.orderId ? DOC_TAB_LABEL[next.tab] : `${ref} · ${DOC_TAB_LABEL[next.tab]}`}
    </Button>
  );
}
