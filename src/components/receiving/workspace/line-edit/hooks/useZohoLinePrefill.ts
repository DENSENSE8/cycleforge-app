'use client';

/** Prefill Zendesk ticket, listing URL, and serial from the line's Zoho PO (notes + matching line-item description). */

import { useEffect, useRef } from 'react';
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
  // Keyed on line identity only; everything else is read through a ref so a
  // serial publish or a typed value never re-runs this and overwrites input.
  const latest = useRef({ row, setZendesk, setListingLink, setSerialInput });
  latest.current = { row, setZendesk, setListingLink, setSerialInput };
  useEffect(() => {
    const { row, setZendesk, setListingLink, setSerialInput } = latest.current;
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

    // Zendesk + listing come from the PO *header* notes, which neither the local
    // mirror nor lookup-po carry — the fetch is skipped only when both are
    // already on the row (lookup-po's listing_url seed counts) or in scratch.
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
  }, [row.id, row.receiving_id, row.zoho_purchaseorder_id, row.zoho_line_item_id]);
}
