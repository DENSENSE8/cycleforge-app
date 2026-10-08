'use client';

/**
 * The replacement parcel on ONE row (operator 2026-10-08): weight in ounces
 * with a live pound readout | hairline | length × width × height. Each field
 * wears its glyph; the host owns the strings and decides when they are complete.
 */

import type { ReactNode } from 'react';
import { ArrowLeftRight, ArrowUpDown, Ruler, Weight } from '@/components/Icons';
import { TextField } from '@/design-system/primitives';
import { ozToLbText } from '@/lib/shipping/replacement-rate-shop';

export type ParcelField = 'weight' | 'length' | 'width' | 'height';
export type ParcelDraft = Record<ParcelField, string>;

const DIMENSIONS: readonly { field: Exclude<ParcelField, 'weight'>; label: string; icon: ReactNode }[] = [
  { field: 'length', label: 'Length (in)', icon: <Ruler className="h-4 w-4" /> },
  { field: 'width', label: 'Width (in)', icon: <ArrowLeftRight className="h-4 w-4" /> },
  { field: 'height', label: 'Height (in)', icon: <ArrowUpDown className="h-4 w-4" /> },
];

/** The glyph inside a field's right edge — decoration, not a control. */
function FieldGlyph({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="flex h-8 w-8 items-center justify-center text-text-faint">
      {children}
    </span>
  );
}

export function ReplacementParcelRow({
  draft,
  weightOz,
  onChange,
}: {
  draft: ParcelDraft;
  /** The parsed weight (positive) — drives the pound readout. */
  weightOz: number | null;
  onChange: (field: ParcelField, value: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid="send-replacement-parcel">
      <div className="flex shrink-0 items-center gap-2">
        <TextField
          label="Weight (oz)"
          value={draft.weight}
          onChange={(next) => onChange('weight', next.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          className="w-36"
          trailing={<FieldGlyph><Weight className="h-4 w-4" /></FieldGlyph>}
          data-testid="send-replacement-weight"
        />
        <span
          className="w-16 pt-2 text-role-caption tabular-nums text-text-muted"
          aria-live="polite"
          data-testid="send-replacement-weight-lb"
        >
          {weightOz != null ? `= ${ozToLbText(weightOz)}` : null}
        </span>
      </div>
      <span aria-hidden className="mt-2 h-10 w-px shrink-0 bg-border-soft" />
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
        {DIMENSIONS.map(({ field, label, icon }) => (
          <TextField
            key={field}
            label={label}
            value={draft[field]}
            onChange={(next) => onChange(field, next.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            trailing={<FieldGlyph>{icon}</FieldGlyph>}
            data-testid={`send-replacement-${field}`}
          />
        ))}
      </div>
    </div>
  );
}
