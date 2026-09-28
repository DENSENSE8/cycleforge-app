'use client';

/**
 * Picks — `/m/pick`.
 * There is no queue to read and no start button (operator 2026-09-25).
 * Two ways in (owner 2026-09-28): the directed next pick, or `?mode=label` —
 * scan a printed shipping label and pick that order, the desk's own flow.
 */

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DirectedPickScreen } from '@/components/mobile/picker/directed/DirectedPickScreen';
import { LabelPickScreen } from '@/components/mobile/picker/label/LabelPickScreen';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';

type PickMode = 'next' | 'label';

const PICK_MODES: { id: PickMode; label: string }[] = [
  { id: 'next', label: 'Next pick' },
  { id: 'label', label: 'Shipping label' },
];

function MobilePickModes() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const mode: PickMode = searchParams.get('mode') === 'label' ? 'label' : 'next';

  const setMode = (next: string) => {
    const params = readLiveSearchParams(searchParams.toString());
    if (next === 'label') params.set('mode', 'label');
    else params.delete('mode');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border-soft bg-surface-card px-mode-page py-2">
        <TabSwitch tabs={PICK_MODES} activeTab={mode} onTabChange={setMode} size="sm" />
      </div>
      <div className="min-h-0 flex-1">{mode === 'label' ? <LabelPickScreen /> : <DirectedPickScreen />}</div>
    </div>
  );
}

export default function MobilePickPage() {
  return (
    <Suspense fallback={null}>
      <MobilePickModes />
    </Suspense>
  );
}
