'use client';

/**
 * One permission row in the role editor. Mirrors PageAccessSwitch but
 * generic over the source label (this one shows "on/off" only — the role
 * editor is the source of truth, so there's no Role/Granted/Revoked
 * distinction).
 */

import { requiresStepUp, type PermissionString } from '@/lib/auth/permissions-shared';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Switch } from '@/design-system/primitives/Switch';

interface PermissionToggleProps {
  label: string;
  permission: PermissionString;
  enabled: boolean;
  /** Hex color used for the on-state of the toggle. */
  color: string;
  disabled?: boolean;
  onToggle: () => void;
}

export function PermissionToggle({ label, permission, enabled, color, disabled, onToggle }: PermissionToggleProps) {
  const stepUp = requiresStepUp(permission);
  return (
    <li className={`flex items-center gap-3 px-4 py-2 transition ${disabled ? 'opacity-60' : 'hover:bg-surface-canvas/60'}`}>
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 truncate text-sm font-semibold ${enabled ? 'text-text-default' : 'text-text-soft'}`}>
          <span className="truncate">{label}</span>
          {stepUp && (
            <HoverTooltip label="Requires step-up (fresh PIN) before this action" asChild>
              <span className="rounded-full bg-surface-warning px-1 py-0 text-role-eyebrow uppercase tracking-wider text-text-warning ring-1 ring-border-warning">
                ⚡
              </span>
            </HoverTooltip>
          )}
        </div>
        <code className="truncate text-role-micro font-mono text-text-soft">{permission}</code>
      </div>
      <Switch
        checked={enabled}
        disabled={disabled}
        onCheckedChange={() => onToggle()}
        aria-label={`Toggle ${label}`}
        checkedClassName="data-[state=checked]:bg-transparent"
        style={enabled ? { backgroundColor: color } : undefined}
      />
    </li>
  );
}
