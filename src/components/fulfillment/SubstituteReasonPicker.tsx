'use client';

import { ReasonChipPicker } from '@/components/ui/ReasonChipPicker';
import { SUBSTITUTION_REASONS, type SubstitutionReason } from '@/lib/fulfillment/substitution-reasons';

/**
 * Reason picker for a fulfillment substitution. Presentational + controlled —
 * the parent owns the selected code, and reasons + tones come from the SoT
 * (substitution-reasons.ts).
 *
 * The chip chrome itself now lives in the shared `ReasonChipPicker`
 * (`@/components/ui/ReasonChipPicker`), promoted when the receiving
 * photo-policy waiver needed the same job. This stays as the substitution
 * vocabulary's named entry point — same props, same markup, one primitive.
 */

export interface SubstituteReasonPickerProps {
  value: string | null;
  onChange: (code: string) => void;
  reasons?: readonly SubstitutionReason[];
  className?: string;
}

export function SubstituteReasonPicker({
  value,
  onChange,
  reasons = SUBSTITUTION_REASONS,
  className,
}: SubstituteReasonPickerProps) {
  return (
    <ReasonChipPicker
      value={value}
      onChange={onChange}
      options={reasons}
      ariaLabel="Substitution reason"
      className={className}
    />
  );
}
