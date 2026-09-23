/**
 * Mobile-first surface — machine checklist (repo-wide).
 *
 * Human SoT: docs/mobile-first/SURFACE_LAW.md
 * Cursor: .cursor/rules/mobile-first-surface.mdc
 *
 * Callers: agents / future eval:cohort mobile-first / route audits.
 * No data schemas. Operator 2026-09-10: every product verb must be doable on
 * /m first; not warehouse-OS-only.
 * User: "span repo-wide" / "do everything on the mobile app first."
 */

/**
 * Phone shell route prefixes that count as mobile SoT entrypoints.
 *
 * 2026-09-14 audit: 20 of 44 `/m` page routes were absent from this list,
 * including `/m/id/*` — the identification kernel the operator ruling names as
 * THE mobile surface — plus `/m/claim` and `/m/on-hold`. Anything built on
 * `hasRegisteredMobilePrefix` therefore disowned half the phone surface, so a
 * scan-out or a claim read as "not a mobile route at all". Registered by shell
 * FAMILY rather than leaf path, so new leaves under a known kernel cannot fall
 * out again silently.
 */
export const MOBILE_FIRST_ROUTE_PREFIXES = [
  '/m/work',
  '/m/pick',
  '/m/scan',
  // `/m/unbox` was here until 2026-09-15. It is deleted, not merely un-rowed:
  // it was a SECOND scan door (Track U), and Inbound on the phone is now the
  // photo feed alone.
  '/m/receive',
  '/m/receiving',
  '/m/triage',
  '/m/identify',
  '/m/print',
  '/m/orders',
  '/m/pack',
  '/m/shipping',
  '/m/exceptions',
  '/m/signin',
  '/m/qr-auth',
  // Callers: mobile nav. User: "mobile first design" / complete intake on phone.
  '/m/consult',
  '/m/settings',
  // The phone twin of the desk header inbox (2026-09-22). `SURFACE_LAW` §1
  // refuses a desk-only surface, so the inbox door and the tracking-watch verb
  // both answer here.
  '/m/inbox',
  // Assigned tasks are NOT their own surface any more (operator 2026-09-23:
  // one task system). `/m/home` renders checks and `work_assignments`
  // `FOLLOW_UP` rows as one list and finishes both, so the phone twin of the
  // desk tasks workbench is Daily. `/m/tasks` survives only as a redirect for
  // old bookmarks, which is not a surface and is not registered.
  // Identification kernel — the 2026-09-14 ruling's canonical mobile surface.
  // `/m/id/pick/[orderId]` and `/m/id/scan-out/[orderId]` are OUTBOUND verbs
  // and were unregistered until the audit.
  '/m/id',
  // Outbound / QC decision surfaces that existed but were unregistered.
  '/m/claim',
  '/m/on-hold',
  // Entity deep links the floor reaches by SCANNING a code: unit, receiving
  // line, RMA/return, history, raw barcode, packer-photo upload target,
  // device pairing, enrolment.
  '/m/u',
  '/m/r',
  '/m/rs',
  '/m/h',
  '/m/b',
  '/m/p',
  '/m/pair',
  '/m/enroll',
  '/m/unit-photos',
  // The manager read (Track R2). Registered the RIGHT way round — the phone
  // surface exists before the desk Staff family, which is the law, not an
  // ordering preference (SURFACE_LAW §1). Operator 2026-09-14: *"I want to add
  // a reports page … view all of the daily reports for all of the staff as
  // well"*, plus 2026-09-15 *"view only in a manager"*. This EXTENDS the U2
  // kept set rather than contradicting it — see nav-lanes-reports-IA-PLAN §1.7.
  '/m/reports',
  // CANONICAL MOBILE LANDING (operator 2026-09-15): `/m/home` is the nav
  // registry's Daily leaf and the post-org-switch landing for any switch
  // started on a phone route (`identity/switch-org.ts` routes on
  // `isMobileFirstPath`, so it must be registered here or the checklist calls
  // the landing a non-mobile path). There is no `/m` root page — the landing
  // IS this leaf. Reversed from the 2026-09-14 deletion; see note below.
  '/m/home',
] as const;
// `/m/pack` returned 2026-09-17 as the phone's dedicated packing history and
// capture-evidence surface. It is deliberately `partial`: starting/confirming
// a pack remains a future mobile completion increment. `/m/search` remains
// absent because it never shipped as a mobile surface.
// Deleted 2026-09-15 (operator ruling — *"remove the checklist from the
// mobile display and the checklist components, they are old components from
// the mobile app itself"*): /m/checklist. The route, its page and
// `src/components/mobile/checklist/**` are gone; the earlier "kept for
// repurposing" note is retired. Kit-parts / QC authoring is a desk verb.

