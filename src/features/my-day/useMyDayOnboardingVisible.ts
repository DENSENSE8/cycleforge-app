'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { useOperationsRoi } from '@/features/operations/workspace/useOperationsRoi';
import {
  completedStepCount,
  stepsForEntitlements,
  type OnboardingStats,
} from '@/lib/onboarding/steps';

/** True while first-scan hero or getting-started checklist should pin the right pane. */
export function useMyDayOnboardingVisible(): boolean {
  const { isLoaded, has } = useAuth();
  const entitlements = useEntitlements();
  const { prefs, isLoading: prefsLoading } = useStaffPreferences();
  const { data: roi, isLoading: roiLoading, isError: roiError } = useOperationsRoi();

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['onboarding-stats'],
    staleTime: 5 * 60 * 1000,
    enabled: isLoaded && has('dashboard.view'),
    queryFn: async (): Promise<OnboardingStats> => {
      const res = await fetch('/api/onboarding/stats');
      if (!res.ok) throw new Error(`onboarding-stats ${res.status}`);
      const body = (await res.json()) as { stats?: OnboardingStats };
      if (!body.stats) throw new Error('onboarding-stats: empty payload');
      return body.stats;
    },
  });

  const showFirstScan =
    isLoaded &&
    has('operations.view') &&
    !roiLoading &&
    !roiError &&
    roi != null &&
    !roi.hasData;

  const showChecklist =
    isLoaded &&
    has('dashboard.view') &&
    !statsLoading &&
    !statsError &&
    stats != null &&
    !prefsLoading &&
    !prefs?.onboardingDismissed &&
    (() => {
      const steps = stepsForEntitlements(entitlements);
      const completed = completedStepCount(steps, stats);
      return steps.length > 0 && completed < steps.length;
    })();

  return showFirstScan || showChecklist;
}