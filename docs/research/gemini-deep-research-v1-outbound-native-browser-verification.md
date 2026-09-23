# Gemini Deep Research Briefing — Cycle Forge V1 outbound, Tauri, SwiftUI, and browser-verifiable Definition of Done

**Prepared for:** Gemini Deep Research  
**From:** Cycle Forge engineering  
**Date:** 2026-09-18  
**Status:** Research request and execution-gate specification — implementation not yet approved  
**Domain:** Multi-tenant reseller operations, serialized inventory, outbound fulfillment  
**Primary decision:** Define the smallest safe V1 that replaces Electron with Tauri, rewrites the outbound mobile path in SwiftUI, reduces the public web product to onboarding/control-plane duties, and keeps the business workflow independently testable in an ordinary browser.

---

## 0. How to use this briefing

This is not a request for a generic technology comparison or an enthusiastic rewrite plan. Produce a
source-backed recommendation that an engineering team can turn into an implementation plan and an
acceptance-test suite.

You do **not** have the repository. Treat the measured codebase facts in §3 as ground truth. Treat the
marketplace, carrier, browser-extension, Tauri, Apple, and industry claims in §4 as hypotheses to verify
against current primary sources.

The required end state has four distinct products sharing one hosted control plane:

1. A **public web/control-plane experience** for signup, invitations, organization setup, account and
   billing administration, device enrollment, downloads, release information, and recovery.
2. A **Tauri desktop application** as the primary desktop operations client.
3. A **native SwiftUI iPhone/iPad application** for mobile outbound execution.
4. A **hosted Next.js API and realtime backend** that owns authentication, authorization, tenancy,
   lifecycle transitions, shipment truth, audit, idempotency, and projections.

The research must answer two questions separately:

1. **What should the actual V1 product and architecture be?**
2. **How do we make every business rule and user journey testable through a normal browser while
   honestly isolating the few OS-native properties that a browser cannot prove?**

Do not claim that a browser can verify folder-watcher delivery semantics, OS printer enumeration,
silent printing, Keychain storage, code signing, notarization, updater signatures, or App Store behavior.
Instead, define a thin native-adapter boundary and a browser substitute that drives the exact same hosted
contracts.

Use current official documentation and primary sources wherever possible. For marketplace APIs, include
eligibility, approval, geographic, program, and account-tier constraints—not merely the existence of an
endpoint. For every material claim, provide a stable source URL, publication/update date when available,
and access date.

---

## 1. Executive problem statement

Cycle Forge currently has a very large Next.js operations product, a mature web-mobile surface under
`/m/*`, a small experimental Expo shell, and an Electron desktop host with privileged native
capabilities. The desired simplification is:

- retire Electron and its embedded marketplace-browser concept;
- make Tauri the installed desktop application;
- move the real mobile workflow to a native SwiftUI application;
- make the public web primarily acquire, onboard, enroll, and recover users;
- keep the Next.js server/API as the hosted source of business truth;
- establish a lean V1 label-ingestion flow for marketplace labels purchased in the user's normal browser;
- later replace external label buying with approved marketplace/carrier APIs where they are actually
  available and commercially justified.

The immediate V1 vertical slice is:

```text
Normal browser used for marketplace purchase
                    |
                    v
          PDF saved to enrolled folder
                    |
                    v
       Tauri native watcher + SHA-256
                    |
                    v
       POST /api/v1/label-ingestions
                    |
                    v
  Parse -> exact tenant match -> attach tracking
                    |
          +---------+----------+
          |                    |
          v                    v
       APPLIED             QUARANTINED
          |                    |
          v                    v
  PACKED -> LABELED     operator scan-pair review
```

This is a transition architecture, not the desired high-volume end state. V2 may use marketplace Buy
Shipping or multi-carrier APIs directly, but only after Gemini verifies their actual availability and
program constraints.

---

## 2. Non-negotiable architectural decisions

Research may challenge these decisions only with concrete evidence and a clearly superior alternative.

### 2.1 Preserve the server and domain spine

Do not recommend a greenfield rewrite of authentication, organization isolation, order storage,
tracking reconciliation, documents, audit, realtime, inventory transitions, or marketplace sync.
The frontend may be replaced incrementally; the domain spine must be extended.

### 2.2 Tauri V1 is a remote hosted operations client

The current Next application is server-backed and has more than one thousand API route handlers. It is
not a static SPA that can simply be placed in a desktop bundle. For V1, Tauri should load one exact
allowlisted HTTPS operations origin/route and expose only narrowly scoped commands.

The remote web content must never receive a general filesystem, arbitrary shell, arbitrary path, generic
IPC, or `execute` command. Prefer native Rust code that watches, hashes, and uploads a file directly, then
emits a sanitized ingestion result to the webview.

### 2.3 SwiftUI is a new presentation client, not a JavaScript code port

Port workflow behavior and contracts from the canonical `/m/*` product. Do not use the small Expo shell as
evidence of completed mobile behavior. SwiftUI must use the hosted API only and must never connect directly
to Postgres/Neon.

### 2.4 `orders.status` is not the warehouse lifecycle

Do not add or write `LABEL_READY` to `orders.status`. That field carries source/marketplace order status.
The existing per-unit lifecycle contains `PACKED`, `LABELED`, and `STAGED`. An order-level display state may
project `LABEL_READY` from canonical facts, but the write must use the inventory state machine and existing
shipment/tracking truth.

