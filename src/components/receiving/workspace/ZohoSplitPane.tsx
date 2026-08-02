'use client';

import { useEffect, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  PaneHeader,
  PaneHeaderCloseButton,
  PaneHeaderLabel,
} from '@/components/ui/pane-header';

type OpenPaneDetail = { poId?: string; poNumber?: string };

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
 * Right-side reference pane for opening a Zoho Inventory purchase order. Zoho
 * blocks iframe embedding (X-Frame-Options), so the pane surfaces an "Open in
 * Zoho" deep link. Hidden by default; the flow-header action dispatches
 * `open-zoho-pane` with the PO id / number.
 *
 * **It was a private `fixed right-0 top-0 z-40` aside until 2026-08-01** — the
 * literal shape `lib/right-rail/store.ts`'s docblock names as the bug it exists
 * to prevent, plus a raw `z-40` outside the z-index scale and a hand-rolled rgba
 * shadow. It also hand-rolled its own resize grip and width persistence, all of
 * which `RightRailHost` already owns.
 *
 * Now a non-modal rail occupant, so it PUSHES the receiving work surface rather
 * than covering the PO rows the operator opened it from. Width, the resize grip,
 * the collapse strip and Escape all come from the host.
 *
 * The occupant id is stable across POs on purpose: this is one singleton viewer
 * that re-targets, not a queue being walked, so a per-PO id would play
 * exit → empty → enter every time the header action fires again.
 */
export function ZohoSplitPane() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

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

  const close = () => setOpen(false);

  return (
    <DetailStackRailRegistrar
      id="detail:zoho-po"
      enabled={open && !!url}
      onClose={close}
      modal={false}
      ariaLabel="Purchase order viewer"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <PaneHeader
          leftSlot={<PaneHeaderLabel eyebrow="Purchase order" value="Zoho" />}
          rightSlot={
            <PaneHeaderCloseButton
              onClick={close}
              ariaLabel="Close purchase order viewer"
              title="Close purchase order viewer"
            />
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-role-caption text-text-soft">
            <p className="leading-snug">
              Purchase orders open in the inventory provider. Use the link below to view the PO.
            </p>
            {/* Deep link into the vendor web app — one of the sanctioned places a
                brand name is allowed in operator copy. */}
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
      </div>
    </DetailStackRailRegistrar>
  );
}
