'use client';

/**
 * QA-only station-state strip. Rides outside product chrome (same rule as
 * ReskinHud): real scan stations stay untouched; this is a tester overlay.
 * Visible only when the layout mounts it for the QA sandbox org.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import {
  QA_STATION_HOPS,
  QA_STATION_STATE_BUTTONS,
  dispatchQaStationScanState,
  type QaStationScanKind,
} from '@/lib/qa-tools/station-scan-states';

export function StationStateTester() {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState<QaStationScanKind | null>(null);

  const onStation = useMemo(
    () => QA_STATION_HOPS.some((h) => pathname === h.href || pathname.startsWith(`${h.href}/`)),
    [pathname],
  );

  if (!onStation) return null;

  const apply = (next: QaStationScanKind) => {
    setKind(next === 'clear' ? null : next);
    dispatchQaStationScanState(next);
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Show station state tester"
        className={cn('fixed bottom-16 left-3 z-toast', cornerClass('pill'), elevationClass('raised'))}
      >
        QA
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'fixed bottom-16 left-3 z-toast flex max-w-[min(100vw-1.5rem,28rem)] flex-col gap-2',
        'border border-border-soft bg-surface-card p-2',
        cornerClass('card'),
        elevationClass('raised'),
      )}
      role="region"
      aria-label="QA station state tester"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">
          QA station states
        </p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Hide station state tester">
          Hide
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {QA_STATION_STATE_BUTTONS.map((btn) => (
          <Button
            key={btn.kind}
            type="button"
            variant={kind === btn.kind ? 'default' : 'outline'}
            size="sm"
            title={btn.hint}
            onClick={() => apply(btn.kind)}
          >
            {btn.label}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => apply('clear')}>
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {QA_STATION_HOPS.map((hop) => {
          const here = pathname === hop.href || pathname.startsWith(`${hop.href}/`);
          return (
            <Button key={hop.href} variant={here ? 'active' : 'ghost'} size="sm" asChild>
              <Link href={hop.href}>{hop.label.replace(/ scan station$/i, '')}</Link>
            </Button>
          );
        })}
      </div>
      <p className="text-role-micro text-text-faint">
        Incoming / Exception / Not matching load the shared scan bench (Shipping, Testing). Then edit serials, notes, found vs not found in the station itself.
      </p>
    </div>
  );
}
