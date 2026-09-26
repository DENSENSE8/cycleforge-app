'use client';

import { useEffect, useState } from 'react';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import { postUnitVerb, UnitRefSheet } from './UnitSheetParts';

/** The unit's own verbs — Pair with order, Move to bin. */

interface UnitVerbSheetProps {
  open: boolean;
  /** Numeric `serial_units.id` — the write routes do not resolve a unit_uid. */
  unitId: number;
  initialValue: string;
  onClose: () => void;
  /** Success: the acknowledgement line built from the server's response. */
  onDone: (ack: string) => void;
}

export function UnitPairSheet({ open, unitId, initialValue, onClose, onDone }: UnitVerbSheetProps) {
  const [orderRef, setOrderRef] = useState(initialValue);
  // Set by the route's 409 "already allocated"; the next submit sends
  // `transfer: true`. Cleared when the order changes so a confirmation never
  // carries over to a different order.
  const [reassign, setReassign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOrderRef(initialValue);
    setReassign(false);
    setError(null);
  }, [open, initialValue]);

  const submit = async () => {
    const ref = orderRef.trim();
    if (!ref || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await postUnitVerb(`/api/serial-units/${unitId}/allocate`, {
        order_ref: ref,
        transfer: reassign,
        client_event_id: `mu-allocate-${unitId}-${Date.now()}`,
      });
      // Only the "held by another order" 409 carries the prior allocation; the
      // race and not-allocatable 409s are plain refusals.
      if (res.status === 409 && !reassign && json?.allocation) {
        setReassign(true);
        return;
      }
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      const order = json.order_ref || json.order_id;
      onDone(
        json.already_allocated
          ? `Already paired with ${order}`
          : json.transferred
            ? `Reassigned to ${order}`
            : `Paired with ${order}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pair failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UnitRefSheet
      open={open}
      title="Pair with order"
      label="Scan or type order id"
      value={orderRef}
      onChange={(next) => {
        setOrderRef(next);
        setReassign(false);
      }}
      busy={busy}
      error={error}
      notice={reassign ? 'Already allocated to another order — tap again to reassign.' : null}
      submitLabel={reassign ? 'Confirm reassign' : 'Pair'}
      onSubmit={() => void submit()}
      onClose={onClose}
    />
  );
}

export function UnitMoveSheet({ open, unitId, initialValue, onClose, onDone }: UnitVerbSheetProps) {
  const [binInput, setBinInput] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBinInput(initialValue);
    setError(null);
  }, [open, initialValue]);

  const submit = async () => {
    // A scanned bin label may carry a URL or prefix; the route wants the code.
    const bin = unwrapScannedLocation(binInput);
    if (!bin || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await postUnitVerb(`/api/serial-units/${unitId}/move`, {
        bin_barcode: bin,
        bin_name: bin,
        client_event_id: `mu-move-${unitId}-${Date.now()}`,
      });
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      const name = json.location?.name ?? bin;
      onDone(
        json.unchanged
          ? `Already in ${name}`
          : json.previous_location
            ? `Moved to ${name} from ${json.previous_location}`
            : `Moved to ${name}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UnitRefSheet
      open={open}
      title="Move to bin"
      label="Scan or type bin barcode"
      value={binInput}
      onChange={setBinInput}
      busy={busy}
      error={error}
      notice={null}
      submitLabel="Move"
      onSubmit={() => void submit()}
      onClose={onClose}
    />
  );
}
