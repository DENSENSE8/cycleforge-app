'use client';

/**
 * Phone picker: one ShipStation label for one order, under a purpose. Reads the
 * same candidates the desk's Link label dialog reads (`GET
 * /api/orders/[id]/labels?q=` — the order's ShipStation refs, the ingestion
 * quarantine, and a live ShipStation lookup for a typed tracking / order #);
 * the write is the caller's (a hub resolve hook), handed the picked shipment,
 * the purpose and one `clientEventId` per intended link.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from '@/components/Icons';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, SearchField } from '@/design-system/primitives';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE, type LabelPurpose } from '@/lib/shipping/label-purpose';
import type { LabelLinkCandidate } from '@/lib/shipping/order-label-links';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';

export interface ShipStationLabelLink {
  shipstationShipmentId: number;
  purpose: LabelPurpose;
  clientEventId: string;
}

const QUARANTINE_WHY: Record<string, string> = {
  MULTI_PACKAGE_EVIDENCE: 'second label on its order',
  ORDER_NOT_FOUND: 'order not found',
  AMBIGUOUS_ORDER_MATCH: 'several orders match',
  TRACKING_ONLY: 'no order number',
  MISSING_ACCOUNT_CONTEXT: 'no account',
};

async function fetchCandidates(orderId: number, query: string) {
  const res = await fetch(`/api/orders/${orderId}/labels${query ? `?q=${encodeURIComponent(query)}` : ''}`, {
    credentials: 'same-origin',
  });
  const body = (await res.json().catch(() => ({}))) as {
    candidates?: LabelLinkCandidate[];
    searchedLive?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'Could not search ShipStation labels.');
  return { candidates: body.candidates ?? [], searchedLive: body.searchedLive === true };
}

/** Why a candidate cannot be linked to this order, or null. */
function blockedReason(c: LabelLinkCandidate, orderId: number): string | null {
  if (c.voided) return 'Voided in ShipStation';
  if (c.linkedTo && c.linkedTo.orderId !== orderId) return `On ${c.linkedTo.orderRef ?? `order ${c.linkedTo.orderId}`}`;
  if (c.linkedTo) return `Already on this order · ${LABEL_PURPOSE_FACE[c.linkedTo.purpose].label}`;
  if (c.ingestion?.state === 'APPLIED') return 'Imported onto its order';
  return null;
}

function candidateNote(c: LabelLinkCandidate): string {
  if (c.isReturnLabel) return 'Return label';
  if (c.ingestion?.state === 'QUARANTINED') {
    return `Quarantined · ${QUARANTINE_WHY[c.ingestion.quarantineReason ?? ''] ?? 'unplaced'}`;
  }
  return c.source === 'live' ? 'From ShipStation' : 'ShipStation';
}