### 2.5 Matching is exact or human-confirmed

A tracking number extracted from a previously unlinked label generally cannot identify the internal order
by itself. V1 may automatically match only a unique, normalized marketplace/reference order identifier in
the authenticated organization. Ambiguous or absent identity must produce `QUARANTINED`, never fuzzy
attachment.

### 2.6 Browser-verifiable core, thin native adapters

The hosted ingestion contract must support both:

- the production Tauri adapter, which supplies watched-file bytes and metadata; and
- a non-production browser test adapter, which supplies the same fixture through an ordinary file input or
  drag/drop harness.

Both paths must hit the same authentication, schema validation, hash/idempotency, parser, matcher,
transition, audit, realtime, and projection code. No fake browser-only business implementation is allowed.

### 2.7 No destructive cutover before parity

New V1 routes and clients ship beside the current Electron and web/mobile surfaces. Legacy product paths may
be hidden from newly enrolled pilot organizations after parity, but source deletion occurs only after a
measured parallel-run window and a tested rollback.

---

## 3. Measured current codebase facts

### 3.1 Scale and migration risk

- Approximately 1.07 million TypeScript/TSX lines under `src`.
- 194 Next application pages.
- 1,033 API route handlers.
- 1,177 source unit-test files and 223 Playwright specs.
- 44 scheduled Vercel jobs and more than 500 handwritten SQL migrations.
- The inspected worktree contains hundreds of modified/untracked paths. A new worktree from `HEAD` would
  not automatically include that local state.

The first implementation step must therefore identify and freeze the exact source commit. "Create a clean
worktree immediately" is unsafe until that baseline is explicit.

### 3.2 Electron is currently a capability host

`electron/main.js` declares these native responsibilities:

1. Silent print to a named OS printer.
2. Installed-printer enumeration.
3. Global scan hotkey while the window is unfocused.
4. Versioned, auto-updating, chrome-less host.
5. `VendorView`, a partitioned embedded marketplace browser.
6. Operator-opened native file workspaces and CRUD.

The security posture already bans `nodeIntegration`, unsandboxed rendering, generic script execution, local
HTTP sidecars, arbitrary file-path printing, and file access outside an opened root.

The V1 migration must give every capability an explicit disposition: `PORT`, `RETIRE`, or `DEFER`.
Recommended starting disposition:

| Electron capability | V1 disposition | Reason |
|---|---|---|
| Named silent print | PORT if outbound label printing depends on it | Core warehouse capability |
| Printer enumeration | PORT with narrow return shape | Required for named routing |
| Global scan hotkey | DEFER unless an unfocused workflow is demonstrated | Many wedge scanners work through focused input |
| Signed updater | PORT | Installed client requirement |
| VendorView | RETIRE | Brittle auth/bot/security boundary |
| Generic file workspace CRUD | RETIRE | Replace with one label-ingest folder capability |
| WebUSB/WebHID/WebSerial grants | RETIRE or device-specific PORT | Do not carry a generic device surface into V1 |

### 3.3 Mobile truth

- The canonical mobile product is the Next.js `/m/*` tree, with approximately 60 page routes and 172
  mobile component files.
- The separate `apps/mobile` Expo project is a small scaffold, not feature parity.
- The codebase states that mobile owns the workflow order and completion path while desktop projects the
  same facts at higher density.
- Existing outbound route families include orders, pick, pack, shipping, exceptions, history/staging, and
  scan-out surfaces.

SwiftUI V1 should therefore port a deliberately bounded outbound cohort from `/m`, not port the Expo
scaffold and not attempt the entire repository at once.

### 3.4 Existing data and lifecycle truth

Relevant existing primitives:

| Concern | Current source of truth |
|---|---|
| Marketplace order identifier | `orders.order_id` (text), scoped by `orders.organization_id`; the supplied proposal's `orders.external_id` / `orders.order_number` names are not the current contract |
| Primary tracking link | `orders.shipment_id` -> `shipping_tracking_numbers.id` |
| Additional links | `shipment_links`; the old `order_shipment_links` table was dropped |
| Tracking reconciliation | Existing order-tracking domain helper and `/api/orders/[id]/tracking` route |
| Per-unit lifecycle | `serial_units.current_status`; includes `PACKED`, `LABELED`, `STAGED` |
| Allowed transition | Existing state machine allows `PACKED -> LABELED` and `LABELED -> STAGED` |
| Order lifecycle display | Existing projection derives label presence from `shipmentId` and packed state from `packedAt` |
| Documents | `documents` plus polymorphic `document_entity_links` |
| Document replay guard | Existing content-hash index for order shipping labels and packing slips |
| Realtime | Existing order-change publication/invalidation path |
| Audit | Existing audit and append-only operations-event primitives |
| Existing extraction | A conservative client helper recognizes UPS `1Z` plus 16 alphanumerics, otherwise a 12–22 digit run |

The current order lifecycle gives packed state precedence and collapses it to `PACKED_STAGED`. The desired
V1 needs a deliberate projection split, for example:

```text
PACKED_AWAITING_LABEL = packedAt exists AND no shipment/tracking is linked
LABEL_READY           = packedAt exists AND an accepted shipment/tracking link exists
STAGED                = labeled package has been staged
SCANNED_OUT           = canonical dock scan-out event exists
```

`LABEL_READY` may be a UI/read-model vocabulary. The durable unit transition remains `PACKED -> LABELED`.
Research must evaluate whether the name should instead simply be `LABELED` to avoid another vocabulary.

