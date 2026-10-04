'use client';

/**
 * The phone cart — the top bar's one page action opens it over whatever step
 * is on screen. Each line wears the desk cart's identity face
 * (`TriageLineIdentity`: photo, title, repair tag, SKU · Item # · stock · bin),
 * the same condition chip (tap → the ledger's grade list), "Pair to a catalog
 * product" where the desk offers it, then the thumb controls: quantity stepper,
 * price each, line total. Totals and what still blocks release underneath.
 */

import { useState } from 'react';
import { Minus, Plus, Trash2 } from '@/components/Icons';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConditionChipFace, TriageLineIdentity } from '@/design-system/components/triage-shelf/TriageCartLine';
import { Button, IconButton } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { conditionGradeTableLabel, conditionOptions, EMPTY_META_DASH, type ConditionGrade } from '@/lib/conditions';
import { shelfOfSku } from '@/lib/orders/intake/catalog-shelf';
import { cartLineFacts, lineNeedsPairing } from '@/lib/orders/intake/checkout-model';
import { priceCents, type IntakeLine } from '@/lib/orders/intake/intake-model';
import { formatCents, type ManualOrderTotals } from '@/lib/orders/manual-order-draft';
import { cn } from '@/utils/_cn';
import { MobileChoiceRows } from './MobileChoice';
import { MobileLinePairSheet } from './MobileLinePairSheet';

const FULL_LABEL = new Map(conditionOptions('full').map((o) => [o.value, o.label]));
const CONDITION_CHOICES = conditionOptions('table').map((o) => ({
  value: o.value,
  label: o.label,
  hint: FULL_LABEL.get(o.value) !== o.label ? FULL_LABEL.get(o.value) : undefined,
}));