export type MobileFirstRoutePrefix = (typeof MOBILE_FIRST_ROUTE_PREFIXES)[number];

/**
 * Outbound workflow contract — the shared behavioral waist between phone,
 * desk, and station presentations.
 *
 * Mobile owns the job order and completion path. Desktop may project the same
 * facts into DataTable density; it must not import phone presentation
 * components or invent a second status machine. `legacyMobilePaths` are route
 * compatibility only and must never become a second navigation door.
 */
export const OUTBOUND_WORKFLOW_CONTRACT_VERSION = '1.8.0' as const;

export const OUTBOUND_WORKFLOW_SURFACES = {
  orders: {
    label: 'Order management',
    canonicalMobilePath: '/m/orders',
    legacyMobilePaths: ['/m/work'],
    desktopPath: '/shipping/orders',
    presentation: {
      mobile: 'flat hairline rows + task-local detail',
      desktop: 'DataTable density projection',
    },
  },
  picks: {
    label: 'Picks',
    canonicalMobilePath: '/m/pick',
    legacyMobilePaths: [],
    desktopPath: '/shipping/orders',
    presentation: {
      mobile: 'location-led allocation rows + pick session',
      desktop: 'pick state inside the shared orders projection',
    },
  },
  shipping: {
    label: 'Shipping & packing',
    canonicalMobilePath: '/m/shipping',
    legacyMobilePaths: [],
    desktopPath: '/shipping/orders',
    presentation: {
      mobile: 'execution launcher over canonical order and scan verbs',
      desktop: 'shipping desk composed from the shared workflow facts',
    },
  },
  exceptions: {
    label: 'Exceptions',
    canonicalMobilePath: '/m/exceptions',
    legacyMobilePaths: [],
    desktopPath: '/shipping/exceptions',
    presentation: {
      mobile: 'flat blocker rows + task-local catalog pairing',
      desktop: 'DataTable queue + catalog pairing record',
    },
  },
  history: {
    label: 'Shipped history',
    canonicalMobilePath: '/m/shipping/history',
    legacyMobilePaths: [],
    desktopPath: '/shipping/orders?view=shipped',
    presentation: {
      mobile: 'identifier-led shipped lookup + flat result rows',
      desktop: 'shipped state inside the canonical orders projection',
    },
  },
  staging: {
    label: 'Stage at rack',
    canonicalMobilePath: '/m/shipping/stage',
    legacyMobilePaths: [],
    desktopPath: '/shipping/scan-out',
    presentation: {
      mobile: 'packed-carton queue + task-local rack scan',
      desktop: 'dock staging projection over the same DOCK_STAGED event',
    },
  },
  scanOut: {
    label: 'Carrier scan-out',
    canonicalMobilePath: '/m/shipping/scan-out',
    legacyMobilePaths: [],
    desktopPath: '/shipping/scan-out',
    presentation: {
      mobile: 'staged-carton queue + per-order scan-out task',
      desktop: 'scan station queue + wedge-enhanced station task',
    },
  },
} as const;

export const OUTBOUND_WORKFLOW_STAGES = [
  {
    id: 'import-orders',
    label: 'Import orders',
    mobilePath: '/m/orders/sync',
    desktopPath: '/shipping/orders',
    completion: 'live',
  },
  {
    id: 'triage-orders',
    label: 'Triage orders',
    mobilePath: '/m/orders',
    desktopPath: '/shipping/orders',
    completion: 'live',
  },
  {
    id: 'pick-by-location',
    label: 'Pick by location',
    mobilePath: '/m/pick',
    desktopPath: '/shipping/orders',
    completion: 'live',
  },
  {
    id: 'pack-order',
    label: 'Pack order',
    mobilePath: '/m/pack',
    desktopPath: '/shipping/orders',
    completion: 'live',
  },
  {
    id: 'stage-location',
    label: 'Stage at rack',
    mobilePath: '/m/shipping/stage/[shipmentId]',
    desktopPath: '/shipping/scan-out',
    completion: 'live',
  },
  {
    id: 'carrier-scan-out',
    label: 'Carrier scan-out',
    mobilePath: '/m/id/scan-out/[orderId]',
    desktopPath: '/shipping/scan-out',
    completion: 'live',
  },
] as const;