### 3.5 Existing document-ingest machinery is narrower than this V1

There is an `outbound_document_ingest_jobs` table for Ecwid packing-slip acquisition. It currently:

- requires a known internal `order_id` up front;
- allows only provider `ecwid`;
- allows only document type `packing_slip`;
- uses `pending | processing | available | failed` states;
- deduplicates by organization, provider, order, and document type.

It cannot represent an unknown-order watched file or a quarantine resolution without extension or a small
sibling ledger. Research must compare:

1. extending this table into a general outbound document-ingestion ledger; versus
2. introducing a narrowly named `label_ingestions` ledger that references the resulting `documents` and
   shipment rows without becoming another shipment truth.

Do not create a second tracking-number table, a second document store, or a second inventory lifecycle.

### 3.6 Authentication is currently web-cookie oriented

The existing API wrapper derives staff, role, permissions, and organization from a verified HTTP-only
session cookie and does not trust a `staffId` sent in a body.

- A Tauri remote webview can initially preserve this web session model.
- SwiftUI needs a defined native flow: authorization code plus PKCE, or a one-time browser/app enrollment
  exchange; short-lived access tokens; rotating refresh credentials in Keychain; per-device revocation;
  organization selection; and immediate permission changes.
- Long-lived kiosk/device tokens must not silently become staff credentials.

### 3.7 Current verification posture

- Ordinary `pnpm dev` and `pnpm build` do not call design-MCP or evaluation tooling.
- Agent/editor hooks are not the cause of normal Next startup or build time.
- Broad tenancy, schema-drift, route-auth, dependency, and similar hygiene gates were removed from the main
  verification profile previously.
- A current static tenancy audit reports unresolved findings. They are conservative findings, not automatic
  proof of exploitable cross-tenant access, but they make it unsafe to remove more security checks.
- `next.config.ts` says correctness is owned by a CI workflow, while the inspected checkout has no tracked
  `.github/workflows` implementation. Research should treat build provenance and release gates as an open
  operational gap.

The V1 should define a small, reliable `verify:v1` surface rather than inheriting every historical repo
gate or deleting controls wholesale.

---

## 4. Claims from the proposed label strategy that must be researched

Do not repeat these as fact without current primary evidence.

### 4.1 Amazon Buy Shipping

Verify:

- the current SP-API product/API family and exact operation names;
- seller, marketplace, carrier, geographic, and application-approval eligibility;
- whether purchasing through the API retains the same delivery metrics and claim protections as the seller
  UI, and under what conditions;
- label formats, tracking response, cancellation/void/refund behavior, rate expiry, idempotency, throttles,
  and sandbox limitations;
- whether the app may purchase on behalf of multiple independent tenant sellers and what authorization,
  restricted-data, or security review is required.

### 4.2 eBay shipping labels

Verify whether eBay currently exposes a generally available API that lets third-party seller software rate,
purchase, retrieve, void, and reprint shipping labels with the same seller-negotiated economics and
protections as the web product. Distinguish:

- fulfillment/order APIs that only upload tracking;
- APIs limited to specific programs, partners, countries, or managed delivery products;
- public production access versus documentation for restricted/legacy products.

Do not infer label-purchase capability from an API named "Fulfillment".

### 4.3 Pirate Ship and aggregators

Verify whether Pirate Ship offers a supported public production API or partner program for this use case.
For EasyPost, Shippo, ShipEngine, or other aggregators, compare:

- BYO carrier accounts versus aggregator master accounts;
- cubic and USPS/UPS economics;
- reseller/multi-tenant terms;
- label ownership and refund flow;
- platform-protection loss when the label is not bought through Amazon/eBay;
- rate-shopping latency, webhooks, tracking truth, data retention, and support burden.

### 4.4 Browser-extension bridge

Treat an extension as a separate post-V1 option, not a free replacement for VendorView. Research:

- Chrome/Edge Manifest V3 host permissions and least-privilege models;
- Chrome Web Store and Edge Add-ons review implications for financial/marketplace page access;
- whether observing PDF downloads, response bodies, blob URLs, or tracking values is consistently possible;
- marketplace terms of service and account-lock risk;
- extension signing, forced updates, enterprise deployment, incident response, and credential boundary;
- DOM/network brittleness versus the watched-folder alternative.

### 4.5 Label PDF identity assumptions

Determine, with actual current sample labels or official templates where legally available, which identifiers
appear in text layers for Amazon, eBay, USPS, UPS, FedEx, and common aggregator labels:

- marketplace order ID;
- merchant reference;
- package reference fields;
- tracking number and barcode text;
- whether identifiers survive 4x6 thermal formatting;
- whether the label is text-based, vector outlines, raster-only, encrypted, or combined with a packing slip.

Provide a confidence matrix. "Almost always" is not sufficient for an automatic database write.

### 4.6 High-volume economics

Validate the labor-cost thesis with explicit formulas and sensitivity ranges rather than one hardcoded
45-second assumption. Include:

- labels per shift;
- external-purchase seconds per label;
- loaded labor rate;
- rate savings distribution;
- error/rework cost;
- claim-protection value;
- software/API fees;
- exception percentage;
- printer and workstation delays.

Define the volume/exception thresholds at which watched-folder V1 should be retired in favor of direct API
purchase.

---

## 5. Proposed V1 scope for Gemini to critique

