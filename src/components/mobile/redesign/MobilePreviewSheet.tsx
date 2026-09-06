'use client';

/**
 * The read-only ID preview sheet — long-press the SCAN CTA to open it.
 *
 * "What would this ID do?" answered BEFORE anything happens. The operator's
 * ruling (2026-09-06): preview is how you learn the system on live inventory —
 * every dock commit is irreversible, so the only safe training gesture is a
 * scan that structurally cannot write.
 *
 * ## Read-only is enforced by construction
 *
 * This sheet renders `previewScan` (pure, over `dispatchScan`) and its only
 * action NAVIGATES. There is no write path in this file, no mutation hook, no
 * optimistic anything. The one fetch is the door's existing read-only
 * `/api/receiving/preview-scan` (`mode=tracking`), reused so a carrier label
 * can say "never seen → the door" vs "already has a carton → its stage" — the
 * same honest read the door itself does before writing. No new endpoint.
 *
 * ## Unarmed, on purpose
 *
 * The preview answers from the bar, where no session context is known, so it
 * passes `armedSession: null` — the same function the Stack's Find band will
 * call WITH the armed session when it wants the armed answer. One model, two
 * callers, no fork.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, TextField } from '@/design-system/primitives';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { previewScan, type ScanPreview } from '@/lib/scan/preview-model';
import { routeScan } from '@/lib/barcode-routing';
import { cn } from '@/utils/_cn';

/** Where Open lands, per Card. The workstation is THE scan entry since the
 *  2026-09-06 pivot; per-class deep links return when the cards carry IDs. */
const OPEN_ROUTE: Record<ScanPreview['card'], string> = {
  arrival: '/m/triage',
  carton: '/m/triage',
  qc: '/m/triage',
  pack: '/m/triage',
  preview: '/m/triage',
};
type Lookup = 'checking' | 'done' | 'offline';

export function MobilePreviewSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [raw, setRaw] = useState('');
  const [state, setState] = useState<{ trackingSeen?: boolean } | undefined>(undefined);
  const [lookup, setLookup] = useState<Lookup>('done');
  const lastLookupRef = useRef('');
  const lastClassRef = useRef<string | null>(null);

  const trimmed = raw.trim();
  const preview = trimmed ? previewScan({ scan: trimmed, state }) : null;

  /** The door's own read-before-write, reused read-only. Failing the fetch is
   *  not an error here: the preview simply answers without prior state, which
   *  the dispatch table treats honestly ("never been seen"). */
  const runLookup = useCallback(async (value: string) => {
    if (lastLookupRef.current === value) return;
    lastLookupRef.current = value;
    setLookup('checking');
    try {
      const res = await fetch(
        `/api/receiving/preview-scan?value=${encodeURIComponent(value)}&mode=tracking`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { matched?: boolean };
      setState({ trackingSeen: json.matched === true });
      setLookup('done');
    } catch {
      setLookup('offline');
    }
  }, []);

  // The answer paints as the ID is typed; the only async part is the door's
  // prior-state read, debounced so a thumb-typed tracking number settles first.
  useEffect(() => {
    if (!open) return;
    const route = trimmed ? routeScan(trimmed) : null;
    if (route?.type !== 'carrier-tracking') return;
    const timer = setTimeout(() => void runLookup(trimmed), 350);
    return () => clearTimeout(timer);
  }, [open, trimmed, runLookup]);

  // Eyes stay on the label: the haptic says "answered" exactly once per class,
  // never per keystroke.
  useEffect(() => {
    const card = preview?.card ?? null;
    if (card && card !== lastClassRef.current) vibrateScan('success');
    lastClassRef.current = card;
  }, [preview?.card]);

  const close = useCallback(() => {
    onClose();
    // Reset only after the sheet's exit starts, so the answer stays readable
    // during the slide-down instead of blanking mid-motion.
    setRaw('');
    setState(undefined);
    setLookup('done');
    lastLookupRef.current = '';
    lastClassRef.current = null;
  }, [onClose]);

  return (
    <BottomSheet open={open} onClose={close} title="Preview a scan">
      <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
        <TextField
          label="Type or paste an ID"
          value={raw}
          onChange={(v) => {
            setRaw(v);
            setState(undefined);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={open}
        />

        {preview ? (
          <div
            className={cn(
              'rounded-xl border border-border-soft bg-surface-card p-4',
              'flex flex-col gap-2',
            )}
            data-testid="scan-preview-result"
          >
            <p className="text-role-caption uppercase text-text-soft">{preview.classLabel}</p>
            <p className="text-role-data font-semibold text-text-default">{preview.next}</p>
            <p className="text-role-caption text-text-muted">{preview.reason}</p>
            {preview.title && (
              <p className="text-role-caption text-text-muted">Block title: {preview.title}</p>
            )}
            {lookup === 'checking' && (
              <p className="text-role-caption text-text-soft">Checking prior state…</p>
            )}
            {lookup === 'offline' && (
              <p className="text-role-caption text-text-warning">
                State unknown — offline. Answer assumes never seen.
              </p>
            )}
            <p className="text-role-caption text-text-soft">
              Nothing is recorded. Open goes to the station; the scan still has to happen there.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="h-9 self-start"
              onClick={() => {
                close();
                router.push(OPEN_ROUTE[preview.card]);
              }}
            >
              Open at the station
            </Button>
          </div>
        ) : trimmed ? (
          <p className="text-role-caption text-text-muted" data-testid="scan-preview-empty">
            Not an ID this system knows.
          </p>
        ) : (
          <p className="text-role-caption text-text-soft">
            Scan nothing, change nothing — the answer is a sentence, not a commit.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
