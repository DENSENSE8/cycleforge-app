'use client';

/**
 * PickPairToteSheet — pairs an order's allocated units to a TOTE, from the
 * pick queue's Pair CTA (operator 2026-09-15: *"a CTA button most right to
 * pair the order to the TOT ID or to a serial number, similar to how the
 * desktop flow works"*).
 *
 * The tote is the handling unit (`H-{id}` house plate — the same object the
 * bulk tote-label run mints). Pairing = one `POST /api/handling-units/{id}/`
 * `assign` carrying every allocated unit of the order, the mobile twin of the
 * desk's allocation pair flow: after this, the packer scans the tote plate
 * and the box carries the order.
 *
 * The field takes a typed/pasted reference (keyboard-wedge scanners type) and
 * accepts `H-12`, bare `12`, or the `/m/h/12` QR redirect. EXTERNAL tote
 * barcodes are rejected with a message rather than failing silently: the
 * assign endpoint resolves numeric ids only.
 */

import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';

export interface PairToteUnit {
  serialUnitId: number;
  serialNumber: string;
}

interface PickPairToteSheetProps {
  open: boolean;
  onClose: () => void;
  orderLabel: string;
  units: readonly PairToteUnit[];
  /** Test seam — defaults to the assign API. */
  assign?: (toteId: number, units: readonly PairToteUnit[]) => Promise<void>;
}

/** `H-12`, `12`, or a `/m/h/12` QR redirect → numeric tote id, else null. */
export function parseToteRef(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const handle = /^H-(\d+)$/i.exec(value);
  if (handle) return Number(handle[1]);
  const redirect = /\/m\/h\/(\d+)/.exec(value);
  if (redirect) return Number(redirect[1]);
  return /^\d+$/.test(value) ? Number(value) : null;
}

async function assignViaApi(toteId: number, units: readonly PairToteUnit[]): Promise<void> {
  const res = await fetch(`/api/handling-units/${toteId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ units: units.map((unit) => unit.serialUnitId) }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !body?.success) {
    throw new Error(body?.error || 'Could not pair the tote');
  }
}

export function PickPairToteSheet({
  open,
  onClose,
  orderLabel,
  units,
  assign = assignViaApi,
}: PickPairToteSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRef('');
      setError(null);
      setBusy(false);
      const timer = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const toteId = parseToteRef(ref);

  const confirm = async () => {
    if (toteId == null || units.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await assign(toteId, units);
      toast.success(`Paired ${units.length} unit${units.length === 1 ? '' : 's'} to H-${toteId}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pair the tote');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`Pair tote · ${orderLabel}`}>
      <p className="mb-3 text-center text-role-caption text-text-soft">
        Scan or type the tote plate — pairs {units.length} allocated unit
        {units.length === 1 ? '' : 's'} into the box.
      </p>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        placeholder="H-12"
        value={ref}
        onChange={(event) => setRef(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void confirm();
          if (event.key === 'Escape') onClose();
        }}
        className={cn(
          'mb-2 h-12 w-full rounded-2xl border border-border-default bg-surface-canvas px-4 font-mono text-lg tabular-nums text-text-default transition-colors focus:bg-surface-card',
          focusRing('field', 'accent'),
        )}
      />
      {ref.trim() && toteId == null ? (
        <p className="mb-2 text-role-caption text-text-warning">
          Not a house tote plate — use the H- number printed on the tote label.
        </p>
      ) : null}
      {error ? <p className="mb-2 text-role-caption text-text-danger">{error}</p> : null}
      <Button
        type="button"
        variant="primary"
        className="h-12 w-full justify-center"
        disabled={toteId == null || units.length === 0 || busy}
        loading={busy}
        onClick={() => void confirm()}
      >
        {toteId != null ? `Pair to H-${toteId}` : 'Pair tote'}
      </Button>
    </BottomSheet>
  );
}
