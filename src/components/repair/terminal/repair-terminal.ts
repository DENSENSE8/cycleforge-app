/**
 * Repair intake terminal — Next / Submit CTA via StationTerminalDock.
 */

'use client';

import type { TerminalActionVm } from '@/lib/station-terminal';

export interface RepairTerminalContext {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  maxWidth?: string;
}

export function resolveRepairTerminal(
  kind: string,
  ctx: RepairTerminalContext,
): TerminalActionVm | null {
  if (kind !== 'mode-default') return null;

  return {
    label: ctx.label,
    onClick: ctx.onClick,
    disabled: ctx.disabled,
    loading: ctx.loading,
    title: ctx.title,
    tone: 'gray',
    maxWidth: ctx.maxWidth ?? 'max-w-[720px]',
    fullWidth: true,
    docked: true,
  };
}
