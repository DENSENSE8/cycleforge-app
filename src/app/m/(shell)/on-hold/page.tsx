import { MobileOnHoldList } from '@/components/mobile/onhold/MobileOnHoldList';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/**
 * `/m/on-hold` — the reconcile queue: placeholder products still holding
 * stock, each one tap from merging into its real SKU.
 */
export default function MobileOnHoldPage() {
  return (
    <ModeRegion mode="triage" className="contents">
      <MobileOnHoldList />
    </ModeRegion>
  );
}
