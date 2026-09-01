'use client';

/**
 * Modal sheet for switching the active staff at a shared station.
 *
 *   1. Picker — same row layout as /signin (StaffPickerList)
 *   2. PIN — themed numpad for the picked staff (StaffPinPad), calls /api/auth/switch
 *
 * On success, refreshes AuthContext and re-renders server components so the
 * sidebar and any page that reads useAuth() picks up the new identity
 * without a full reload.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { StaffPickerList, type StaffPickerRow } from '@/components/auth/StaffPickerList';
import { StaffPinPad } from '@/components/auth/StaffPinPad';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SearchField } from '@/design-system/primitives/SearchField';
import { readRecentSignins, writeRecentSignin } from '@/lib/auth/recent-signins';

function humanError(code: string | undefined): string {
  switch (code) {
    case 'WRONG':              return 'PIN incorrect. Try again.';
    case 'NO_PIN':             return 'This account has no PIN. Ask an admin for an enrollment QR.';
    case 'NOT_FOUND':          return 'Account not found.';
    case 'TOO_SHORT':          return 'PIN is too short.';
    case 'TOO_LONG':           return 'PIN is too long.';
    case 'NOT_NUMERIC':        return 'PIN must be digits only.';
    case 'ACCOUNT_NOT_ACTIVE': return 'Account is not active.';
    default:                   return 'Switch failed. Try again.';
  }
}

export function SwitchStaffSheet() {
  const { isOpen, closeSwitcher } = useStaffSwitcher();
  const { refresh, user } = useAuth();
  const router = useRouter();
  const [picked, setPicked] = useState<StaffPickerRow | null>(null);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);
  // Snapshot of recents read once per open. Reading on every render (the old
  // `recent={readRecent()}`) handed StaffPickerList a fresh array each time,
  // re-grouping rows mid-interaction.
  const [recent, setRecent] = useState<number[]>([]);
  const [recentReady, setRecentReady] = useState(false);
  const [query, setQuery] = useState('');

  // Reset whenever the sheet opens.
  useEffect(() => {
    if (isOpen) {
      setPicked(null);
      setPickerMessage(null);
      setQuery('');
      setRecent(readRecentSignins());
      setRecentReady(true);
    } else {
      setRecentReady(false);
    }
  }, [isOpen]);

  const submit = useCallback(async (pin: string) => {
    if (!picked) return { ok: false as const, error: 'INTERNAL' };
    const r = await fetch('/api/auth/switch', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        staffId: picked.id,
        pin,
        deviceKind: 'station',
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return { ok: false as const, error: humanError((data as { error?: string }).error) };
    }
    writeRecentSignin(picked.id);
    await refresh();
    router.refresh();
    closeSwitcher();
    return { ok: true as const };
  }, [picked, refresh, router, closeSwitcher]);

  const currentName = user?.name?.trim() || null;
  const currentStaffLabel = currentName
    ? `Currently signed in as ${currentName}`
    : 'Choose a staff member';

  return (
    <BottomSheet
      open={isOpen}
      onClose={closeSwitcher}
      title={picked ? undefined : 'Switch staff'}
      maxWidth="28rem"
      fixedWidth
      scrollBody
    >
      {picked ? (
        <StaffPinPad
          staff={picked}
          onSubmit={submit}
          onBack={() => setPicked(null)}
          submitLabel="Switch"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 text-center text-role-caption text-text-soft">{currentStaffLabel}</p>
          <div className="mt-3 shrink-0">
            <SearchField
              value={query}
              onChange={setQuery}
              onClear={() => setQuery('')}
              placeholder="Search staff"
              tone="neutral"
              size="compact"
              debounceMs={0}
              autoFocus
            />
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            <StaffPickerList
              recent={recent}
              recentReady={recentReady}
              query={query}
              onPick={(s) => { setPickerMessage(null); setPicked(s); }}
              onMessage={setPickerMessage}
            />
            {pickerMessage && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {pickerMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
