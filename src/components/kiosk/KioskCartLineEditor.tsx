'use client';

/**
 * Cart line editor — the UPDATE half of kiosk line CRUD.
 *
 * @domain-job Correct a line already on the ticket without voiding it.
 * @hardware-target Station (counter tablet)
 * @density floor
 * @justification The ledger could create (catalog / scan / pane) and delete
 *   (the row `X`) but never update: a mistyped serial, a wrong quantity or a
 *   re-quoted repair meant voiding the line and re-entering the whole intake,
 *   which also threw away the signature. `kioskSessionStore.updateLine` existed
 *   the whole time with no caller — this is that caller.
 *
 * Edits write straight through on change (the cart IS the session root; there
 * is no separate save step to strand work in). The identification field is
 * chosen by line type, matching the paperwork panel's `lineIdentification`.
 */

import { Button, TextField } from '@/design-system/primitives';
import { Trash2 } from '@/components/Icons';
import { isBuybackPayload, isRepairPayload } from '@/lib/kiosk/cart-line';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { useKioskSession, useKioskSessionActions } from '@/lib/kiosk/kiosk-session-store';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

function centsToInput(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const n = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function KioskCartLineEditor({
  line,
  focusField,
  onDone,
}: {
  line: KioskCartLine;
  /** Triage deep-link — which field to bring the operator to. */
  focusField?: 'serial' | 'price' | 'imei' | 'quantity' | 'signature';
  onDone: () => void;
}) {
  const actions = useKioskSessionActions();
  // A desk holding this tablet owns the money verbs — void included.
  const mirrored = useKioskSession().sharedSessionId !== null;
  const repair = isRepairPayload(line.payload) ? line.payload : null;
  const buyback = isBuybackPayload(line.payload) ? line.payload : null;
  // BUYBACK stores a credit as a negative amount; the operator types the offer.
  const isCredit = line.unitAmountCents < 0;

  const patchPayload = (next: Record<string, unknown>) => {
    actions.updateLine(line.id, {
      payload: { ...line.payload, ...next } as KioskCartLine['payload'],
    });
  };

  return (
    <div
      className="space-y-3 border-t border-border-hairline bg-surface-card px-4 py-3"
      data-testid="kiosk-cart-line-editor"
      data-line-id={line.id}
    >
      <TextField
        label="Description"
        value={line.title}
        onChange={(v) => actions.updateLine(line.id, { title: v })}
        tone="blue"
        inputClassName="rounded-none"
      />

      <div className="flex gap-3">
        {!repair && !buyback && (
          <TextField
            label="Qty"
            value={String(line.quantity)}
            onChange={(v) => {
              const n = Number.parseInt(v.replace(/\D/g, ''), 10);
              actions.updateLine(line.id, { quantity: Number.isFinite(n) ? n : 0 });
            }}
            inputMode="numeric"
            autoFocus={focusField === 'quantity'}
            tone="blue"
            className="w-20 shrink-0"
            inputClassName="rounded-none tabular-nums"
            data-testid="kiosk-line-qty"
          />
        )}
        <TextField
          label={isCredit ? 'Credit ($)' : 'Price ($)'}
          value={centsToInput(line.unitAmountCents)}
          onChange={(v) => {
            const cents = inputToCents(v);
            actions.updateLine(line.id, {
              unitAmountCents: isCredit ? -cents : cents,
            });
            // A repair quote is ALSO printed off the payload — keep both in step
            // or the paperwork disagrees with the total.
            if (repair) patchPayload({ price: (cents / 100).toFixed(2) });
          }}
          inputMode="decimal"
          autoFocus={focusField === 'price'}
          tone="emerald"
          className="min-w-0 flex-1"
          inputClassName="rounded-none font-semibold tabular-nums text-text-success"
          data-testid="kiosk-line-price"
        />
      </div>

      {repair && (
        <>
          <TextField
            label="Serial number"
            value={repair.serialNumber}
            onChange={(v) => patchPayload({ serialNumber: v })}
            mono
            autoFocus={focusField === 'serial'}
            tone="blue"
            inputClassName="rounded-none"
            data-testid="kiosk-line-serial"
          />
          <TextField
            label="Issue / notes"
            value={repair.repairNotes ?? ''}
            onChange={(v) => patchPayload({ repairNotes: v })}
            multiline
            rows={2}
            tone="blue"
            inputClassName="rounded-none"
          />
        </>
      )}

      {buyback && (
        <>
          <TextField
            label="IMEI"
            value={buyback.imei}
            onChange={(v) => patchPayload({ imei: v })}
            mono
            autoFocus={focusField === 'imei'}
            tone="blue"
            inputClassName="rounded-none"
            data-testid="kiosk-line-imei"
          />
          <TextField
            label="Grade"
            value={buyback.grade ?? ''}
            onChange={(v) => patchPayload({ grade: v })}
            tone="blue"
            inputClassName="rounded-none"
          />
        </>
      )}

      {repair && focusField === 'signature' && (
        <p className={cn('text-text-warning', KIOSK_META)}>
          Signature is captured in the Repair pane — open Repair to sign.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        {mirrored ? (
          <span className={cn('text-text-soft', KIOSK_META)}>Ask staff to remove this line</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              actions.removeLine(line.id);
              onDone();
            }}
            className="text-text-danger"
            data-testid="kiosk-line-delete"
          >
            <Trash2 className="h-4 w-4" />
            Remove line
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onDone} data-testid="kiosk-line-done">
          Done
        </Button>
      </div>
    </div>
  );
}
