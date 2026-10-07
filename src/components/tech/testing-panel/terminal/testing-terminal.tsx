'use client';

import { Printer } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';
import { QC_VERDICTS } from '@/lib/qc/qc-verdict';
import type { TestingTerminalInput } from './types';

const PASS = QC_VERDICTS.find((spec) => spec.verdict === 'PASS')!;

/**
 * Testing terminal — the one Pass CTA: passes the active unit and prints its
 * label (the printer glyph says so). Never disabled; a press with nothing to
 * pass says why in a toast.
 */
export function resolveTestingTerminal(
  kind: string,
  input: TestingTerminalInput,
): TerminalActionVm | null {
  if (kind !== 'mode-default') return null;
  return {
    label: PASS.label,
    title: input.primaryTitle,
    hotkey: PASS.hotkey.toUpperCase(),
    onClick: () => void input.onPrimary(),
    icon: <Printer className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    maxWidth: 'max-w-[45rem]',
    fullWidth: true,
    docked: false,
  };
}
