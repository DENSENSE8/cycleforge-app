'use client';

/**
 * Attach carrier tracking to a PO before the boxes arrive (docs/multi-tracking-po-plan.md
 * Phase 4b) — the form body. The Incoming record's Attach tracking verb hosts it in
 * the strip's centered dialog; `IncomingAttachTrackingPopover` hosts it for the
 * Purchasing sheet. The tracking field is focused; Enter links the number as a box
 * (`POST /api/receiving/po/:poId/attach-box`) and the done face says so — its toast
 * carries Undo for a number put on the wrong purchase.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Truck } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { SearchBar } from '@/components/ui/SearchBar';
import { getLast8 } from '@/components/ui/CopyChip';
import { toast } from '@/lib/toast';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';

interface PoHit {
  po_id: string;
  po_number: string;
  receiving_id: number | null;
  item_count: number;
  qty_expected: number;
}

interface AttachedBox {
  id: number;
  box_seq: number;
  is_primary: boolean;
  tracking_number: string | null;
  carrier: string | null;
  status_category: string | null;
  is_delivered: boolean | null;
}

export interface AttachTrackingPresetPo {
  poId: string;
  poNumber: string | null;
}

/** What the done face reports: the number, its purchase, and the box it became (null when it was already linked). */
interface Attached {
  tracking: string;
  poLabel: string;
  boxCount: number | null;
}

/** A preset PO — only po_id / po_number are read by attach() and the selected-PO header. */
function presetHit(po: AttachTrackingPresetPo): PoHit {
  return { po_id: po.poId, po_number: po.poNumber ?? '', receiving_id: null, item_count: 0, qty_expected: 0 };
}

