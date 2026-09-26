'use client';

import { Check, PackageCheck } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';

interface TriageTerminalInput {
  triageSaved: boolean;
  savingTriage: boolean;
  onSaveForUnbox: () => void | Promise<void>;
}

/**
 * Single-action triage terminal — Save for unbox on every SectionTabsSlider tab.
 * Always `mode-default`.
 */
export function resolveTriageTerminal(
  kind: string,
  input: TriageTerminalInput,
): TerminalActionVm | null {
  if (kind !== 'mode-default') return null;
  return {
    label: input.triageSaved ? 'Saved ✓' : 'Save for unbox',
    title: input.triageSaved ? undefined : 'Shortcut: ⌘/Ctrl + Enter',
    onClick: () => void input.onSaveForUnbox(),
    icon: input.triageSaved ? (
      <Check className="h-4 w-4 shrink-0" />
    ) : (
      <PackageCheck className="h-4 w-4 shrink-0" />
    ),
    loading: input.savingTriage,
    disabled: input.triageSaved,
    tone: 'accent',
    maxWidth: 'max-w-[45rem]',
    fullWidth: true,
    docked: false,
  };
}
