'use client';

/** Incoming marketplace + inventory Import — single-shot POSTs → {@link IncomingSyncDialog}. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import type { IncomingSyncKind, IncomingSyncResult } from '@/components/sidebar/receiving/IncomingSyncDialog';

export function useIncomingSyncActions() {
  const queryClient = useQueryClient();
  const [zohoRefreshing, setZohoRefreshing] = useState(false);
  const [marketplaceRefreshing, setMarketplaceRefreshing] = useState(false);

  const [incSyncOpen, setIncSyncOpen] = useState(false);
  const [incSyncKind, setIncSyncKind] = useState<IncomingSyncKind>('marketplace');
  const [incSyncRunning, setIncSyncRunning] = useState(false);
  const [incSyncResult, setIncSyncResult] = useState<IncomingSyncResult | null>(null);
  const [incSyncElapsedMs, setIncSyncElapsedMs] = useState(0);
  const incSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const beginIncSync = useCallback((kind: IncomingSyncKind) => {
    setIncSyncKind(kind);
    setIncSyncResult(null);
    setIncSyncRunning(true);
    setIncSyncElapsedMs(0);
    setIncSyncOpen(true);
    const t0 = Date.now();
    if (incSyncTimerRef.current) clearInterval(incSyncTimerRef.current);
    incSyncTimerRef.current = setInterval(() => setIncSyncElapsedMs(Date.now() - t0), 100);
  }, []);

  const finishIncSync = useCallback((result: IncomingSyncResult) => {
    if (incSyncTimerRef.current) {
      clearInterval(incSyncTimerRef.current);
      incSyncTimerRef.current = null;
    }
    setIncSyncRunning(false);
    setIncSyncResult(result);
  }, []);

  useEffect(() => () => {
    if (incSyncTimerRef.current) clearInterval(incSyncTimerRef.current);
  }, []);

  const invalidateIncoming = useCallback(async () => {
    invalidateReceivingFeeds(queryClient);
  }, [queryClient]);

  const refreshZoho = useCallback(async () => {
    if (zohoRefreshing) return;
    setZohoRefreshing(true);
    beginIncSync('zoho');
    try {
      const res = await fetch('/api/receiving-lines/incoming/inventory-refresh', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || `PO sync failed (${res.status})`);
      await invalidateIncoming();
      const created = data?.issued?.created ?? 0;
      const updated = data?.issued?.updated ?? 0;
      const linked = data?.issued?.linked ?? 0;
      const processed = data?.issued?.processed ?? 0;
      const failed = data?.issued?.failed ?? 0;
      const statusUpdates = data?.mirror?.upserted ?? 0;
      const fetched = data?.mirror?.fetched ?? 0;
      const mirrorMode = data?.mirror?.mode ?? '—';
      const mirrorErrors: string[] = Array.isArray(data?.mirror?.errors) ? data.mirror.errors : [];
      const nothingChanged = created + updated + linked + statusUpdates === 0;
      finishIncSync({
        ok: true,
        tiles: [
          { label: 'New', value: created, tone: 'emerald' },
          { label: 'Refreshed', value: updated, tone: 'blue' },
          { label: 'Cleared', value: statusUpdates, tone: 'gray' },
          { label: 'Errors', value: failed + mirrorErrors.length, tone: 'red' },
        ],
        updated: [
          created > 0 ? `${created} new PO${created === 1 ? '' : 's'} added` : null,
          updated > 0 ? `${updated} PO${updated === 1 ? '' : 's'} refreshed` : null,
          linked > 0 ? `${linked} PO${linked === 1 ? '' : 's'} linked to a shipment` : null,
          statusUpdates > 0
            ? `${statusUpdates} received PO${statusUpdates === 1 ? '' : 's'} cleared from Incoming`
            : null,
        ].filter(Boolean) as string[],
        sections: [
          {
            label: 'Issued sync',
            rows: [
              { k: 'Checked', v: processed },
              { k: 'Created', v: created },
              { k: 'Updated', v: updated },
              { k: 'Linked', v: linked },
              { k: 'Failed', v: failed },
            ],
          },
          {
            label: 'Mirror sync',
            rows: [
              { k: 'Mode', v: mirrorMode },
              { k: 'Fetched', v: fetched },
              { k: 'Updated', v: statusUpdates },
              { k: 'Errors', v: mirrorErrors.length },
            ],
          },
        ],
        errors: mirrorErrors,
        note: nothingChanged ? 'Already up to date — no PO changes since last sync.' : null,
      });
    } catch (err) {
      finishIncSync({
        ok: false,
        tiles: [],
        updated: [],
        sections: [],
        errors: [],
        note: err instanceof Error ? err.message : 'Could not reach the inventory service. Try again.',
      });
    } finally {
      setZohoRefreshing(false);
    }
  }, [zohoRefreshing, invalidateIncoming, beginIncSync, finishIncSync]);

  const refreshMarketplace = useCallback(async () => {
    if (marketplaceRefreshing) return;
    setMarketplaceRefreshing(true);
    beginIncSync('marketplace');
    try {
      const res = await fetch('/api/receiving-lines/incoming/marketplace-refresh', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || `Marketplace refresh failed (${res.status})`);
      await invalidateIncoming();
      const ebay = data?.ebay ?? {};
      const landed = ebay.landed ?? 0;
      const updated = ebay.updated ?? 0;
      const unchanged = ebay.unchanged ?? 0;
      const accounts = ebay.accounts ?? 0;
      const ordersFetched = ebay.ordersFetched ?? 0;
      const errors: string[] = Array.isArray(ebay.errors) ? ebay.errors : [];
      const notes: string[] = Array.isArray(data?.notes) ? data.notes : [];
      const nothingChanged = landed === 0 && updated === 0 && errors.length === 0;
      finishIncSync({
        ok: Boolean(data?.ok) || nothingChanged,
        tiles: [
          { label: 'Accounts', value: accounts, tone: 'gray' },
          { label: 'Fetched', value: ordersFetched, tone: 'blue' },
          { label: 'Imported', value: landed + updated, tone: 'emerald' },
          { label: 'Errors', value: errors.length, tone: 'red' },
        ],
        updated: [
          landed > 0 ? `${landed} new purchase${landed === 1 ? '' : 's'} added to Incoming` : null,
          updated > 0 ? `${updated} existing purchase${updated === 1 ? '' : 's'} updated` : null,
        ].filter(Boolean) as string[],
        sections: [
          {
            label: 'eBay buyer accounts',
            rows: [
              { k: 'Accounts', v: accounts },
              { k: 'Orders fetched', v: ordersFetched },
              { k: 'New', v: landed },
              { k: 'Updated', v: updated },
              { k: 'Unchanged', v: unchanged },
              { k: 'Errors', v: errors.length },
            ],
          },
        ],
        errors,
        note: notes[0] ?? (nothingChanged ? 'Already up to date — no new marketplace purchases.' : null),
      });
    } catch (err) {
      finishIncSync({
        ok: false,
        tiles: [],
        updated: [],
        sections: [],
        errors: [],
        note: err instanceof Error ? err.message : 'Could not reach marketplace accounts. Try again.',
      });
    } finally {
      setMarketplaceRefreshing(false);
    }
  }, [marketplaceRefreshing, invalidateIncoming, beginIncSync, finishIncSync]);

  return {
    zohoRefreshing,
    marketplaceRefreshing,
    refreshZoho,
    refreshMarketplace,
    incSyncOpen,
    setIncSyncOpen,
    incSyncKind,
    incSyncRunning,
    incSyncResult,
    incSyncElapsedMs,
  };
}
