'use client';

/** Link label — pair a ShipStation label with this order under a purpose. */

import { useMemo, useRef, useState } from 'react';
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
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE, type LabelPurpose } from '@/lib/shipping/label-purpose';
import type { LabelLinkCandidate } from '@/lib/shipping/order-label-links';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';
import { useLabelLinkCandidates, useOrderLabelActions } from './order-labels-client';

const QUARANTINE_WHY: Record<string, string> = {
  MULTI_PACKAGE_EVIDENCE: 'second label on its order',
  ORDER_NOT_FOUND: 'order not found',
  AMBIGUOUS_ORDER_MATCH: 'several orders match',
  TRACKING_ONLY: 'no order number',
  MISSING_ACCOUNT_CONTEXT: 'no account',
};

/** Why a candidate cannot be linked here, or null. */
function blockedReason(c: LabelLinkCandidate, orderId: number): string | null {
  if (c.voided) return 'Voided in ShipStation';
  if (c.linkedTo && c.linkedTo.orderId !== orderId) return `On ${c.linkedTo.orderRef ?? `order ${c.linkedTo.orderId}`}`;
  if (c.linkedTo) return `Already on this order · ${LABEL_PURPOSE_FACE[c.linkedTo.purpose].label}`;
  if (c.ingestion?.state === 'APPLIED') return 'Imported onto its order';
  return null;
}

