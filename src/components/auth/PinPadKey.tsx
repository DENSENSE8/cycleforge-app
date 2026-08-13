'use client';

/**
 * @domain-job Staff-identity themed PIN numpad key cell (digit or icon).
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse Button — ds-raw-button keypad cell painted from
 *   THEME_NUMPAD identity hues (not chrome variants). Shared by StaffPinPad
 *   and SetPinPad; those jobs stay separate (sign-in vs first-time set).
 */

import type { ReactNode } from 'react';
import { numpadTheme } from '@/components/auth/theme-numpad';
import type { StationTheme } from '@/utils/staff-colors';

export function PinPadKey({
  value,
  onClick,
  disabled,
  theme,
  ariaLabel,
  icon,
}: {
  value: string;
  onClick: () => void;
  disabled?: boolean;
  theme: StationTheme;
  ariaLabel?: string;
  icon?: ReactNode;
}) {
  const t = numpadTheme(theme);
  return (
    // ds-raw-button: PIN numpad key (keypad grid cell)
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel || value}
      className={`group flex h-16 w-20 items-center justify-center rounded-2xl border border-border-soft bg-surface-card text-2xl font-semibold text-text-default shadow-sm shadow-gray-900/[0.04] transition-all duration-100 ${t.passkeyHover} hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-900/[0.08] active:scale-95 active:shadow-none focus:outline-none focus:ring-4 ${t.ring} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm`}
    >
      {icon ? <span className={t.accentText}>{icon}</span> : value}
    </button>
  );
}
