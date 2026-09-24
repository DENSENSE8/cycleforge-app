'use client';

/**
 * Cart line editor — the UPDATE half of kiosk line CRUD.
 *
 * @domain-job Correct a line already on the cart without voiding it.
 * @hardware-target Station (counter tablet)
 * @density floor
 * @justification The ledger could create (catalog / scan / pane) and delete
 *   (the row `X`) but never update: a mistyped serial, a wrong quantity or a
 *   re-quoted repair meant voiding the line and re-entering the whole intake,
 *   which also threw away the signature. `kioskSessionStore.updateLine` existed
 *   the whole time with no caller — this is that caller.
 *
 * Edits write straight through on change (the cart IS the session root; there
 * is no separate save step to strand work in) — EXCEPT money. A price is
 * Square's item-details screen: a **Price adjustment** switch (keypad + reason,
 * saved behind a `walk_in.adjust_price` PIN; off restores the catalog price
 * with no PIN), a **Comp** switch (the item stays on the bill at $0 with a
 * reason), and an **item note**. The raw `Price ($)` field that used to change
 * a price with no permission, no PIN and no record of the original is gone.
 * Quantity lives on the card's `−  N  +`.
 */

import { useState } from 'react';
import { Button, Switch, TextField } from '@/design-system/primitives';
import { Trash2 } from '@/components/Icons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { KioskAmountKeypad } from '@/components/kiosk/KioskAmountKeypad';
import {
  KioskPriceApprovalSheet,
  type KioskPriceApproval,
  type KioskPriceApprovalRequest,
} from '@/components/kiosk/KioskPriceApprovalSheet';
import {
  isBuybackPayload,
  isRepairPayload,
  isRetailPayload,
  lineCatalogUnitCents,
  lineIsCustom,
  linePriceAdjustment,
  type KioskCartLine,
  type LinePriceAdjustment,
} from '@/lib/kiosk/cart-line';
import { formatCartCents } from '@/lib/kiosk/cart-card-view';
import { PRICE_ADJUST_REASONS } from '@/lib/kiosk/price-approval-kinds';
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

/** Which money panel is open under the switches. */
type MoneyPanel = null | 'adjust' | 'comp';

