'use client';

/**
 * "Link a PO" tab for the Package Pairing surface.
 *
 * Makes the WEBSITE the source of truth for the carton↔PO link: search the local
 * PO mirror (read-only, no Zoho round-trip) and re-point this carton + line at
 * the correct PO — even when Zoho already had a different (wrong) one. Posts to
 * the audited /api/receiving/relink (scope 'both'); the displayed PO# updates in
 * place via `dispatchLineUpdated`. When relink pairs onto a busy matched shell,
 * the response's `paired_onto` / `receiving_id` redirects Unbox to that carton.
 *
 * This replaces "Zoho is authoritative": an operator who knows the right PO can
 * correct a mis-linked carton here instead of editing Zoho and waiting for a sync.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
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
import { apiErrorMessage } from '@/lib/api-error-message';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

interface PoCandidate {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  reference_number: string | null;
  vendor_name: string | null;
  status: string | null;
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

  // Universal Incoming (plan §7.1): when this line is an eBay-originated spine row
  // (a real spine row with a non-Zoho primary source), picking a Zoho PO MERGES —
  // it augments this line with a secondary Zoho link + equivalence via
  // /api/receiving/inbound/link, rather than re-pointing a carton (relink). The
  // eBay identity stays the badge; the Zoho PO is added alongside for accounting.
  const inboundSource = (row.inbound_source_type || '').trim().toLowerCase();
  const isInboundMerge = row.id > 0 && inboundSource !== '' && inboundSource !== 'zoho';

  const trimmed = query.trim();
  const { data, isFetching, isError } = useQuery({
    queryKey: ['po-search', trimmed],
    queryFn: async () => {
      const res = await fetch(`/api/receiving/po-search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error('PO search failed');
      return (await res.json()) as { success: boolean; candidates: PoCandidate[] };
    },
    // Always enabled — an empty query lists the most recent locally-stored
    // incoming POs; ≥2 chars filters the mirror.
    enabled: true,
    staleTime: 15_000,
  });
  const candidates = data?.candidates ?? [];

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

  return (
    <div className="space-y-2">
      {/* The currently-linked PO is shown in the global header — not repeated
          here. This tab is purely the search-and-(re)link surface. */}

      {isInboundMerge ? (
        <p
          className={cn(
            cornerClass('flush'),
            'border border-blue-200 bg-blue-50 inset-field text-role-eyebrow font-semibold uppercase tracking-widest text-blue-700',
          )}
        >
          {`${(row.inbound_source_type || 'eBay')} order · pick its purchase order to merge`}
        </p>
      ) : null}

      {/* Search the local PO mirror (PO# / reference / vendor). */}
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search purchase order # / reference / vendor…"
        isSearching={isFetching}
        variant="blue"
        size="compact"
        hideUnderline
        inputRef={searchInputRef}
        autoFocus={autoFocusSearch}
      />

      {/* Results — the most recent locally-stored incoming POs by default; the
          search box filters them. */}
      {isError ? (
        <p
          className={cn(
            cornerClass('flush'),
            'border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-center text-xs text-rose-600',
          )}
        >
          Couldn’t load purchase orders. Try again.
        </p>
      ) : isFetching && candidates.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-5 text-xs text-text-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading purchase orders…
        </p>
      ) : candidates.length === 0 ? (
        <p
          className={cn(
            cornerClass('flush'),
            'border border-dashed border-border-soft bg-surface-canvas px-4 py-5 text-center text-xs text-text-soft',
          )}
        >
          {trimmed ? `No purchase orders match “${trimmed}”.` : 'No incoming purchase orders stored yet.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {candidates.map((po) => {
            const isCurrent = currentPoId != null && po.zoho_purchaseorder_id === currentPoId;
            const isLinking = linkingId === po.zoho_purchaseorder_id;
            return (
              <PairingCandidateRow
                key={po.zoho_purchaseorder_id}
                linked={isCurrent}
                title={
                  po.zoho_purchaseorder_number || `PO ${po.zoho_purchaseorder_id}`
                }
                meta={
                  <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                    {po.vendor_name || 'Unknown vendor'}
                    {po.reference_number ? ` · ref ${po.reference_number}` : ''}
                    {po.status ? ` · ${po.status}` : ''}
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
        </div>
      )}
    </div>
  );
}
