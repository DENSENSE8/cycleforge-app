# HANDOFF — Cross-client outbound foundation

**Status:** proposed foundation; do this before parallel UI ports.  
**Integration trunk:** this `prod` worktree.  
**Reference implementation:** `../v1-outbound`; migrate reviewed slices into `prod`, do not keep two editable product truths.

## The decision

Build one outbound vertical slice first: **create a QA test order → see it in
the industrial To-ship queue → open triage → change its state → see the same
fact on every client.**

The clients are intentionally different:

| Surface | Runtime | What it owns |
|---|---|---|
| Web | Next.js at `http://localhost:3050` | universal fallback, admin and triage; first industrial-ledger implementation |
| Desktop | Tauri | station packaging plus OS capabilities; bundles a pinned shared React work surface |
| iPhone / iPad | SwiftUI | handheld floor flow, camera, haptics, Dynamic Type and native sheets |
| Android today | `/m/*` in the browser | mobile acceptance surface; do not start a second Android UI port in this slice |

There is **not** one UI codebase. The single source of truth is the server
contract, lifecycle, QA fixtures, state vocabulary and generated tokens.
React is shared by web and Tauri where practical; SwiftUI deliberately renders
the same contracts natively.

`docs/design-system/BRIEF.md` is the governing design law. The older
`HANDOFF-outbound-to-ship-ledger.md` is the exact web To-ship port plan and
uses the native Tauri ledger only as a visual reference; its old “Tauri out”
scope does not prohibit this foundation.

## Foundation 0 — stop split-brain before UI work

1. **`prod` is the only integration target.** Do not rsync individual files
   between `prod`, `v1-outbound`, and the MacBook checkout. A reviewed change
   lands in `prod`; each device worktree pulls that revision.
