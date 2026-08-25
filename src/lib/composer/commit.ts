/**
 * What the composer hands the shell when something commits. One discriminated
 * union so `useShell.onComposerCommit` is the single hydration point —
 * feed summary + orders tile for a chip, launcher-equivalent run for an
 * action, a narrated miss, prose to the assistant.
 */

import type { ShippedOrder } from '@/types/orders';
import type { FindFieldSource } from '@/lib/keyboard/find-field-scan';
import type { ComposerAction } from '@/lib/composer/actions';

export type ComposerCommit =
  | { readonly kind: 'order'; readonly order: ShippedOrder; readonly token: string; readonly source: FindFieldSource }
  | { readonly kind: 'action'; readonly action: ComposerAction }
  | { readonly kind: 'miss'; readonly token: string; readonly source: FindFieldSource }
  | { readonly kind: 'prose'; readonly text: string };
