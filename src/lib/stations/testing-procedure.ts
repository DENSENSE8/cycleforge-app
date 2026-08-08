/**
 * Testing QC procedure vocabulary — distinct from Unbox `FOUND_CAPTURE`.
 *
 * Dock CTAs live on TestingDockHost; listing + seller-claimed condition facts
 * live on Displays (`listing` leaf). Never import Unbox dock registries here.
 */

/** Ordered QC capture steps (reference → verdict). */
const TESTING_QC_CAPTURE = ['listing_context', 'works_as_listed'] as const;

type TestingQcStepKey = (typeof TESTING_QC_CAPTURE)[number];

export const TESTING_QC_STEP_LABEL: Record<TestingQcStepKey, string> = {
  listing_context: 'Listing',
  works_as_listed: 'Works as listed',
};

/** Steps with no dock CTA — Displays holds the reference. */
const TESTING_STEPS_WITHOUT_DOCK_ACTION: Readonly<Record<string, string>> = {
  listing_context:
    'reference on Displays (listing URL + seller-claimed condition) — dock does not capture it',
};

/** Guard / vocabulary consumers: capture keys that have no dock CTA. */
export function testingQcStepsWithoutDockAction(): readonly string[] {
  return Object.keys(TESTING_STEPS_WITHOUT_DOCK_ACTION);
}

/** Full QC capture key list (for guards / procedure registries). */
export function testingQcCaptureKeys(): readonly string[] {
  return [...TESTING_QC_CAPTURE];
}
