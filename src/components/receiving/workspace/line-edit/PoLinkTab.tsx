'use client';

/** "Link a PO" tab for the Package Pairing surface. */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StationDisplaySearchHeader } from '@/components/station/displays/StationDisplaySearchHeader';
import { ItemRecordThumb } from '@/design-system/components/item-record';
import { OrderIdChip, SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import {
  PairingCandidateRow,
  PairingLinkButton,
  PairingLinkedBadge,
} from './PairingLinkButton';
import { toast } from '@/lib/toast';
import { requestConfirm } from '@/design-system/components/confirm';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { apiErrorMessage } from '@/lib/api-error-message';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

interface PoCandidate {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  reference_number: string | null;
  vendor_name: string | null;
  status: string | null;
}

/** A previously-seen ORDER — the other namespace an operator pairs a box from. */
interface OrderCandidate {
  order_id: string;
  product_title: string | null;
  sku: string | null;
  account_source: string | null;
  status: string | null;
  order_date: string | null;
  item_count: number;
  /** Product thumb via the SKU identity ladder — Zoho item photo, else catalog. */
  image_url: string | null;
}

export function PoLinkTab({
  row,
  receivingId,
  autoFocusSearch = false,
  focusRequestId = 0,
}: {
  row: ReceivingLineRow;
  receivingId: number;
  /** Focus the PO search field on mount (chip → Package Pairing PO). */
  autoFocusSearch?: boolean;
  /** Bump to re-focus when already on this tab (re-open from chip). */
  focusRequestId?: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkingIdentifier, setLinkingIdentifier] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusSearch && focusRequestId <= 0) return;
    // Wait a frame so expand/scroll can settle before focusing.
    const id = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [autoFocusSearch, focusRequestId]);

  const currentPoNumber = (row.zoho_purchaseorder_number || '').trim() || null;
  const currentPoId = (row.zoho_purchaseorder_id || '').trim() || null;

  // Universal Incoming (plan §7.1):
  const inboundSource = (row.inbound_source_type || '').trim().toLowerCase();
  const isInboundMerge = row.id > 0 && inboundSource !== '' && inboundSource !== 'zoho';

  const trimmed = query.trim();
  const { data, isFetching, isError } = useQuery({
    queryKey: ['po-search', trimmed],
    queryFn: async () => {
      const res = await fetch(`/api/receiving/po-search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error('PO search failed');
      return (await res.json()) as {
        success: boolean;
        candidates: PoCandidate[];
        orders?: OrderCandidate[];
      };
    },
    // Always enabled — an empty query lists the most recent locally-stored
    // incoming POs; ≥2 chars filters the mirror.
    enabled: true,
    staleTime: 15_000,
  });
  const candidates = data?.candidates ?? [];
  const orderCandidates = data?.orders ?? [];

  const link = async (po: PoCandidate) => {
    if (linkingId) return;
    const poLabel = po.zoho_purchaseorder_number || po.zoho_purchaseorder_id;
    const existingLabel = currentPoNumber || currentPoId;

    // Explicit Replace / Merge confirm when an identity already exists (P2 / D§7.4).
    if (isInboundMerge) {
      const ok = await requestConfirm({
        title: 'Merge purchase order?',
        description: existingLabel
          ? `This carton already has a store/marketplace identity${existingLabel ? ` (${existingLabel})` : ''}. Merge purchase order ${poLabel} alongside it?`
          : `Merge purchase order ${poLabel} onto this carton? The marketplace identity stays; the PO is added for accounting.`,
        confirmLabel: 'Merge',
        tone: 'primary',
      });
      if (!ok) return;
    } else if (existingLabel) {
      const ok = await requestConfirm({
        title: 'Replace purchase order?',
        description: `This carton is linked to ${existingLabel}. Replace with PO ${poLabel}?`,
        confirmLabel: 'Replace',
        tone: 'primary',
      });
      if (!ok) return;
    }

    setLinkingId(po.zoho_purchaseorder_id);
    try {
      if (isInboundMerge) {
        // eBay (or other non-Zoho) Incoming line → add a Zoho PO identity (merge).
        const res = await fetch('/api/receiving/inbound/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_line_id: row.id,
            target: {
              system: 'zoho',
              purchase_order_id: po.zoho_purchaseorder_id,
              purchase_order_number: po.zoho_purchaseorder_number,
            },
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          message?: string;
          merged?: boolean;
        };
        if (!res.ok || !body.success) {
          toast.error(apiErrorMessage(body, res.status, `Link failed (${res.status})`));
          return;
        }
        toast.success(body.merged ? `Merged into purchase order ${poLabel}` : `Linked purchase order ${poLabel}`);
        // eBay stays the badge; the row now also carries the Zoho PO.
        dispatchLineUpdated({
          id: row.id,
          zoho_purchaseorder_id: po.zoho_purchaseorder_id,
          zoho_purchaseorder_number: po.zoho_purchaseorder_number,
        });
        invalidateReceivingFeeds(queryClient);
        setQuery('');
        return;
      }

      const res = await fetch('/api/receiving/relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiving_id: receivingId,
          line_id: row.id > 0 ? row.id : undefined,
          zoho_purchaseorder_id: po.zoho_purchaseorder_id,
          zoho_purchaseorder_number: po.zoho_purchaseorder_number,
          scope: 'both',
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        receiving_id?: number;
        paired_onto?: number;
        photos_moved?: number;
        lines_imported?: number;
      };
      if (!res.ok || !body.success) {
        toast.error(apiErrorMessage(body, res.status, `Link failed (${res.status})`));
        return;
      }
      const winnerId =
        body.paired_onto ??
        (typeof body.receiving_id === 'number' ? body.receiving_id : null);
      const pairedOntoBusyShell =
        winnerId != null && winnerId !== receivingId;
      const photosMoved =
        typeof body.photos_moved === 'number' && body.photos_moved > 0
          ? body.photos_moved
          : 0;
      const linesImported =
        typeof body.lines_imported === 'number' && body.lines_imported > 0
          ? body.lines_imported
          : 0;

      toast.success(
        pairedOntoBusyShell
          ? photosMoved > 0
            ? `Paired onto carton #${winnerId} · purchase order ${poLabel} · ${photosMoved} photo${photosMoved === 1 ? '' : 's'} kept`
            : `Paired onto carton #${winnerId} · purchase order ${poLabel}`
          : existingLabel
            ? linesImported > 0
              ? `Replaced with purchase order ${poLabel} · ${linesImported} line${linesImported === 1 ? '' : 's'}`
              : `Replaced with purchase order ${poLabel}`
            : linesImported > 0
              ? `Linked purchase order ${poLabel} · ${linesImported} line${linesImported === 1 ? '' : 's'}`
              : `Linked purchase order ${poLabel}`,
      );

      if (pairedOntoBusyShell && winnerId != null) {
        invalidateReceivingFeeds(queryClient);
        void queryClient.invalidateQueries({ queryKey: ['receiving-photos'] });
        setQuery('');
        router.replace(`${UNBOX_SURFACE_ROUTE}?openReceivingId=${winnerId}`);
        return;
      }

      // Update the open carton's displayed PO in place (carton context + feeds).
      dispatchLineUpdated({
        id: row.id,
        zoho_purchaseorder_id: po.zoho_purchaseorder_id,
        zoho_purchaseorder_number: po.zoho_purchaseorder_number,
        receiving_source: 'zoho_po',
      });
      invalidateReceivingFeeds(queryClient);
      setQuery('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setLinkingId(null);
    }
  };

  /** Link an identifier — the one the operator typed, or the `order_id` of a previous ORDER they picked from the results. */
  const linkIdentifier = async (identifier: string) => {
    const value = identifier.trim();
    if (!value || linkingIdentifier) return;
    setLinkingIdentifier(true);
    try {
      const res = await fetch('/api/receiving/link-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiving_id: receivingId,
          line_id: row.id > 0 ? row.id : undefined,
          identifier: value,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        outcome?: 'linked' | 'pending';
        receiving_id?: number;
        zoho_purchaseorder_id?: string | null;
        zoho_purchaseorder_number?: string | null;
        lines_imported?: number;
        paired_onto?: number;
      };
      if (!res.ok || !body.success) {
        toast.error(apiErrorMessage(body, res.status, `Link failed (${res.status})`));
        return;
      }

      const imported = typeof body.lines_imported === 'number' ? body.lines_imported : 0;
      const winnerId = body.paired_onto ?? null;

      if (body.outcome === 'linked') {
        const poLabel = body.zoho_purchaseorder_number || body.zoho_purchaseorder_id || value;
        toast.success(
          imported > 0
            ? `Linked purchase order ${poLabel} · ${imported} item${imported === 1 ? '' : 's'} imported`
            : `Linked purchase order ${poLabel}`,
        );
        if (winnerId != null && winnerId !== receivingId) {
          invalidateReceivingFeeds(queryClient);
          setQuery('');
          router.replace(`${UNBOX_SURFACE_ROUTE}?openReceivingId=${winnerId}`);
          return;
        }
        dispatchLineUpdated({
          id: row.id,
          zoho_purchaseorder_id: body.zoho_purchaseorder_id ?? null,
          zoho_purchaseorder_number: body.zoho_purchaseorder_number ?? null,
          receiving_source: 'zoho_po',
        });
      } else {
        toast.success(`Linked ${value} — not imported yet, the carton stays unfound`);
        // The id reads on the carton chip immediately: the primary `manual`
        // purchase link dual-writes the spine cache the chip resolves from.
        dispatchLineUpdated({
          id: row.id,
          source_order_id: value,
          inbound_source_type: 'manual',
        });
      }
      // Refresh THIS carton on the spot: the imported items have to appear in
      // the open Items section without a manual reload, and the PO search this
      // tab is showing must re-run now that the mirror may have gained the row.
      invalidateReceivingFeeds(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['po-search'] });
      refreshDomains(REFRESH_BUNDLES.receivingWrite);
      window.dispatchEvent(
        new CustomEvent('receiving-package-updated', {
          detail: {
            receiving_id: body.receiving_id ?? receivingId,
            zoho_purchaseorder_number: body.zoho_purchaseorder_number ?? null,
          },
        }),
      );
      setQuery('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setLinkingIdentifier(false);
    }
  };

  return (
    // Column, not a stack:
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
      {/* The currently-linked PO is shown in the global header — not repeated
          here. This tab is purely the search-and-(re)link surface. */}

      {isInboundMerge ? (
        <p
          className={cn(
            cornerClass('flush'),
            'border border-accent-border bg-surface-sunken inset-field text-role-eyebrow font-semibold uppercase tracking-widest text-accent-bg',
          )}
        >
          {`${(row.inbound_source_type || 'eBay')} order · pick its purchase order to merge`}
        </p>
      ) : null}

      {/* One search box over BOTH namespaces — purchase orders and previous sales orders — because a box's label carries whichever the seller… */}
      <StationDisplaySearchHeader
        value={query}
        onChange={setQuery}
        placeholder="Search any order id, PO#, reference…"
        isSearching={isFetching}
        inputRef={searchInputRef}
        autoFocus={autoFocusSearch}
      />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">

      {isError ? (
        <p
          className={cn(
            cornerClass('flush'),
            'border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-center text-xs text-rose-600',
          )}
        >
          Couldn’t load orders. Try again.
        </p>
      ) : isFetching && candidates.length === 0 && orderCandidates.length === 0 ? (
        <UniversalLoader isLoading label="Loading orders" className="min-h-28" />
      ) : (
        // Flush stack: `-space-y-px` pulls each row up onto its neighbour's border so adjacent 1px edges collapse into ONE hairline seam.
        <div className="-space-y-px">
          {/*
 * Every avenue paints the SAME row — thumb · id · product title — so the operator reads one list whichever namespace answered
 * (operator 2026-09-23). `ItemRecordThumb` is the Store avenue's own
 */}
          {/* The typed id leads: it is what the operator is holding, and it is
              linkable whether or not anything below matches it. */}
          {trimmed ? (
            <PairingCandidateRow
              media={<ItemRecordThumb imageUrl={null} />}
              title={trimmed}
              meta={
                <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                  Not in the system
                </p>
              }
              action={
                <PairingLinkButton
                  loading={linkingIdentifier}
                  disabled={linkingId !== null}
                  onClick={() => void linkIdentifier(trimmed)}
                  label="Link Id"
                />
              }
            />
          ) : null}

          {orderCandidates.map((order) => (
            <PairingCandidateRow
              key={`order-${order.order_id}`}
              media={<ItemRecordThumb imageUrl={order.image_url ?? null} />}
              // Same grammar as the Store row (`ecwid-search-rows.tsx`):
              title={order.product_title || order.order_id}
              meta={
                <div className="flex flex-wrap items-center gap-1">
                  <OrderIdChip value={order.order_id} display={getLast8(order.order_id)} dense />
                  {order.sku ? <SkuScanRefChip value={order.sku} display={order.sku} dense /> : null}
                </div>
              }
              action={
                <PairingLinkButton
                  loading={linkingIdentifier}
                  disabled={linkingId !== null}
                  onClick={() => void linkIdentifier(order.order_id)}
                  label="Link"
                />
              }
            />
          ))}

          {candidates.map((po) => {
            const isCurrent = currentPoId != null && po.zoho_purchaseorder_id === currentPoId;
            const isLinking = linkingId === po.zoho_purchaseorder_id;
            return (
              <PairingCandidateRow
                key={po.zoho_purchaseorder_id}
                linked={isCurrent}
                media={<ItemRecordThumb imageUrl={null} />}
                title={po.zoho_purchaseorder_number || `PO ${po.zoho_purchaseorder_id}`}
                meta={
                  <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                    {po.vendor_name || 'Unknown vendor'}
                  </p>
                }
                action={
                  isCurrent ? (
                    <PairingLinkedBadge />
                  ) : (
                    <PairingLinkButton
                      loading={isLinking}
                      disabled={linkingId !== null}
                      onClick={() => void link(po)}
                      label={isInboundMerge ? 'Merge' : currentPoNumber ? 'Relink' : 'Link'}
                    />
                  )
                }
              />
            );
          })}

          {!trimmed && candidates.length === 0 && orderCandidates.length === 0 ? (
            <p
              className={cn(
                cornerClass('flush'),
                'border border-dashed border-border-soft bg-surface-canvas px-4 py-5 text-center text-xs text-text-soft',
              )}
            >
              Type an order id or PO#.
            </p>
          ) : null}
        </div>
      )}
      </div>
    </div>
  );
}
