/**
 * `/m/orders/sync` — phone order import.
 *
 * Static segment, so it resolves ahead of the sibling `[orderId]` route. Owns
 * its own top bar (see `OWN_TOP_BAR_PREFIXES` in MobileShell): X top-left, no
 * host header stacked above it.
 *
 * Reachable only from the outbound orders queue's top-bar action — no nav row,
 * because the verb belongs to the surface whose rows it changes.
 */

import { MobileOrderSyncScreen } from '@/features/orders/sync/MobileOrderSyncScreen';

export default function MobileOrderSyncPage() {
  return <MobileOrderSyncScreen />;
}
