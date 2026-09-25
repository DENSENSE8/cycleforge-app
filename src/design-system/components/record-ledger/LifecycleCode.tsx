import type { ComponentType, ReactNode } from 'react';
import { AlarmClock, CircleDot, CirclePause, Package, PackageX, Truck } from '@/components/Icons';
import { LIFECYCLE, type LifecycleState } from '../../tokens/lifecycle';
import { RECORD_LABEL_CLASS, stateBadgeClass } from '../../tokens/industrial-record';
import { cn } from '@/utils/_cn';
import type { LifecycleIcon } from '@cycleforge/design-tokens';

const LIFECYCLE_GLYPH: Readonly<Record<LifecycleIcon, ComponentType<{ className?: string }>>> = {
  'circle-dot': CircleDot,
  'alarm-clock': AlarmClock,
  package: Package,
  'package-x': PackageX,
  truck: Truck,
  'circle-pause': CirclePause,
};

/**
 * A lifecycle state as the floor reads it: a solid badge in the state's
 * colour carrying the state's icon, then its mono code (`RDY`, `OOS` …). The
 * icon is the second carrier after colour — shape still separates states for
 * colour-blind staff and when scanning a long list. Icon and code are hidden
 * from assistive tech; the full word is read instead.
 *
 * `children` replaces the visible code (a group band's `OOS 2/3`); `srLabel`
 * replaces the spoken word, and `null` drops it where the word is already
 * visible.
 */
export function LifecycleCode({
  state,
  className,
  children,
  srLabel,
}: {
  state: LifecycleState;
  className?: string;
  children?: ReactNode;
  srLabel?: ReactNode | null;
}) {
  const spec = LIFECYCLE[state];
  const Glyph = LIFECYCLE_GLYPH[spec.icon];
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