### 5.1 In scope

#### Public web/control plane

- Marketing/product explanation.
- Signup, signin, invitations, organization creation/selection, and account recovery.
- Billing and plan management where already required.
- Desktop download page with platform/architecture detection and manual alternatives.
- Release channel/version information.
- Device enrollment and revocation.
- One-time, expiring handoff into the installed Tauri client; no session token in a URL.
- Mobile app links/TestFlight/App Store distribution when available.

#### Tauri desktop

- Hosted operational route on one exact allowlisted production origin.
- Desktop-device enrollment and revocation.
- Label-folder selection and persisted user consent.
- Stable-file detection, byte/size/MIME validation, SHA-256, upload, retry, and sanitized status events.
- Required named-printer selection and silent-print capability if the current outbound operation needs it.
- Signed updates and release-channel visibility.
- No embedded marketplace/vendor browser.
- No general filesystem browser.

#### Hosted outbound product

- Packed-awaiting-label queue.
- Ingestion inbox with processing, applied, quarantined, failed, and duplicate outcomes.
- Exact order-reference match.
- Scan-to-match quarantine resolution.
- Tracking attachment through the existing tracking domain.
- `PACKED -> LABELED` transition through the canonical state machine.
- Realtime update in all connected clients.
- Audit/history sufficient to explain who/what/when/source/hash/result.
- Exception recovery and safe retry.

#### SwiftUI outbound cohort

- Native authentication and organization selection.
- Orders queue and order detail.
- Pick.
- Pack confirmation/evidence for the agreed V1 path.
- Label state, quarantine visibility, and resolution by scanning order then tracking where authorized.
- Stage and scan-out.
- Exceptions and recent history.
- Camera and hardware-scanner input.
- Durable local mutation queue, idempotency keys, retry state, and conflict display.
- Realtime or bounded-refresh consistency with the hosted source of truth.

#### Contract and test infrastructure

- Versioned `/api/v1` contract with OpenAPI output.
- Generated or mechanically verified Swift DTO/client surface.
- One server-side ingestion domain used by Tauri and browser fixtures.
- Browser native-adapter simulator available only in test/development builds.
- Deterministic test organizations, users, permissions, orders, serial units, and PDF fixtures.

### 5.2 Explicitly out of scope for V1

- Automatic marketplace label purchase unless research proves an already-approved, low-risk integration can
  ship inside the V1 window.
- Browser extension.
- Generic desktop filesystem workspace.
- Embedded Amazon/eBay/Pirate Ship login.
- Full offline warehouse operation.
- Porting every desktop or `/m` module.
- Deleting the current Electron/mobile implementation before pilot parity.
- A new shipment, tracking, order, document, or lifecycle source of truth.
- Fuzzy or AI-only order attachment.
- Treating OCR confidence as permission to mutate a shipment automatically.

---

## 6. Exact V1 ingestion contract to evaluate

### 6.1 API boundary

Recommend exact request/response/error semantics for a contract equivalent to:

```http
POST /api/v1/label-ingestions
Content-Type: multipart/form-data
Authorization: staff or enrolled-device context

file=<pdf bytes>
clientEventId=<uuid>
sha256=<hex>
source=tauri_watched_folder|browser_test_upload|manual_upload
deviceId=<server-recognized enrolled device, never trusted as tenant identity>
observedBasename=<basename only; never upload the user's absolute local path>
observedAt=<RFC3339>
```

The server must derive organization, staff/device principal, permissions, and allowed source from auth. It
must independently compute the content hash and reject a claimed mismatch.

The response should expose a stable outcome vocabulary, not internal exceptions:

```text
APPLIED
QUARANTINED_NO_ORDER_REFERENCE
QUARANTINED_AMBIGUOUS_ORDER
QUARANTINED_MULTIPLE_TRACKING
DUPLICATE_ALREADY_APPLIED
REJECTED_UNSUPPORTED_MEDIA
REJECTED_TOO_LARGE
REJECTED_ENCRYPTED
REJECTED_INVALID_PDF
FAILED_RETRYABLE
FAILED_TERMINAL
```

Research should recommend whether asynchronous parsing is necessary for V1. If asynchronous, specify the
creation response, polling/realtime contract, terminal-state guarantees, and retry ownership.

### 6.2 Ledger model

Evaluate a tenant-from-birth ledger approximately containing:

```text
id
organization_id
device_id nullable
actor_staff_id nullable
client_event_id
server_sha256
observed_basename
byte_size
page_count nullable
source
state
document_id nullable
matched_order_id nullable
shipment_id nullable
normalized_tracking nullable
carrier nullable
detected_order_reference nullable
match_method nullable
parser_version
attempt_count
error_code nullable
error_detail_safe nullable
created_at
updated_at
applied_at nullable
resolved_by_staff_id nullable
resolved_at nullable
```

Required properties:

- unique `(organization_id, server_sha256)`;
- unique `(organization_id, client_event_id)` when present;
- organization-led indexes;
- RLS/tenant policy installed at table birth;
- immutable original hash and original observation metadata;
- no raw absolute workstation path;
- no raw PDF text stored indefinitely unless retention and sensitivity are explicitly approved;
- append-only audit/ops event for state changes;
- safe replay returns the first successful result rather than repeating side effects.

### 6.3 Matching precedence

Proposed first-match policy:

1. Exact Cycle Forge reference explicitly embedded in the file, validated against an order in the current
   organization.
