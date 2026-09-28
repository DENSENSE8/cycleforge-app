'use client';

/**
 * The cart — one compact row per product: thumb, title, quantity, price each,
 * condition, line total, remove. Quantity takes typing or ↑/↓; 0 removes the
 * row. Price pre-fills from the product's last sale / list price and stays
 * editable (the "price match" the caller asks for); money reads green.
 * Condition is the To-ship ledger's own control (`LedgerCondition`: tone chip,
 * one triage selection list) — never a second condition dropdown.
 */

import { X } from '@/components/Icons';
import { LedgerCondition } from '@/components/outbound/orders/outbound-orders-ledger-editors';
import { IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { resolveConditionGrade, type ConditionGrade } from '@/lib/conditions';
import { formatCents } from '@/lib/orders/manual-order-draft';
import { cn } from '@/utils/_cn';
import { TriageLineIdentity } from '@/design-system/components/triage-shelf/TriageCartLine';
import { shelfOfSku } from '@/lib/orders/intake/catalog-shelf';
import { cartLineFacts, lineNeedsPairing, pairLineToHit } from '@/lib/orders/intake/checkout-model';
import { priceCents, type IntakeLine } from '@/lib/orders/intake/intake-model';
import { IntakeProductSearch } from '@/components/outbound/orders/intake/IntakeProductSearch';

const INPUT_CLASS = cn(
  'h-8 rounded-mode-control border border-border-soft bg-surface-card px-2 text-right text-role-caption tabular-nums text-text-default',
  focusRing('control'),
);

export function CheckoutCart({
  lines,
  currency,
  onChange,
  onRemove,
  locked = false,
}: {
  lines: readonly IntakeLine[];
  currency: string;
  onChange: (key: string, patch: Partial<IntakeLine>) => void;
  onRemove: (key: string) => void;
  /** Saved as a draft: lines edit in place (synced to the held rows), none is added or removed. */
  locked?: boolean;
}) {
  if (lines.length === 0) {
    return (
      <p className="px-1 py-4 text-center text-role-caption text-text-muted" data-testid="checkout-cart-empty">
        Cart is empty — search a product and press Enter.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border-hairline" data-testid="checkout-cart">
      {lines.map((line, index) => {
        const unit = priceCents(line.unitPrice);
        // A repair service (`…-RS`) has no condition — it is work, not a unit.
        const service = shelfOfSku(line.sku) === 'repair';
        return (
          <li key={line.key} className="space-y-2 py-3" data-testid={`checkout-cart-line-${index + 1}`}>
            <TriageLineIdentity
              title={line.title}
              imageUrl={line.imageUrl}
              facts={cartLineFacts(line)}
              repair={service}
              repairTestId="checkout-cart-repair"
              trailing={
                locked ? null : (
                  <IconButton
                    icon={<X className="size-3.5" />}
                    ariaLabel={`Remove ${line.title}`}
                    radius="control"
                    size="sm"
                    tabIndex={-1}
                    onClick={() => onRemove(line.key)}
                    data-testid="checkout-cart-remove"
                  />
                )
              }
            />
            {lineNeedsPairing(line) ? (
              <div className="pl-15">
                <IntakeProductSearch
                  seed={line.sku || line.title}
                  placeholder="Pair to a catalog product"
                  testId="checkout-cart-pair"
                  onPick={(hit) => onChange(line.key, pairLineToHit(line, hit))}
                />
              </div>
            ) : null}
            <div className="flex items-center gap-2 pl-15">
              <label className="flex items-center gap-1 text-role-micro text-text-muted">
                Qty
                <input
                  type="number"
                  inputMode="numeric"
                  min={locked ? 1 : 0}
                  max={9999}
                  value={line.quantity}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (n === 0 && !locked) onRemove(line.key);
                    else if (Number.isFinite(n)) onChange(line.key, { quantity: Math.min(9999, Math.max(1, n)) });
                  }}
                  className={cn(INPUT_CLASS, 'w-14')}
                  aria-label={`Quantity of ${line.title}`}
                  data-testid="checkout-cart-qty"
                />
              </label>
              <label className="flex items-center gap-1 text-role-micro text-text-muted">
                $
                <input
                  type="text"
                  inputMode="decimal"
                  value={line.unitPrice}
                  placeholder="0.00"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => onChange(line.key, { unitPrice: e.target.value })}
                  className={cn(INPUT_CLASS, 'w-20 font-medium text-text-success', unit == null && 'border-border-warning')}
                  aria-label={`Price each of ${line.title}`}
                  data-testid="checkout-cart-price"
                />
              </label>
              <span className={cn('ml-auto text-role-caption font-medium tabular-nums', unit == null ? 'text-text-muted' : 'text-text-success')}>
                {unit == null ? 'No price' : formatCents(unit * line.quantity, currency)}
              </span>
            </div>
            {service ? null : (
              <div className="pl-15">
                <div className="h-8 w-36" data-testid="checkout-cart-condition">
                  <LedgerCondition
                    value={line.condition}
                    onCommit={(value) => onChange(line.key, { condition: resolveConditionGrade(value) as ConditionGrade })}
                  />
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
