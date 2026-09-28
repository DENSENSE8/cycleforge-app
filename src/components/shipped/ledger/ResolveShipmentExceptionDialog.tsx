'use client';

/** Resolve an unmatched pack scan — the open `orders_exceptions` row on a package. */

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { Button, SearchField } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useResolveShipmentException } from '@/lib/shipments/shipment-record-client';
import { searchLinkableOrders, type LinkableOrderLine } from '@/lib/shipments/shipment-order-search';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

type Decision = 'link-order' | 'close';

const DECISIONS: readonly { id: Decision; label: string }[] = [
  { id: 'link-order', label: 'Link to an order' },
  { id: 'close', label: 'Close' },
];

export function ResolveShipmentExceptionDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: ShipmentRecord;
}) {
  const [decision, setDecision] = useState<Decision>('link-order');
  const [query, setQuery] = useState(record.tracking);
  const [picked, setPicked] = useState<LinkableOrderLine | null>(null);
  const [reason, setReason] = useState('');
  const keyRef = useRef('');
  const resolve = useResolveShipmentException(record.shipmentId);

  const needle = query.trim();
  const search = useQuery({
    queryKey: ['shipment-link-order-search', needle],
    queryFn: ({ signal }) => searchLinkableOrders(needle, signal),
    enabled: open && decision === 'link-order' && needle.length >= 3,
    staleTime: 30_000,
  });
  const lines = search.data ?? [];

  const close = () => {
    setDecision('link-order');
    setQuery(record.tracking);
    setPicked(null);
    setReason('');
    keyRef.current = '';
    resolve.reset();
    onOpenChange(false);
  };

  const choose = (next: Decision) => {
    setDecision(next);
    keyRef.current = '';
    resolve.reset();
  };

  const canSubmit = decision === 'link-order' ? picked != null : reason.trim().length > 0;

  const submit = () => {
    if (!canSubmit || resolve.isPending) return;
    if (!keyRef.current) keyRef.current = safeRandomUUID();
    const body =
      decision === 'link-order' && picked
        ? { kind: 'link-order' as const, orderRowId: picked.orderRowId, clientEventId: keyRef.current }
        : { kind: 'close' as const, reason: reason.trim(), clientEventId: keyRef.current };
    resolve.mutate(body, {
      onSuccess: (result) => {
        toast.success(
          result.idempotent
            ? 'Already resolved'
            : body.kind === 'link-order'
              ? `Linked ${record.tracking} to ${picked?.orderRef ?? `order line ${body.orderRowId}`}`
              : `Closed the unmatched scan on ${record.tracking}`,
        );
        close();
      },
    });
  };

  const reasonLabel = (record.exception?.reason || 'unmatched').replace(/_/g, ' ');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !resolve.isPending && close()}>
      <DialogContent className="flex max-h-[88dvh] max-w-xl flex-col gap-3" data-testid="resolve-shipment-exception-dialog">
        {/* The dialog portals out of the ledger's mode region; re-declare it. */}
        <ModeRegion mode="triage" className="contents">
          <DialogHeader>
            <DialogTitle>Resolve unmatched scan · {record.tracking}</DialogTitle>
            <DialogDescription>
              This box was pack-scanned but matched no order ({reasonLabel}). Link it to the order line it belongs to, or
              close the exception with a reason.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-stretch border border-mode-ink bg-mode-bar" role="radiogroup" aria-label="Decision">
            {DECISIONS.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={decision === option.id}
                data-testid={`resolve-decision-${option.id}`}
                onClick={() => choose(option.id)}
                className={cn(
                  DESK_BAR_SEGMENT_CLASS,
                  'flex-1 justify-center',
                  index > 0 && 'border-l border-mode-edge',
                  deskBarSegmentTone(decision === option.id),
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {decision === 'link-order' ? (
            <>
              <SearchField
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPicked(null);
                  keyRef.current = '';
                }}
                placeholder="Order #, tracking # or title"
                isSearching={search.isFetching}
                autoFocus
              />
              <div className="min-h-40 flex-1 overflow-y-auto border border-mode-ink" data-testid="resolve-order-candidates">
                {search.isError ? (
                  <p className={cn(RECORD_LABEL_CLASS, 'p-4 normal-case tracking-normal text-mode-warn')}>
                    {search.error.message}
                  </p>
                ) : lines.length === 0 ? (
                  <p className={cn(RECORD_LABEL_CLASS, 'p-4 normal-case tracking-normal text-mode-muted')}>
                    {needle.length < 3
                      ? 'Type at least 3 characters of an order #, tracking # or title.'
                      : search.isFetching
                        ? 'Searching…'
                        : `No order line matches “${needle}”.`}
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {lines.map((line) => {
                      const selected = picked?.orderRowId === line.orderRowId;
                      return (
                        <li key={line.orderRowId} className="border-b border-mode-edge last:border-b-0">
                          <button
                            type="button"
                            aria-pressed={selected}
                            data-testid="resolve-order-candidate"
                            onClick={() => {
                              setPicked(line);
                              keyRef.current = '';
                            }}
                            className={cn(
                              'ds-raw-button flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left',
                              selected ? 'bg-mode-ink text-mode-bar' : 'hover:bg-mode-hover',
                              focusRing('control'),
                            )}
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-role-data">{line.title || 'Untitled line'}</span>
                              <span
                                className={cn(RECORD_LABEL_CLASS, 'truncate', selected ? 'text-mode-bar' : 'text-mode-muted')}
                              >
                                {[line.channel, line.sku ? `SKU ${line.sku}` : null, line.quantity != null ? `Qty ${line.quantity}` : null]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-0.5">
                              <span className={RECORD_ID_CLASS}>{line.orderRef ?? `#${line.orderRowId}`}</span>
                              <span className={cn(RECORD_LABEL_CLASS, selected ? 'text-mode-bar' : 'text-mode-muted')}>
                                {line.status ?? '—'}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <Label htmlFor="resolve-close-reason">Reason (required)</Label>
              <Textarea
                id="resolve-close-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  keyRef.current = '';
                }}
                placeholder="Test scan, duplicate label, re-labelled as …"
                rows={3}
                autoFocus
                data-testid="resolve-close-reason"
              />
            </div>
          )}

          {resolve.isError ? (
            <p
              role="alert"
              className={cn(RECORD_LABEL_CLASS, 'normal-case tracking-normal', STATE_TONE_CLASSES.danger.text)}
            >
              {resolve.error.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={resolve.isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!canSubmit || resolve.isPending}
              loading={resolve.isPending}
              data-testid="resolve-shipment-exception-submit"
            >
              {decision === 'link-order'
                ? picked
                  ? `Link to ${picked.orderRef ?? `line ${picked.orderRowId}`}`
                  : 'Pick an order line'
                : 'Close exception'}
            </Button>
          </DialogFooter>
        </ModeRegion>
      </DialogContent>
    </Dialog>
  );
}
