'use client';

/**
 * Items section for an unmatched (no-Zoho-PO) receiving carton.
 *
 * Mounted by {@link LineEditPanel} where {@link PoLinesAccordion} would
 * sit for a Zoho-matched carton. Every carton — receiving and Testing —
 * renders the unified one-row surface ({@link UnmatchedAccordionSurface}).
 * Testing injects verdict pills via `activeRowSlot` (same leaf slot matched
 * Testing uses on PoLinesAccordion).
 */

import { UnmatchedAccordionSurface } from './unmatched-items/UnmatchedAccordionSurface';
import type { UnmatchedItemsSectionProps } from './unmatched-items/unmatched-items-shared';

export type {
  UnfoundLine,
  UnmatchedItemsSectionProps,
} from './unmatched-items/unmatched-items-shared';

export function UnmatchedItemsSection(props: UnmatchedItemsSectionProps) {
  return <UnmatchedAccordionSurface {...props} />;
}
