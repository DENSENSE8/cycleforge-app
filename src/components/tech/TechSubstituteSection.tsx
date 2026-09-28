'use client';

import { RefreshCw } from '@/components/Icons';
import { SubstituteUnitCard } from '@/components/fulfillment/SubstituteUnitCard';

/** "Substitute unit" section for the `/pick` active-order workspace — a thin wrapper over the shared fulfillment SubstituteUnitCard (do not… */
interface TechSubstituteSectionProps {
  orderId: number;
  orderLabel: string;
  enforcement?: 'advisory' | 'block_until_approved';
}

export function TechSubstituteSection({
  orderId,
  orderLabel,
  enforcement = 'advisory',
}: TechSubstituteSectionProps) {
  return (
    // Section separator per the wiring plan §5 Phase 1.4 (semantic token for
    // the hairline — border-border-soft is the theme-registry gray-200).
    <section className="mt-5 border-t border-border-soft pt-5" data-testid="tech-substitute-section">
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-role-eyebrow text-text-soft">
          <RefreshCw className="h-3.5 w-3.5" />
          Substitute unit
        </p>
        <SubstituteUnitCard
          orderId={orderId}
          orderLabel={orderLabel}
          raisedAtNode="test"
          enforcement={enforcement}
        />
      </div>
    </section>
  );
}