2. Exact normalized marketplace order ID matched to `orders.order_id` plus expected marketplace/account
   context in the current organization.
3. Explicit operator scan/select resolution from the quarantine UI.
4. Otherwise remain quarantined.

Tracking number alone may prove the carrier artifact but may not select an unlinked order. SKU, customer
name, address, amount, filename, and fuzzy similarity are prohibited as automatic match keys.

Research should determine the safest way to create a Cycle Forge reference for labels bought in external
sites when the site offers a printable reference field. Do not assume all channels preserve it.

### 6.4 Atomic apply operation

The accepted application must behave as one idempotent domain operation:

1. Lock/re-read ingestion and target order in the tenant transaction.
2. Verify ingestion is unresolved or replay-safe.
3. Create/reuse the canonical `shipping_tracking_numbers` row.
4. Apply primary/additional shipment links through existing tracking reconciliation.
5. Create/reuse the canonical `documents` record and entity links.
6. Transition eligible packed serial units to `LABELED` through the inventory state machine.
7. Mark ingestion `APPLIED` with references to resulting records.
8. Append audit/ops events.
9. Commit.
10. Publish cache invalidation and realtime events after commit.

Research must specify partial-order and multi-package semantics. One label must not silently transition units
belonging to a different package or order line.

### 6.5 File-processing rules

Define exact V1 behavior for:

- file-created events received before the browser finishes writing;
- file rename versus incremental write;
- same bytes under a different filename;
- same tracking in a visually different PDF;
- multi-page PDFs;
- multiple labels in one PDF;
- image-only PDFs;
- malformed or truncated PDFs;
- encrypted/password-protected PDFs;
- oversized files and decompression bombs;
- malicious PDF objects/scripts/attachments;
- duplicate watcher events;
- network interruption after upload but before response;
- local archive/quarantine folder moves;
- filename collisions;
- workstation clock skew;
- parser-version upgrades and replay.

Recommend text-layer extraction for the lean path and an explicit quarantine reason for image-only input
unless OCR is proven safe and necessary. OCR may assist review; it must not silently upgrade an ambiguous
match to an automatic mutation.

---

## 7. Browser-verifiable architecture

### 7.1 Native adapter interface

The operational web UI should depend on a small semantic interface, not Tauri APIs directly:

```text
NativeLabelSource
  capabilities() -> { folderWatch, silentPrint, printerList, secureEnrollment }
  chooseFolder() -> consent/result
  watchStatus() -> stopped|watching|degraded
  subscribeToObservations(callback)
  retryObservation(ingestionId)

NativePrintService
  listPrinters()
  printDocument(documentId, printerId, clientEventId)
```

Production implementations:

- `TauriLabelSource`
- `TauriPrintService`

Test/development implementations:

- `BrowserFixtureLabelSource`, backed by `<input type="file">` or drag/drop;
- `BrowserPrintRecorder`, which records requested document/printer/idempotency data and renders a preview
  instead of claiming an OS print occurred.

The browser implementations must change only transport/capability behavior. They must not replace server
parsing, matching, authorization, data writes, projection, audit, or realtime.

### 7.2 Browser harness constraints

- Available only when an explicit non-production flag is set.
- Server refuses the `browser_test_upload` source in production.
- No anonymous test routes.
- Uses normal authenticated roles and permissions.
- No "success" button that bypasses PDF parsing.
- Test data seeded through Playwright setup or a separately authenticated test fixture process, not a public
  production endpoint.
- All app browser requests in this repository go through `http://localhost:3050`.
- Browser tests assert visible UI outcomes and network contracts; database-level assertions may be made by
  the test runner after the browser action, not by exposing database access to the page.

### 7.3 What the browser suite must prove

The browser/Playwright suite can and should prove:

- authentication and permission gating;
- organization isolation;
- packed-awaiting-label queue projection;
- file upload and server-side hash verification;
- parser result presentation;
- exact order match;
- quarantine states and operator resolution;
- duplicate/idempotent replay behavior;
- tracking/document/link persistence;
- canonical lifecycle transition;
- audit/history visibility;
- realtime change in a second browser context;
- retry and terminal error UX;
- public-web onboarding/download/device-enrollment UX;
- responsive reference behavior for the workflow used by SwiftUI.

### 7.4 What still requires native tests

The Definition of Done must additionally require:

- Rust unit tests for stable-file detection, path scoping, hash, retry journal, and sanitization;
- a Tauri integration smoke that observes a real temporary directory and uploads one fixture;
- printer enumeration and named-print smoke on supported OS images/hardware;
- code-signing, notarization, installer, and updater verification in release automation;
- deep-link and one-time enrollment smoke;
- Swift unit tests for auth/token storage, DTO decoding, local queue, and state reducers;
- XCUITest for the minimum iPhone/iPad outbound happy path and scan flow.

These are small boundary suites. They must not duplicate the full business workflow already covered in the
browser.

---

## 8. Required browser acceptance scenarios

Gemini must refine this into a complete test matrix with preconditions, fixture, actions, visible
assertions, API assertions, durable-data assertions, audit assertions, and cleanup.

### B01 — Public web to desktop enrollment

**Given** a signed-in organization administrator on the public web  
**When** they choose the correct desktop download and enroll a new device  
**Then** the UI issues a single-use, short-lived handoff; the device becomes visible and revocable; no
session or refresh token appears in the URL, page source, analytics event, or browser history.

