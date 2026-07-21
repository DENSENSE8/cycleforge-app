'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Link2, Loader2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Popover } from '@/design-system/primitives';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { dispatchTestingLineUpdated } from '@/components/tech/testing-line-events';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';

interface SiblingLine {
  id: number;
  sku: string | null;
  item_name?: string | null;
  serials?: Array<{ id: number; serial_number: string }>;
  /** A real Zoho-PO line is never deleted on combine — only its serials move. */
  zoho_purchaseorder_id?: string | null;
}

/**
 * LINK (combine) control for the condition+serial row, sitting next to the
 * title ⋮ in the accordion (testing page only).
 *
 * A scanned serial is a sidecar on a line; a SKU import is a whole new line — so
 * they show as separate rows. LINK merges them into ONE row via the verified
 * `/api/receiving/serial-move` primitive (re-homes membership IN PLACE, preserving
 * the testing verdict). UNLINK (split) lives in the shared {@link PoLineTitleMenu}.
 */
export function TestingSerialLinkControls({
  carton,
  line,
}: {
  /** The active carton row — supplies receiving_id. */
  carton: ReceivingLineRow;
  /** This accordion line. */
  line: ReceivingLineRow;
}) {
  const qc = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);
  const [siblings, setSiblings] = useState<SiblingLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const linkBtnRef = useRef<HTMLButtonElement>(null);

  const receivingId = carton.receiving_id;

  const refresh = () => {
    if (receivingId != null) {
      qc.invalidateQueries({ queryKey: ['receiving-siblings', receivingId] });
    }
    qc.invalidateQueries({ queryKey: ['receiving-lines'] });
    dispatchTestingLineUpdated({ id: line.id, serials: line.serials ?? [] });
  };

  const moveSerial = async (serialUnitId: number, targetLineId: number): Promise<boolean> => {
    const res = await fetch('/api/receiving/serial-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serial_unit_id: serialUnitId,
        target_receiving_line_id: targetLineId,
        // Fresh per move so a genuine repeat move back to a previously-visited
        // line never collides with an earlier event's idempotency key.
        client_event_id: safeRandomUUID(),
      }),
    });
    const data = await res.json().catch(() => null);
    return Boolean(res.ok && data?.success);
  };

  const openLink = async () => {
    const next = !linkOpen;
    setLinkOpen(next);
    if (!next || siblings || receivingId == null) return;
    try {
      const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`);
      const data = await res.json().catch(() => null);
      const rows: SiblingLine[] = Array.isArray(data?.receiving_lines) ? data.receiving_lines : [];
      setSiblings(rows.filter((r) => r.id !== line.id && (r.serials?.length ?? 0) > 0));
    } catch {
      setSiblings([]);
    }
  };

  const combineFrom = async (source: SiblingLine) => {
    if (busy) return;
    setBusy(true);
    try {
      let allOk = true;
      for (const s of source.serials ?? []) {
        if (!(await moveSerial(s.id, line.id))) allOk = false;
      }
      if (!allOk) {
        toast.error('Some serials could not be combined');
      } else {
        // Drop the now-empty source line — but ONLY an ad-hoc line, never a real
        // Zoho-PO line (those belong to the PO; leave the emptied line in place).
        if (!source.zoho_purchaseorder_id) {
          await fetch(`/api/receiving-lines?id=${source.id}`, { method: 'DELETE' }).catch(() => {});
        }
        toast.success('Combined into this row');
      }
      refresh();
      setLinkOpen(false);
      setSiblings(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HoverTooltip label="Combine another row's serial into this one" asChild focusable={false}>
        <button
          ref={linkBtnRef}
          type="button"
          aria-label="Combine a serial into this row"
          aria-expanded={linkOpen}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void openLink();
          }}
          className="ds-raw-button -m-1 flex shrink-0 items-center justify-center rounded-md p-1 text-text-faint transition-colors hover:bg-blue-100 hover:text-blue-600 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        </button>
      </HoverTooltip>

      <Popover
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        anchorRef={linkBtnRef}
        placement="bottom-end"
        role="listbox"
        aria-label="Combine a serial into this row"
        className="min-w-[13rem] max-w-[18rem]"
        padded={false}
      >
        {siblings == null ? (
          <div className="flex items-center gap-2 px-3 py-2.5 text-role-caption text-text-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rows…
          </div>
        ) : siblings.length === 0 ? (
          <div className="px-3 py-2.5 text-role-caption text-text-soft">
            No other row on this carton has a scanned serial to combine.
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto py-1">
            {siblings.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void combineFrom(s)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover disabled:opacity-40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-role-caption font-bold text-text-default">
                      {s.item_name || s.sku || `Line #${s.id}`}
                    </span>
                    <span className="block truncate text-role-micro font-semibold uppercase tracking-widest text-text-faint">
                      {(s.serials?.length ?? 0)} serial{(s.serials?.length ?? 0) === 1 ? '' : 's'}
                    </span>
                  </span>
                  <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </>
  );
}
