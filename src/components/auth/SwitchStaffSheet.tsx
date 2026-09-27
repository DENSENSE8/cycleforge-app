'use client';

/** Modal sheet for switching the active staff at a shared station — PINLESS. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { StaffPickerList, type StaffPickerRow } from '@/components/auth/StaffPickerList';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SearchField } from '@/design-system/primitives/SearchField';
import { readRecentSignins, writeRecentSignin } from '@/lib/auth/recent-signins';
import { isMobileFirstPath } from '@/lib/mobile/mobile-first-surface';
import { armBootSplash, readWelcomeThemeOverride, WELCOME_PLAY_EVENT } from '@/lib/boot-flag';
import { resolveWelcomeTheme } from '@/components/boot/welcome/welcome-theme';
import { getStaffColorHex } from '@/utils/staff-colors';
import { staffInitials } from '@/design-system/components/StaffBadge';
import { photoContentUrl } from '@/lib/photos/display-url';

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

  // Tap = switch.
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
      // Desktop only: the mobile tree hosts no welcome, so a stash there would
      // linger and replay on the next desktop load.
      const desktop = !isMobileFirstPath(window.location.pathname);
      if (desktop) {
        const photoId = row.avatar_photo_id ?? null;
        armBootSplash({
          name: row.name,
          colorHex: getStaffColorHex({ id: row.id, color_hex: row.color_hex }),
          avatarUrl: photoId && photoId > 0 ? photoContentUrl(photoId, 'thumb') : undefined,
          initials: staffInitials(row.name),
          themeId: resolveWelcomeTheme(new Date(), readWelcomeThemeOverride()).id,
        });
      }
      await refresh();
      router.refresh();
      closeSwitcher();
      // In-place switch (no navigation): the shell host plays the welcome once
      // AuthContext carries the new staffer (refresh() committed it above).
      if (desktop) window.dispatchEvent(new Event(WELCOME_PLAY_EVENT));
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
      // Phones get the whole viewport:
      fullScreen
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
