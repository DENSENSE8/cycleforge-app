'use client';

import { useEffect, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';

type OpenPaneDetail = { poId?: string; poNumber?: string };

function buildProviderPoUrl(detail: OpenPaneDetail): string {
  const poId = (detail.poId || '').trim();
  const poNumber = (detail.poNumber || '').trim();
  // Dogfood inventory provider deep link (Zoho Inventory). Kept as an escape
  // hatch for desk contexts — Unbox order-chip Details opens Displays → Inventory.
  if (poId) {
    return `https://inventory.zoho.com/app#/purchaseorders/${encodeURIComponent(poId)}`;
  }
  if (poNumber) {
    return `https://inventory.zoho.com/app#/purchaseorders?search_text=${encodeURIComponent(poNumber)}`;
  }
  return 'https://inventory.zoho.com/app#/purchaseorders';
}

/**
 * Right-side escape hatch for opening the connected inventory provider's PO
 * page in a new tab. Provider apps block iframe embedding, so this pane only
 * surfaces an external link.
 *
 * **Unbox station:** prefer Displays → Inventory (`openDisplays('inventory')`)
 * for dossier CRUD — do not dispatch `open-zoho-pane` from Unbox LineEdit.
 * This occupant remains for desk/history flows that still fire the event.
 *
 * Non-modal rail occupant on `RightRailHost` (pushes; never floats).
 */
export function ZohoSplitPane() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const providerLabel = providerCatalogLabel('zoho');

  useEffect(() => {
    const handler = (e: Event) => {
      // Tell the dispatcher the pane handled this — caller does NOT fall
      // back to window.open. Operators get the "open externally" link
      // inside the pane instead.
      e.preventDefault();
      const detail = ((e as CustomEvent).detail || {}) as OpenPaneDetail;
      setUrl(buildProviderPoUrl(detail));
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
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow
            onClose={close}
            closeTitle="Close purchase order viewer"
          />
          <div className="px-2 pb-2 pt-1">
            <PaneHeaderLabel eyebrow="Purchase order" value={providerLabel} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-role-caption text-text-soft">
            <p className="leading-snug">
              On Unbox, open Displays → Inventory for the full dossier. Use the
              link below only when you need the provider web app.
            </p>
            {/* Deep link into the vendor web app — one of the sanctioned places a
                brand name is allowed in operator copy. */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-role-caption font-semibold uppercase tracking-[0.16em] text-white hover:bg-blue-700"
            >
              Open in {providerLabel}
            </a>
          </div>
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
