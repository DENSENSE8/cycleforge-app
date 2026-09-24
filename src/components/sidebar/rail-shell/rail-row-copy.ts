'use client';

/**
 * Clipboard side of a rail row's Copy verbs. Split from `rail-row-verbs`
 * (which decides WHICH items a row offers) so that module stays pure and
 * unit-testable — importing it must not drag the toaster and the DOM clipboard
 * shim into a node test.
 */

import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';

/** Copy one identity value, naming it in the confirmation. */
export function copyRailValue(value: string, label: string): void {
  void copyToClipboard(value, { historyKind: label }).then((ok) =>
    ok ? toast.success(`Copied ${label}`) : toast.error(`Could not copy ${label}`),
  );
}
