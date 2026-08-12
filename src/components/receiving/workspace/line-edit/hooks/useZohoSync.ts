'use client';

import { useCallback, useEffect, useState } from 'react';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { parseZendeskListingFromPoNotes } from '@/lib/zoho-po-prefill';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

/** Result of Inventory Displays Refresh (sync-one + carton inventory-sync). */
export type InventoryDossierRefreshResult =
  | { ok: true; zohoNotes: string | null }
  /** Live Zoho failed but local mirror/line paint was refreshed. */
  | { ok: false; error: string; painted?: boolean };

function isLocallyReceived(row: ReceivingLineRow): boolean {
  return (
    Boolean((row.received_done_at || '').trim()) ||
    String(row.workflow_status || '').trim().toUpperCase() === 'DONE'
  );
}

/**
 * Refresh ↔ Zoho for a single receiving line. Always searches by tracking#
 * (PO# search is a future upgrade). Flow:
 *   1. find-po by tracking# — Zoho is the source of truth.
 *   2. Reconcile the line: if Zoho's purchaseorder_id or number differs from
 *      the local line, PATCH /api/receiving-lines. No-op on match.
 *   3. Reconcile the carton (receiving row): PATCH with PO# + tracking# when
 *      `receiving_id` is set. Otherwise fall back to /api/receiving/lookup-po
 *      which creates/links a carton from the tracking#.
 *
 * Also wires the workspace header's Refresh button (the
 * `receiving-workspace-refresh-line` window event) so the panel doesn't need a
 * prop-drilled ref or to lift this up to the workspace.
 *
 * Listing/Zendesk are prefilled from PO notes only when still empty — the
 * setters are passed in so the values stay owned by the panel.
 */
