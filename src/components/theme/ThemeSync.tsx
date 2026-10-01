'use client';

import { useEffect } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { applyTheme, applyAccentTheme } from '@/lib/theme/theme';
import { applyStationSkin } from '@/lib/theme/station-skin';
import { applyStationDepth } from '@/lib/theme/station-depth';
import { DEFAULT_STATION_DEPTH } from '@/design-system/themes/station-depths';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { resolveOperatorAccentTheme } from '@/utils/operator-accent';

/** Bridges the server-backed staff_preferences `theme` to `data-theme`, the scan-station Color to `data-station-skin`, Depth to… */
export function ThemeSync() {
  const { prefs } = useStaffPreferences();
  const { user } = useAuth();
  const colorVersion = useStaffColorVersion();
  const prefsReady = prefs != null;
  const theme = prefs?.theme;
  const stationSkin = prefs?.stationSkin;
  const stationDepth = prefs?.stationDepth;
  const useStaffAccent = prefs?.useStaffAccent;
  const accentHex = prefs?.accentHex;

  useEffect(() => {
    if (!prefsReady) return; // server prefs not loaded yet — keep the boot value
    applyTheme(theme ?? 'light');
  }, [prefsReady, theme]);

  useEffect(() => {
    if (!prefsReady) return;
    applyStationSkin(stationSkin ?? 'porcelain');
  }, [prefsReady, stationSkin]);

  useEffect(() => {
    if (!prefsReady) return;
    applyStationDepth(stationDepth ?? DEFAULT_STATION_DEPTH);
  }, [prefsReady, stationDepth]);

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
