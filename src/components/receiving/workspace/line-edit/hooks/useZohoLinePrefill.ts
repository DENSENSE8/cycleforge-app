'use client';

/** Prefill Zendesk ticket, listing URL, and serial from the line's Zoho PO (notes + matching line-item description). */

import { useEffect } from 'react';
import { readReceivingLineDetailsScratch } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import {
  parseSerialFromLineDescription,
  parseZendeskListingFromPoNotes,
} from '@/lib/zoho-po-prefill';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

interface UseZohoLinePrefillArgs {
  row: ReceivingLineRow;
  setZendesk: (v: string) => void;
  setListingLink: (v: string) => void;
  setSerialInput: (v: string) => void;
}

export function useZohoLinePrefill({
  row,
  setZendesk,
  setListingLink,
  setSerialInput,
}: UseZohoLinePrefillArgs) {
  useEffect(() => {
    const poId = (row.zoho_purchaseorder_id || '').trim();
    if (!poId) return;

    const rid = row.receiving_id;
    const scratch = readReceivingLineDetailsScratch(rid);

    // LOCAL-FIRST serial: the incoming Zoho sync already copied the line's
    // description into receiving_lines.notes (= row.notes), so parse the serial
    // from there instead of pinging Zoho. A local serial_units value still wins.
    const hasLocalSerial = (row.serials ?? []).some((s) => (s.serial_number || '').trim());
    if (!hasLocalSerial) {
      const snLocal = parseSerialFromLineDescription(row.notes ?? null);
      if (snLocal) setSerialInput(snLocal);
    }

    // Zendesk + listing come from the PO *header* notes, which the local mirror (header-only) doesn't carry — so they're the only reason to…
    const zendeskSatisfied = !!(scratch.zendesk.trim() || (row.zendesk_ticket || '').trim());
    const listingSatisfied = !!((row.receiving_listing_url || '').trim() || scratch.listing.trim());
    if (zendeskSatisfied && listingSatisfied) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/zoho/purchase-orders?purchaseorder_id=${encodeURIComponent(poId)}`,
        );
        const data = await res.json();
        if (cancelled || !data?.success || !data.purchaseorder) return;

        const po = data.purchaseorder as { notes?: string | null };
        const { zendesk: zPo, listing: lPo } = parseZendeskListingFromPoNotes(po.notes ?? '');
        if (!zendeskSatisfied && zPo) setZendesk(zPo);
        // Listing URL: DB column (`receiving.listing_url`) is the source of truth — never overwrite an existing DB value or a per-browser scratch…
        if (!listingSatisfied && lPo) setListingLink(lPo);
      } catch {
        /* Zoho unavailable — fields stay empty */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.receiving_id, row.zoho_purchaseorder_id, row.zoho_line_item_id]);
}
