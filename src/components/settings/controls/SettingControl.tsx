'use client';

/**
 * Settings Registry — the control dispatcher. Renders the right input for a
 * setting's `control` type (toggle / segmented / select / number / text) and
 * calls onChange with a value the registry schema will accept. Purely
 * presentational: the panel owns which value to show and which home to write.
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, Switch } from '@/design-system/primitives';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import type { SettingDef, SettingValue } from '@/lib/settings/types';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

interface SettingControlProps {
  def: SettingDef;
  value: SettingValue;
  disabled?: boolean;
  /** Option values gated by a plan the org lacks — disabled with a lock. */
  lockedOptions?: SettingValue[];
  onChange: (value: SettingValue) => void;
}

export function SettingControl({ def, value, disabled, lockedOptions = [], onChange }: SettingControlProps) {
  switch (def.control) {
    case 'toggle':
      return (
        <Switch
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-label={def.label}
        />
      );

    case 'segmented':
      return (
        <div className="flex flex-wrap justify-end gap-1.5">
          {(def.options ?? []).map((opt) => {
            const isActive = value === opt.value;
            const optLocked = lockedOptions.some((lv) => lv === opt.value);
            const tip = optLocked ? 'Requires a higher plan' : opt.hint;
            const el = (
              <Button
                key={String(opt.value)}
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || optLocked}
                onClick={() => onChange(opt.value)}
                aria-pressed={isActive}
                className={`rounded-xl border px-3 py-1.5 text-xs disabled:opacity-40 ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                    : 'border-border-default bg-surface-card text-text-muted hover:bg-surface-hover ring-0'
                }`}
              >
                {opt.label}
                {optLocked && <span className="ml-1" aria-hidden>🔒</span>}
              </Button>
            );
            return tip ? (
              <HoverTooltip key={String(opt.value)} label={tip} asChild>
                {el}
              </HoverTooltip>
            ) : el;
          })}
        </div>
      );

    case 'select':
      return (
        <div className="relative min-w-[10rem]">
          <select
            disabled={disabled}
            value={String(value)}
            onChange={(e) => {
              const opt = (def.options ?? []).find((o) => String(o.value) === e.target.value);
              if (opt) onChange(opt.value);
            }}
            className={FILTER_DROPDOWN_SELECT_CLASS}
            aria-label={def.label}
          >
            {(def.options ?? []).map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'number':
      return (
        <div className="flex items-center gap-2">
          <input
            key={String(value)}
            type="number"
            disabled={disabled}
            defaultValue={Number(value)}
            min={def.min}
            max={def.max}
            step={def.step}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n !== Number(value)) onChange(n);
            }}
            className={cn("w-24 rounded-xl border border-border-default bg-surface-card px-3 py-1.5 text-sm text-text-default disabled:cursor-not-allowed disabled:opacity-40", focusRing("field", "accent"))}
          />
          {def.unit && <span className="text-role-caption text-text-soft">{def.unit}</span>}
        </div>
      );

    case 'text':
      return (
        <input
          key={String(value)}
          type="text"
          disabled={disabled}
          defaultValue={String(value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== String(value)) onChange(v);
          }}
          className={cn("w-48 rounded-xl border border-border-default bg-surface-card px-3 py-1.5 text-sm text-text-default disabled:cursor-not-allowed disabled:opacity-40", focusRing("field", "accent"))}
        />
      );

    default:
      return null;
  }
}
