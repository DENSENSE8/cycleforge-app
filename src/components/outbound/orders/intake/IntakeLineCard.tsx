'use client';

/**
 * One product line: the paired product (photo, identity title, SKU, item #,
 * stock / bin) and what this order takes of it — quantity stepper, condition,
 * price each. A pasted line that is not a catalog product yet carries its own
 * search, seeded with what was pasted.
 */

import { Minus, Package, Plus, X } from '@/components/Icons';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { IconButton } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import type { ConditionGrade } from '@/lib/conditions';
import { formatCents } from '@/lib/orders/manual-order-draft';
import { IntakeProductSearch } from './IntakeProductSearch';
import { priceCents, type IntakeLine } from '@/lib/orders/intake/intake-model';

export function IntakeLineCard({
  line,
  index,
  currency,
  onChange,
  onRemove,
}: {
  line: IntakeLine;
  index: number;
  currency: string;
  onChange: (patch: Partial<IntakeLine>) => void;
  onRemove: () => void;
}) {
  const unitCents = priceCents(line.unitPrice);
  const paired = line.skuCatalogId != null;
  return (
    <li className="rounded-mode-control border border-border-hairline p-3" data-testid={`intake-line-${index + 1}`}>
      <div className="flex items-start gap-3">
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- catalog photos are remote, unsized thumbnails
          <img src={line.imageUrl} alt="" className="size-12 shrink-0 bg-surface-sunken object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center bg-surface-sunken text-text-faint">
            <Package className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-role-body font-medium leading-snug text-text-default" data-testid="intake-line-title">
            {line.title || 'Pick a product'}
          </p>
          <p className="truncate text-role-caption text-text-muted">
            {[
              line.sku ? `SKU ${line.sku}` : null,
              line.itemNumber ? `Item ${line.itemNumber}` : null,
              line.onHand != null ? `${line.onHand} in stock` : null,
              line.bin ? `Bin ${line.bin}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || (paired ? '' : 'Not a catalog product yet')}
          </p>
        </div>
        <IconButton
          icon={<X className="size-4" />}
          ariaLabel={`Remove line ${index + 1}`}
          radius="control"
          size="md"
          onClick={onRemove}
          data-testid="intake-line-remove"
        />
      </div>

      {paired ? null : (
        <div className="mt-2">
          <IntakeProductSearch
            seed={line.title || line.sku || line.itemNumber}
            placeholder={`Pair “${line.title || line.sku || 'this line'}” to a catalog product`}
            testId={`intake-line-${index + 1}-pair`}
            onPick={(hit) =>
              onChange({
                skuCatalogId: hit.skuCatalogId,
                sku: hit.sku,
                title: hit.title,
                itemNumber: line.itemNumber || hit.itemNumber || '',
                imageUrl: hit.imageUrl,
                onHand: hit.onHand,
                bin: hit.bin,
              })
            }
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <p className="mode-label pb-1 text-text-soft" id={`${line.key}-qty`}>Quantity</p>
          <div className="inline-flex h-11 items-center rounded-mode-control border border-border-soft" role="group" aria-labelledby={`${line.key}-qty`}>
            <IconButton
              icon={<Minus className="size-4" />}
              ariaLabel="One fewer"
              radius="control"
              size="md"
              disabled={line.quantity <= 1}
              onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })}
              data-testid="intake-line-qty-down"
            />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={line.quantity}
              aria-label="Quantity"
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                onChange({ quantity: Number.isFinite(n) ? Math.min(9999, Math.max(1, n)) : 1 });
              }}
              className="h-9 w-12 bg-transparent text-center text-sm tabular-nums text-text-default outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              data-testid="intake-line-qty"
            />
            <IconButton
              icon={<Plus className="size-4" />}
              ariaLabel="One more"
              radius="control"
              size="md"
              onClick={() => onChange({ quantity: Math.min(9999, line.quantity + 1) })}
              data-testid="intake-line-qty-up"
            />
          </div>
        </div>
        <TextField
          label="Price each"
          value={line.unitPrice}
          onChange={(v) => onChange({ unitPrice: v })}
          inputMode="decimal"
          className="w-32"
          data-testid="intake-line-price"
        />
        <p className="pb-3 text-role-caption tabular-nums text-text-muted">
          {unitCents == null ? 'No price' : `Line ${formatCents(unitCents * line.quantity, currency)}`}
        </p>
      </div>

      <div className="mt-3">
        <p className="mode-label pb-1 text-text-soft">Condition</p>
        <ConditionPills
          value={line.condition}
          onChange={(next) => onChange({ condition: next as ConditionGrade })}
          corner="panel"
          labelVariant="full"
        />
      </div>
    </li>
  );
}