export function LinkLabelDialog({
  open,
  onOpenChange,
  orderId,
  orderRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  orderRef: string;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<LabelPurpose>('outbound');
  // One key per intended link — a double click or a retry replays, never duplicates.
  const keyRef = useRef('');
  const candidatesQuery = useLabelLinkCandidates(orderId, query, open);
  const { link } = useOrderLabelActions(orderId);
  const candidates = useMemo(() => candidatesQuery.data?.candidates ?? [], [candidatesQuery.data]);
  const pickedCandidate = candidates.find((c) => c.shipstationShipmentId === picked) ?? null;

  const close = () => {
    setQuery('');
    setPicked(null);
    setPurpose('outbound');
    keyRef.current = '';
    link.reset();
    onOpenChange(false);
  };

  const pick = (c: LabelLinkCandidate) => {
    setPicked(c.shipstationShipmentId);
    keyRef.current = '';
    // ShipStation says what a return label is; the operator picks for the rest.
    if (c.isReturnLabel) setPurpose('return');
  };

  const submit = () => {
    if (!pickedCandidate) return;
    if (!keyRef.current) keyRef.current = safeRandomUUID();
    link.mutate(
      { shipstationShipmentId: pickedCandidate.shipstationShipmentId, purpose, clientEventId: keyRef.current },
      {
        onSuccess: (data) => {
          toast.success(
            data.idempotent
              ? 'Already linked'
              : `${LABEL_PURPOSE_FACE[purpose].label} label linked to ${orderRef}`,
          );
          close();
        },
      },
    );
  };

  const returnOnly = pickedCandidate?.isReturnLabel === true;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="flex max-h-[88dvh] max-w-xl flex-col gap-3" data-testid="link-label-dialog">
        {/* The dialog portals out of the ledger's mode region; re-declare it
            so the mode ink / bar / hit tokens (purpose segments) resolve here. */}
        <ModeRegion mode="triage" className="contents">
          <DialogHeader>
            <DialogTitle>Link label · {orderRef}</DialogTitle>
            <DialogDescription>
              Pair a ShipStation label with this order — a return, a replacement or an outbound label bought outside
              here. It joins the order under the same number and name.
            </DialogDescription>
          </DialogHeader>

          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v.trim());
              setPicked(null);
            }}
            placeholder="Tracking # or ShipStation order #"
            isSearching={candidatesQuery.isFetching}
            autoFocus
          />

          <div className="min-h-40 flex-1 overflow-y-auto border border-mode-ink" data-testid="link-label-candidates">
            {candidatesQuery.isError ? (
              <p className={cn(RECORD_LABEL_CLASS, 'p-4 normal-case tracking-normal text-mode-warn')}>
                {candidatesQuery.error.message}
              </p>
            ) : candidates.length === 0 ? (
              <p className={cn(RECORD_LABEL_CLASS, 'p-4 normal-case tracking-normal text-mode-muted')}>
                {candidatesQuery.isLoading
                  ? 'Searching…'
                  : query
                    ? `No ShipStation label for “${query}”${candidatesQuery.data?.searchedLive ? ' — ShipStation searched too' : ''}.`
                    : 'No ShipStation labels for this order and none waiting in quarantine. Search a tracking # or order #.'}
              </p>
            ) : (
              <ul className="flex flex-col">
                {candidates.map((c) => {
                  const blocked = blockedReason(c, orderId);
                  const selected = c.shipstationShipmentId === picked;
                  const carrier = shipStationCarrierToStored(c.carrierCode) ?? c.carrierCode;
                  return (
                    <li key={c.shipstationShipmentId} className="border-b border-mode-edge last:border-b-0">
                      <button
                        type="button"
                        disabled={blocked != null}
                        aria-pressed={selected}
                        title={blocked ?? undefined}
                        data-testid="link-label-candidate"
                        onClick={() => pick(c)}
                        className={cn(
                          'ds-raw-button flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left disabled:opacity-50',
                          selected ? 'bg-mode-ink text-mode-bar' : 'enabled:hover:bg-mode-hover',
                          focusRing('control'),
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={cn(RECORD_ID_CLASS, 'truncate')}>{c.trackingNumber ?? c.labelId}</span>
                          <span className={cn(RECORD_LABEL_CLASS, 'truncate', selected ? 'text-mode-bar' : 'text-mode-muted')}>
                            {[carrier, c.serviceCode?.replace(/_/g, ' '), c.orderNumber ? `SS #${c.orderNumber}` : null, c.createDate?.slice(0, 10)]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className={RECORD_ID_CLASS}>{c.cost == null ? '—' : formatCurrency(c.cost)}</span>
                          <span className={cn(RECORD_LABEL_CLASS, selected ? 'text-mode-bar' : 'text-mode-muted')}>
                            {blocked ??
                              (c.isReturnLabel
                                ? 'Return label'
                                : c.ingestion?.state === 'QUARANTINED'
                                  ? `Quarantined · ${QUARANTINE_WHY[c.ingestion.quarantineReason ?? ''] ?? 'unplaced'}`
                                  : c.source === 'live'
                                    ? 'From ShipStation'
                                    : 'ShipStation')}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className={cn(RECORD_LABEL_CLASS, 'mb-1 text-mode-muted')}>Purpose</p>
            <div className="flex items-stretch border border-mode-ink bg-mode-bar" role="radiogroup" aria-label="Label purpose">
              {LABEL_PURPOSES.map((p, i) => {
                const disabled = returnOnly && p !== 'return';
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={purpose === p}
                    disabled={disabled}
                    title={disabled ? 'ShipStation marks this as a return label' : undefined}
                    data-testid={`link-label-purpose-${p}`}
                    onClick={() => setPurpose(p)}
                    className={cn(
                      DESK_BAR_SEGMENT_CLASS,
                      'flex-1 justify-center',
                      i > 0 && 'border-l border-mode-edge',
                      deskBarSegmentTone(purpose === p),
                    )}
                  >
                    {LABEL_PURPOSE_FACE[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          {link.isError ? (
            <p className={cn(RECORD_LABEL_CLASS, 'normal-case tracking-normal', STATE_TONE_CLASSES.danger.text)}>
              {link.error.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={link.isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!pickedCandidate || link.isPending}
              loading={link.isPending}
              data-testid="link-label-submit"
            >
              {pickedCandidate ? `Link as ${LABEL_PURPOSE_FACE[purpose].label.toLowerCase()}` : 'Pick a label'}
            </Button>
          </DialogFooter>
        </ModeRegion>
      </DialogContent>
    </Dialog>
  );
}
