'use client';

import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist';
import { useMyDayOnboardingVisible } from './useMyDayOnboardingVisible';

/** Pinned right-pane onboarding until activation reaches 100% (or skip + complete). */
export function MyDayOnboardingPanel() {
  const visible = useMyDayOnboardingVisible();
  if (!visible) return null;

  return (
    <div className="shrink-0 space-y-3 border-b border-border-hairline px-4 py-3">
      <GettingStartedChecklist variant="pane" />
    </div>
  );
}
