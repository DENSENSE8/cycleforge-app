'use client';

/**
 * Purchase-order section: the order's lines. Each line is its own product —
 * SKU or title, an explicit quantity, and its own listing URL.
 */

import { Plus, Trash2 } from '@/components/Icons';
import {
  lineHasIdentity,
  type PoIntakeLineDraft,
  type PoIntakeMissingField,
} from '@/lib/inbound/po-intake-draft';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import {
  ComposerButton,
  ComposerField,
  ComposerIconButton,
  ComposerInput,
  ComposerSection,
} from './receiving-order-composer-parts';

export interface PurchaseOrderLinesProps {
  lines: readonly PoIntakeLineDraft[];
  missing: readonly PoIntakeMissingField[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, patch: Partial<PoIntakeLineDraft>) => void;
}

export function PurchaseOrderLines({ lines, missing, onAdd, onRemove, onChange }: PurchaseOrderLinesProps) {
  return (
    <ComposerSection
      label={`Lines · ${lines.length}`}
      trailing={
        <ComposerButton tone="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
          Add line
        </ComposerButton>
      }
    >
      <ol className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <PurchaseOrderLineRow
            key={index}
            index={index}
            line={line}
            identityMissing={missing.includes('line_identity') && !lineHasIdentity(line)}
            quantityMissing={missing.includes('quantity')}
            removable={lines.length > 1}
            onRemove={() => onRemove(index)}
            onChange={(patch) => onChange(index, patch)}
          />
        ))}
      </ol>
    </ComposerSection>
  );
}

function PurchaseOrderLineRow({
  index,
  line,
  identityMissing,
  quantityMissing,
  removable,
  onRemove,
  onChange,
}: {
  index: number;
  line: PoIntakeLineDraft;
  identityMissing: boolean;
  quantityMissing: boolean;
  removable: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<PoIntakeLineDraft>) => void;
}) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr_1fr_5rem_2rem] items-end gap-2 border-b border-mode-rule pb-3 last:border-b-0 last:pb-0">
      <span className={cn(RECORD_ID_CLASS, 'flex h-8 items-center text-mode-muted')}>{index + 1}</span>
      <ComposerField label="SKU" missing={identityMissing}>
        <ComposerInput value={line.sku} onChange={(e) => onChange({ sku: e.target.value })} />
      </ComposerField>
      <ComposerField label="Item title" missing={identityMissing}>
        <ComposerInput value={line.itemName} onChange={(e) => onChange({ itemName: e.target.value })} />
      </ComposerField>
      <ComposerField label="Qty" required missing={quantityMissing}>
        <ComposerInput inputMode="numeric" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
      </ComposerField>
      <ComposerIconButton
        label={`Remove line ${index + 1}`}
        icon={<Trash2 className="h-4 w-4" />}
        disabled={!removable}
        onClick={onRemove}
      />
      <span aria-hidden />
      <ComposerField label="Listing URL">
        <ComposerInput
          type="url"
          placeholder="https://"
          value={line.listingUrl}
          onChange={(e) => onChange({ listingUrl: e.target.value })}
        />
      </ComposerField>
      <ComposerField label="Line item ID" className="col-span-2">
        <ComposerInput value={line.lineItemId} onChange={(e) => onChange({ lineItemId: e.target.value })} />
      </ComposerField>
    </li>
  );
}
