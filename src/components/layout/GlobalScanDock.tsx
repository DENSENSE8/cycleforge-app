'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ThemedStationScanBar } from '@/components/station/scan-bar';
import {
  getActiveScanDockPolicy,
  subscribeScanDock,
} from '@/lib/scan-dock/store';

/** The persistent scan input — the fourth zone of {@link GlobalHeader}. */
export function GlobalScanDock() {
  const policy = useSyncExternalStore(
    subscribeScanDock,
    getActiveScanDockPolicy,
    () => null,
  );
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPolicyId = useRef<string | null>(null);

  // Surface changed:
  useEffect(() => {
    const id = policy?.id ?? null;
    if (lastPolicyId.current === id) return;
    const hadFocus =
      lastPolicyId.current !== null &&
      typeof document !== 'undefined' &&
      document.activeElement === inputRef.current;
    lastPolicyId.current = id;
    setValue('');
    if (hadFocus && id) inputRef.current?.focus();
  }, [policy?.id]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !policy) return;
    policy.onSubmit(trimmed);
    setValue('');
  }, [policy, value]);

  if (!policy) return null;

  return (
    <div className="flex h-full min-w-0 flex-1 items-center" data-header-zone="scan">
      <ThemedStationScanBar
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        inputRef={inputRef}
        placeholder={policy.placeholder ?? 'Scan'}
        staffId={policy.staffId ?? null}
        isResolving={policy.isResolving}
        rightContent={policy.rightContent}
        hasRightContent={policy.rightContent != null}
        leadingColumn="masternav"
      />
    </div>
  );
}