export function IncomingAttachTrackingForm({
  presetPo,
  onAttached,
  onDone,
}: {
  /** Locks the form to this PO (no search step, no Change). */
  presetPo?: AttachTrackingPresetPo;
  /**
   * Fired after a successful attach, and again after its Undo — lets a host
   * that owns its own query keys (the incoming delivery record, the Purchasing
   * sheet) refresh beyond the shared receiving feeds.
   */
  onAttached?: () => void;
  /** The done face's Done — closes the host dialog. */
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PoHit | null>(() => (presetPo ? presetHit(presetPo) : null));
  const [tracking, setTracking] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState<Attached | null>(null);

  const { data: hits, isFetching } = useQuery<PoHit[]>({
    queryKey: ['incoming-attach-po-search', query],
    enabled: !selected && query.trim().length >= 2,
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving/po/list?view=open&limit=20&search=${encodeURIComponent(query.trim())}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('PO search failed');
      const data = await res.json();
      return Array.isArray(data?.purchase_orders)
        ? data.purchase_orders
        : Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data)
            ? data
            : [];
    },
    staleTime: 10_000,
  });

  // The boxes already attached to this PO (receiving_shipments junction), so the
  // form shows what's linked instead of the empty hint.
  const { data: boxes, isFetching: loadingBoxes } = useQuery<AttachedBox[]>({
    queryKey: ['incoming-attach-po-boxes', selected?.po_id],
    enabled: !!selected,
    queryFn: async () => {
      const res = await fetch(`/api/receiving/po/${encodeURIComponent(selected!.po_id)}/attach-box`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load attached boxes');
      const data = await res.json();
      return Array.isArray(data?.boxes) ? data.boxes : [];
    },
    staleTime: 5_000,
  });

  // Undo one fresh attach (`DELETE …/attach-box`): the link goes, the box list and every feed refresh.
  // The toast outlives the dialog, so it writes the shared cache, never this form's state.
  const undoAttach = useCallback(
    async (made: { poId: string; label: string; tracking: string; receivingId: number; shipmentId: number }) => {
      try {
        const res = await fetch(`/api/receiving/po/${encodeURIComponent(made.poId)}/attach-box`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receivingId: made.receivingId, shipmentId: made.shipmentId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data?.success) {
          toast.error(data?.error || 'Could not undo — the tracking number is still linked');
          return;
        }
        queryClient.setQueryData(['incoming-attach-po-boxes', made.poId], Array.isArray(data.boxes) ? data.boxes : []);
        toast.success(`Removed ${made.tracking} from ${made.label}`);
        invalidateReceivingFeeds(queryClient);
        onAttached?.();
      } catch {
        toast.error('Could not undo — the tracking number is still linked');
      }
    },
    [queryClient, onAttached],
  );

  const attach = async (rawTracking: string) => {
    const value = rawTracking.trim();
    if (!value || !selected || attaching) return;
    setAttaching(true);
    try {
      const poId = selected.po_id;
      const res = await fetch(`/api/receiving/po/${encodeURIComponent(poId)}/attach-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.success) {
        toast.error(data?.error || 'Could not link tracking number');
        return;
      }
      const label = selected.po_number || poId;
      queryClient.setQueryData(['incoming-attach-po-boxes', poId], Array.isArray(data.boxes) ? data.boxes : []);
      if (!data.already_attached) {
        // A fresh link can be taken back (wrong PO, wrong row) — the box was linked, never scanned.
        toast.undo(`${value} linked to ${label} as box ${data.box_count}`, {
          duration: 10_000,
          onUndo: () => void undoAttach({ poId, label, tracking: value, receivingId: data.receiving_id, shipmentId: data.shipment_id }),
        });
      }
      invalidateReceivingFeeds(queryClient);
      onAttached?.();
      setAttached({ tracking: value, poLabel: label, boxCount: data.already_attached ? null : data.box_count });
    } catch {
      toast.error('Could not link tracking number');
    } finally {
      setAttaching(false);
    }
  };

  if (attached) {
    return (
      <VerbDoneState
        title={attached.boxCount == null ? 'Tracking already linked' : 'Tracking attached'}
        detail={`${attached.tracking} → ${attached.poLabel}${attached.boxCount == null ? '' : ` · box ${attached.boxCount}`}`}
        onDone={onDone}
        testId="incoming-attach-tracking-done"
      />
    );
  }

  if (!selected) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2" data-testid="incoming-attach-tracking">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search purchase order #, vendor, SKU…"
          variant="blue"
          size="compact"
          autoFocus
          debounceMs={250}
          leadingIcon={<Package className="h-[14px] w-[14px]" />}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-1 py-2 text-role-caption text-text-faint">Type at least 2 characters to search incoming POs.</p>
          ) : isFetching ? null : !hits || hits.length === 0 ? (
            <p className="px-1 py-2 text-role-caption text-text-faint">No matching POs.</p>
          ) : (
            <ul className="space-y-1">
              {hits.map((po) => (
                <li key={po.po_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(po)}
                    /* ds-raw-button: text-left PO search result row (title + item count) — not a Button shape */
                    className="ds-raw-button flex w-full items-center justify-between gap-2 rounded-lg border border-border-soft px-2.5 py-2 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
                      {po.po_number || po.po_id}
                    </span>
                    <span className="shrink-0 tabular-nums text-role-micro font-semibold text-text-faint">
                      {po.item_count} item{po.item_count === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const shownBoxes = boxes ?? [];
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2" data-testid="incoming-attach-tracking">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-canvas inset-cozy">
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
          {selected.po_number || selected.po_id}
        </span>
        {/* A preset PO is locked — no "Change" back to search. */}
        {!presetPo ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(null);
              setTracking('');
            }}
          >
            Change
          </Button>
        ) : null}
      </div>

      <SearchBar
        value={tracking}
        onChange={setTracking}
        onSearch={(v) => void attach(v)}
        placeholder="Scan / enter tracking #"
        variant="blue"
        size="compact"
        autoFocus
        debounceMs={0}
        leadingIcon={<Truck className="h-[14px] w-[14px]" />}
        isSearching={attaching}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shownBoxes.length === 0 ? (
          loadingBoxes ? null : (
            <p className="px-1 py-2 text-role-caption text-text-faint">
              Scan the carton’s tracking # — it attaches to this PO as a box.
            </p>
          )
        ) : (
          <ul className="space-y-1">
            {shownBoxes.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-lg border border-border-hairline inset-cozy">
                <span className="shrink-0 rounded bg-surface-sunken inset-chip text-role-micro tabular-nums text-text-muted">
                  Box {b.box_seq}
                </span>
                <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-muted">
                  {b.tracking_number ? `…${getLast8(b.tracking_number)}` : '—'}
                  {b.carrier ? <span className="ml-1 text-text-faint">{b.carrier}</span> : null}
                </span>
                <span className={`shrink-0 text-role-micro font-semibold ${b.is_delivered ? 'text-emerald-600' : 'text-text-faint'}`}>
                  {b.is_delivered ? 'Delivered' : b.status_category ? b.status_category.replace(/_/g, ' ').toLowerCase() : 'pending'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="px-1 text-role-micro text-text-faint">
        The PO stays in Incoming and leaves “Awaiting tracking #” once carrier sync runs.
      </p>
    </div>
  );
}
