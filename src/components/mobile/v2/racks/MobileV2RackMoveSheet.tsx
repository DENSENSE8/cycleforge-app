'use client';

/**
 * Move rack — the sheet from the rack record's dock (handoff room-agnostic
 * racks §5). Stage 1 shows the rack and where it stands now, then a scan of
 * the destination room / floor label (manual pick below goes through the same
 * server validation). Stage 2 is the receipt — from → to — with Undo, which
 * moves the rack back to the receipt's `from` under a new clientEventId.
 * Only the rack's placement changes; its shelves follow, nothing reprints.
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import type { DetailDockVerb } from '@/design-system/components/DetailDock';
import { rackPlacementText } from '@/lib/locations/rack-display';
import { moveRack, rackQueryKey } from '@/lib/locations/racks-client';
import type { MoveRackBody, MoveRackResponse, RackDetail } from '@/lib/locations/rack-types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { rackErrorSentence } from './rack-presentation';
import { RackPlacementChoices, useRackPlacements } from './RackPlacementChoices';

type Receipt = MoveRackResponse & { undone: boolean };

export function MobileV2RackMoveSheet({
  rack,
  open,
  onClose,
  onMoved,
}: {
  rack: RackDetail;
  open: boolean;
  onClose: () => void;
  /** The rack after a move or an undo — the record repaints from it. */
  onMoved: (rack: RackDetail) => void;
}) {
  const queryClient = useQueryClient();
  const placements = useRackPlacements();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** One key per destination attempt: a retry of the same destination after a dropped response is a no-op. */
  const attempt = useRef<{ key: string; id: string } | null>(null);

  const settle = (moved: RackDetail) => {
    queryClient.setQueryData(rackQueryKey(rack.code), { rack: moved });
    void queryClient.invalidateQueries({ queryKey: ['racks'] });
    onMoved(moved);
  };

  const move = async (destination: Omit<MoveRackBody, 'clientEventId'>) => {
    const key = destination.destinationCode ?? `id:${destination.destinationId}`;
    if (attempt.current?.key !== key) attempt.current = { key, id: safeRandomUUID() };
    setBusy(true);
    setError(null);
    try {
      const response = await moveRack(rack.code, { ...destination, clientEventId: attempt.current.id });
      attempt.current = null;
      setReceipt({ ...response, undone: false });
      settle(response.rack);
    } catch (err) {
      setError(rackErrorSentence(err, 'Could not move the rack.'));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!receipt) return;
    setBusy(true);
    try {
      const response = await moveRack(rack.code, { destinationId: receipt.from.id, clientEventId: safeRandomUUID() });
      setReceipt({ ...receipt, undone: true });
      settle(response.rack);
      toast.success(`${rack.name} is back in ${rackPlacementText(response.rack)}`);
    } catch (err) {
      toast.error(rackErrorSentence(err, 'Could not undo the move.'));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setReceipt(null);
    setError(null);
    attempt.current = null;
    onClose();
  };

  const verbs: DetailDockVerb<'undo' | 'done'>[] = receipt
    ? [
        ...(receipt.undone ? [] : [{ id: 'undo' as const, label: 'Undo', icon: <RotateCcw />, loading: busy, disabled: busy, testId: 'rack-move-undo' }]),
        { id: 'done', label: 'Done', icon: <Check />, primary: true, testId: 'rack-move-done' },
      ]
    : [];

  return (
    <MobileV2ActionSheet
      open={open}
      onClose={close}
      eyebrow={rack.name}
      title={receipt ? (receipt.undone ? 'Move undone' : 'Rack moved') : 'Move rack'}
      description={receipt ? undefined : `Scan the room or floor label where ${rack.name} now stands.`}
      verbs={verbs}
      onVerb={(id) => (id === 'undo' ? undo() : close())}
      dockLabel="Move rack"
      testId="rack-move-sheet"
    >
      {receipt ? (
        <MobileRecordCardList>
          <MobileRecordCard
            identity={rack.name}
            title={receipt.undone ? receipt.from.name : rackPlacementText(receipt.rack)}
            detail={receipt.undone ? `Moved back from ${receipt.to.name}` : `Moved from ${receipt.from.name}`}
            status={receipt.undone ? 'Undone' : receipt.idempotent ? 'Already moved' : 'Moved'}
            tone={receipt.undone ? 'neutral' : 'ok'}
            testId="rack-move-receipt"
          />
          <p className="break-words text-role-caption text-text-muted">
            Its shelves moved with it. No labels change, nothing to reprint.
          </p>
        </MobileRecordCardList>
      ) : (
        <>
          <MobileRecordCardList>
            <MobileRecordCard
              identity={rack.name}
              title={rackPlacementText(rack)}
              detail="Stands here now"
              status={rack.code}
              testId="rack-move-current"
            />
          </MobileRecordCardList>
          <div className="px-mode-page">
            <MobileV2ScanInput
              compact
              onDecode={(value) => void move({ destinationCode: value.trim() })}
              placeholder="Scan the destination label"
              isResolving={busy}
            />
          </div>
          {error ? (
            <p role="alert" className="break-words px-mode-page py-3 text-role-caption font-semibold text-text-danger" data-testid="rack-move-error">
              {error}
            </p>
          ) : null}
          <RackPlacementChoices
            choices={placements.choices}
            loading={placements.loading}
            error={placements.error}
            currentId={rack.placement.id}
            label="Or choose where it goes"
            onChoose={(choice) => {
              if (!busy) void move({ destinationId: choice.id });
            }}
          />
        </>
      )}
    </MobileV2ActionSheet>
  );
}