2. **Promote the V1 contract assets into `prod` first:** V1 OpenAPI (`docs/openapi/cycleforge-v1.json`
   in `v1-outbound` has 23 paths; prod's copy has only the 4 `label-ingestions` paths), its
   generator/verifier (`scripts/generate-v1-openapi.ts`, `scripts/verify-v1-openapi.ts`), the
   outbound-work projection and its fixtures (`apps/mobile-ios/Tests/**/outbound-work-*.json`),
   and the desktop package boundary. Preserve history where possible with `git mv`/targeted
   commits rather than copy-paste. **Tokens go the other way:** `DesignTokens.swift` is not in V1;
   prod generates it (`packages/design-tokens/generated/`, gate `pnpm tokens:check`).
3. **One generation gate:** TypeScript token registry → CSS variables +
   `DesignTokens.swift`; OpenAPI → Swift contracts. CI rejects generated-file
   drift. No client may carry a literal status map, hard-coded colour palette,
   or local copy of an `OutboundWorkItem` schema.
4. **One QA environment:** QA org only, with deterministic fixture IDs and a
   disposable Neon branch for destructive runs. Never use dogfood orders or a
   live ShipStation purchase in normal development.

### Existing contract seam for the first slice

Do not invent a second order domain. These server-owned endpoints form the web/iPhone
vertical slice. **Promoted into `prod` 2026-09-24** by path-limited diffs from reviewed SHAs
(capabilities from `6aadb7b67`; acknowledge, live-label and the work projection from `b7e7653a3`;
the staff-session work route from `b3a1dc6de`). The desktop-bearer branch of the work route is
deliberately not promoted; see `SPEC-v1-desktop-outbound-adapter.md`:

```text
GET  /api/developer/qa/capabilities
POST /api/orders/add                    Idempotency-Key: UUID
POST /api/orders/{id}/acknowledge       { route: "PICK" | "QC" }
GET  /api/v1/outbound/work
```

The QA-capability response is the client visibility gate; the server remains
the security boundary. `POST /api/orders/add` requires the staff session and
`orders.create`, and returns the persisted canonical order. A label-less test
order must remain label-less so the acknowledge response can honestly return
`409 NOT_READY` with its missing pairing/label facts.

The desktop native transport currently proxies only `/api/v1/*`, whereas the
first two write routes above are staff-cookie routes. Before the desktop
button ships, add a narrow versioned **adapter** under `/api/v1` that calls the
same canonical creation/acknowledgement services and derives tenant + actor
from the native principal. It must be QA-capability-gated, idempotent and
return the existing outbound-work projection; it must not create a second
lifecycle or expose a general authenticated proxy. The iPhone/web clients use
the existing cookie routes until that adapter is available.

## Foundation 1 — the reference vertical slice

### Web — first visual/reference port

Follow `docs/design-system/HANDOFF-outbound-to-ship-ledger.md` exactly for the
To-ship page only. It is the reference for industrial proportions and behavior:
`#fafafa` canvas, hard rules, state spine, photo lane, three record bands,
right-side triage evidence, S/M/L row zoom, no SaaS cards or motion.

Mount a QA-only “Create test order” control in the To-ship workbench. It first
reads `GET /api/developer/qa/capabilities`, invokes `/api/orders/add` with an
idempotency key, refreshes the existing outbound query, selects the returned
row, and opens the normal triage rail. Do not add a parallel test-order client
store.

### Desktop — Tauri station port

Port the reference work surface into `apps/desktop-tauri` as a pinned shared
React package; do not extend its current standalone fixture queue or retain
literal `styles.css`/`handset.css` as a second design system. The Tauri shell
owns only desktop-only seams: keychain/device session, printing, scanner,
offline outbox, scale and station configuration.

The desktop QA control waits for the narrow versioned adapter, then invokes it
through the native transport. After creation it reloads `GET
/api/v1/outbound/work`, opens the record in the desktop evidence column and
drives the normal command/triage contract. It must never create a browser-only
or Rust-only order.

### iPhone Air — SwiftUI native port

SwiftUI consumes the generated OpenAPI types and `DesignTokens.swift`. Build
the handheld equivalent, not a pixel copy: 48 pt targets, native sheet for
test-order creation, camera/haptic behavior, Dynamic Type and the same state
codes. It calls the exact same endpoint and refreshes the same outbound-work
projection. Xcode builds and device installation run locally on the MacBook;
the remote agent supplies source changes and a handoff, not an SSH Xcode build.

**Where the iOS source lives (decision needed).** Rule 1 forbids file copies between checkouts,
so the generated `DesignTokens.swift` cannot be `scp`'d into `~/Projects/cycleforge-ios` (the
`pnpm tokens:sync-ios` script approved in BRIEF item 5 is exactly that copy). Recommended: promote
`apps/mobile-ios` into `prod` (from `v1-outbound`, with history) and point the token generator's
Swift output straight at it; the MacBook checkout pulls `prod`. Then delete `tokens:sync-ios`.

### Android — validation now, port later

Per `BRIEF.md`, Android remains the production `/m/*` surface in this slice.
Use the connected phone to validate the test order, queue read and triage
facts against the same QA tenant. Do not duplicate the feature in the Tauri
Android target or begin a Compose port until the desktop/web/iPhone slice is
stable.

## Parallelization that remains safe

```text
Foundation 0: API contract + fixtures + tokens + generated clients
                      |
      +---------------+---------------+
      |               |               |
Web industrial     Tauri shell      SwiftUI handheld
reference port     integration      native port
      |               |               |
      +---------------+---------------+
                      |
         One QA acceptance matrix on all devices
```

Do not start any of the three client implementations until Foundation 0 has
one reviewed OpenAPI request/response fixture. Once it does, the work can fan
out. Each stream owns presentation only; the API/contract owner resolves any
lifecycle or data-shape decision once.

## Device test matrix

| Check | Web (`:3050`) | Tauri desktop | iPhone Air | Android |
|---|---:|---:|---:|---:|
| Create test order with details | required | required | required | browser validation |
| Read canonical queue row | required | required | required | required |
| Open triage / record evidence | required | required | required | required |
| Apply a safe test-only lifecycle action | required | required | required | required |
| Print / scan / offline behavior | degraded copy | desktop proof | camera/haptics proof | `/m` scan proof |

