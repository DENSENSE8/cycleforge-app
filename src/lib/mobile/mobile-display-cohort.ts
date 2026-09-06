/**
 * Mobile display cohort — the control and type law for every `/m` surface.
 *
 * ## Why this exists
 *
 * The house had a 44px touch floor and nothing that said what 44px was a floor
 * FOR. So it was applied to the painted box: `min-h-11` on every control,
 * `size="lg"` (which resolves to `h-14`, 56px, in mobile mode) on confirms, two
 * of them side by side for one action. A phone screen got spent on chrome
 * because a rule was applied without the distinction the rule itself makes.
 *
 * Apple makes that distinction explicitly. The 44×44 figure is the HIT REGION;
 * the visible control may be smaller than the area that accepts the tap
 * (Apple HIG, Buttons; "UI Design Dos and Don'ts": "Create controls that
 * measure at least 44 points x 44 points so they can be accurately tapped with
 * a finger."). WCAG 2.2 SC 2.5.8 sets a lower floor still — 24×24 CSS px at
 * Level AA — with an explicit spacing exception for undersized targets.
 *
 * So: paint small, hit big. That is the whole law, and everything below is its
 * consequences.
 *
 * ## Text has a floor; controls do not
 *
 * Apple: "Text should be at least 11 points so it's legible at a typical
 * viewing distance without zooming." Our `role-micro` is 10px, which is under
 * it — and it was carrying stamps, actor names, status pills and server
 * messages on the scan station. "Make everything smaller" therefore stops at
 * `role-eyebrow` (11px), and the shrink is spent on CONTROLS instead.
 *
 * ## Enforcement, three layers
 *
 * 1. CI — `scripts/ci/check-mobile-display-law.mjs` greps every rule below and
 *    blocks the PR. Deterministic, no engine required.
 * 2. Eval — `mobile-display-cohort.test.ts` is the tripwire, asserted against
 *    EVERY member of {@link MOBILE_DISPLAY_COHORT}, so a new mobile surface has
 *    to join the cohort or fail. Run by `pnpm run eval:cohort mobile-display`
 *    and by `eval:station scan-out`.
 * 3. Checksum — {@link mobileDisplayLawSource} is hashed into the eval receipt,
 *    so the law cannot be quietly edited to make a violation legal.
 *
 * Adding a mobile surface → append a row. Do not special-case one screen.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The three control sizes a mobile surface may use.
 *
 * `paint` is the drawn box. `hit` is the minimum interactive region, which the
 * control reaches with padding — never by growing the paint.
 *
 * Operator 2026-09-05, on a gloved dock: 28 / 36 / 44. The gloved hand argues
 * for more SPACING between targets, not more paint per target, which is exactly
 * what WCAG's 24px spacing exception encodes.
 */
export const MOBILE_CONTROL_LADDER = {
  /** Inside a field or a row — a confirm next to text the operator is typing. */
  inline: { paint: 28, hit: 44 },
  /** A row-level action; one per row at most. */
  row: { paint: 36, hit: 44 },
  /** The screen's single primary action. The one place paint == hit. */
  cta: { paint: 44, hit: 44 },
} as const;

export type MobileControlSize = keyof typeof MOBILE_CONTROL_LADDER;

/** Apple's legibility floor, in CSS px. Nothing on `/m` renders below it. */
export const MOBILE_MIN_TEXT_PX = 11;

/**
 * Type roles a mobile surface may render, smallest first.
 *
 * `role-micro` (10px) is absent on purpose — it is below
 * {@link MOBILE_MIN_TEXT_PX}. `role-eyebrow` (11px) is the floor.
 */
export const MOBILE_TEXT_ROLES = [
  'text-role-eyebrow',
  'text-role-caption',
  'text-role-nav',
  'text-role-data',
  'text-role-body',
  'text-role-title',
] as const;

/** Banned outright on `/m`: below Apple's 11pt legibility floor. */
export const MOBILE_BANNED_TEXT_ROLES = ['text-role-micro'] as const;

/**
 * Painted control heights that are never allowed on a mobile surface.
 *
 * `h-14` is 56px — the `size="lg"` mobile branch. It is a desk-sized commit on
 * a phone and it is what produced the bloat this law exists to stop.
 */
export const MOBILE_BANNED_CONTROL_CLASSES = ['h-14', 'min-h-14'] as const;

/**
 * How many distinct type roles one mobile component may render.
 *
 * Two. Hierarchy on a phone comes from weight and ground, not from a third
 * size — a scale spanning 10-14px cannot build hierarchy by size anyway, so it
 * silently pushes the job onto colour, and the colour then has to carry meaning
 * it cannot carry accessibly.
 */
