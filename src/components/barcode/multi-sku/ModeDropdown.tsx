'use client';

import { ChevronDown } from '@/components/Icons';
import { BARCODE_MODES, type BarcodeMode } from '@/components/barcode/ModeSelector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';

interface ModeDropdownProps {
  mode: BarcodeMode;
  onChange: (next: BarcodeMode) => void;
}

/**
 * Compact print/log/reprint switcher pinned to the top of the horizontal
 * workspace. `onChange` is the controller's handleModeChange, which writes
 * `?mode=` and resets the step progression.
 */
export function ModeDropdown({ mode, onChange }: ModeDropdownProps) {
  const current = BARCODE_MODES.find((m) => m.id === mode) ?? BARCODE_MODES[0];
  const CurrentIcon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          className="ds-raw-button flex w-full items-center gap-3 rounded-xl border border-border-soft bg-surface-card px-3 py-2.5 text-left transition-colors hover:border-border-default data-[state=open]:rounded-b-none data-[state=open]:border-b-0"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <CurrentIcon className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-role-caption font-black uppercase tracking-[0.14em] text-text-default">
              {current.label}
            </span>
            <span className="truncate text-role-micro font-medium text-text-soft">
              {current.description}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-faint transition-transform [[data-state=open]_&]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={0}
        className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-t-none rounded-b-xl border-t-0 p-0 shadow-lg"
      >
        {BARCODE_MODES.filter(({ id }) => id !== mode).map(({ id, label, description, Icon }) => (
          <DropdownMenuItem
            key={id}
            onSelect={() => onChange(id)}
            className="gap-3 rounded-none px-3 py-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-soft">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-role-caption font-black uppercase tracking-[0.14em] text-text-default">
                {label}
              </span>
              <span className="truncate text-role-micro font-medium text-text-soft">{description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