### B02 — Packed order enters Needs label

**Given** an order with an eligible packed unit and no linked shipment  
**When** the outbound queue loads  
**Then** it appears exactly once in `PACKED_AWAITING_LABEL`/`Needs label`; source marketplace status is
unchanged.

### B03 — Exact reference auto-apply

**Given** a text-layer PDF containing one valid tracking number and one exact marketplace order reference  
**When** uploaded through `BrowserFixtureLabelSource`  
**Then** ingestion moves visibly through processing to applied; tracking and document are linked; eligible
unit state is `LABELED`; UI projects `LABEL_READY`; audit names the authenticated actor/source/hash; a second
browser receives the update without reload.

### B04 — Tracking-only quarantine

**Given** a PDF with a valid tracking number but no accepted order reference  
**When** ingested  
**Then** no order, shipment link, or unit state changes; the item appears in quarantine with a precise reason
and a scan-to-match action.

### B05 — Operator scan-pair resolution

**Given** a tracking-only quarantined ingestion and a packed order  
**When** an authorized operator scans/selects the order and confirms the detected tracking  
**Then** the same atomic apply operation as B03 runs; resolver identity and resolution time are audited.

### B06 — Ambiguous order reference

**Given** two candidate rows in the same organization that cannot be uniquely resolved by the complete
approved match key  
**When** a label is ingested  
**Then** it is quarantined; no arbitrary first match is selected.

### B07 — Cross-tenant collision

**Given** organization A and B contain the same external order text  
**When** an A principal ingests or resolves a label  
**Then** only A records are queryable or mutable; attempting to submit B's internal identifier produces a
non-enumerating error; audit contains no B data.

### B08 — Duplicate bytes

**Given** an already applied PDF  
**When** the same bytes are uploaded again under another filename and client event ID  
**Then** the original result is returned as a duplicate; no second tracking, document, transition, or audit
mutation is created beyond an allowed duplicate-observed event.

### B09 — Network retry with same client event

**Given** the server commits but the client loses the response  
**When** the client retries with the same event ID/hash  
**Then** it receives the committed result and no side effect is duplicated.

### B10 — Same tracking, different bytes

**Given** a carrier re-render/reprint with different PDF bytes but the same tracking  
**When** ingested  
**Then** V1 applies the documented reprint policy: it must not create a conflicting shipment or repeat the
lifecycle transition; document/reprint history remains explainable.

### B11 — Multiple tracking candidates

**Given** a PDF containing multiple plausible tracking values  
**When** parsed  
**Then** it is quarantined unless deterministic package rules identify exactly one; the UI shows candidates
without exposing raw sensitive PDF text.

### B12 — Invalid and hostile inputs

Exercise corrupt, truncated, encrypted, wrong-MIME, HTML-disguised-as-PDF, very large, high-object-count,
embedded-script, and decompression-bomb fixtures. Each must fail with a safe terminal state, no partial
business mutation, bounded resource use, and sanitized operator error.

### B13 — Image-only label

**Given** a raster-only label  
**When** V1 has no approved OCR path  
**Then** it quarantines as `OCR_REQUIRED`/unsupported rather than treating the absence of extracted text as
an empty valid label.

### B14 — Unauthorized role

**Given** a user who may view orders but may not attach tracking or resolve exceptions  
**When** they upload or resolve  
**Then** server authorization denies the mutation even if the UI is bypassed.

### B15 — Multi-package order

**Given** an order with two explicit package/shipment slots  
**When** one label is applied  
**Then** only its package is labeled; the order does not become globally ready until the documented package
completion rule is satisfied.

### B16 — Concurrent resolution

**Given** two operators open the same quarantine item  
**When** both resolve it to different orders  
**Then** one transaction wins; the loser receives a conflict and current committed result; no split truth is
created.

### B17 — Rollback on transition failure

**Given** tracking is syntactically valid but a unit transition is no longer allowed  
**When** apply runs  
**Then** the chosen atomicity policy is honored. V1 must not show an applied label while silently leaving an
unexplained mixed lifecycle.

### B18 — Realtime reconnection

**Given** a second client loses realtime connectivity during apply  
**When** it reconnects/refetches  
**Then** it converges to the durable server projection and does not retain stale `Needs label` state.

### B19 — Device revocation

**Given** an enrolled desktop device is revoked from the web control plane  
**When** it attempts a subsequent native upload or token refresh  
**Then** the server denies it and the client presents a recoverable re-enrollment state.

### B20 — Browser print recorder

**Given** an applied label document and selected logical printer  
**When** Print is invoked in browser test mode  
**Then** the recorder receives the correct document, printer profile, copies, and idempotency key; the UI
shows queued/completed simulation explicitly, never claims an OS printer was exercised.

### B21 — Public web excludes operational work

**Given** a normal browser session on the public product  
**When** navigating its primary information architecture  
**Then** the principal path is onboarding/account/download—not the legacy operational desktop. If operations
are restricted to enrolled desktop clients, the gate relies on a server-recognized device session, not a
spoofable user-agent string.

### B22 — SwiftUI contract parity

**Given** the same seeded account and order facts  
**When** the browser reference flow and generated Swift client load them  
**Then** contract fixtures decode to the same identifiers, states, permissions, pagination, errors, and
idempotency semantics. Browser tests prove the server behavior; Swift contract/XCUITests prove the native
adapter renders and invokes it correctly.

