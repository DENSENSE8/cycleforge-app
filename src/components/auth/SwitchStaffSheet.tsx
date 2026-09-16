'use client';

/**
 * Modal sheet for switching the active staff at a shared station — PINLESS.
 *
 *   1. Picker — same row layout as /signin (StaffPickerList)
 *   2. Tap = switch — POST /api/auth/act-as-staff, the same PIN-less mint
 *      the email login's staff picker performs. No PIN pad.
 *
 * On success, refreshes AuthContext and re-renders server components so the
 * sidebar and any page that reads useAuth() picks up the new identity
 * without a full reload.
 *
 * Callers: WarehouseShell (mounted once app-wide; opened from any surface
 * via useStaffSwitcher). API: /api/auth/act-as-staff.
 * User (2026-09-15): "the switch staff should not have a pin. It should be
 * pinless, just like the native login using email."
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { StaffPickerList, type StaffPickerRow } from '@/components/auth/StaffPickerList';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SearchField } from '@/design-system/primitives/SearchField';
import { readRecentSignins, writeRecentSignin } from '@/lib/auth/recent-signins';

function humanError(code: string | undefined): string {
  switch (code) {
    case 'NOT_SHARED_ORG':  return 'Pinless switching needs a shared-account workspace.';
    case 'TARGET_NOT_FOUND':
    case 'CROSS_ORG':       return 'Account not found.';
    case 'TARGET_INACTIVE': return 'Account is not active.';
    case 'NO_SESSION':      return 'Session expired — sign in again.';
    case 'RATE_LIMITED':    return 'Too many switches. Wait a moment and try again.';
    default:                return 'Switch failed. Try again.';
  }
}

export function SwitchStaffSheet() {
  const { isOpen, closeSwitcher } = useStaffSwitcher();
  const { refresh, user } = useAuth();
  const router = useRouter();
  const [picked, setPicked] = useState<StaffPickerRow | null>(null);
  const [busy, setBusy] = useState(false);
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
      setBusy(false);
      setPickerMessage(null);
      setQuery('');
      setRecent(readRecentSignins());
      setRecentReady(true);
    } else {
      setRecentReady(false);
    }
  }, [isOpen]);

  // Tap = switch. The mint itself is the email login's PIN-less act-as: the
  // already-signed-in session is the gate, org + active-staff checks are the
  // route's. `persistent` is omitted on purpose — a re-mint on the same
  // device inherits the session's persistence choice.
  const switchTo = useCallback(async (row: StaffPickerRow) => {
    if (busy) return;
    setPicked(row);
    setPickerMessage(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/act-as-staff', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: row.id, deviceKind: 'station' }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setPickerMessage(humanError((data as { error?: string }).error));
        setPicked(null);
        return;
      }
      writeRecentSignin(row.id);
      await refresh();
      router.refresh();
      closeSwitcher();
    } catch {
      setPickerMessage('Switch failed. Try again.');
      setPicked(null);
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, router, closeSwitcher]);

  const currentName = user?.name?.trim() || null;
  const statusLabel = busy && picked
    ? `Switching to ${picked.name}…`
    : currentName
      ? `Currently signed in as ${currentName}`
      : 'Choose a staff member';

  return (
    <BottomSheet
      open={isOpen}
      onClose={closeSwitcher}
      title="Switch staff"
      maxWidth="28rem"
      fixedWidth
      scrollBody
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="shrink-0 text-center text-role-caption text-text-soft">{statusLabel}</p>
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
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain p-0.5 [scrollbar-gutter:stable]">
          <StaffPickerList
            recent={recent}
            recentReady={recentReady}
            query={query}
            onPick={(s) => { void switchTo(s); }}
            onMessage={setPickerMessage}
            flat
            excludeStaffId={user?.staffId}
          />
          {pickerMessage && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {pickerMessage}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