export function MobileCartSheet({
  open,
  onClose,
  lines,
  currency,
  totals,
  blockers,
  onChange,
  onRemove,
  locked = false,
}: {
  open: boolean;
  onClose: () => void;
  lines: readonly IntakeLine[];
  currency: string;
  totals: ManualOrderTotals;
  /** What still blocks release, in form order. */
  blockers: readonly string[];
  onChange: (key: string, next: Partial<IntakeLine>) => void;
  onRemove: (key: string) => void;
  /** Saved as a draft: lines edit in place (synced to the held rows), none is added or removed. */
  locked?: boolean;
}) {
  const [conditionKey, setConditionKey] = useState<string | null>(null);
  const [pairKey, setPairKey] = useState<string | null>(null);
  const conditionLine = lines.find((l) => l.key === conditionKey) ?? null;
  const pairLine = lines.find((l) => l.key === pairKey) ?? null;
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>{`Cart (${count} item${count === 1 ? '' : 's'})`}</SheetTitle>
        </SheetHeader>
        <SheetBody className="px-0 pt-0" data-testid="m-order-cart">
          {lines.length === 0 ? (
            <p className="px-mode-page py-8 text-center text-role-caption text-mode-muted">Nothing on the cart yet — add products from the grid.</p>
          ) : (
            <ul className="divide-y divide-mode-rule border-b border-mode-rule">
              {lines.map((l) => {
                const each = priceCents(l.unitPrice);
                // A repair service (`…-RS`) has no condition — it is work, not a unit.
                const service = shelfOfSku(l.sku) === 'repair';
                const conditionLabel = conditionGradeTableLabel(l.condition);
                return (
                  <li key={l.key} className="space-y-2 px-mode-page py-3" data-testid="m-order-cart-line">
                    <TriageLineIdentity
                      title={l.title}
                      imageUrl={l.imageUrl}
                      facts={cartLineFacts(l)}
                      repair={service}
                      repairTestId="m-order-cart-repair"
                      trailing={
                        locked ? null : (
                          <IconButton
                            icon={<Trash2 className="size-4" />}
                            ariaLabel={`Remove ${l.title}`}
                            size="touch"
                            radius="control"
                            onClick={() => onRemove(l.key)}
                            data-testid="m-order-cart-remove"
                          />
                        )
                      }
                    />
                    {!service || lineNeedsPairing(l) ? (
                      <div className="flex flex-wrap items-center gap-2 pl-15">
                        {service ? null : (
                          // ds-raw-button: the ledger's condition chip is the face; the button is only its touch target
                          <button
                            type="button"
                            onClick={() => setConditionKey(l.key)}
                            aria-label={`Condition, ${conditionLabel === EMPTY_META_DASH ? 'not set' : conditionLabel}`}
                            className={cn('flex min-h-mode-hit items-center rounded-mode-control', focusRing('control'))}
                            data-testid="m-order-cart-condition"
                          >
                            <ConditionChipFace value={l.condition} />
                          </button>
                        )}
                        {lineNeedsPairing(l) ? (
                          <Button variant="secondary" size="sm" onClick={() => setPairKey(l.key)} data-testid="m-order-cart-pair">
                            Pair to a catalog product
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-3 pl-15">
                      <div className="flex items-center" role="group" aria-label="Quantity">
                        <IconButton
                          icon={<Minus className="size-4" />}
                          ariaLabel="One fewer"
                          size="touch"
                          radius="control"
                          disabled={l.quantity <= 1}
                          onClick={() => onChange(l.key, { quantity: Math.max(1, l.quantity - 1) })}
                        />
                        <span className="w-8 text-center text-role-body tabular-nums text-mode-ink" aria-live="polite" data-testid="m-order-cart-qty">
                          {l.quantity}
                        </span>
                        <IconButton
                          icon={<Plus className="size-4" />}
                          ariaLabel="One more"
                          size="touch"
                          radius="control"
                          onClick={() => onChange(l.key, { quantity: Math.min(9999, l.quantity + 1) })}
                        />
                      </div>
                      <TextField
                        label="Price each"
                        value={l.unitPrice}
                        onChange={(v) => onChange(l.key, { unitPrice: v })}
                        inputMode="decimal"
                        className="min-w-0 flex-1"
                      />
                      <span
                        className={cn('w-20 shrink-0 text-right text-role-body font-medium tabular-nums', each == null ? 'text-mode-muted' : 'text-text-success')}
                      >
                        {each == null ? 'No price' : formatCents(each * l.quantity, currency)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <dl className="space-y-1 px-mode-page py-3 text-role-caption">
            <div className="flex justify-between text-mode-muted">
              <dt>Subtotal</dt>
              <dd className="tabular-nums text-text-success">{formatCents(totals.subtotalCents, currency)}</dd>
            </div>
            <div className="flex justify-between text-role-body font-semibold text-mode-ink">
              <dt>Total</dt>
              <dd className="tabular-nums text-text-success" data-testid="m-order-cart-total">{formatCents(totals.totalCents, currency)}</dd>
            </div>
          </dl>
          {blockers.length > 0 ? (
            <ul className="space-y-1 border-t border-mode-rule px-mode-page py-3" aria-label="Still needed before release">
              {blockers.map((b) => (
                <li key={b} className="flex items-center gap-2 text-role-caption text-mode-muted">
                  <span className="size-1.5 shrink-0 rounded-mode-pill bg-text-warning" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </SheetBody>
        <Sheet open={conditionLine != null} onOpenChange={(next) => { if (!next) setConditionKey(null); }}>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
              <SheetTitle>{conditionLine ? `Condition · ${conditionLine.title}` : 'Condition'}</SheetTitle>
            </SheetHeader>
            <SheetBody className="px-0 pt-0">
              <MobileChoiceRows<ConditionGrade>
                label="Condition"
                options={CONDITION_CHOICES}
                value={conditionLine?.condition ?? null}
                onChange={(grade) => {
                  if (conditionLine) onChange(conditionLine.key, { condition: grade });
                  setConditionKey(null);
                }}
                testId="m-order-condition"
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
        <MobileLinePairSheet line={pairLine} currency={currency} onClose={() => setPairKey(null)} onPair={onChange} />
      </SheetContent>
    </Sheet>
  );
}