---

## 9. Required fixture corpus

Define a versioned fixture manifest. Each file must declare expected parser output, expected ingestion
outcome, sensitivity classification, provenance/license, and SHA-256.

Minimum corpus:

1. UPS text-layer 4x6 with exact order reference.
2. USPS numeric tracking with exact reference.
3. FedEx numeric tracking with exact reference.
4. Amazon-style order reference fixture, legally synthetic if necessary.
5. eBay-style order reference fixture, legally synthetic if necessary.
6. Tracking-only label.
7. Image-only label.
8. Combined label and packing slip.
9. Two labels in one PDF.
10. Multiple tracking-like numbers.
11. Duplicate bytes with different filenames.
12. Same tracking with different bytes.
13. Encrypted PDF.
14. Truncated/corrupt PDF.
15. MIME spoof.
16. Oversized/object-amplification adversarial fixture.
17. Unicode/whitespace/order-ID normalization fixture.
18. Cross-tenant identifier collision fixture.
19. Redacted real-world fixtures only if retention and access policy allow them.

No fixture may contain a real customer address, marketplace credential, live tracking number, or reusable
session material.

---

## 10. V1 Definition of Done

Gemini must critique and then return a final Definition of Done at least this strict.

### 10.1 Architecture and simplification

- Tauri is the primary enrolled desktop client for the pilot cohort.
- Electron has a complete capability disposition and remains only as rollback during the defined parallel
  window.
- `VendorView` is absent from the V1 path.
- Tauri remote-content capabilities allow exactly the production operations origin and only named semantic
  commands.
- No generic filesystem, shell, arbitrary URL, arbitrary print path, or generic IPC command is exposed.
- Public web primary navigation covers onboarding/control-plane/download responsibilities.
- Operational backend remains hosted; no duplicate embedded server is introduced.

### 10.2 Data correctness

- No V1 code writes `LABEL_READY` into `orders.status`.
- Tracking uses existing canonical shipment/tracking records and links.
- Documents use existing document storage and entity-link primitives.
- Packed-to-labeled changes use the canonical transition machinery and append lifecycle evidence.
- Every apply is tenant-scoped, permission-checked, idempotent, audited, and transactionally consistent.
- Automatic matching uses only approved exact keys.
- Ambiguous/missing identity produces quarantine with no business mutation.
- Duplicate bytes, request retries, reprints, multi-package orders, and concurrency have tested semantics.

### 10.3 Browser-verifiable product

- The production business workflow is injectable through the browser fixture adapter without substituting
  fake domain logic.
- B01–B22 are implemented or explicitly narrowed through a reviewed scope decision.
- All browser calls target `http://localhost:3050` in repository test environments.
- Tests assert visible state, network contract, durable state, audit, and second-client convergence.
- The native test harness cannot be enabled in production.
- Accessibility includes keyboard completion, focus recovery after scan/actions, non-color status meaning,
  live-region behavior for asynchronous ingestion, and reduced-motion compliance.
- Responsive browser reference states exist for the SwiftUI cohort so product behavior can be inspected
  without the iOS simulator.

### 10.4 Tauri boundary

- Real-folder smoke proves create/rename/partial-write stabilization and one successful upload.
- Path/root scoping is tested against traversal, symlink, and out-of-root access.
- Local retry journal survives restart and cannot duplicate server side effects.
- Absolute paths and file contents are absent from logs except under an explicit redacted diagnostic mode.
- Supported OS printer enumeration/print behavior is tested where in V1 scope.
- Installers are signed; macOS builds are notarized; updater artifacts and metadata are signed; rollback and
  key custody are documented and exercised.
- Revoked devices cannot upload, refresh, or invoke privileged operations.

### 10.5 SwiftUI boundary

- The selected outbound cohort is native SwiftUI and does not embed the old `/m` UI as its implementation.
- API DTOs are generated or mechanically checked against versioned OpenAPI fixtures.
- Staff tokens are short-lived; refresh material uses Keychain; logout/revocation removes access.
- Organization switching cannot replay queued mutations into the previous or next organization.
- Scanner/camera input, offline queue, retry, conflict, and permission loss have native tests.
- Minimum iPhone and iPad happy paths pass XCUITest.
- The same server-side B03–B19 semantics are not reimplemented locally.

### 10.6 Security and release

- Threat model covers compromised hosted frontend, malicious PDF, stolen desktop device, revoked staff,
  cross-tenant identifiers, replay, extension pressure, and updater-key compromise.
- New tables have RLS/tenant enforcement and org-led indexes at birth.
- V1 endpoints pass targeted route-auth and tenancy static checks with no new unresolved findings.
- Release automation, rather than `next build` configuration comments, proves lint/type/test/build/signing
  gates actually run.
- Pilot rollout is feature-flagged by organization and has observable rollback.
- Audit/KPI dashboards can distinguish parsed, auto-applied, human-resolved, duplicate, retryable failure,
  terminal failure, and cross-tenant denial outcomes.

### 10.7 Operational success thresholds

Gemini should research and propose defensible values. At minimum the pilot must define:

- label auto-match rate;
- quarantine rate by reason;
- false-auto-match target: effectively zero;
- median and p95 file-observed-to-UI-applied time;
- duplicate/retry side-effect rate: zero;
- manual touches and seconds per label;
- labels per labor hour;
- reprint rate;
- wrong-label/wrong-order incident rate;
- cross-tenant access incidents: zero;
- Tauri crash-free sessions and updater success;
- SwiftUI mutation retry/conflict rate;
- threshold that triggers direct Buy Shipping API investment.

