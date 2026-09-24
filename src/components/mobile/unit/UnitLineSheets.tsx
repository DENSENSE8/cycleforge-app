'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { postUnitVerb, SheetAlerts, UnitRefSheet } from './UnitSheetParts';

interface UnitLineSheetProps {
  open: boolean;
  unitId: number;
  /** `current_receiving_line_id` — the line the unit is on now. */
  lineId: number;
  staffId: number;
  onClose: () => void;
  onDone: (ack: string) => void;
}

/**
 * The receiving-line writes carried over from the old phone unit page
 * (`/serial/[id]`), same bodies: the scan token is the page path the tech
 * stood on, and the event id is fresh per tap.
 */
function lineWriteStamp(unitId: number, staffId: number, note: string) {
  return {
    serial_unit_id: unitId,
    staff_id: staffId,
    station: 'MOBILE',
    notes: note.trim() || null,
    client_event_id: safeRandomUUID(),
    scan_token: window.location.pathname,
  };
}

const LINE_TEST_VERBS = [
  { eventType: 'TEST_START', label: 'Start', variant: 'primary', ack: 'Test started' },
  { eventType: 'TEST_PASS', label: 'Pass', variant: 'success', ack: 'Test passed' },
  { eventType: 'TEST_FAIL', label: 'Fail', variant: 'danger', ack: 'Test failed' },
] as const;

type LineTestEvent = (typeof LINE_TEST_VERBS)[number]['eventType'];

/** Line test — Start / Pass / Fail on the unit's receiving line, one tap each. */
export function UnitLineTestSheet({ open, unitId, lineId, staffId, onClose, onDone }: UnitLineSheetProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<LineTestEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNote('');
    setError(null);
  }, [open]);

  const record = async (verb: (typeof LINE_TEST_VERBS)[number]) => {
    if (busy) return;
    setBusy(verb.eventType);
    setError(null);
    try {
      const { res, json } = await postUnitVerb(`/api/receiving/lines/${lineId}/status`, {
        event_type: verb.eventType,
        ...lineWriteStamp(unitId, staffId, note),
      });
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      onDone(json.serial_status ? `${verb.ack} — unit ${json.serial_status}` : verb.ack);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not recorded');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet open={open} onClose={busy ? () => {} : onClose} forceVariant="sheet" title="Line test">
      {/* Portals out of the page's ModeRegion; re-declare triage. */}
      <ModeRegion mode="triage" className="flex flex-col gap-3 pb-2">
        <TextField label="Note (optional)" value={note} onChange={setNote} multiline rows={2} disabled={!!busy} />
        <SheetAlerts notice={null} error={error} />
        <div className="grid grid-cols-3 gap-2">
          {LINE_TEST_VERBS.map((verb) => (
            <Button
              key={verb.eventType}
              variant={verb.variant}
              size="lg"
              className="w-full rounded-mode"
              loading={busy === verb.eventType}
              disabled={!!busy}
              onClick={() => void record(verb)}
            >
              {verb.label}
            </Button>
          ))}
        </div>
      </ModeRegion>
    </BottomSheet>
  );
}

/** Stash in bin — putaway of this one unit off its receiving line. */
export function UnitStashSheet({ open, unitId, lineId, staffId, onClose, onDone }: UnitLineSheetProps) {
  const [binInput, setBinInput] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBinInput('');
    setNote('');
    setError(null);
  }, [open]);

  const submit = async () => {
    const bin = unwrapScannedLocation(binInput);
    if (!bin || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await postUnitVerb(`/api/receiving/lines/${lineId}/putaway`, {
        bin_barcode: bin,
        qty: 1,
        ...lineWriteStamp(unitId, staffId, note),
      });
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      onDone(`Stored in ${json.bin?.name ?? bin}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stash failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UnitRefSheet
      open={open}
      title="Stash in bin"
      label="Scan or type bin"
      value={binInput}
      onChange={setBinInput}
      note={{ value: note, onChange: setNote }}
      busy={busy}
      error={error}
      notice={null}
      submitLabel="Stash"
      onSubmit={() => void submit()}
      onClose={onClose}
    />
  );
}
