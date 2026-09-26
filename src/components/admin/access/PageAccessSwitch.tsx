'use client';

/** One row in the "Page access" card: */

import { type StationTheme } from '@/utils/staff-colors';
import type { PermissionSource } from '@/lib/auth/permissions-shared';
import { Switch } from '@/design-system/primitives/Switch';

interface PageAccessSwitchProps {
  label: string;
  permission: string;
  enabled: boolean;
  source: PermissionSource;
  theme: StationTheme;
  disabled?: boolean;
  busy?: boolean;
  onToggle: () => void;
}

const SOURCE_PILL: Record<PermissionSource, { className: string; text: string }> = {
  role:          { className: 'bg-surface-sunken text-text-muted ring-border-soft',          text: 'Role' },
  granted:       { className: 'bg-emerald-100 text-emerald-800 ring-emerald-200', text: 'Granted' },
  revoked:       { className: 'bg-rose-100 text-rose-800 ring-rose-200',          text: 'Revoked' },
  'role-denies': { className: 'bg-surface-sunken text-text-soft ring-border-soft',          text: 'Role denies' },
};

/** Static Tailwind classes so JIT sees every theme (dynamic `bg-${x}` is purged). */
const THEME_CHECKED: Record<StationTheme, string> = {
  green: 'data-[state=checked]:bg-emerald-600',
  blue: 'data-[state=checked]:bg-blue-600',
  purple: 'data-[state=checked]:bg-purple-600',
  yellow: 'data-[state=checked]:bg-amber-500',
  black: 'data-[state=checked]:bg-slate-800', // ds-allow-raw-neutral: identity hue — staff theme switch
  red: 'data-[state=checked]:bg-red-600',
  lightblue: 'data-[state=checked]:bg-sky-500',
  pink: 'data-[state=checked]:bg-pink-600',
};

export function PageAccessSwitch({ label, permission, enabled, source, theme, disabled, busy, onToggle }: PageAccessSwitchProps) {
  const pill = SOURCE_PILL[source];
  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 transition ${disabled ? 'opacity-60' : 'hover:bg-surface-canvas/60'}`}>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-semibold ${enabled ? 'text-text-default' : 'text-text-soft'}`}>{label}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <code className="truncate text-role-micro font-mono text-text-soft">{permission}</code>
          <span className={`rounded-full inset-chip text-role-eyebrow uppercase tracking-wider ring-1 ring-inset ${pill.className}`}>
            {pill.text}
          </span>
        </div>
      </div>
      <Switch
        checked={enabled}
        disabled={disabled || busy}
        onCheckedChange={() => onToggle()}
        aria-label={`Toggle ${label}`}
        checkedClassName={THEME_CHECKED[theme]}
      />
    </li>
  );
}
