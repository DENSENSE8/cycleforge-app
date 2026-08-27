'use client';

import { Printer } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { TestingTerminalInput } from './types';

/**
 * Testing terminal — carton-terminal only (Pass · Print).
 *
 * Ticket replies are local controls inside the Ticket Displays body (inline
 * composer), never a dock kind — same Unbox grammar. File claim opens from
 * carton identity / Ticket empty state.
 */
export function resolveTestingTerminal(
  kind: string,
  input: TestingTerminalInput,
): TerminalActionVm | null {
  if (kind !== 'mode-default') return null;
  return {
    label: input.primaryLabel,
    title: input.primaryTitle,
    disabled: input.primaryDisabled,
    loading: input.isPrinting,
    onClick: () => void input.onPrimary(),
    icon: <Printer className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    maxWidth: 'max-w-[45rem]',
    fullWidth: true,
    docked: false,
  };
}
