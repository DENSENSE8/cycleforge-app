'use client';

/**
 * Documents in the AI session — an order's shipping label, packing slip and
 * paired paperwork. Documents always open in the right rail (operator
 * 2026-09-27): the chat carries only {@link DocumentArtifactCard}, a compact
 * card that re-opens the rail.
 *
 * The rail frames each file through its own auth-gated content route (the
 * artifact contract only admits those URLs) with the shared
 * `DocumentPreviewFrame`, switches between files, and hands the operator the
 * same three moves the order paperwork panel does: open in a new tab,
 * download, print (`printDocument`, the paperwork panel's print). Nothing here
 * prints on its own.
 */

import { useState } from 'react';
import { Download, ExternalLink, FileText, Printer } from '@/components/Icons';
import {
  AiArtifactCard,
  AiTurnActions,
  AI_FOCUS_CLASS,
  aiPresence,
  aiTransition,
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/ai';
import { DocumentPreviewFrame } from '@/design-system/components/DocumentPreviewFrame';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import type { ArtifactDocument } from '@/lib/assistant/ui-artifacts';
import { downloadHref, printDocument } from '@/lib/orders/order-paperwork-client';
import { cn } from '@/utils/_cn';

type DocumentFile = ArtifactDocument['documents'][number];

/** The rail body: switcher + actions, then the file itself. */
export function DocumentArtifact({ artifact }: { artifact: ArtifactDocument }) {
  const [activeId, setActiveId] = useState(artifact.documents[0]?.id);
  const active = artifact.documents.find((d) => d.id === activeId) ?? artifact.documents[0];
  const presence = useMotionPresence(aiPresence.fade);
  const transition = useMotionTransition(aiTransition.fade);
  if (!active) return null;

  const actions = [
    {
      id: 'open',
      label: `Open ${active.label} in a new tab`,
      icon: <ExternalLink className="h-4 w-4" />,
      onClick: () => window.open(active.url, '_blank', 'noopener,noreferrer'),
    },
    {
      id: 'download',
      label: `Download ${active.label}`,
      icon: <Download className="h-4 w-4" />,
      onClick: () => {
        const link = document.createElement('a');
        link.href = downloadHref(active.url);
        link.download = '';
        link.click();
      },
    },
    {
      id: 'print',
      label: `Print ${active.label}`,
      icon: <Printer className="h-4 w-4" />,
      onClick: () => printDocument(active.url),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-artifact-document>
      <div className="flex shrink-0 items-center gap-2 border-b border-ai-line py-2 pl-3 pr-2">
        {artifact.documents.length > 1 ? (
          <DocumentSwitcher documents={artifact.documents} activeId={active.id} onSelect={setActiveId} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-ai-label text-ai-muted">{active.label}</span>
        )}
        <AiTurnActions actions={actions} visible ariaLabel="Document actions" className="ml-auto shrink-0" />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active.id}
          {...presence}
          transition={transition}
          className="flex min-h-0 flex-1 flex-col"
          data-document-id={active.id}
        >
          <DocumentPreviewFrame
            title={active.label}
            src={active.url}
            mimeHint={active.mime.startsWith('image/') ? 'image' : 'pdf'}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Label / Packing slip / … — one pill per file, the open one held. */
function DocumentSwitcher({
  documents,
  activeId,
  onSelect,
}: {
  documents: readonly DocumentFile[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const transition = useMotionTransition(aiTransition.press);
  return (
    <div role="tablist" aria-label="Documents" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {documents.map((doc) => {
        const selected = doc.id === activeId;
        return (
          <button
            key={doc.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(doc.id)}
            className={cn(
              'ds-raw-button relative inline-flex shrink-0 items-center rounded-ai-chip px-3 py-1 text-ai-label transition-colors duration-150',
              AI_FOCUS_CLASS,
              selected ? 'text-ai-ink' : 'text-ai-muted hover:bg-ai-hover hover:text-ai-ink',
            )}
          >
            {selected ? (
              <motion.span
                layoutId={reduced ? undefined : 'ai-document-switcher-pill'}
                transition={transition}
                className="absolute inset-0 rounded-ai-chip border border-ai-line-strong bg-ai-hover"
                aria-hidden
              />
            ) : null}
            <span className="relative max-w-40 truncate">{doc.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The compact face in the chat column — re-opens the rail. */
export function DocumentArtifactCard({
  artifact,
  onOpen,
  active = false,
}: {
  artifact: ArtifactDocument;
  onOpen: () => void;
  active?: boolean;
}) {
  return (
    <AiArtifactCard
      title={artifact.title}
      kind={artifact.subtitle || (artifact.documents.length > 1 ? `${artifact.documents.length} documents` : 'Document')}
      icon={<FileText className="h-4 w-4" />}
      selected={active}
      onOpen={onOpen}
    />
  );
}
