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
  '/m/signin',
  '/m/qr-auth',
  // Callers: mobile nav. User: "mobile first design" / complete intake on phone.
  '/m/consult',
  '/m/settings',
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
// Deleted 2026-09-14 (operator ruling — mobile surface is the unbox photo
// feed, picks, location scanning, and the identification kernel): /m/pack,
// /m/search — and /m/home, which was REINSTATED 2026-09-15 as the canonical
// mobile landing (nav Daily leaf + org-switch landing, registered above). The
// 09-14 ruling stands for pack and search: the phone's pack surface is the
// desk-triggered photo feed (`/m/p/[id]/photos`), and mobile search never
// shipped as a surface.
// Deleted 2026-09-15 (operator ruling — *"remove the checklist from the
// mobile display and the checklist components, they are old components from
// the mobile app itself"*): /m/checklist. The route, its page and
// `src/components/mobile/checklist/**` are gone; the earlier "kept for
// repurposing" note is retired. Kit-parts / QC authoring is a desk verb.

export type MobileFirstRoutePrefix = (typeof MOBILE_FIRST_ROUTE_PREFIXES)[number];

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
  // ── Outbound ──────────────────────────────────────────────────────────────
  {
    id: 'outbound-stage-location',
    deskHint: '/shipping/scan-out',
    mobileSoT: null as string | null,
    note: 'Boxed order → rack/staging location scan. `/m/scan` scans locations for inventory, but no outbound staging verb exists, so a packed box has no phone-recordable home.',
  },
  {
    id: 'outbound-scan-out-queue',
    deskHint: '/shipping/scan-out',
    mobileSoT: '/m/id/scan-out/[orderId]' as string | null,
    note: 'Per-order dock scan-out exists on the kernel; the QUEUE (what is staged and still waiting on a carrier) is desk-only.',
  },
  {
    id: 'outbound-exceptions',
    deskHint: '/shipping/(desk)/exceptions, /tracking-exceptions',
    mobileSoT: null as string | null,
    note: 'Where outbound orders die silently. Zero mobile files mention exceptions, so an operator must be at a desk to discover one.',
  },
  {
    id: 'outbound-shortage',
    deskHint: '/shipping/(desk)/shortage',
    mobileSoT: null as string | null,
    note: 'Unallocated / short backlog — the shortfall side of auto-allocation. `/m/on-hold` is SKU-grained and adjacent, not this view.',
  },
  {
    id: 'outbound-shipped-history',
    deskHint: '/shipping/(desk)/shipped',
    mobileSoT: null as string | null,
    note: 'Post-ship lookup on the floor (buyer asks, carrier disputes a scan).',
  },
  {
    id: 'outbound-fba',
    deskHint: '/fba',
    mobileSoT: null as string | null,
    note: 'FBA prep / plan work is desk-only.',
  },
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