/**
 * FBA is a workflow family, not one vague "Amazon Prep" verb. These records
 * keep parity claims honest until each physical operation has a phone task.
 */
export const OUTBOUND_FBA_VERBS = [
  {
    id: 'fba-plan',
    label: 'Plan shipment',
    desktopPath: '/shipping/fba?fbaMode=plan',
    api: '/api/fba/shipments',
    mobilePath: '/m/shipping/fba',
    completion: 'live',
  },
  {
    id: 'fba-scan-unit',
    label: 'Scan unit into plan',
    desktopPath: '/shipping/fba?fbaMode=plan',
    api: '/api/fba/items/scan',
    mobilePath: '/m/shipping/fba/scan',
    completion: 'live',
  },
  {
    id: 'fba-verify-unit',
    label: 'Verify and ready unit',
    desktopPath: '/shipping/fba?fbaMode=ready',
    api: '/api/fba/items/verify',
    mobilePath: '/m/shipping/fba/verify',
    completion: 'live',
  },
  {
    id: 'fba-bind-label',
    label: 'Bind FNSKU label',
    desktopPath: '/shipping/fba',
    api: '/api/fba/labels/bind',
    mobilePath: '/m/shipping/fba/label',
    completion: 'live',
  },
  {
    id: 'fba-close-shipment',
    label: 'Close and mark shipment sent',
    desktopPath: '/shipping/fba',
    api: '/api/fba/shipments/close',
    mobilePath: '/m/shipping/fba/close',
    completion: 'live',
  },
] as const;

export type OutboundWorkflowStage = (typeof OUTBOUND_WORKFLOW_STAGES)[number];

type OutboundWorkflowStageVerdict = {
  id: string;
  completion: 'live' | 'partial' | 'gap';
  mobilePath: string | null;
  gapId?: string;
};

export function evaluateOutboundWorkflowContract() {
  const violations: string[] = [];
  const gapIds = new Set<string>(MOBILE_FIRST_VERB_GAPS.map((gap) => gap.id));
  const canonicalPaths = Object.values(OUTBOUND_WORKFLOW_SURFACES).map(
    (surface) => surface.canonicalMobilePath,
  );

  if (new Set(canonicalPaths).size !== canonicalPaths.length) {
    violations.push('Outbound surfaces must not share a canonical mobile path.');
  }

  for (const stage of OUTBOUND_WORKFLOW_STAGES as readonly OutboundWorkflowStageVerdict[]) {
    if (stage.completion === 'gap' && stage.mobilePath !== null) {
      violations.push(`${stage.id}: a gap must not claim a completed mobile path.`);
    }
    if (stage.gapId && !gapIds.has(stage.gapId)) {
      violations.push(`${stage.id}: gapId ${stage.gapId} is absent from MOBILE_FIRST_VERB_GAPS.`);
    }
  }

  for (const verb of OUTBOUND_FBA_VERBS as readonly OutboundWorkflowStageVerdict[]) {
    if (verb.completion === 'gap' && verb.mobilePath !== null) {
      violations.push(`${verb.id}: an FBA gap must not claim a completed mobile path.`);
    }
    if (verb.completion === 'live' && !verb.mobilePath) {
      violations.push(`${verb.id}: a live FBA verb must declare its phone completion path.`);
    }
  }

  return {
    ok: violations.length === 0,
    version: OUTBOUND_WORKFLOW_CONTRACT_VERSION,
    surfaces: OUTBOUND_WORKFLOW_SURFACES,
    stages: OUTBOUND_WORKFLOW_STAGES,
    fbaVerbs: OUTBOUND_FBA_VERBS,
    factsContract: {
      resolver: 'resolveOutboundWorkflowFacts',
      module: 'src/lib/shipping/outbound-workflow-facts.ts',
      actionsModule: 'src/lib/shipping/outbound-workflow-actions.ts',
      actionIds: ['label', 'pick', 'pack', 'hold', 'clear_hold', 'stage', 'scan_out'],
      owns: [
        'stage',
        'deadlineBand',
        'blocked',
        'readyForScanOut',
        'nextStep',
        'exception',
        'actions',
      ],
      rule: 'Renderers pass raw facts and consume this verdict; they do not re-derive workflow precedence.',
    },
    violations,
  } as const;
}