export function useZohoSync(
  row: ReceivingLineRow,
  {
    staffId,
    listingLink,
    zendesk,
    setListingLink,
    setZendesk,
    dispatchLine = dispatchLineUpdated,
  }: {
    staffId: string;
    listingLink: string;
    zendesk: string;
    setListingLink: (v: string) => void;
    setZendesk: (v: string) => void;
    dispatchLine?: (patch: Partial<ReceivingLineRow> & { id: number }) => void;
  },
) {
  const [zohoSyncing, setZohoSyncing] = useState(false);
  const [inventoryRefreshing, setInventoryRefreshing] = useState(false);

  /** Re-fetch the open line so zoho_status / notes from the local mirror land even when live Zoho is down. */
  const refetchLineForPaint = useCallback(async (): Promise<boolean> => {
    try {
      const lineRes = await fetch(`/api/receiving-lines?id=${row.id}`);
      const lineData = await lineRes.json();
      if (lineData?.success && lineData.receiving_line) {
        dispatchLine(lineData.receiving_line as ReceivingLineRow);
        refreshDomains(REFRESH_BUNDLES.receivingWrite);
        return true;
      }
    } catch {
      /* paint re-fetch best-effort */
    }
    return false;
  }, [row.id, dispatchLine]);

  /**
   * Pull-from-Zoho for the whole carton: re-imports the linked PO so
   * receiving.zoho_notes (PO header notes), receiving_lines.unit_price (price),
   * and receiving_lines.zoho_notes (item descriptions) all refresh from Zoho.
   * Returns ok + notes so Inventory Refresh can toast; thin `string | null`
   * wrapper stays for older callers.
   */
  const syncCartonFromZohoResult = useCallback(async (): Promise<InventoryDossierRefreshResult> => {
    if (!row.receiving_id) {
      return { ok: false, error: 'No carton linked — cannot pull inventory' };
    }
    try {
      const res = await fetch(`/api/receiving/${row.receiving_id}/inventory-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => null)) as {
        zoho_notes?: string | null;
        error?: string;
        local_promoted?: number;
      } | null;
      if (!res.ok) {
        // Local DONE repair may have run before Zoho failed — still re-paint.
        const promoted = Number(data?.local_promoted ?? 0) > 0;
        if (promoted) {
          await refetchLineForPaint();
        }
        return {
          ok: false,
          error: data?.error?.trim() || `Inventory sync failed (${res.status})`,
          painted: promoted || undefined,
        };
      }
      const syncedNotes =
        data && 'zoho_notes' in data ? ((data.zoho_notes ?? null) as string | null) : undefined;

      // Re-fetch the line so the sidebar/table/panel pick up price + notes +
      // zoho_status (by-id SQL joins zoho_po_mirror). Always patch
      // receiving_zoho_notes from the sync response so PO-notes draft
      // dirty-state reseeds (false "Unsaved" after a clean pull).
      try {
        const lineRes = await fetch(`/api/receiving-lines?id=${row.id}`);
        const lineData = await lineRes.json();
        if (lineData?.success && lineData.receiving_line) {
          const next = lineData.receiving_line as ReceivingLineRow;
          dispatchLine(
            syncedNotes !== undefined
              ? { ...next, receiving_zoho_notes: syncedNotes }
              : next,
          );
        } else if (syncedNotes !== undefined) {
          dispatchLine({ id: row.id, receiving_zoho_notes: syncedNotes });
        }
      } catch {
        if (syncedNotes !== undefined) {
          dispatchLine({ id: row.id, receiving_zoho_notes: syncedNotes });
        }
      }
      refreshDomains(REFRESH_BUNDLES.receivingWrite);

      return { ok: true, zohoNotes: syncedNotes !== undefined ? syncedNotes : null };
    } catch {
      return { ok: false, error: 'Inventory sync failed' };
    }
  }, [row.receiving_id, row.id, dispatchLine, refetchLineForPaint]);

  const syncCartonFromZoho = useCallback(async (): Promise<string | null> => {
    const result = await syncCartonFromZohoResult();
    return result.ok ? result.zohoNotes : null;
  }, [syncCartonFromZohoResult]);

  /**
   * Inventory Displays Refresh — refresh the Zoho PO mirror (header · line_items ·
   * activity) then pull carton notes/prices. Incoming desk Sync's twin.
   * Callers that toast (header Refresh / F5) read {@link InventoryDossierRefreshResult}.
   * Always re-fetches the open line afterward so coarse Received paint updates
   * from the local mirror even when live Zoho credentials fail.
   *
   * Already-received lines never return `{ painted: true }` — that drives the
   * yellow "Inventory status updated locally" toast, which is noise once DONE.
   */
  const refreshInventoryDossier = useCallback(async (): Promise<InventoryDossierRefreshResult> => {
    if (inventoryRefreshing) {
      return { ok: false, error: 'Refresh already in progress' };
    }
    setInventoryRefreshing(true);
    try {
      const alreadyReceived = isLocallyReceived(row);
      const poId = (row.zoho_purchaseorder_id || '').trim();
      let mirrorError: string | null = null;
      let mirrorOk = !poId; // no PO id → skip mirror, not a failure
      if (poId) {
        try {
          const mirrorRes = await fetch('/api/receiving-lines/incoming/sync-one', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ po_id: poId }),
          });
          if (mirrorRes.ok) {
            mirrorOk = true;
          } else {
            const mirrorData = (await mirrorRes.json().catch(() => null)) as {
              error?: string;
              details?: string;
            } | null;
            mirrorError =
              mirrorData?.error?.trim()
              || mirrorData?.details?.trim()
              || `Mirror sync failed (${mirrorRes.status})`;
          }
        } catch {
          mirrorError = 'Mirror sync failed';
        }
      }

      const carton = await syncCartonFromZohoResult();
      if (carton.ok) {
        return carton;
      }

      // Live pulls failed — still paint from local mirror / carton rows.
      // inventory-sync may have promoted stuck UNBOXED→DONE before Zoho failed.
      const painted = carton.painted === true || (await refetchLineForPaint());
      if (painted && (alreadyReceived || carton.painted === true)) {
        // Local DONE already stands (or just repaired) — never warn.
        return { ok: true, zohoNotes: null };
      }
      if (painted && (mirrorOk || !poId)) {
        // Mirror was already current (or skipped); local paint refreshed.
        return { ok: true, zohoNotes: null };
      }
      if (painted) {
        // Operator still gets status from the local mirror; surface that the
        // live Zoho pull failed (common when credentials are missing in a lane).
        // Never for already-received — handled above.
        return {
          ok: false,
          painted: true,
          error: mirrorError || carton.error || 'Inventory sync failed',
        };
      }
      return {
        ok: false,
        error: mirrorError || carton.error || 'Inventory sync failed',
      };
    } finally {
      setInventoryRefreshing(false);
    }
  }, [
    inventoryRefreshing,
    row,
    syncCartonFromZohoResult,
    refetchLineForPaint,
  ]);

  const syncWithZoho = useCallback(async () => {
    if (zohoSyncing) return;
    const tracking = (row.tracking_number || '').trim();
    setZohoSyncing(true);
    try {
      const knownPoId = (row.zoho_purchaseorder_id || '').trim();

      // Fast path: PO id already known, OR no tracking to search by — skip the
      // find-po search and just refresh the line, prefill from the PO, and pull
      // the carton (notes + price + descriptions) from Zoho.
      if (knownPoId || !tracking) {
        // Re-fetch the line to pick up any server-side changes.
        const lineRes = await fetch(`/api/receiving-lines?id=${row.id}`);
        const lineData = await lineRes.json();
        if (lineData?.success && lineData.receiving_line) {
          dispatchLine(lineData.receiving_line as ReceivingLineRow);
        }

        // Fetch full PO for notes → prefill listing / zendesk (PO id required).
        if (knownPoId) {
          try {
            const poRes = await fetch(
              `/api/zoho/purchase-orders?purchaseorder_id=${encodeURIComponent(knownPoId)}`,
            );
            const poData = await poRes.json();
            if (poData?.success && poData.purchaseorder) {
              const poNotes = (poData.purchaseorder as { notes?: string | null }).notes ?? '';
              const parsed = parseZendeskListingFromPoNotes(poNotes);
              if (!listingLink.trim() && parsed.listing) setListingLink(parsed.listing);
              if (!zendesk.trim() && parsed.zendesk) setZendesk(parsed.zendesk);
            }
          } catch { /* PO fetch failed — fields stay as-is */ }
        }

        // Pull notes + price + descriptions from Zoho into the local carton.
        await syncCartonFromZoho();
        return;
      }

      // Slow path: no PO ID yet — search Zoho by tracking number.
      const findRes = await fetch('/api/zoho/find-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: tracking }),
      });
      const findData = await findRes.json();
      const po = findData?.success && findData.matched ? findData.purchase_order : null;

      // Reconcile the line's PO#/number only if Zoho disagrees.
      if (po) {
        const zohoId = (po.zoho_purchaseorder_id || '').trim() || null;
        const zohoNum = (po.zoho_purchaseorder_number || '').trim() || null;
        const localId = (row.zoho_purchaseorder_id || '').trim() || null;
        const localNum = (row.zoho_purchaseorder_number || '').trim() || null;
        const patchBody: Record<string, unknown> = { id: row.id };
        if (zohoId && zohoId !== localId) patchBody.zoho_purchaseorder_id = zohoId;
        if (zohoNum && zohoNum !== localNum) patchBody.zoho_purchaseorder_number = zohoNum;
        if (Object.keys(patchBody).length > 1) {
          await fetch('/api/receiving-lines', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchBody),
          });
        }
      }

      // Reconcile the carton.
      if (row.receiving_id) {
        if (po) {
          await fetch(`/api/receiving/${row.receiving_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              zoho_purchaseorder_id: po.zoho_purchaseorder_id || null,
              zoho_purchaseorder_number: po.zoho_purchaseorder_number || null,
              reference_number: po.reference_number || tracking,
            }),
          });
        }
      } else {
        await fetch('/api/receiving/lookup-po', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingNumber: tracking, staffId: Number(staffId) }),
        });
        refreshDomains(REFRESH_BUNDLES.receivingWrite);
      }

      // Re-fetch the line so sidebar + table pick up every change.
      const lineRes = await fetch(`/api/receiving-lines?id=${row.id}`);
      const lineData = await lineRes.json();
      if (lineData?.success && lineData.receiving_line) {
        dispatchLine(lineData.receiving_line as ReceivingLineRow);
      }

      // Prefill listing / zendesk from PO notes if still empty.
      const resolvedPoId = (po?.zoho_purchaseorder_id || '').trim();
      if (resolvedPoId) {
        try {
          const poRes = await fetch(
            `/api/zoho/purchase-orders?purchaseorder_id=${encodeURIComponent(resolvedPoId)}`,
          );
          const poData = await poRes.json();
          if (poData?.success && poData.purchaseorder) {
            const poNotes = (poData.purchaseorder as { notes?: string | null }).notes ?? '';
            const parsed = parseZendeskListingFromPoNotes(poNotes);
            if (!listingLink.trim() && parsed.listing) setListingLink(parsed.listing);
            if (!zendesk.trim() && parsed.zendesk) setZendesk(parsed.zendesk);
          }
        } catch { /* PO fetch failed — fields stay as-is */ }
      }

      // Now that the PO link is established, pull notes + price + descriptions
      // from Zoho into the local carton.
      await syncCartonFromZoho();
    } catch {
      /* silent — user can retry */
    } finally {
      setZohoSyncing(false);
    }
  }, [
    zohoSyncing,
    row.id,
    row.receiving_id,
    row.tracking_number,
    row.zoho_purchaseorder_id,
    row.zoho_purchaseorder_number,
    staffId,
    listingLink,
    zendesk,
    setListingLink,
    setZendesk,
    syncCartonFromZoho,
  ]);

  // Workspace header's Refresh button dispatches this so we don't need a
  // prop-drilled ref or to lift syncWithZoho up to the workspace.
  useEffect(() => {
    const handler = () => { void syncWithZoho(); };
    window.addEventListener('receiving-workspace-refresh-line', handler);
    return () => window.removeEventListener('receiving-workspace-refresh-line', handler);
  }, [syncWithZoho]);

  return {
    zohoSyncing,
    inventoryRefreshing,
    syncWithZoho,
    syncCartonFromZoho,
    refreshInventoryDossier,
  };
}
