'use client';

import { useEffect, useState } from 'react';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { useHorizontalEdgeResize } from '@/design-system/hooks';
import { cn } from '@/utils/_cn';

type OpenPaneDetail = { poId?: string; poNumber?: string };

const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 320;
const WIDTH_STORAGE_KEY = 'zoho-pane-width';

function buildZohoUrl(detail: OpenPaneDetail): string {
  const poId = (detail.poId || '').trim();
  const poNumber = (detail.poNumber || '').trim();
  if (poId) {
    return `https://inventory.zoho.com/app#/purchaseorders/${encodeURIComponent(poId)}`;
  }
  if (poNumber) {
    return `https://inventory.zoho.com/app#/purchaseorders?search_text=${encodeURIComponent(poNumber)}`;
  }
  return 'https://inventory.zoho.com/app#/purchaseorders';
}

/**
 * Right-side overlay for opening a Zoho Inventory purchase order. Zoho blocks
 * iframe embedding (X-Frame-Options), so the pane surfaces an "Open in Zoho"
 * deep link. Hidden by default; the flow-header action dispatches
 * `open-zoho-pane` with the PO id / number.
 *
 * The pane has a draggable left edge; width is persisted across sessions via
 * {@link useHorizontalEdgeResize}.
 */
export function ZohoSplitPane() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: WIDTH_STORAGE_KEY,
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    enabled: open,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      // Tell the dispatcher the pane handled this — caller does NOT fall
      // back to window.open. Operators get the "open externally" link
      // inside the pane instead.
      e.preventDefault();
      const detail = ((e as CustomEvent).detail || {}) as OpenPaneDetail;
      setUrl(buildZohoUrl(detail));
      setOpen(true);
    };
    window.addEventListener('open-zoho-pane', handler);
    return () => window.removeEventListener('open-zoho-pane', handler);
  }, []);

  if (!open || !url) return null;

  return (
    <aside
      className="fixed right-0 top-0 z-40 flex h-full flex-col border-l border-border-soft bg-surface-card shadow-[0_0_24px_-12px_rgba(15,23,42,0.35)]"
      style={{ width }}
      role="complementary"
      aria-label="Zoho PO viewer"
    >
      <div
        {...edgeHandleProps}
        className={cn(
          'absolute -left-0.5 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-blue-400/40 active:bg-blue-500/60',
          isDragging && 'bg-blue-500/60',
        )}
        aria-label="Resize Zoho pane"
      />

      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border-hairline bg-surface-canvas px-3">
        <span className="text-role-caption font-semibold uppercase tracking-[0.18em] text-text-muted">
          Zoho · Purchase Order
        </span>
        <IconButton
          onClick={() => setOpen(false)}
          ariaLabel="Close Zoho pane"
          icon={<X className="h-4 w-4" />}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-strong"
        />
      </header>

      <div className="min-h-0 flex-1">
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-role-caption text-text-soft">
          <p className="leading-snug">
            Purchase orders open in the inventory provider. Use the link below to view the PO.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-role-caption font-semibold uppercase tracking-[0.16em] text-white hover:bg-blue-700"
          >
            Open in Zoho
          </a>
        </div>
      </div>
    </aside>
  );
}
