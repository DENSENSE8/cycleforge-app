import type { ComponentType, ReactNode } from 'react';
import { AlarmClock, CircleDot, CirclePause, Package, PackageSearch, PackageX, Truck } from '@/components/Icons';
import { LIFECYCLE, type LifecycleState } from '../../tokens/lifecycle';
import { RECORD_LABEL_CLASS, stateBadgeClass, type RecordStateFace } from '../../tokens/industrial-record';
import { cn } from '@/utils/_cn';
import type { LifecycleIcon } from '@cycleforge/design-tokens';

export const LIFECYCLE_GLYPH: Readonly<Record<LifecycleIcon, ComponentType<{ className?: string }>>> = {
  'circle-dot': CircleDot,
  'package-search': PackageSearch,
  'alarm-clock': AlarmClock,
  package: Package,
  'package-x': PackageX,
  truck: Truck,
  'circle-pause': CirclePause,
};

/**
 * A lifecycle state as the floor reads it. `state` is an outbound lifecycle
 * state, or any desk's own state face (stock, QC labels) — one badge, every desk.
 */
export function LifecycleCode({
  state,
  className,
  children,
  srLabel,
}: {
  state: LifecycleState | RecordStateFace;
  className?: string;
  children?: ReactNode;
  srLabel?: ReactNode | null;
}) {
  const spec = typeof state === 'string' ? LIFECYCLE[state] : state;
  const Glyph = LIFECYCLE_GLYPH[spec.icon as LifecycleIcon] ?? CircleDot;
  const spoken = srLabel === undefined ? spec.label : srLabel;
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'inline-flex items-center gap-0.5', stateBadgeClass(spec.tone), className)}>
      <span aria-hidden className="inline-flex shrink-0">
        <Glyph className="h-3 w-3" />
      </span>
      <span aria-hidden={spoken != null || undefined} className="truncate">
        {children ?? spec.code}
      </span>
      {spoken != null ? <span className="sr-only">{spoken}</span> : null}
    </span>
  );
}
