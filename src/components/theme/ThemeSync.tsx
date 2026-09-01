'use client';

import { useEffect } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { applyTheme, applyAccentTheme } from '@/lib/theme/theme';
import { applyStationSkin } from '@/lib/theme/station-skin';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { resolveOperatorAccentTheme } from '@/utils/operator-accent';

/**
 * Bridges the server-backed staff_preferences `theme` to `data-theme`, the
 * scan-station skin to `data-station-skin`, and the operator accent to the
 * `theme-${accent}` class.
 * Mount once inside the authenticated tree (beside ScanHotkeySync).
 *
 * Deps are the theme/accent *fields* — never the whole `prefs` object identity
 * (every unrelated staff-preferences write used to re-touch <html>).
 */
export function ThemeSync() {
  const { prefs } = useStaffPreferences();
  const { user } = useAuth();
  const colorVersion = useStaffColorVersion();
  const prefsReady = prefs != null;
  const theme = prefs?.theme;
  const stationSkin = prefs?.stationSkin;
  const useStaffAccent = prefs?.useStaffAccent;
  const accentHex = prefs?.accentHex;

  useEffect(() => {
    if (!prefsReady) return; // server prefs not loaded yet — keep the boot value
    applyTheme(theme ?? 'light');
  }, [prefsReady, theme]);

  useEffect(() => {
    if (!prefsReady) return;
    applyStationSkin(stationSkin ?? 'industrial');
  }, [prefsReady, stationSkin]);

  useEffect(() => {
    if (!user?.staffId) {
      applyAccentTheme('blue');
      return;
    }
    if (!prefsReady) return;
    applyAccentTheme(
      resolveOperatorAccentTheme({ useStaffAccent, accentHex }, user.staffId),
    );
  }, [user?.staffId, colorVersion, prefsReady, useStaffAccent, accentHex]);

  return null;
}