/** Preset reasons as touch chips, plus the free-text field for anything else. */
function ReasonPicker({
  presets,
  value,
  onChange,
  testId,
}: {
  presets: readonly string[];
  value: string;
  onChange: (reason: string) => void;
  testId: string;
}) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className={KIOSK_META}>Reason</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <KioskChip
            key={preset}
            tone={value === preset ? 'accent' : 'idle'}
            selected={value === preset}
            onClick={() => onChange(preset)}
            className="min-h-11 px-4"
            testId={`${testId}-${preset.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {preset}
          </KioskChip>
        ))}
      </div>
      <TextField
        label="Other reason"
        value={presets.includes(value) ? '' : value}
        onChange={onChange}
        maxLength={200}
        inputClassName="rounded-none"
      />
    </div>
  );
}

export function KioskCartLineEditor({
  line,
  onDone,
  onRemove,
}: {
  line: KioskCartLine;
  onDone: () => void;
  /** Remove the line. The ledger decides whether that needs a void reason. */
  onRemove: () => void;
}) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  // A desk holding this tablet owns the money verbs — price, comp and void.
  const mirrored = session.sharedSessionId !== null;
  const repair = isRepairPayload(line.payload) ? line.payload : null;
  const buyback = isBuybackPayload(line.payload) ? line.payload : null;
  const retail = isRetailPayload(line.payload) ? line.payload : null;
  const custom = lineIsCustom(line);
  const adjustment = linePriceAdjustment(line);
  const catalogCents = lineCatalogUnitCents(line);

  const [panel, setPanel] = useState<MoneyPanel>(null);
  const [draftCents, setDraftCents] = useState(line.unitAmountCents);
  const [reason, setReason] = useState('');
  const [request, setRequest] = useState<KioskPriceApprovalRequest | null>(null);

  const patchPayload = (next: Record<string, unknown>) => {
    actions.updateLine(line.id, {
      payload: { ...line.payload, ...next } as KioskCartLine['payload'],
    });
  };

  /** One write for the price and its provenance; a repair's quote text follows the money. */
  const setPrice = (cents: number, priceAdjustment: LinePriceAdjustment | null) => {
    actions.updateLine(line.id, {
      unitAmountCents: cents,
      payload: {
        ...line.payload,
        priceAdjustment,
        ...(repair ? { price: (cents / 100).toFixed(2) } : {}),
      } as KioskCartLine['payload'],
    });
  };

  /** Square: switching Price adjustment (or Comp) off restores the item price. No PIN. */
  const restoreCatalogPrice = () => {
    if (catalogCents != null) setPrice(catalogCents, null);
    setPanel(null);
  };

  const openPanel = (next: Exclude<MoneyPanel, null>) => {
    setPanel(next);
    setReason('');
    setDraftCents(next === 'adjust' ? line.unitAmountCents : 0);
  };

  const onApproved = (approved: KioskPriceApproval) => {
    if (!request || request.kind === 'void') return;
    setPrice(request.toCents, {
      kind: request.kind,
      originalUnitAmountCents: request.fromCents,
      reason: request.reason,
      staffId: approved.staffId,
      staffName: approved.staffName,
      approval: approved.approval,
    });
    setRequest(null);
    setPanel(null);
  };

  const adjustOn = panel === 'adjust' || adjustment?.kind === 'adjust';
  const compOn = panel === 'comp' || adjustment?.kind === 'comp';
  // A keypad line has no catalog price to comp from or return to; remove it instead.
  const canComp = !custom && !buyback;

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
        inputClassName="rounded-none"
      />

      {buyback ? (
        // The trade-in OFFER is typed here; it is what the counter pays out,
        // not a catalog price being overridden.
        <TextField
          label="Credit ($)"
          value={centsToInput(line.unitAmountCents)}
          onChange={(v) => actions.updateLine(line.id, { unitAmountCents: -inputToCents(v) })}
          inputMode="decimal"
          inputClassName="rounded-none font-semibold tabular-nums text-text-success"
          data-testid="kiosk-line-price"
        />
      ) : mirrored ? (
        <p className={cn('text-text-soft', KIOSK_META)}>
          {formatCartCents(line.unitAmountCents)} · Ask staff to change the price
        </p>
      ) : (
        <div className="space-y-3" data-testid="kiosk-line-money">
          {custom ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-text-default">
                Custom amount · {formatCartCents(line.unitAmountCents)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => (panel === 'adjust' ? setPanel(null) : openPanel('adjust'))}
                data-testid="kiosk-line-change-amount"
              >
                {panel === 'adjust' ? 'Cancel' : 'Change amount'}
              </Button>
            </div>
          ) : (
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm font-semibold text-text-default">
                Price adjustment
                {adjustment?.kind === 'adjust' && catalogCents != null ? (
                  <span className={cn('block font-normal', KIOSK_META)}>
                    {formatCartCents(catalogCents)} → {formatCartCents(line.unitAmountCents)} ·{' '}
                    {adjustment.reason}
                    {adjustment.staffName ? ` · ${adjustment.staffName}` : ''}
                  </span>
                ) : null}
              </span>
              <Switch
                checked={adjustOn}
                disabled={compOn}
                onCheckedChange={(on) => (on ? openPanel('adjust') : restoreCatalogPrice())}
                aria-label="Price adjustment"
                data-testid="kiosk-line-adjust-switch"
              />
            </label>
          )}

          {panel === 'adjust' ? (
            <div className="space-y-4 border border-border-hairline p-4" data-testid="kiosk-line-adjust-panel">
              <KioskAmountKeypad cents={draftCents} onChange={setDraftCents} label="New price" />
              <ReasonPicker
                presets={PRICE_ADJUST_REASONS}
                value={reason}
                onChange={setReason}
                testId="kiosk-line-adjust-reason"
              />
              <Button
                size="lg"
                className="w-full"
                disabled={!reason.trim() || draftCents === line.unitAmountCents}
                onClick={() =>
                  setRequest({
                    kind: custom ? 'custom' : 'adjust',
                    fromCents: custom ? null : catalogCents,
                    toCents: draftCents,
                    reason: reason.trim(),
                  })
                }
                data-testid="kiosk-line-adjust-save"
              >
                Save price · {formatCartCents(draftCents)}
              </Button>
            </div>
          ) : null}

          {canComp ? (
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm font-semibold text-text-default">
                Comp
                {adjustment?.kind === 'comp' ? (
                  <span className={cn('block font-normal', KIOSK_META)}>
                    {adjustment.reason}
                    {adjustment.staffName ? ` · ${adjustment.staffName}` : ''}
                  </span>
                ) : null}
              </span>
              <Switch
                checked={compOn}
                disabled={adjustOn}
                onCheckedChange={(on) => (on ? openPanel('comp') : restoreCatalogPrice())}
                aria-label="Comp"
                data-testid="kiosk-line-comp-switch"
              />
            </label>
          ) : null}

          {panel === 'comp' ? (
            <div className="space-y-4 border border-border-hairline p-4" data-testid="kiosk-line-comp-panel">
              <ReasonPicker
                presets={session.lineReasons.comp}
                value={reason}
                onChange={setReason}
                testId="kiosk-line-comp-reason"
              />
              <Button
                size="lg"
                className="w-full"
                disabled={!reason.trim()}
                onClick={() =>
                  setRequest({
                    kind: 'comp',
                    fromCents: catalogCents ?? line.unitAmountCents,
                    toCents: 0,
                    reason: reason.trim(),
                  })
                }
                data-testid="kiosk-line-comp-save"
              >
                Comp item · $0.00
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {retail ? (
        <TextField
          label="Note"
          value={retail.note ?? ''}
          onChange={(v) => patchPayload({ note: v })}
          multiline
          rows={2}
          maxLength={2000}
          inputClassName="rounded-none"
          data-testid="kiosk-line-note"
        />
      ) : null}

      {repair && (
        <>
          <TextField
            label="Serial number"
            value={repair.serialNumber}
            onChange={(v) => patchPayload({ serialNumber: v })}
            mono
            inputClassName="rounded-none"
            data-testid="kiosk-line-serial"
          />
          <TextField
            label="Issue / notes"
            value={repair.repairNotes ?? ''}
            onChange={(v) => patchPayload({ repairNotes: v })}
            multiline
            rows={2}
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
            inputClassName="rounded-none"
            data-testid="kiosk-line-imei"
          />
          <TextField
            label="Grade"
            value={buyback.grade ?? ''}
            onChange={(v) => patchPayload({ grade: v })}
            inputClassName="rounded-none"
          />
        </>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        {mirrored ? (
          <span className={cn('text-text-soft', KIOSK_META)}>Ask staff to remove this line</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
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

      <KioskPriceApprovalSheet
        request={request}
        onClose={() => setRequest(null)}
        onApproved={onApproved}
      />
    </div>
  );
}
