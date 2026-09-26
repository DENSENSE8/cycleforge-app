'use client';

/** Items section for an unmatched (no-Zoho-PO) receiving carton. */

import { UnmatchedAccordionSurface } from './unmatched-items/UnmatchedAccordionSurface';
import type { UnmatchedItemsSectionProps } from './unmatched-items/unmatched-items-shared';

export type {
  UnfoundLine,
  UnmatchedItemsSectionProps,
} from './unmatched-items/unmatched-items-shared';

export function UnmatchedItemsSection(props: UnmatchedItemsSectionProps) {
  return <UnmatchedAccordionSurface {...props} />;
}
