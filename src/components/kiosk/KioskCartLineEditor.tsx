'use client';

/**
 * Cart line editor — the UPDATE half of kiosk line CRUD.
 * ## One cart system (operator 2026-09-24: "no forks")
 * Removing is one tap, no PIN (operator 2026-09-24). Quantity lives on the
 */

import { useState } from 'react';
import { Button, Switch } from '@/design-system/primitives';
import { Receipt, Trash2 } from '@/components/Icons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { KioskAmountKeypad } from '@/components/kiosk/KioskAmountKeypad';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { KioskSerialListField } from '@/components/kiosk/KioskSerialListField';
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
import { repairQuotePatch } from '@/lib/kiosk/repair-line-payload';
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

/** Which money panel is open. `amount` = a custom amount's keypad. */
type MoneyPanel = null | 'adjust' | 'comp' | 'amount';

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
      <KioskEntryField
        name="Other reason"
        idScope={testId}
        value={presets.includes(value) ? '' : value}
        onChange={onChange}
        maxLength={200}
      />
    </div>
  );
}

/** A label-left, switch-right row — Square's item-details toggles. */
function MoneySwitch({
  label,
  detail,
  checked,
  disabled,
  onCheckedChange,
  testId,
}: {
  label: string;
  detail: string | null;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (on: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm font-semibold text-text-default">
        {label}
        {detail ? <span className={cn('block font-normal', KIOSK_META)}>{detail}</span> : null}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        data-testid={testId}
      />
    </label>
  );
}

export function KioskCartLineEditor({
  line,
  onDone,
  onRemove,
}: {
  line: KioskCartLine;
  onDone: () => void;
  onRemove: () => void;
}) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  // A desk holding this tablet owns the money verbs — price, comp and remove.
  const mirrored = session.sharedSessionId !== null;
  const repair = isRepairPayload(line.payload) ? line.payload : null;
  const linked = repair?.linkedRepairId != null;
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

  /** One write for a sale's price and its provenance. */
  const setPrice = (cents: number, priceAdjustment: LinePriceAdjustment | null) => {
    actions.updateLine(line.id, {
      unitAmountCents: cents,
      payload: { ...line.payload, priceAdjustment } as KioskCartLine['payload'],
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
    setDraftCents(next === 'comp' ? 0 : line.unitAmountCents);
  };

  const onApproved = (approved: KioskPriceApproval) => {
    if (!request) return;
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

  return (
    <div
      className="space-y-3 border-t border-border-hairline bg-surface-card px-4 py-3"
      data-testid="kiosk-cart-line-editor"
      data-line-id={line.id}
    >
      {linked ? (
        <p className="text-sm text-text-soft" data-testid="kiosk-line-linked">
          Linked repair {repair?.linkedTicketNumber ?? `#${repair?.linkedRepairId}`} · its
          serial and quote stay on its own record.
        </p>
      ) : (
        <KioskEntryField
          name="Description"
          idScope={line.id}
          value={line.title}
          onChange={(v) => actions.updateLine(line.id, { title: v })}
          testId="kiosk-line-title"
        />
      )}

      {repair && !linked ? (
        // The Device & quote card's fields, in its order, with its writes.
        <>
          <KioskSerialListField
            name="Serial number"
            idScope={line.id}
            value={repair.serialNumber}
            onChange={(v) => patchPayload({ serialNumber: v })}
            testId="kiosk-line-serial"
          />
          {mirrored ? (
            <p className={cn('text-text-soft', KIOSK_META)}>
              {formatCartCents(line.unitAmountCents)} · Ask staff to change the price
            </p>
          ) : (
            <KioskEntryField
              name="Price"
              idScope={line.id}
              value={repair.price}
              inputMode="decimal"
              icon={<Receipt className="h-4 w-4" />}
              onChange={(v) => actions.updateLine(line.id, repairQuotePatch(repair, v))}
              testId="kiosk-line-price"
            />
          )}
          <KioskEntryField
            name="Notes (optional)"
            idScope={line.id}
            value={repair.notes ?? ''}
            multiline
            onChange={(v) => patchPayload({ notes: v || null })}
            testId="kiosk-line-notes"
          />
        </>
      ) : null}

      {buyback ? (
        <>
          {/* The trade-in OFFER is typed here; it is what the counter pays
              out, not a catalog price being overridden. */}
          <KioskEntryField
            name="Credit"
            idScope={line.id}
            value={centsToInput(line.unitAmountCents)}
            inputMode="decimal"
            icon={<Receipt className="h-4 w-4" />}
            onChange={(v) => actions.updateLine(line.id, { unitAmountCents: -inputToCents(v) })}
            testId="kiosk-line-price"
          />
          <KioskEntryField
            name="IMEI"
            idScope={line.id}
            value={buyback.imei}
            onChange={(v) => patchPayload({ imei: v })}
            testId="kiosk-line-imei"
          />
          <KioskEntryField
            name="Grade"
            idScope={line.id}
            value={buyback.grade ?? ''}
            onChange={(v) => patchPayload({ grade: v })}
            testId="kiosk-line-grade"
          />
        </>
      ) : null}

      {retail ? (
        mirrored ? (
          <p className={cn('text-text-soft', KIOSK_META)}>
            {formatCartCents(line.unitAmountCents)} · Ask staff to change the price
          </p>
        ) : custom ? (
          // The Keypad's own line: change it on the keypad that made it, no PIN.
          <div className="space-y-3" data-testid="kiosk-line-money">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-text-default">
                Custom amount · {formatCartCents(line.unitAmountCents)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => (panel === 'amount' ? setPanel(null) : openPanel('amount'))}
                data-testid="kiosk-line-change-amount"
              >
                {panel === 'amount' ? 'Cancel' : 'Change amount'}
              </Button>
            </div>
            {panel === 'amount' ? (
              <div className="space-y-4 border border-border-hairline p-4" data-testid="kiosk-line-amount-panel">
                <KioskAmountKeypad cents={draftCents} onChange={setDraftCents} label="New amount" />
                <Button
                  size="lg"
                  className="w-full"
                  disabled={draftCents <= 0 || draftCents === line.unitAmountCents}
                  onClick={() => {
                    setPrice(draftCents, null);
                    setPanel(null);
                  }}
                  data-testid="kiosk-line-amount-save"
                >
                  Save amount · {formatCartCents(draftCents)}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          // A catalog price: Square's item-details verbs, each behind a PIN.
          <div className="space-y-3" data-testid="kiosk-line-money">
            <MoneySwitch
              label="Price adjustment"
              detail={
                adjustment?.kind === 'adjust' && catalogCents != null
                  ? `${formatCartCents(catalogCents)} → ${formatCartCents(line.unitAmountCents)} · ${adjustment.reason}${
                      adjustment.staffName ? ` · ${adjustment.staffName}` : ''
                    }`
                  : null
              }
              checked={adjustOn}
              disabled={compOn}
              onCheckedChange={(on) => (on ? openPanel('adjust') : restoreCatalogPrice())}
              testId="kiosk-line-adjust-switch"
            />
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
                      kind: 'adjust',
                      fromCents: catalogCents,
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
            <MoneySwitch
              label="Comp"
              detail={
                adjustment?.kind === 'comp'
                  ? `${adjustment.reason}${adjustment.staffName ? ` · ${adjustment.staffName}` : ''}`
                  : null
              }
              checked={compOn}
              disabled={adjustOn}
              onCheckedChange={(on) => (on ? openPanel('comp') : restoreCatalogPrice())}
              testId="kiosk-line-comp-switch"
            />
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
        )
      ) : null}

      {retail ? (
        <KioskEntryField
          name="Note"
          idScope={line.id}
          value={retail.note ?? ''}
          multiline
          maxLength={2000}
          onChange={(v) => patchPayload({ note: v })}
          testId="kiosk-line-note"
        />
      ) : null}

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
