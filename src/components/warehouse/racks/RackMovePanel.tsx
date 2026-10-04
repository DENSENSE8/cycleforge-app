'use client';

/**
 * Move a rack — the phone's two-scan flow on the desk. The rack is already in
 * hand (its record); the second scan is the destination, by wedge, keyboard or
 * the manual pick (same validation). Only the rack's placement changes: no
 * reprint. The receipt carries Undo = move back to where it stood, with a new
 * client event id.
 */

import { useState } from 'react';
import { ArrowRight, RotateCcw } from '@/components/Icons';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import type { RackCreatePlacement } from '@/lib/locations/rack-create-model';
import { rackErrorMessage, rackPlacementText } from '@/lib/locations/rack-display';
import type { MoveRackResponse, RackDetail } from '@/lib/locations/rack-types';
import { moveRack } from '@/lib/locations/racks-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { RackPlacementField } from './RackPlacementField';

export function RackMovePanel({
  rack,
  onMoved,
}: {
  rack: RackDetail;
  /** After a move or its undo — the host refreshes the rack and the list. */
  onMoved: (next: RackDetail) => void;
}) {
  const [destination, setDestination] = useState<RackCreatePlacement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<MoveRackResponse | null>(null);
  const [undone, setUndone] = useState(false);

  const submit = async (to: RackCreatePlacement | null = destination) => {
    if (!to || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await moveRack(rack.code, {
        ...(to.id != null ? { destinationId: to.id } : { destinationCode: to.code ?? '' }),
        clientEventId: safeRandomUUID(),
      });
      setReceipt(res);
      setUndone(false);
      setDestination(null);
      onMoved(res.rack);
    } catch (err) {
      setError(rackErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!receipt || busy) return;
    setBusy(true);
    try {
      const res = await moveRack(rack.code, { destinationId: receipt.from.id, clientEventId: safeRandomUUID() });
      setUndone(true);
      onMoved(res.rack);
      toast.success(`${rack.name} is back at ${res.to.name}`);
    } catch (err) {
      toast.error(rackErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return (
      <div className="flex min-w-0 flex-col gap-4" data-testid="rack-move-receipt">
        <RecordGroup
          title={undone ? 'Move undone' : 'Rack moved'}
          action={
            undone ? null : (
              <Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden />} loading={busy} onClick={() => void undo()} data-testid="rack-move-undo">
                Undo
              </Button>
            )
          }
        >
          <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
            <EvidenceFactRow label="Rack">
              {rack.name} · <span className="font-mono">{rack.code}</span>
            </EvidenceFactRow>
            <EvidenceFactRow label="From">{receipt.from.name}</EvidenceFactRow>
            <EvidenceFactRow label="To">{receipt.to.name}</EvidenceFactRow>
            <EvidenceFactRow label="Labels">Unchanged — no reprint</EvidenceFactRow>
          </div>
        </RecordGroup>
        <Button variant="secondary" onClick={() => setReceipt(null)} data-testid="rack-move-again">
          Move it again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="rack-move">
      <RecordGroup title="Rack">
        <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
          <EvidenceFactRow label="Rack">
            {rack.name} · <span className="font-mono">{rack.code}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Stands at">{rackPlacementText(rack)}</EvidenceFactRow>
        </div>
      </RecordGroup>
      <RecordGroup title="Destination">
        <div className="px-4 pb-3">
          <RackPlacementField
            value={destination}
            onChange={(next) => {
              setDestination(next);
              setError(null);
            }}
            onSubmit={(next) => void submit(next)}
            excludeId={rack.placement.id}
            testId="rack-move-destination"
          />
        </div>
      </RecordGroup>
      {error ? <EvidenceNotice tone="warn">{error}</EvidenceNotice> : null}
      <Button
        variant="primary"
        icon={<ArrowRight aria-hidden />}
        loading={busy}
        disabled={!destination}
        onClick={() => void submit()}
        data-testid="rack-move-go"
      >
        {destination ? `Move to ${destination.name}` : 'Scan where the rack goes'}
      </Button>
    </div>
  );
}