---

## 11. Required research workstreams

### A. Marketplace and carrier feasibility

Answer every question in §4.1–§4.3 using current primary documentation. Produce a matrix by marketplace,
country, seller/app eligibility, operation, protection retained, label/refund capabilities, limitations,
approval lead time, and V1/V2 recommendation.

### B. Desktop security architecture

Evaluate Tauri's current remote webview, capability, scope, CSP, navigation, deep-link, updater, filesystem,
and signing models. Recommend exact trust boundaries and enumerate failure modes if the hosted frontend is
compromised.

### C. PDF parsing and malware boundary

Compare credible Rust/server parsing options, sandboxing/isolation, memory/resource limits, text fidelity,
barcode decoding, OCR deferral, and known malicious-PDF risks. Recommend where parsing runs and why.

### D. Identity and state model

Validate the exact-match policy, order-reference normalization, multi-account uniqueness, package grain,
unit transitions, quarantine resolution, reprint semantics, and audit model against WMS/OMS practice.

### E. Native authentication

Recommend a standards-based Tauri and SwiftUI enrollment/auth flow. Cover OAuth 2.1/OIDC, authorization code
plus PKCE, app/universal links, loopback/custom scheme tradeoffs, device binding, refresh rotation, Keychain,
revocation, SSO/MFA, and organization switching.

### F. Browser-first verification

Critique §7–§9. Recommend the cleanest dependency boundary that maximizes browser coverage without allowing
the test harness into production or letting native simulations lie about OS behavior.

### G. SwiftUI migration

Recommend the minimum iOS/iPadOS architecture for the selected outbound cohort: navigation, camera/scanner,
hardware keyboard input, local mutation journal, generated API client, realtime, observability, and test
strategy. Distinguish behavior parity from visual/component-code reuse.

### H. Rollout and economics

Define pilot size, parallel duration, kill/rollback conditions, instrumentation, support runbook, and the
economic trigger for V2 marketplace APIs.

---

## 12. Required final answer format from Gemini

Return one coherent report with these exact sections:

1. **Executive decision** — approve, revise, or reject the proposed V1; maximum two pages.
2. **Claim-verification ledger** — each claim from §4, verdict (`verified`, `partly verified`, `false`,
   `unknown`), evidence, applicability, and consequence.
3. **Recommended V1 architecture** — trust-boundary diagram and component responsibilities.
4. **Capability disposition** — every Electron capability marked `PORT`, `RETIRE`, or `DEFER` with evidence.
5. **Canonical state machine** — ingestion, package/order projection, unit lifecycle, quarantine, reprint, and
   rollback transitions.
6. **Data model and transaction design** — tables/columns/constraints/indexes, reuse map, atomicity, and
   idempotency.
7. **API contract** — endpoint shapes, authentication principals, error vocabulary, async/realtime contract,
   and OpenAPI/Swift generation strategy.
8. **Security and privacy threat model** — assets, actors, abuse cases, mitigations, residual risk.
9. **Browser test architecture** — adapter seam, fixture corpus, environment, and why production code is not
   bypassed.
10. **Acceptance matrix** — expand B01–B22 with preconditions, actions, UI/network/data/audit assertions,
    native companion test where needed, and priority.
11. **SwiftUI parity contract** — exact V1 screens, verbs, offline/retry behavior, and native-only tests.
12. **Implementation sequence** — dependency-ordered increments, each independently deployable and
    reversible.
13. **Definition of Done** — final objective checklist with measurable pass/fail language.
14. **Pilot/KPI plan** — baseline, target, instrumentation, sample size, review window, and V2 trigger.
15. **Open decisions** — only choices that materially change scope, risk, or data semantics.
16. **Sources** — primary sources first; stable URLs; access dates; limitations noted.

For recommendations, label each as:

- `MUST FOR V1`
- `SHOULD FOR V1`
- `DEFER TO V2`
- `REJECT`

For each `MUST FOR V1`, identify its proving test or evidence artifact. If no test or artifact can prove it,
the recommendation is not yet implementation-ready.

---

## 13. Anti-goals for the research answer

Reject answers that:

- recommend wiping the current codebase before parity;
- present a generic Tauri-versus-Electron feature table without mapping current capabilities;
- claim SwiftUI is a direct port of React components;
- put `LABEL_READY` in `orders.status`;
- introduce a second shipment/tracking/document/state-machine truth;
- use tracking, SKU, address, or fuzzy similarity alone to auto-select an unlinked order;
- assume eBay/Pirate Ship label-purchase APIs without current official proof;
- suggest a browser extension without permissions, store-review, terms, and maintenance analysis;
- claim browser automation proves native folder, printer, signing, Keychain, or updater behavior;
- create a browser-only fake ingestion flow that bypasses production server logic;
- expose a test fixture endpoint in production;
- weaken tenant isolation, authentication, audit, or transition rules to speed the rewrite;
- provide a schedule before identifying dependency and approval risks;
- leave multi-package, duplicate, retry, concurrency, quarantine, or rollback behavior undefined.

The desired answer is a falsifiable V1 contract: small enough to ship, strict enough not to corrupt
fulfillment data, and structured so one browser-driven suite proves almost all business behavior while
small native suites prove the honest operating-system boundaries.
