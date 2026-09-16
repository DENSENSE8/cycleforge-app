import { MobileOnHoldList } from '@/components/mobile/onhold/MobileOnHoldList';

/**
 * `/m/on-hold` — the reconcile queue: placeholder products still holding
 * stock, each one tap from merging into its real SKU.
 */
export default function MobileOnHoldPage() {
  return <MobileOnHoldList />;
}