export function ShipStationLabelSheet({
  open,
  onClose,
  orderId,
  orderRef,
  initialQuery = '',
  preferShipmentId = null,
  pending,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  /** `orders.id` the label joins. */
  orderId: number;
  orderRef: string;
  /** Opening search (the label's tracking #), so a live ShipStation lookup runs on open. */
  initialQuery?: string;
  /** Pre-pick this ShipStation shipment when it is a linkable candidate (the quarantined label). */
  preferShipmentId?: number | null;
  pending: boolean;
  onLink: (link: ShipStationLabelLink) => void;
}) {
  const [query, setQuery] = useState(initialQuery.trim());
  const [picked, setPicked] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<LabelPurpose>('outbound');
  // One key per intended link — a double tap or a retry replays, never duplicates.
  const [clientEventId, setClientEventId] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ['order-label-candidates', orderId, query],
    queryFn: () => fetchCandidates(orderId, query),
    enabled: open && orderId > 0,
    staleTime: 15_000,
  });
  const candidates = search.data?.candidates ?? [];
  const preferred =
    preferShipmentId == null
      ? null
      : (candidates.find((c) => c.shipstationShipmentId === preferShipmentId && blockedReason(c, orderId) == null) ?? null);
  const pickedCandidate =
    (picked == null ? preferred : candidates.find((c) => c.shipstationShipmentId === picked)) ?? null;
  const returnOnly = pickedCandidate?.isReturnLabel === true;
  const effectivePurpose: LabelPurpose = returnOnly ? 'return' : purpose;

  const close = () => {
    if (pending) return;
    setQuery(initialQuery.trim());
    setPicked(null);
    setPurpose('outbound');
    setClientEventId(null);
    onClose();
  };

  const submit = () => {
    if (!pickedCandidate) return;
    const key = clientEventId ?? safeRandomUUID();
    if (!clientEventId) setClientEventId(key);
    onLink({ shipstationShipmentId: pickedCandidate.shipstationShipmentId, purpose: effectivePurpose, clientEventId: key });
  };

  const emptyText = search.isLoading
    ? 'Searching…'
    : query
      ? `No ShipStation label for “${query}”${search.data?.searchedLive ? ' — ShipStation searched too' : ''}.`
      : 'No ShipStation labels for this order and none waiting in quarantine. Search a tracking # or order #.';

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>{`Link label · ${orderRef}`}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value.trim());
            setPicked(null);
            setClientEventId(null);
          }}
          placeholder="Tracking # or ShipStation order #"
          tone="neutral"
          isSearching={search.isFetching}
        />

        {search.isError ? (
          <p role="alert" className="px-1 text-role-caption font-semibold text-text-danger">
            {search.error.message}
          </p>
        ) : candidates.length === 0 ? (
          <p className="px-1 text-role-caption text-text-muted">{emptyText}</p>
        ) : (
          <div role="radiogroup" aria-label="ShipStation labels" className="flex flex-col gap-1.5">
            {candidates.map((c) => {
              const blocked = blockedReason(c, orderId);
              const selected = c.shipstationShipmentId === pickedCandidate?.shipstationShipmentId;
              const carrier = shipStationCarrierToStored(c.carrierCode) ?? c.carrierCode;
              return (
                // ds-raw-button: full-width radio row (tracking + carrier line + trailing check), not an action button
                <button
                  key={c.shipstationShipmentId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={blocked != null || pending}
                  onClick={() => {
                    setPicked(c.shipstationShipmentId);
                    setClientEventId(null);
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-3 border px-3 py-2 text-left text-text-default transition-colors disabled:opacity-60',
                    selected ? 'border-border-strong bg-surface-hover' : 'border-border-soft bg-surface-card active:bg-surface-hover',
                  )}
                  data-testid="phone-link-label-candidate"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-role-data font-semibold">
                      {c.trackingNumber ?? c.labelId}
                    </span>
                    <span className="block truncate text-role-caption text-text-muted">
                      {[
                        carrier,
                        c.serviceCode?.replace(/_/g, ' '),
                        c.orderNumber ? `SS #${c.orderNumber}` : null,
                        c.createDate?.slice(0, 10),
                        c.cost == null ? null : formatCurrency(c.cost),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="block truncate text-role-caption text-text-muted">{blocked ?? candidateNote(c)}</span>
                  </span>
                  {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        )}

        <TabSwitch
          tabs={(returnOnly ? (['return'] as const) : LABEL_PURPOSES).map((p) => ({ id: p, label: LABEL_PURPOSE_FACE[p].label }))}
          activeTab={effectivePurpose}
          onTabChange={(id) => {
            if (pending) return;
            setPurpose(id as LabelPurpose);
            setClientEventId(null);
          }}
          size="sm"
          fit="fill"
        />
        {returnOnly ? (
          <p className="px-1 text-role-caption text-text-muted">ShipStation marks this as a return label.</p>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!pickedCandidate}
          loading={pending}
          onClick={submit}
          data-testid="phone-link-label-submit"
        >
          {pickedCandidate ? `Link as ${LABEL_PURPOSE_FACE[effectivePurpose].label.toLowerCase()}` : 'Pick a label'}
        </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
