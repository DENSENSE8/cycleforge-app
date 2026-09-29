import type { ExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';

/**
 * What the phone record hands the ONE resolver for its kind. The resolver
 * renders flat full-bleed blocks (the record column already draws the rules
 * between them) and at most one `DetailDock` for its verbs; after its resolve
 * mutation succeeds it calls `onResolved` — the record toasts and returns to
 * the list the exception was opened from.
 */
export interface PhoneResolverProps<F extends ExceptionFacts> {
  row: ExceptionRow;
  facts: F;
  onResolved: (message: string) => void;
}
