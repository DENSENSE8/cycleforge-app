'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Check } from '@/components/Icons';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, SearchField, TextField } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { useResolveShipmentException } from '@/lib/shipments/shipment-record-client';
import { searchLinkableOrders } from '@/lib/shipments/shipment-order-search';
import type { ShipmentRecord, ShipmentRecordException } from '@/lib/shipments/shipment-record-types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { formatMonthDayTimePST } from '@/utils/date';

type ResolveMode = 'link-order' | 'close';

const MODES: readonly { id: ResolveMode; label: string; hint: string }[] = [
  { id: 'link-order', label: 'Link to an order', hint: 'The box holds an order the scan missed' },
  { id: 'close', label: 'Close without an order', hint: 'Say why no order belongs to this box' },
];

const rowClass = (selected: boolean) =>
  cn(
    'flex min-h-mode-hit w-full items-center justify-between gap-3 rounded-mode border px-mode-page py-2 text-left transition-colors disabled:opacity-60',
    selected ? 'border-border-strong bg-mode-hover text-mode-ink' : 'border-mode-edge bg-mode-panel text-mode-ink active:bg-mode-hover',
  );

/**
 * The package hub's `Resolve exception` verb: the pack scan of this tracking
 * number matched no order (an open `orders_exceptions` row). Two ways out —
 * link the box to the order it really holds (search by order #, tracking or
 * title), or close the exception with a required reason. One explicit button
 * is the write; `clientEventId` is minted once per opening so a retried tap
 * cannot resolve twice.
 */
export function ShipmentResolveSheet({
  open,
  onClose,
  record,
  exception,
}: {
  open: boolean;
  onClose: () => void;
  record: ShipmentRecord;
  exception: ShipmentRecordException;
}) {
  const resolve = useResolveShipmentException(record.shipmentId);
  const [mode, setMode] = useState<ResolveMode>('link-order');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [orderRowId, setOrderRowId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [clientEventId, setClientEventId] = useState('');

  // Re-seed on every opening: a stale pick or reason never survives a close.
  useEffect(() => {
    if (!open) return;
    setMode('link-order');
    setQuery('');
    setDebounced('');
    setOrderRowId(null);
    setReason('');
    setClientEventId(safeRandomUUID());
    resolve.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const orders = useQuery({
    queryKey: ['shipment-link-order-search', debounced],
    queryFn: ({ signal }) => searchLinkableOrders(debounced, signal),
    enabled: open && mode === 'link-order' && debounced.length >= 3,
    staleTime: 30_000,
  });
  const picked = orders.data?.find((order) => order.orderRowId === orderRowId) ?? null;

  const submit = () => {
    const body =
      mode === 'link-order'
        ? orderRowId != null
          ? ({ kind: 'link-order', orderRowId, clientEventId } as const)
          : null
        : reason.trim()
          ? ({ kind: 'close', reason: reason.trim(), clientEventId } as const)
          : null;
    if (!body) return;
    resolve.mutate(body, {
      onSuccess: () => {
        toast.success(mode === 'link-order' ? `Linked to ${picked?.orderRef ?? 'the order'}` : 'Exception closed');
        onClose();
      },
    });
  };

  const saving = resolve.isPending;
  const ready = mode === 'link-order' ? orderRowId != null : reason.trim().length > 0;
  const scanned = [
    exception.staffName ? `by ${exception.staffName}` : null,
    exception.sourceStation ? `at ${exception.sourceStation}` : null,
    exception.createdAt ? formatMonthDayTimePST(exception.createdAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <BottomSheet
      open={open}
      onClose={saving ? () => {} : onClose}
      forceVariant="sheet"
      scrollBody
      title="Resolve unmatched scan"
    >
      {/* BottomSheet portals out of the page's ModeRegion; re-declare triage so
          the mode radius / padding / hit tokens resolve inside the sheet. */}
      <ModeRegion mode="triage" className="flex flex-col gap-3 pb-2">
        <p className="text-role-caption text-mode-muted">
          Pack scan of <span className="font-mono text-mode-ink">{record.tracking}</span>
          {scanned ? ` ${scanned}` : ''} matched no order
          {exception.reason ? ` (${exception.reason.replace(/_/g, ' ')})` : ''}.
        </p>

        <TabSwitch
          tabs={MODES.map(({ id, label }) => ({ id, label }))}
          activeTab={mode}
          onTabChange={(id) => {
            if (!saving) setMode(id as ResolveMode);
          }}
          size="sm"
          fit="fill"
        />
        <p className="px-1 text-role-caption text-mode-muted">{MODES.find((option) => option.id === mode)?.hint}</p>

        {mode === 'link-order' ? (
          <div className="flex flex-col gap-1.5">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Order #, tracking or title…"
              tone="neutral"
              isSearching={orders.isFetching}
            />
            {debounced.length < 3 ? (
              <p className="px-1 text-role-caption text-mode-muted">Type at least 3 characters to find the order.</p>
            ) : orders.isError ? (
              <p role="alert" className="px-1 text-role-caption font-semibold text-text-danger">
                {orders.error instanceof Error ? orders.error.message : 'Order search failed'}
              </p>
            ) : orders.data && orders.data.length === 0 ? (
              <p className="px-1 text-role-caption text-mode-muted">No order matched “{debounced}”.</p>
            ) : (
              <div role="radiogroup" aria-label="Orders" className="flex flex-col gap-1.5">
                {(orders.data ?? []).map((order) => (
                  // ds-raw-button: full-width radio row (order title + refs + trailing check), not an action button
                  <button
                    key={order.orderRowId}
                    type="button"
                    role="radio"
                    aria-checked={orderRowId === order.orderRowId}
                    disabled={saving}
                    onClick={() => setOrderRowId(order.orderRowId)}
                    className={rowClass(orderRowId === order.orderRowId)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-mode-body font-semibold">{order.title || 'Untitled product'}</span>
                      <span className="block truncate text-role-caption text-mode-muted">
                        {[order.orderRef, order.sku, order.channel, order.status].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {orderRowId === order.orderRowId ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <TextField label="Reason (required)" value={reason} onChange={setReason} multiline rows={3} disabled={saving} />
        )}

        {resolve.error ? (
          <p role="alert" className="rounded-mode border border-border-danger bg-surface-danger px-mode-page py-2.5 text-role-caption font-semibold text-text-danger">
            Not resolved — {resolve.error.message}
          </p>
        ) : null}

        <Button variant="primary" size="lg" className="w-full rounded-mode" disabled={!ready} loading={saving} onClick={submit}>
          {saving
            ? 'Saving'
            : mode === 'link-order'
              ? picked
                ? `Link to ${picked.orderRef ?? `order #${picked.orderRowId}`}`
                : 'Pick the order in this box'
              : ready
                ? 'Close exception'
                : 'Say why to close'}
        </Button>
      </ModeRegion>
    </BottomSheet>
  );
}
