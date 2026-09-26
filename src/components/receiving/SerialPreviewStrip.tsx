'use client';

import { getLast8 } from '@/lib/copy-chip-format';
import { Package, ScanBarcode } from '@/components/Icons';

/** Last 8 of a serial for a compact preview chip. */
export function serialLast8(value: string): string {
  return getLast8(value);
}

type PreviewSerial = { id?: number; serial_number: string; unit_uid?: string | null };
type BoxableSerial = { handling_unit_id?: number | null };

/** Distinct box (handling-unit) ids across a serial set, in first-seen order. */
export function distinctBoxIds(serials?: BoxableSerial[] | null): number[] {
  if (!serials) return [];
  return Array.from(
    new Set(
      serials
        .map((s) => s.handling_unit_id)
        .filter((v): v is number => typeof v === 'number'),
    ),
  );
}

/** Non-interactive box-membership hint (teal, matching HandlingUnitChip's LPN convention). */
export function BoxMembershipHint({
  serials,
  className,
}: {
  serials?: BoxableSerial[] | null;
  className?: string;
}) {
  const ids = distinctBoxIds(serials);
  if (ids.length === 0) return null;
  const label = ids.length === 1 ? `H-${ids[0]}` : `${ids.length} boxes`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-teal-50 inset-chip text-role-eyebrow uppercase tracking-widest text-teal-700 ring-1 ring-inset ring-teal-200 ${className ?? ''}`}
    >
      <Package className="h-2.5 w-2.5 shrink-0" />
      {label}
    </span>
  );
}

/** Non-interactive serial preview — a strip of emerald `serial`-tone pills (last-8) that lets an operator see WHICH serials sit on a line… */
export function SerialPreviewStrip({
  serials,
  max = 5,
  className,
}: {
  serials: PreviewSerial[];
  max?: number;
  className?: string;
}) {
  if (!serials.length) return null;
  const shown = serials.slice(0, max);
  const extra = serials.length - shown.length;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      {shown.map((s) => {
        const labeled = !!s.unit_uid;
        return (
          <span
            key={s.id ?? s.serial_number}
            data-serial-chip
            data-labeled={labeled ? 'true' : 'false'}
            title={labeled ? `Labeled · ${s.unit_uid}` : 'Not labeled yet'}
            className={`inline-flex items-center gap-1 rounded inset-chip text-role-eyebrow uppercase tracking-widest ring-1 ring-inset ${
              labeled
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-surface-canvas text-text-muted ring-border-soft'
            }`}
          >
            <ScanBarcode className="h-2.5 w-2.5 shrink-0" />
            {serialLast8(s.serial_number)}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
