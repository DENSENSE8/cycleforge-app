/**
 * Mobile bulk-print procedure — one step per full page, Continue.
 *
 * SoT for `/m/print`. Two families: location labels (bay / bin), which walk the
 * room → aisle → bays → levels ladder to derive their codes, and totes, which
 * have no ladder at all — a tote's code is a database serial, so the only
 * question is HOW MANY. Printer then display ladder, Print last.
 */

export const MOBILE_PRINT_STEPS = [
  'job',
  'options',
  'count',
  'room',
  'aisle',
  'bays',
  'levels',
  'preview',
  'ack',
  'print',
] as const;

export type MobilePrintStep = (typeof MOBILE_PRINT_STEPS)[number];

export type MobilePrintJobKind = 'rack' | 'bin' | 'tote';

/** Printer/service first, then the display ladder, Print last. */
const LOCATION_STEPS: readonly MobilePrintStep[] = MOBILE_PRINT_STEPS.filter(
  (s) => s !== 'count',
);

/** A tote run has no coordinates to build — just how many plates to peel. */
const TOTE_STEPS: readonly MobilePrintStep[] = [
  'job',
  'options',
  'count',
  'preview',
  'ack',
  'print',
];

export function mobilePrintHref(step: MobilePrintStep): string {
  return `/m/print?step=${step}`;
}

export function parseMobilePrintStep(raw: string | null | undefined): MobilePrintStep {
  const value = String(raw ?? '').trim();
  return (MOBILE_PRINT_STEPS as readonly string[]).includes(value)
    ? (value as MobilePrintStep)
    : 'job';
}

export function mobilePrintVisibleSteps(
  kind: MobilePrintJobKind | null,
): readonly MobilePrintStep[] {
  return kind === 'tote' ? TOTE_STEPS : LOCATION_STEPS;
}

export function mobilePrintStepIndex(
  step: MobilePrintStep,
  kind: MobilePrintJobKind | null,
): number {
  return mobilePrintVisibleSteps(kind).indexOf(step);
}

export function nextMobilePrintStep(
  step: MobilePrintStep,
  kind: MobilePrintJobKind | null,
): MobilePrintStep | null {
  const rail = mobilePrintVisibleSteps(kind);
  const i = rail.indexOf(step);
  if (i < 0 || i >= rail.length - 1) return null;
  return rail[i + 1] ?? null;
}

export function prevMobilePrintStep(
  step: MobilePrintStep,
  kind: MobilePrintJobKind | null,
): MobilePrintStep | null {
  const rail = mobilePrintVisibleSteps(kind);
  const i = rail.indexOf(step);
  if (i <= 0) return null;
  return rail[i - 1] ?? null;
}

export const MOBILE_PRINT_DRAFT_KEY = 'cf.mobilePrintDraft';
