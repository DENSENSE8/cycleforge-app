'use client';

/**
 * Dock CTA for the Testing `works_as_listed` step.
 *
 * Yes → operator continues to Pass · Print (terminal).
 * No → Fail path + claim with issue prefill for seller-message assist.
 */

import { Check, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

export function WorksAsListedDockControl({
  onAsListed,
  onNotAsListed,
  busy,
}: {
  onAsListed: () => void;
  onNotAsListed: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex h-11 min-w-0 items-center gap-1.5" data-testing-works-as-listed>
      <Button
        variant="primary"
        size="sm"
        disabled={busy}
        icon={<Check className="h-3.5 w-3.5" />}
        ariaLabel="Works as listed — continue to Pass and Print"
        onClick={onAsListed}
      >
        As listed
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        icon={<X className="h-3.5 w-3.5" />}
        ariaLabel="Not as listed — open claim"
        onClick={onNotAsListed}
      >
        Not as listed
      </Button>
    </div>
  );
}