The acceptance evidence is one order reference, its audit event IDs, and one
screen capture per client. A change is not “done” because it looks alike; each
client must read the same returned work item and observe the same state after a
refresh.

## Work handoffs

### Main/integration owner

Implement Foundation 0 in `prod`: test-order endpoint, authorization,
idempotency, canonical projection, OpenAPI, fixtures and generation gates.
Then land the web reference port from the To-ship ledger handoff.

### Desktop Tauri owner

Work only after the Foundation 0 contract is merged. Consume the shared React
industrial ledger and desktop transport. Do not change server schema or copy
token/status literals. Verify with `pnpm desktop:v1:dev` and the desktop
package checks.

### iPhone Air owner (MacBook/Xcode only)

Work only after generated Swift contracts are available. Build/run locally in
Xcode on the attached iPhone Air, use the QA endpoint and return screenshots,
device build result, and any contract mismatch. Do not SSH-run Xcode.

## First executable next action

Prove the existing QA capability → `/api/orders/add` → outbound-work projection
→ acknowledge/refusal loop in `prod`, then write the narrow desktop `/api/v1`
adapter contract. That lets the web and iPhone teams start immediately while
the desktop team integrates against one deliberate native seam.

---

## Verification notes (2026-09-24, against the live trees)

| Claim in this plan | Status | Evidence |
|---|---|---|
| QA capability / acknowledge / `v1/outbound/work` "already form the slice" | **In `prod`** (2026-09-24) | curl at `:3050`, QA org: capabilities `allowed` → `orders/add` + replay returns the same pk, one `order.create` audit row → `work?view=triage` lists it → acknowledge `409 NOT_READY ["label"]`; customer org: `not_sandbox`, 0 items, acknowledge 404 |
| Promote generated `DesignTokens.swift` from V1 | **Reversed** | not tracked in V1; prod generates it with a drift gate in `verify:fast` |
| One generation gate (tokens → CSS + Swift) | **Done for tokens** | `packages/design-tokens`, `pnpm tokens:build` / `tokens:check`, gate "Design tokens" |
| OpenAPI → Swift contracts gate | **Gate in `verify:fast`** ("V1 OpenAPI") | 5 paths (label ingestions + `/api/v1/outbound/work`) + `OutboundWorkItem`/`OutboundWorkPage` components; shared fixtures in `src/lib/outbound/fixtures/` parse under the runtime contract |
| No client carries a literal status map | **Being built** | `LIFECYCLE` map in `packages/design-tokens/src/lifecycle.ts` + guard test (in progress); `/m/*` and desk still carry page-local tone maps until each page adopts it |
| Web To-ship reference port uses `#fafafa` | **Consistent** | BRIEF §4 industrial canvas changed to `#fafafa` (applied in the To-ship handoff Step 0) |
| No rsync between checkouts | **Conflicts with BRIEF item 5** (`tokens:sync-ios`) | see "Where the iOS source lives" |

## First-principles implementation method

The system has three layers and every change belongs to exactly one of them:

1. **Facts (server):** order, unit, lifecycle state, audit events. Owned by API routes + OpenAPI.
   A client never derives a state the server did not return.
2. **Meaning (shared package):** state → tone + code + label (`LIFECYCLE`), mode values, radius,
   hit sizes, durations. Owned by `@cycleforge/design-tokens`; generated to CSS, Swift, JSON.
   A client never restates a hex, a code or a tone.
3. **Presentation (per client, per page):** layout, native navigation, gestures. Owned by the page.
   A page declares its mode (`ModeRegion` on web, an environment value in SwiftUI) and reads
   layers 1–2 only.

A bug is fixed in the lowest layer that owns it. If two clients disagree about a fact, the fix is
on the server; about a colour or code, in the package; about layout, on that page.

### Page protocol (every page, every client — the definition of done)

