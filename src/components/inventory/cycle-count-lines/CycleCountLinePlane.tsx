'use client';

/** The COUNT plane for `/inventory/cycle-counts/[id]` — a Center-Lock L2 record form stacked on the desk stage (`recordPlane: */

import { useEffect, useId, useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  cycleCountLineBinLabel,
  type CycleCountLineRow,
} from '@/lib/inventory/cycle-count-line-row';

interface CycleCountLinePlaneProps {
  row: CycleCountLineRow | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (row: CycleCountLineRow, countedQty: number) => void;
}

export function CycleCountLinePlane({
  row,
  busy = false,
  onClose,
  onSubmit,
}: CycleCountLinePlaneProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState('');

  // A fresh line gets a fresh box. Carrying the previous row's digits over is
  // how a counter writes bin A's number onto bin B.
  useEffect(() => {
    setDraft('');
  }, [row?.id]);

  const parsed = Number(draft.trim());
  const valid = draft.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
  const expected = row?.expectedQty ?? 0;
  const preview = valid && row ? parsed - expected : null;

  return (
    <DeskStageOverlay
      open={row != null}
      onClose={onClose}
      title={row ? `Count · ${cycleCountLineBinLabel(row)}` : 'Count line'}
      subtitle={row ? `${row.sku} · expected ${row.expectedQty}` : undefined}
      testId="cycle-count-line-plane"
      fill="inset"
      // A half-typed count must not be eaten by a stray click on the table
      // behind it; Esc and the header ✕ still close.
      closeOnScrim={false}
      footer={
        row ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={busy || !valid}
              onClick={() => onSubmit(row, Math.floor(parsed))}
            >
              {busy ? 'Submitting…' : 'Submit count'}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4 px-4 py-4 text-sm text-text-default">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId}>Counted quantity</Label>
          <Input
            id={fieldId}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            autoFocus
            value={draft}
            disabled={busy}
            placeholder={String(expected)}
            className="w-32 text-right font-mono"
            data-testid="cycle-count-line-qty"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !valid || busy || !row) return;
              event.preventDefault();
              onSubmit(row, Math.floor(parsed));
            }}
          />
          <p className="text-role-caption text-text-soft">
            {preview == null
              ? 'Whole units on the shelf right now — a non-negative integer.'
              : preview === 0
                ? `Matches the expected ${expected}.`
                : `Δ ${preview > 0 ? `+${preview}` : preview} against the expected ${expected}.`}
          </p>
        </div>
        <p className="text-text-soft">
          Within the campaign’s tolerance this auto-approves when the campaign closes; outside it,
          the line lands in admin review instead.
        </p>
      </div>
    </DeskStageOverlay>
  );
}
