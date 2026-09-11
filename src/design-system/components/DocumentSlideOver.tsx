'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, Printer, X } from '@/components/Icons';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  DocumentPreviewFrame,
} from '@/design-system/components/DocumentPreviewFrame';
import type { DocumentPreviewMimeHint } from '@/design-system/components/document-preview-mime';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

export type DocumentSlideItem = {
  /** Stable key — e.g. `shipping_label`, `packing_slip`, `manual:123`. */
  id: string;
  /** Type switcher + canvas title. */
  title: string;
  /** iframe / img URL when present. */
  src?: string | null;
  mimeHint?: DocumentPreviewMimeHint;
  meta?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  loading?: boolean;
  /** Optional badge count on the type tab (e.g. attached=1). */
  count?: number;
};

type DocumentSlideOverProps = {
  open: boolean;
  onClose: () => void;
  /** Panel header label. Default "Documents". */
  title?: string;
  /** Every document type for this context — always listed in the switcher. */
  items: DocumentSlideItem[];
  activeId?: string;
  onActiveIdChange?: (id: string) => void;
  /** Extra header actions (call-site Print, etc.). */
  headerActions?: ReactNode;
  /**
   * Show the built-in print header action. Default `true`. Surfaces where
   * printing does not belong (Testing manuals — printing inserts happens at
   * pack) pass `false` to drop the printer affordance entirely.
   */
  showPrint?: boolean;
  /** Width persistence key. Default `document-slide-over-width`. */
  storageKey?: string;
  /** Seed width when nothing persisted. Default 640. */
  defaultWidth?: number;
  minWidth?: number;
  anchor?: 'pane' | 'viewport';
  backdrop?: boolean;
  className?: string;
  'aria-label'?: string;
};

/**
 * Resizable right-side document slide-over — Kinetic Ledger SoT for viewing
 * PDFs / images by document type (shipping labels, packing slips, manuals).
 *
 * Composes {@link RightPaneOverlay} (left-edge resize) + type switcher +
 * {@link DocumentPreviewFrame}. Call sites pass every type for the context;
 * empty types still appear in the switcher.
 */
export function DocumentSlideOver({
  open,
  onClose,
  title = 'Documents',
  items,
  activeId: activeIdProp,
  onActiveIdChange,
  headerActions,
  showPrint = true,
  storageKey = 'document-slide-over-width',
  defaultWidth = 640,
  minWidth = 360,
  anchor = 'pane',
  backdrop = true,
  className,
  'aria-label': ariaLabel,
}: DocumentSlideOverProps) {
  const firstId = items[0]?.id ?? '';
  const [internalActive, setInternalActive] = useState(activeIdProp ?? firstId);

  useEffect(() => {
    if (activeIdProp != null) setInternalActive(activeIdProp);
  }, [activeIdProp]);

  useEffect(() => {
    if (!open) return;
    if (activeIdProp != null) return;
    if (items.some((i) => i.id === internalActive)) return;
    setInternalActive(firstId);
  }, [open, items, internalActive, firstId, activeIdProp]);

  const activeId = activeIdProp ?? internalActive;
  const setActiveId = (id: string) => {
    onActiveIdChange?.(id);
    if (activeIdProp == null) setInternalActive(id);
  };

  const active = useMemo(
    () => items.find((i) => i.id === activeId) ?? items[0],
    [items, activeId],
  );

  const tabs = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        label: item.title,
        count: item.count,
      })),
    [items],
  );

  const canOpenExternal = Boolean(active?.src);
  const canPrint = showPrint && Boolean(active?.src);

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="right"
      anchor={anchor}
      width={defaultWidth}
      minWidth={minWidth}
      resizable
      storageKey={storageKey}
      backdrop={backdrop}
      aria-label={ariaLabel ?? title}
      className={cn('min-w-0', className)}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border-hairline bg-surface-canvas px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-role-caption font-semibold uppercase tracking-[0.16em] text-text-muted">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          {headerActions}
          {canPrint ? (
            <HoverTooltip label="Print active document" asChild>
              <IconButton
                ariaLabel="Print active document"
                icon={<Printer className="h-4 w-4" />}
                onClick={() => {
                  if (!active?.src) return;
                  // Native print of the iframe content when possible; fallback open.
                  const w = window.open(active.src, '_blank', 'noopener,noreferrer');
                  w?.addEventListener('load', () => {
                    try {
                      w.print();
                    } catch {
                      /* cross-origin — operator uses browser print */
                    }
                  });
                }}
                className="rounded-md p-1.5 text-text-soft hover:bg-surface-strong hover:text-text-default"
              />
            </HoverTooltip>
          ) : null}
          {canOpenExternal ? (
            <HoverTooltip label="Open in new tab" asChild>
              <a
                href={active!.src!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in new tab"
                className="rounded-md p-1.5 text-text-faint hover:bg-surface-strong hover:text-text-muted"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </HoverTooltip>
          ) : null}
          <IconButton
            ariaLabel="Close documents panel"
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
            className="rounded-md p-1.5 text-text-soft hover:bg-surface-strong"
          />
        </div>
      </header>

      {tabs.length > 1 ? (
        <div className="shrink-0 border-b border-border-hairline px-3 py-2">
          <TabSwitch
            tabs={tabs}
            activeTab={active?.id ?? firstId}
            onTabChange={setActiveId}
            solidTone="accent"
            countStyle="plain"
            scrollable
          />
        </div>
      ) : null}

      {active ? (
        <DocumentPreviewFrame
          title={active.title}
          src={active.src}
          mimeHint={active.mimeHint}
          loading={active.loading}
          emptyTitle={active.emptyTitle}
          emptyHint={active.emptyHint}
          meta={active.meta}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-role-caption text-text-soft">No document types to show.</p>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </RightPaneOverlay>
  );
}