1. **Declare** the page's mode by job (BRIEF §3/§6). One region per page, rail may nest one more.
2. **Inventory** what the page renders today: every literal colour/radius/size, every page-local
   status/tone map, every sub-48 pt touch target. Paste the list in the change description.
3. **Replace** literals with mode/state tokens and page-local status maps with `LIFECYCLE`.
   Nothing outside the page changes; shared primitives change only if the page proves them wrong,
   and then in the package, with every consumer listed.
4. **Prove on the QA tenant** with a deterministic fixture that exercises the page's states (see
   triage fixtures below): before/after screenshots at `:3050` — phone 390×844 for `/m/*`, desk
   1440×900 — plus the behaviour checklist for the page.
5. **Floor check** (BRIEF §8): touch targets ≥48 with 8 px gaps, text ≥4.5:1, usable at 200 %
   zoom, reduced motion leaves feedback visible, state codes read as words.
6. **Gates:** `pnpm tokens:check` and `pnpm verify:fast`. Owner commits.

### Page queue — mobile triage first (owner, 2026-09-24: "I need to test the mobile display
right now in terms of the entire triage operations")

Triage mode is **declared** on these routes as of 2026-09-24 (verified at runtime,
`data-mode="triage"`): `/m/scan` (arrival identification; `/m/triage` and `/m/receive` redirect
here), `/m/exceptions`, `/m/exceptions/[orderId]`, `/m/on-hold`, `/m/on-hold/[sku]`, `/m/inbox`.
Declaring a mode changes only the neutral surfaces/rules; each page still needs steps 2–5.

| # | Page | Job | Known gaps from the 2026-09-24 screenshots |
|---|---|---|---|
| 1 | `/m/scan` | arrival triage — "return? repair? ticket?" | **Done 2026-09-24.** Rows lead with an `INTAKE` code (`NEW`/`RTN`/`REP`/`TKT`, new registry beside `LIFECYCLE` in `packages/design-tokens`, from `carton_intake_type` + the ticket link); the focus row wears the 2 px ink outline, with its outcome colour in the code; radius 4 / 48 px hits / body 16 at 1.45; the opened row offers Photos & classify (ink) · Return · Repair, all into the existing classify flow (Return/Repair pre-select the Type step); opacity-only motion at the mode duration. Open: Ticket verb, copy-chip `<button>` nesting, `BottomSheet` portal loses the mode (sheets re-declare `ModeRegion`). |
| 2 | `/m/exceptions` → `/m/exceptions/[orderId]` | exception triage (catalog pairing) | industrial-style work rows on a triage page, pink exception spine without a code, `NO SLA ASSIGNED` truncation |
| 3 | `/m/on-hold` → `/m/on-hold/[sku]` | merge placeholder SKU into real SKU | pill-shaped `Merge` buttons in raw blue (triage decision = ink fill, radius 4), amber `ON HOLD` chip outside `LIFECYCLE` |
| 4 | `/m/inbox` | decisions waiting on me | raw kind slug shown as text (`support_ticket #450`), every row reads "Handed to you" with no state code or decision affordance |
| 5 | desk `/triage` + the record rail | same jobs on desk | shares the phone's evidence-stack components where possible |

**Testing on the phone:** open `http://100.72.226.55:3050/m/scan` over Tailscale (the lane
listens on the Tailscale address). Sign in as a QA-org user, not dogfood.

**Triage QA fixtures (Foundation 0 item 4):** `QA_TRIAGE_FIXTURES` in `src/lib/tenancy/qa-org.ts`,
seeded by `pnpm provision:qa-org -- --triage-only` (idempotent; it does not reset the QA admin
password or PIN). There is one record per decision: a return, a repair intake, a support-ticket package
(handed to the QA admin's inbox), an order missing catalog pairing (acknowledge → `missing
["pairing"]`), an order missing a label (`409 NOT_READY ["label"]`), and an on-hold placeholder SKU
with 5 on hand. Each page's proof finds them by the natural keys in that constant, not by serial ids.
