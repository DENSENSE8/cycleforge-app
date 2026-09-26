'use client';

import { CopyChip } from '@/components/ui/CopyChip';
import { Package } from '@/components/Icons';
import { handlingUnitHandle } from '@/lib/barcode-routing';

/** The LPN (handling-unit) chip — "Box H-123 · 4 units". */
export interface HandlingUnitChipProps {
  handlingUnitId?: number | null;
  code?: string | null;
  unitCount?: number | null;
  dense?: boolean;
  width?: string;
}

export function HandlingUnitChip({
  handlingUnitId,
  code,
  unitCount,
  dense = false,
  width,
}: HandlingUnitChipProps) {
  const handle =
    (code && code.trim()) ||
    (handlingUnitId != null ? handlingUnitHandle(handlingUnitId) : '');
  if (!handle) return null;

  const display =
    unitCount != null && Number.isFinite(unitCount)
      ? `${handle} · ${Math.max(0, Math.floor(unitCount))} units`
      : handle;

  return (
    <CopyChip
      value={handle}
      display={display}
      icon={<Package className="h-4 w-4 shrink-0" />}
      iconClass="text-teal-600"
      truncateDisplay={false}
      width={width}
      dense={dense}
    />
  );
}
