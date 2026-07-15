'use client';

import { useEffect } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { applyTheme, applyAccentTheme } from '@/lib/theme/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { resolveOperatorAccentTheme } from '@/utils/operator-accent';

/**
 * Bridges the server-backed staff_preferences `theme` to the live `data-theme`
 * attribute, and the operator accent to the `theme-${accent}` class.
 * Mount once inside the authenticated tree (beside ScanHotkeySync).
 */
export function ThemeSync() {
  const { prefs } = useStaffPreferences();
  const { user } = useAuth();
  const colorVersion = useStaffColorVersion();

  useEffect(() => {
    if (!prefs) return; // server prefs not loaded yet — keep the boot value
    applyTheme(prefs.theme ?? 'light');
  }, [prefs]);

  useEffect(() => {
    if (!user?.staffId) {
      applyAccentTheme('blue');
      return;
    }
    applyAccentTheme(resolveOperatorAccentTheme(prefs, user.staffId));
  }, [user?.staffId, colorVersion, prefs?.useStaffAccent, prefs?.accentHex, prefs]);

  return null;
}
