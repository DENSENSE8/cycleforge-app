'use client';

import { useCallback, useState } from 'react';
import { requestConfirm } from '@/lib/overlay/confirm-bus';
import { requestSwitchOrg } from '@/lib/identity/switch-org';

/**
 * Confirm → POST switch-org → hard reload. Shared by spine org control and
 * Settings workspace cards.
 */
export function useSwitchOrg() {
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchErr, setSwitchErr] = useState<string | null>(null);

  const clearError = useCallback(() => setSwitchErr(null), []);

  const switchTo = useCallback(async (organizationId: string, name: string) => {
    if (switching) return;
    const ok = await requestConfirm({
      description: `Switch to ${name}? Your current view and any unsaved scan state will close.`,
      tone: 'primary',
      confirmLabel: 'Switch',
    });
    if (!ok) return;
    setSwitching(organizationId);
    setSwitchErr(null);
    const result = await requestSwitchOrg(organizationId);
    if (!result.ok) {
      setSwitchErr(result.error);
      setSwitching(null);
    }
    // Success path never returns — window.location.assign navigates away.
  }, [switching]);

  return { switching, switchErr, switchTo, clearError };
}
