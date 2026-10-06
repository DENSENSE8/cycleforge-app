'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Package, Truck, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { Dialog, DialogContent, DialogTitle } from '@/design-system/components/Dialog';
import { SearchBar } from '@/components/ui/SearchBar';
import { getLast8 } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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

interface AttachTrackingPresetPo {
  poId: string;
  poNumber: string | null;
}

interface IncomingAttachTrackingPopoverProps {
  /** When set, skip the PO-search step entirely and open straight into the attach-tracking state for this PO — used by row-anchored triggers… */
  presetPo?: AttachTrackingPresetPo;
  /** Custom trigger node. Defaults to the standalone "Link tracking to PO" pill.
   *  Pass `null` when a host opens the modal via controlled `open` only (no trigger). */
  trigger?: React.ReactNode | null;
  /** Optional controlled open state (falls back to internal state). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Fired after a successful attach — lets a host that owns its own query keys
   * (e.g. the incoming delivery record) refresh beyond the shared receiving feeds.
   */
  onAttached?: () => void;
}

/** Attach carrier tracking number(s) to a PO BEFORE the boxes arrive (docs/multi-tracking-po-plan.md Phase 4b). */
export function IncomingAttachTrackingPopover({
  presetPo,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onAttached,
}: IncomingAttachTrackingPopoverProps = {}) {
  const queryClient = useQueryClient();

  // A seeded PoHit for the row-anchored mode — only po_id / po_number are read
  // by attach() and the selected-PO header, so the rest are harmless defaults.
  const presetSelected = useMemo<PoHit | null>(
    () =>
      presetPo
        ? {
            po_id: presetPo.poId,
            po_number: presetPo.poNumber ?? '',
            receiving_id: null,
            item_count: 0,
            qty_expected: 0,
          }
        : null,
    [presetPo],
  );

  const [internalOpen, setInternalOpen] = useState(false);
  const [_stationPreset, setStationPreset] = useState<PoHit | null>(null);
  const open = controlledOpen ?? internalOpen;
  // Where focus was before we opened — restored on close for keyboard users.
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PoHit | null>(presetSelected);
  const [tracking, setTracking] = useState('');
  const [boxes, setBoxes] = useState<AttachedBox[]>([]);
  const [attaching, setAttaching] = useState(false);

  const reset = useCallback(() => {
    setQuery('');
    // Row-anchored mode has no search step — reset back to the fixed PO.
    setSelected(presetSelected);
    setTracking('');
    setBoxes([]);
  }, [presetSelected]);

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (controlledOpen === undefined) setInternalOpen(next);
      if (!next) {
        reset();
        setStationPreset(null);
        // Return focus to the launching control.
        lastFocusedRef.current?.focus?.();
      }
    },
    [controlledOpen, onOpenChange, reset],
  );

  // Listen for station-builder attach-tracking events (fired when the
  // `incoming.attach_tracking` action is run from a station block row).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ poId: string | null; poNumber: string | null }>).detail;
      if (!detail?.poId) return;
      const hit: PoHit = {
        po_id: detail.poId,
        po_number: detail.poNumber ?? '',
        receiving_id: null,
        item_count: 0,
        qty_expected: 0,
      };
      setStationPreset(hit);
      setSelected(hit);
      setOpen(true);
    };
    window.addEventListener('station:attach-tracking', handler as EventListener);
    return () => window.removeEventListener('station:attach-tracking', handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: hits, isFetching } = useQuery<PoHit[]>({
    queryKey: ['incoming-attach-po-search', query],
    enabled: open && !presetPo && !selected && query.trim().length >= 2,
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

  const pickPo = useCallback((po: PoHit) => {
    setSelected(po);
    setTracking('');
    setBoxes([]);
  }, []);

  // Preload the boxes already attached to this PO (receiving_shipments junction)
  // so a reopen shows what's linked instead of the empty hint. Attaches below
  // overwrite this via setBoxes with the POST's authoritative list.
  const { data: existingBoxes, isFetching: loadingBoxes } = useQuery<AttachedBox[]>({
    queryKey: ['incoming-attach-po-boxes', selected?.po_id],
    enabled: open && !!selected,
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving/po/${encodeURIComponent(selected!.po_id)}/attach-box`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Could not load attached boxes');
      const data = await res.json();
      return Array.isArray(data?.boxes) ? data.boxes : [];
    },
    staleTime: 5_000,
  });

  // Session attaches (POST response) win; otherwise show what's already linked.
  const shownBoxes = boxes.length > 0 ? boxes : (existingBoxes ?? []);

  const attach = useCallback(
    async (rawTracking: string) => {
      const value = rawTracking.trim();
      if (!value || !selected) return;
      setAttaching(true);
      try {
        const res = await fetch(
          `/api/receiving/po/${encodeURIComponent(selected.po_id)}/attach-box`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackingNumber: value }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!data?.success) {
          toast.error(data?.error || 'Could not link tracking number');
          return;
        }
        const nextBoxes: AttachedBox[] = Array.isArray(data.boxes) ? data.boxes : [];
        setBoxes(nextBoxes);
        // Keep the preload cache current so a close/reopen shows the same list.
        queryClient.setQueryData(['incoming-attach-po-boxes', selected.po_id], nextBoxes);
        setTracking('');
        if (data.already_attached) toast.success('Tracking already linked to this PO');
        else toast.success(`Box ${data.box_count} linked to ${selected.po_number}`);
        invalidateReceivingFeeds(queryClient);
        onAttached?.();
      } catch {
        toast.error('Could not link tracking number');
      } finally {
        setAttaching(false);
      }
    },
    [selected, queryClient, onAttached],
  );

  // Escape, focus trap, focus restore, scroll lock and the scrim all come from
  // the DS Dialog (Radix) — this used to hand-roll every one of them.

  const openModal = useCallback((e?: MouseEvent) => {
    // Remember the trigger so focus returns to it on close.
    lastFocusedRef.current = (e?.currentTarget as HTMLElement) ?? (document.activeElement as HTMLElement);
    setOpen(true);
  }, [setOpen]);

  // Compose the open handler onto the caller's trigger (preserving its own
  // onClick, e.g. the row's stopPropagation) so a custom trigger still works.
  // `trigger={null}` → headless (controlled open only — e.g. Incoming Sync menu).
  const triggerNode =
    trigger === null
      ? null
      : trigger
        ? isValidElement(trigger)
          ? cloneElement(trigger as ReactElement<{ onClick?: (e: MouseEvent) => void }>, {
              onClick: (e: MouseEvent) => {
                (trigger as ReactElement<{ onClick?: (e: MouseEvent) => void }>).props.onClick?.(e);
                openModal(e);
              },
            })
          : trigger
        : (
          <HoverTooltip
            label="Search a PO and attach carrier tracking number(s) before the boxes arrive"
            asChild
          >
            <Button
              variant="secondary"
              size="sm"
              icon={<Link2 className="h-3.5 w-3.5" />}
              onClick={openModal}
              ariaLabel="Search a PO and attach carrier tracking number(s) before the boxes arrive"
              className="mx-1.5 bg-indigo-50 text-indigo-700 ring-indigo-200 ring-inset hover:bg-indigo-100"
            >
              Link tracking to PO
            </Button>
          </HoverTooltip>
        );

  const modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        ref={cardRef}
        hideClose
        aria-describedby={undefined}
        className="w-[360px] max-w-full gap-0 rounded-xl p-3"
      >
              {/* Header */}
              <div className="mb-2 flex items-center justify-between">
                <DialogTitle className="text-role-eyebrow text-text-soft">
                  {selected ? 'Attach tracking' : 'Find a PO'}
                </DialogTitle>
                <IconButton
                  icon={<X className="h-3.5 w-3.5" />}
                  ariaLabel="Close"
                  onClick={() => setOpen(false)}
                  className="rounded p-0.5 hover:bg-surface-sunken"
                />
              </div>

              {!selected ? (
                <>
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
                  <div className="mt-2 max-h-64 overflow-y-auto">
                    {query.trim().length < 2 ? (
                      <p className="px-1 py-2 text-role-caption text-text-faint">
                        Type at least 2 characters to search incoming POs.
                      </p>
                    ) : isFetching ? null : !hits || hits.length === 0 ? (
                      <p className="px-1 py-2 text-role-caption text-text-faint">No matching POs.</p>
                    ) : (
                      <ul className="space-y-1">
                        {hits.map((po) => (
                          <li key={po.po_id}>
                            <button
                              type="button"
                              onClick={() => pickPo(po)}
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
                </>
              ) : (
                <>
                  {/* Selected PO header + change */}
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-surface-canvas inset-cozy">
                    <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
                      {selected.po_number || selected.po_id}
                    </span>
                    {/* Row-anchored mode locks the PO — no "Change" back to search. */}
                    {!presetPo ? (
                      <button
                        type="button"
                        onClick={reset}
                        /* ds-raw-button: compact inline text link (text-mini) inside a chip row — Button height/padding would bloat it */
                        className="ds-raw-button shrink-0 text-role-micro text-indigo-600 hover:text-indigo-800"
                      >
                        Change
                      </button>
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

                  {/* Attached boxes */}
                  <div className="mt-2 max-h-56 overflow-y-auto">
                    {shownBoxes.length === 0 ? (
                      loadingBoxes ? null : (
                        <p className="px-1 py-2 text-role-caption text-text-faint">
                          Scan each carton’s tracking # — they’ll attach to this PO as boxes.
                        </p>
                      )
                    ) : (
                      <ul className="space-y-1">
                        {shownBoxes.map((b) => (
                          <li
                            key={b.id}
                            className="flex items-center gap-2 rounded-lg border border-border-hairline inset-cozy"
                          >
                            <span className="shrink-0 rounded bg-surface-sunken inset-chip text-role-micro tabular-nums text-text-muted">
                              Box {b.box_seq}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-muted">
                              {b.tracking_number ? `…${getLast8(b.tracking_number)}` : '—'}
                              {b.carrier ? <span className="ml-1 text-text-faint">{b.carrier}</span> : null}
                            </span>
                            <span
                              className={`shrink-0 text-role-micro font-semibold ${
                                b.is_delivered ? 'text-emerald-600' : 'text-text-faint'
                              }`}
                            >
                              {b.is_delivered ? 'Delivered' : b.status_category ? b.status_category.replace(/_/g, ' ').toLowerCase() : 'pending'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <p className="mt-2 px-1 text-role-micro text-text-faint">
                    The PO stays in Incoming and leaves “Awaiting tracking #” once carrier sync runs.
                  </p>
                </>
              )}
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {triggerNode}
      {modal}
    </>
  );
}
