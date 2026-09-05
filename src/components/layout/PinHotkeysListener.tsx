'use client';

/**
 * ⌘/Ctrl+1–9 jump to per-staff pins (list order). Mounted on MasterNav so
 * chords stay live even when the header pin menu is empty (nothing to pin).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import { pinSlotFromKeyboardEvent } from '@/lib/quick-access/pin-hotkeys';

export function PinHotkeysListener({
  onPinNavigate,
}: {
  onPinNavigate?: () => void;
}) {
  const router = useRouter();
  const { settings } = useQuickAccess();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const slot = pinSlotFromKeyboardEvent(e);
      if (slot == null) return;
      const target = settings.pinned[slot - 1];
      if (!target) return;
      e.preventDefault();
      onPinNavigate?.();
      router.push(target.href);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, settings.pinned, onPinNavigate]);

  return null;
}
