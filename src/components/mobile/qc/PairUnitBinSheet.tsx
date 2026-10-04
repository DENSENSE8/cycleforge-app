'use client';

/**
 * Pair a unit to its bin from the QC queue (owner 2026-09-29): the card's
 * "No bin" pill — or its carton-dock fallback — opens this. The tech scans the
 * QC shelf's bin label (or types it — the capture window's own Type entry);
 * the unit moves there through `POST /api/serial-units/:id/move` (the phone's
 * own move, `MOVED` event, `tech.scan_serial`), and the queue repaints with
 * the bin. Same camera as the pick screen's pairing (`usePairBin`), but the
 * write is the UNIT's location, not the SKU's home bin.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { feedback } from '@/components/mobile/picker/usePickOrder';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import { QC_QUEUE_QUERY_KEY } from '@/lib/qc/queue-client';
import { safeRandomUUID } from '@/lib/safe-uuid';

export interface PairUnitBinTarget {
  serialUnitId: number;
  /** How the sheet names the unit: its title, else its serial. */
  name: string;
}

export function PairUnitBinSheet({ target, onClose }: { target: PairUnitBinTarget | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  const pair = useCallback(
    async (raw: string) => {
      const code = unwrapScannedLocation(raw);
      if (!target || !code || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/serial-units/${target.serialUnitId}/move`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bin_barcode: code, bin_name: code, client_event_id: safeRandomUUID() }),
        });
        const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (res.status === 404) throw new Error(`"${code}" is not a bin — scan a bin label`);
        if (res.status === 403) throw new Error('You can’t move units — ask a lead.');
        if (!res.ok || !body?.success) throw new Error(body?.error || `Pairing failed (${res.status})`);
        feedback('success');
        await queryClient.invalidateQueries({ queryKey: QC_QUEUE_QUERY_KEY });
        close();
      } catch (err) {
        feedback('reject');
        setError(err instanceof Error ? err.message : 'Pairing failed — scan the bin again');
      } finally {
        setBusy(false);
      }
    },
    [target, busy, queryClient, close],
  );

  return (
    <Sheet open={target != null} onOpenChange={(next) => { if (!next) close(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>Pair bin</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3" data-testid="pair-unit-bin-sheet">
          <p className="truncate text-role-body text-text-muted">Scan the bin this unit sits on — {target?.name}</p>
          {target ? (
            <MobileCaptureWindow
              label="Bin camera"
              collapsedLabel={busy ? 'Pairing…' : 'Scan bin to pair'}
              status={busy ? 'Pairing…' : 'Scan bin'}
              onDecode={(value) => void pair(value)}
              pending={busy ? 1 : 0}
            />
          ) : null}
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="text-role-data opacity-100">{error}</AlertDescription>
            </Alert>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
