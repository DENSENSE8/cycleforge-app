'use client';

import { ReasonChipPicker } from '@/components/ui/ReasonChipPicker';
import { SUBSTITUTION_REASONS, type SubstitutionReason } from '@/lib/fulfillment/substitution-reasons';

/** Reason picker for a fulfillment substitution. */

interface SubstituteReasonPickerProps {
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