export const MOBILE_MAX_TYPE_ROLES_PER_FILE = 2;

/** At most one screen-primary control per mobile surface. */
export const MOBILE_MAX_CTA_PER_SURFACE = 1;

export type MobileDisplayMember = {
  /** Short id for assert messages and the eval ledger. */
  id: string;
  /** Route the operator opens. */
  route: string;
  /** Repo-relative files this surface owns, all of them law-bound. */
  files: readonly string[];
  /** Human label for LEDGERs. */
  label: string;
};

/**
 * Every `/m` surface bound by this law.
 *
 * Deliberately NOT "all of src/components/mobile": a cohort that silently
 * covers everything is a cohort nobody can add to safely. A surface joins by
 * appearing here, and the CI rule scans exactly these files.
 */
export const MOBILE_DISPLAY_COHORT: readonly MobileDisplayMember[] = [
  {
    id: 'scan-out',
    route: '/m/scan-out',
    label: 'Scan out (dock ship-confirm)',
    files: [
      'src/components/mobile/station/MobileStationShell.tsx',
      'src/components/mobile/station/MobileStationSheet.tsx',
      'src/components/mobile/station/MobileStationTapeItem.tsx',
      'src/components/mobile/station/MobileCaptureWindow.tsx',
      'src/components/mobile/station/station-chrome.ts',
      'src/components/mobile/redesign/MobileScanOut.tsx',
    ],
  },
  {
    id: 'arrival',
    route: '/m/triage',
    label: 'Arrival (door intake)',
    files: [
      // The station files above are shared with scan-out and are already
      // law-bound there; listed once, scanned once. What arrival adds is its
      // own body.
      'src/components/mobile/receiving/MobileArrivalStation.tsx',
    ],
  },
  {
    // Not a route: the chrome every `/m` route wears. It belongs in the cohort
    // because it is the single largest fixed cost on a phone screen — a bar
    // that grows by 20px spends 20px on twenty surfaces — and because nothing
    // else was checking it. It was 60px tall with an 18px title until
    // 2026-09-05.
    id: 'shell-chrome',
    route: '/m/*',
    label: 'Mobile host chrome (top bar + shell)',
    files: [
      'src/components/mobile/redesign/MobileShell.tsx',
      'src/components/mobile/redesign/MobileTopBar.tsx',
      'src/components/mobile/redesign/mobile-scan-cta.tsx',
      'src/components/mobile/redesign/MobilePreviewSheet.tsx',
      'src/components/mobile/redesign/MobileStackSheet.tsx',
      'src/components/mobile/redesign/MobileSidebarDrawer.tsx',
    ],
  },
  {
    // Queues: compact chrome + ladder + type cap, but no capture sheet —
    // these surfaces list work, they do not commit scans (v1 item 3).
    id: 'queues',
    route: '/m/home, /m/work',
    label: 'Queues (home + assigned work)',
    files: [
      'src/components/mobile/redesign/Dashboard.tsx',
      'src/components/mobile/redesign/AssignedOrders.tsx',
      'src/components/mobile/redesign/MobileAssignedOrdersGroup.tsx',
    ],
  },
  {
    // v1 item 4: the rest of the (shell) family, law-audited. Violations here
    // are fixed mechanically only (banned type role, oversized control paint).
    id: 'shell-rest',
    route: '/m/*',
    label: 'Remaining /m surfaces (pick, receiving feed, identify, checklist, companion)',
    files: [
      'src/components/mobile/redesign/PickQueue.tsx',
      'src/components/mobile/redesign/ReceivingLive.tsx',
      'src/components/mobile/identify/MobileIdentify.tsx',
      'src/components/mobile/checklist/MobileChecklistPage.tsx',
      'src/components/mobile/companion/MobileCompanionComposer.tsx',
    ],
  },
];

/** Every file the law covers, flattened. */
export function mobileDisplayLawFiles(): string[] {
  return MOBILE_DISPLAY_COHORT.flatMap((m) => [...m.files]);
}

/** This module's own source — hashed into the eval receipt. */
export function mobileDisplayLawSource(repoRoot: string): string {
  return readFileSync(
    path.join(repoRoot, 'src/lib/mobile/mobile-display-cohort.ts'),
    'utf8',
  );
}

/** Manifest the eval runner and the ledger read. */
export function mobileDisplayEvalManifest() {
  return {
    cohort: 'mobile-display',
    tripwire: 'src/lib/mobile/mobile-display-cohort.test.ts',
    ladder: MOBILE_CONTROL_LADDER,
    minTextPx: MOBILE_MIN_TEXT_PX,
    members: MOBILE_DISPLAY_COHORT.map((m) => m.id),
    files: mobileDisplayLawFiles(),
  };
}
