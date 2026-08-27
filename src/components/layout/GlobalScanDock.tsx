'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ThemedStationScanBar } from '@/components/station/scan-bar';
import {
  getActiveScanDockPolicy,
  subscribeScanDock,
} from '@/lib/scan-dock/store';

/**
 * The persistent scan input — the fourth zone of {@link GlobalHeader}.
 *
 * Mounted once, in the header, which `ResponsiveLayout` mounts once from the
 * ROOT layout. The App Router does not remount the root layout across a client
 * navigation, so this input — its React state, its DOM node, and its focus —
 * survives every jump the command router performs. That is the entire reason it
 * lives here rather than in each surface's sidebar panel, where the panel swap
 * on a mode change takes the bar down with it.
 *
 * It renders NOTHING until a surface publishes a policy via `useScanDock`, so
 * mounting it is inert on every page that has not migrated. Surfaces move over
 * one at a time; an unmigrated surface keeps its own bar and nothing collides.
 *
 * @domain-job Persistent cross-surface scan input for the station command router
 * @hardware-target Station
 * @density ops
 * @justification `StationScanPaneHost` and the sidebar bands are mounted INSIDE
 *   a surface, which is precisely the lifetime this must outlive. The named host
 *   cannot be reused because its remount is the defect.
 */
export function GlobalScanDock() {
  const policy = useSyncExternalStore(
    subscribeScanDock,
    getActiveScanDockPolicy,
    () => null,
  );
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPolicyId = useRef<string | null>(null);

  // Surface changed: clear the VALUE, keep the FOCUS.
  //
  // Both halves are deliberate. Keeping focus is the dock's whole purpose — an
  // operator who scanned a jump sticker must be able to pull the trigger again
  // immediately. Clearing the value is the other half: a half-typed serial
  // carried from Quality Control to Ready to Pack would hand the next bench a
  // string its resolver never saw scanned.
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
