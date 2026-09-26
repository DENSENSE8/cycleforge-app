'use client';

/** Clipboard side of a rail row's Copy verbs. */

import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';

/** Copy one identity value, naming it in the confirmation. */
export function copyRailValue(value: string, label: string): void {
  void copyToClipboard(value, { historyKind: label }).then((ok) =>
    ok ? toast.success(`Copied ${label}`) : toast.error(`Could not copy ${label}`),
  );
}