/**
 * OUTBOUND / INBOUND VERB LEDGER — operator flow, 2026-09-14, in execution
 * order rather than in the order the desk happened to grow surfaces.
 *
 *   OUTBOUND  import orders → pick list AUTO-CREATED (item# ↔ staff pairing)
 *             → pick from pre-boxed stock BY LOCATION → print + stick label
 *             → box → place on rack (location scan) → carrier scan-out
 *
 *   INBOUND   delivery → unbox + photos → QC inspect (claim?) → QC test
 *             (claim?) → ID kernel marks QC done → place at location
 *             → PRE-BOX: labelled, graded, location-paired, ready to pick
 *
 * The hinge is PRE-BOX. If a unit carries its own grade, label and location by
 * the time QC ends, outbound stops computing anything and becomes a lookup:
 * `order_unit_allocations → serial_units.current_location`. That is exactly
 * what the allocation table was built for, and until 2026-09-14 the org had
 * 4581 orders, 116 stocked location-paired units and ONE live allocation — so
 * `/m/pick` was reading the shipping feed instead, which is why it could not
 * show a pre-label order.
 *
 * Entries below are verbs that still need a dedicated `/m` SoT (or a
 * documented embed of an existing one) before desk-only UI is considered
 * complete. Grow this list as gaps are found — never shrink to excuse
 * desktop-only.
 */
export const MOBILE_FIRST_VERB_GAPS = [
  // ── Inbound / QC ──────────────────────────────────────────────────────────
  {
    id: 'qc-test-report',
    deskHint: '/tech, /test',
    mobileSoT: null as string | null,
    note: 'Diagnostic result bound to unit identity as ONE record. Amazon Renewed requires serial/IMEI → order id → test report traceability retained 180 days; today serials, photos and test scans live in three separate places.',
  },
  {
    id: 'qc-claim-decision',
    deskHint: 'receiving exceptions',
    mobileSoT: '/m/claim' as string | null,
    note: 'Claim-or-not, at BOTH QC decision points (after unbox, after test). The route exists; it is not yet the documented SoT for either.',
  },
  // ── Inventory / locations (pre-existing, 2026-09-10) ───────────────────────
  {
    id: 'locations-labels',
    deskHint: '/inventory/locations?tab=labels',
    mobileSoT: '/m/print' as string | null,
    note: 'Port location label printer to /m before desk Labels is “done”.',
  },
  {
    id: 'locations-bays',
    deskHint: '/inventory/locations?tab=bays',
    mobileSoT: '/m/print' as string | null,
    note: 'Port bay label printer to /m.',
  },
  {
    id: 'locations-rooms',
    deskHint: '/inventory/locations?tab=rooms',
    mobileSoT: null as string | null,
    note: 'Rooms CRUD / browse on /m.',
  },
  // ── Tasks (2026-09-22) ─────────────────────────────────────────────────────
  // READING and FINISHING an assigned task landed on /m/tasks in this pass.
  // THROWING one did not, and this entry is why rather than an omission.
  //
  // A task needs a target `(entityType, entityId)`, which only
  // `POST /api/scan/resolve` can produce from what an operator is holding (a
  // tracking number has no client-side vocabulary). On the phone that resolve
  // lives behind the scan kernel at `/m/scan`, which today RESOLVES AND
  // NAVIGATES — it has no "hand the answer back to the caller" contract. So the
  // composer would be: scan screen → return with a target → choose a recipient
  // → note → urgency. That is two screens plus a cross-surface handoff, which
  // fails R1 (one job per screen), and the only ways to collapse it are a
  // SECOND resolver on the phone (the drift `throw-targets.ts` exists to stop)
  // or a stub. Recorded as a gap instead of shipped as either.
  {
    id: 'task-throw',
    deskHint: 'quick access → ThrowTaskPanel',
    mobileSoT: null as string | null,
    note: 'Throw a task at a colleague from the phone. Needs a return-path contract on /m/scan (resolve, then hand (entityType, entityId) back to the caller) before a one-screen composer is honest. /m/tasks already owns the read + complete half.',
  },
] as const;

export function isMobileFirstPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/m' || pathname.startsWith('/m/')) return true;
  return false;
}

export function hasRegisteredMobilePrefix(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return MOBILE_FIRST_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
