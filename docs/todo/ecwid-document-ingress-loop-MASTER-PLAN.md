# ECWID order and document-ingress loop — master plan and verifier input

> Plan id: `wms-ecwid-document-ingress-v3`
> Target repository: `cycleforge-prod`
> Loop owner: Garisek-OS
> Domain owner: CycleForge WMS
> First provider: ECWID
> First verifier lane: OMP terminal through the generic harness adapter
> Status: Phase 0 harness boundary and the first ECWID document vertical slice
> are implemented; schedule persistence and document lifecycle remain stopped
> pending explicit schema approval

## Loop input

Submit this exact goal as a `HarnessJobV1` with role `verifier`, allowed action
`read`, and this plan's digest to the managed CycleForge OMP terminal:

> Act as the advisor/verifier for Phase 1 of
> `docs/todo/ecwid-document-ingress-loop-MASTER-PLAN.md`. Ground every claim in
> the current CycleForge code. Confirm that the proposed ECWID-first bulk
> document-ingress and pairing flow reuses the existing outbound-document domain,
> keeps model output non-authoritative, preserves tenant/account routing and
> idempotency, fetches and exposes each available packing slip with its imported
> order, gives operators a recoverable review/replace/reject path, and does not
> expose Neon or marketplace credentials to the inference host. Verify the
> default 08:30 and 15:00 America/Los_Angeles schedules, runtime schedule edits,
> replay safety, and document-viewing path. Produce findings only; do not edit
> code, schema, credentials, schedules, or baselines.

The first run is deliberately one verifier job. Hermes is not used. The generic
loop talks only to the harness adapter; the first adapter delivers the job to an
OMP terminal through `garisek-ptyd`. A full diamond and coding loop are not
authorized until the adapter records a terminal verifier receipt and the
operator accepts or amends the evidence-backed findings.

### Implementation checkpoint — 2026-09-17

The first safe slice now exists and has machine evidence:

- Garisek-OS contains executable `HarnessJobV1` / `HarnessReceiptV1` contracts,
  an adapter registry, a deterministic fake adapter, and an OMP-over-ptyd
  adapter. Two independently registered fake adapters pass the same conformance
  contract; the OMP adapter test proves repository mapping, OMP-pane validation,
  one-line submission, job-id/message-id parity, and delivered-state recovery.
- The live OMP adapter connected to `cf-prod-9`, submitted verifier job
  `wms-doc-ingress-verify-20260917`, and recovered a `delivered` receipt plus the
  ptyd log reference. No Hermes process or API participated.
- The live verifier inspected the current CycleForge diff but the model provider
  rate-limited before a terminal PASS/BLOCK result. Delivery is proven; semantic
  completion is not. The OMP adapter therefore correctly advertises no durable
  completion receipts and never promotes `delivered` to `completed`.
- New ECWID orders carry their inserted database ids through the canonical
  transfer job. The connector immediately and idempotently requests only the
  provider-authored packing slip for each unique inserted order. Document
  failures are summarized and cannot roll back the committed ingest.
- ECWID invoice failures no longer silently become generated packing slips.
- The mobile To Ship sheet now opens fetched labels and packing slips inside the
  product through the authenticated document-content route. A missing shipping
  label becomes an upload action; a missing packing slip becomes a fetch action.
- Focused unit tests pass (5/5), targeted lint and TypeScript pass, and the
  mobile document Playwright spec passes 2/2 at `http://localhost:3050` using a
  390×844 viewport.
- `pnpm verify:fast` passes. The full repository eval remains red on pre-existing
  unrelated kiosk-scope debt (`counter scale — no desk surface imports it`), so
  this plan does not claim the entire dirty worktree is green.
- The three reachable execution hosts were inventoried live. Garisek-OS now has
  a reusable `npm run inference-host:audit` command and pure policy tests. Its
  live `gex45` receipt proves root-only modes, zero forbidden credential names,
  a non-empty scoped `VISION_TOKEN`, restricted origins, and loopback-only vLLM.
  The token was generated on `avion` and only that key was synchronized; the
  full CycleForge environment was never copied.

Still not complete: editable schedule persistence/UI, DST occurrence claims,
bulk label/slip pairing, recoverable replacement/quarantine, PDF page controls,
socket transport, and structured OMP completion/cancellation receipts.

### Verifier receipt and outcome

The first bounded phase was delivered through the live ptyd-managed OMP session
`cf-prod-9` without invoking the Hermes API:

- input plan SHA-256: `7e83a7fe7b0d5c76fc891ccf95835790a23ab296184a4802dbabba79d26b3779`;
- CycleForge commit: `4aac43d1b48ce744dac447f156572001f413536f`;
- ptyd message id: `wms-ecwid-plan-verifier-v2-7e83a7fe`;
- ptyd queue job id: `efa15a80-644f-55c2-a51f-b3d9fc918681`;
- accepted and delivered with terminal echo on 2026-09-16 PDT;
- verifier verdict: **BLOCK** pending the amendments now incorporated below.

This proves the existing ptyd `accept -> deliver -> terminal output` path, not
the full target adapter. Today ptyd has no structured harness completion receipt
for this job, and `HarnessJobV1` / `HarnessReceiptV1` are still plan contracts,
not code. Implementing those schemas, final-result capture, and fake-adapter
conformance is therefore Phase 0, before this plan can claim a functioning
harness-neutral loop. This receipt remains pinned to the pre-amendment digest;
the amended file must receive a new verifier receipt before implementation.

## 1. End state

An operator can import a mixed batch of packing slips and shipping labels from a
phone or desktop. ECWID orders and their available packing-slip PDFs arrive in
one observable ingest workflow through the existing ECWID API adapter. The
system separates and identifies every document,
extracts candidate order/account/tracking facts on the local inference fleet,
and proposes pairs. Deterministic CycleForge code verifies each proposal against
tenant-scoped orders and shipments before anything becomes an attached outbound
document.

The mobile-first review queue shows, per proposed order:

- packing slip preview;
- shipping-label preview;
- resolved platform and account;
- order number and tracking evidence;
- confidence and conflicts;
- actions to confirm, reassign, replace, quarantine, or reject.

The order details and review queue provide an in-product document viewer. An
operator can preview the fetched packing slip, inspect every page, download or
print it, see fetch status/errors, and replace an unreadable source without
leaving the CycleForge UI.

A rejected or unreadable source is never silently destroyed. It enters a
recoverable quarantine with its upload batch, digest, reason, and verifier trail.
Permanent deletion is a separate authorized action after replacement or explicit
confirmation.

## 2. Repository-agnostic boundary

Garisek-OS owns the generic loop and must not know ECWID database columns:

- document-ingress and observation envelopes;
- graph checkpoints, receipts, evidence, interrupts, and resume;
- inference-host selection and model-call receipts;
- generic states: `received`, `extracted`, `proposed`, `needs_review`,
  `verified`, `committed`, `quarantined`, `rejected`;
- verifier results and operator questions.
- harness-neutral `HarnessJobV1` and `HarnessReceiptV1` contracts. OMP/ptyd is
  the first adapter, not a dependency embedded in the graph.

CycleForge owns the WMS adapter:

- ECWID order and invoice fetch;
- organization, account, order, shipment, and tracking resolution;
- packing-slip and shipping-label document rules;
- Neon transactions and idempotency;
- mobile review projection and permissions;
- document replacement, quarantine, and deletion policy.
- provider ingest schedules, due-run calculation, auditing, and the editable
  scheduling UI.

The inference host returns observations and ranked candidates. It cannot import
orders, attach documents, delete documents, choose a tenant, or write Neon.

The same Garisek loop can later drive Amazon, eBay, Walmart, or a different WMS
by registering another adapter. Provider-specific code never enters the generic
graph state schema beyond namespaced evidence fields.

The same loop can be driven by another coding harness by registering a harness
adapter. CycleForge never shells out to OMP, Hermes, Codex, or another agent.

## 3. Existing CycleForge foundation to reuse

The following capabilities are live and must be extended rather than duplicated:

| Capability | Current source of truth |
|---|---|
| ECWID credentials and invoice PDF fetch | `src/lib/ecwid/client.ts` (`resolveEcwidCreds`, `fetchInvoicePdf`) |
| ECWID packing-slip adapter | `src/lib/documents/marketplace/ecwid-documents.ts` |
| Marketplace fetch orchestration | `src/lib/documents/marketplace/fetch-outbound-documents.ts` |
| Outbound document transaction | `src/lib/documents/outbound-documents.ts` |
| Order/shipment linkage | `documents` + `document_entity_links` + `shipment_links` |
| Idempotent marketplace fetch identity | semantic `sourceHash` and outbound-document unique constraints |
| Manual label/slip upload | `/api/orders/[id]/documents/upload` and `OrderDocumentsSection` |
| Per-order document read/attach | `/api/orders/[id]/documents` |
| Print bundle | `src/lib/documents/print-bundle.ts` |
| ECWID canonical order fetch | `src/lib/orders/sources/ecwid-orders.ts` |
| Canonical order ingestion | `src/lib/orders/ingest-canonical-orders.ts` |
| Existing ECWID batch entry point | `scripts/ecwid-intake-batch.ts` |
| Cron registry/run/lock foundation | `src/lib/cron/registry.ts`, `withCronRun`, `withCronLock` |
| Existing missing-document sweep | `/api/cron/documents/ensure-outbound` |
| Current local vision service | `vision/app/server.py` (identify, label OCR, analyze) |
| Current model endpoint on `gex45` | vLLM `127.0.0.1:8000`, served model `cf-v2-base` |

ECWID supplies the packing slip through `invoice-pdf`. It does not supply the
carrier shipping-label PDF in the current adapter, so the first test batch uses:

1. ECWID orders and packing slips fetched server-side on `avion`;
2. operator-uploaded shipping-label files for those same orders;
3. local OCR/vision to correlate the uploaded labels to the fetched slips;
4. deterministic order/shipment verification before attachment.

The current deployment already runs both integration sync and missing-document
ensure every 15 minutes from `vercel.json`. The integration sync includes ECWID.
The ensure sweep is limited to pack-ready, tech-scanned orders, so it does not
satisfy on-import packing-slip retrieval. The new dispatcher must replace or
consolidate the existing ECWID cadence; leaving both active would create two
schedulers for the same effect.

## 4. ECWID order ingest and schedule law

### 4.1 One workflow, independently recoverable effects

Each due ECWID account run performs this ordered workflow:

```text
fetch canonical ECWID orders
  -> ingest/update tenant-scoped orders
  -> enqueue one packing-slip ensure command per eligible order
  -> fetch invoice-pdf through the existing ECWID document adapter
  -> store/link idempotently by semantic sourceHash + contentSha256
  -> project order + document status to the UI
```

Order persistence and packing-slip retrieval are one observable run but not one
fragile transaction. A transient PDF failure must not roll back a valid order.
It records `document_pending` or `document_failed`, retry metadata, and a typed
error; the document ensure worker can resume without refetching or duplicating
the order. A successful replay links the same digest once.

The existing `sourceHash` is a deterministic marketplace identity derived from
provider/order/document fields; it is not a byte digest. Preserve it for
provider re-fetch identity. Add and verify a separate SHA-256 of document bytes
for upload/content deduplication. Command ids are namespaced by organization and
provider account before they enter the existing API idempotency pattern, whose
key is currently global per route.

For ECWID, an invoice-PDF error must remain a typed `not_available` or retryable
`failed` result. The current marketplace orchestrator silently falls back to a
generated packing slip; that fallback must be disabled on the ECWID evidence
path so the UI cannot mistake generated content for the provider document.

### 4.2 Editable schedules

The default ECWID order-ingest schedule is 08:30 and 15:00 in
`America/Los_Angeles`. Do not attempt to rewrite `vercel.json` from the browser.
Vercel runs one fixed, frequent dispatcher tick; CycleForge reads tenant-scoped
schedule policy from Neon, claims due rows under the existing cron lock/run
infrastructure, and enqueues account-specific ingestion.

The dispatcher supersedes the current unconditional `*/15` ECWID integration
sync entry. It may still tick frequently, but it performs no provider work until
it atomically claims a due occurrence. The existing global advisory lock is a
coarse overlap guard only; it is not the occurrence idempotency mechanism.

The Settings > Integrations > ECWID scheduling surface exposes:

- enabled/disabled;
- one or more local run times, defaulting to 08:30 and 15:00;
- IANA timezone, defaulting to `America/Los_Angeles`;
- next run, last started/completed run, imported/updated/error counts;
- “Run now,” retry failed documents, and the last typed error;
- an audit trail of who changed the schedule and old/new values.

Only an organization administrator with integration-management permission may
change a schedule. Validation rejects duplicate times and invalid timezones.
Due-run identity is unique per organization, provider account, schedule entry,
and intended local occurrence, so dispatcher retries and overlapping ticks do
not duplicate imports. The scheduler defines DST and downtime semantics:

- spring-forward nonexistent local time runs at the next valid instant;
- fall-back repeated local time runs once;
- after downtime, run at most one bounded catch-up per schedule and expose any
  skipped occurrences in health/audit state.

This policy likely needs new persistent schedule and occurrence records. Under
repository law, implementation stops for explicit schema approval before any
migration is created or applied.

## 5. Input contracts

### 5.1 Batch envelope

```ts
type DocumentIngressBatchV1 = {
  v: 1
  batchId: string
  commandId: string
  organizationId: string
  staffId: number
  source: 'bulk_upload' | 'ecwid_fetch'
  provider: 'ecwid'
  accountKey: string
  observedAt: string
  files: Array<{
    objectId: string
    originalName: string
    mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'
    sha256: string
    byteLength: number
    pageCount?: number
  }>
}
```

`organizationId`, `staffId`, and `accountKey` in the envelope are correlation
claims only. The trusted adapter re-derives actor, organization, account, and
permissions from the authenticated connection plus tenant-scoped database
state. A mismatch is rejected before lookup or write; a model or harness can
never select these authorities by filling envelope fields.

Binary data lives in the existing object/document storage path. WebSocket and
LangGraph state carry object ids, digests, page ids, and extracted evidence—not
PDF/image bytes.

### 5.2 Extracted observation

```ts
type DocumentObservationV1 = {
  documentObjectId: string
  page: number
  kind: 'packing_slip' | 'shipping_label' | 'unknown'
  providerHints: string[]
  accountHints: string[]
  orderRefs: string[]
  trackingNumbers: string[]
  recipientNames: string[]
  postalCodes: string[]
  skus: string[]
  textDigest: string
  confidence: number
  model: { provider: string; model: string; traceId: string }
}
```

Model output is strict-schema parsed. Unknown fields are rejected. Raw OCR text,
page image reference, model response, and parsing errors are retained as evidence
under the existing loop evidence policy.

### 5.3 Pairing proposal

```ts
type DocumentPairProposalV1 = {
  proposalId: string
  batchId: string
  packingSlipObjectId: string
  shippingLabelObjectId: string
  candidateOrderId: number | null
  candidateShipmentId: number | null
  accountKey: string | null
  score: number
  matchedOn: Array<'order_ref' | 'tracking' | 'account' | 'recipient' | 'postal' | 'sku'>
  conflicts: string[]
  verdict: 'auto_verify' | 'needs_review' | 'reject'
}
```

The model may propose extracted facts and candidate ordering. Deterministic code
owns the score, conflict list, and verdict.

## 6. Deterministic pairing law

A proposal may auto-verify only when all conditions hold:

1. The organization and configured ECWID account are fixed by the authenticated
   batch; model text cannot select either.
2. The order exists in that organization and is routed to the same ECWID
   account key.
3. At least one strong identifier agrees:
   - normalized marketplace order reference; or
   - normalized tracking number linked to the order's shipment.
4. No strong identifier conflicts with another order in the batch.
5. The document content SHA-256 is not already committed under the same or another
   order unless the existing row is the idempotent replay target.
6. Document kind is unambiguous. A multipage PDF may be split only when page
   boundaries and per-page classifications are retained.
7. The account, order, and shipment lookups are tenant-scoped inside the same
   trusted CycleForge adapter call.

Recipient name, postal code, and SKU are supporting signals. They can raise or
lower a score but cannot override a conflicting order reference or tracking
number.

`needs_review` is the default when evidence is incomplete. The graph never
hallucinates a pair to clear a queue.

## 7. Phase 1 — ECWID testing orders

### 7.1 Fixture selection

Select a small tenant-scoped cohort of ECWID orders already present in
CycleForge:

- 10 single-shipment orders with known order references;
- at least 3 labels with readable tracking numbers;
- at least 2 deliberately rotated or low-contrast scans;
- one duplicate upload;
- one label for an order outside the fixture cohort;
- one corrupt or password-protected PDF;
- one multipage PDF containing more than one document.

Do not print packing slips merely to create input. Fetch them with the existing
ECWID `invoice-pdf` adapter and store them through
`storeOutboundDocumentFromBytes` using the existing source-hash idempotency.

Production customer data must not be copied into committed fixtures. Store
fixture manifests and expected identifiers; keep source documents in protected
test storage or use redacted/synthetic derivatives for committed tests.

### 7.2 Phase graph

```text
batch_ingress
  -> file_safety_check
  -> pdf_page_materialize
  -> document_classify
  -> ocr_extract
  -> ecwid_context_load
  -> candidate_join
  -> deterministic_pair_verify
  -> [auto_commit | operator_review | quarantine]
  -> project_batch_status
```

Each node contributes a receipt. Model calls retain prompt/model/latency/token
metadata. Mechanical nodes emit zero-cost receipts rather than leaving holes.

### 7.3 File safety

- Accept PDF, PNG, and JPEG only in Phase 1.
- Reject executable/polyglot content by detected media type, not filename.
- Enforce per-file, per-page, and batch byte/page limits before rendering.
- Render PDFs in an isolated worker with a deadline and memory ceiling.
- Reject encrypted/password-protected PDFs with a typed recoverable reason.
- Zip ingestion is deferred until archive traversal, decompression-bomb, nested
  archive, and file-count limits have dedicated tests.
- Compute SHA-256 before inference and reuse it for replay/idempotency.

### 7.4 Vision/OCR placement

The trusted CycleForge adapter fetches ECWID data and owns stored document bytes.
It sends only the minimum page image/object reference required for inference.

`gex45` performs local document classification and extraction. The first model
evaluation must compare:

- the existing EasyOCR path from `vision/`;
- the existing Qwen3-4B vLLM model for structured extraction;
- a vision-capable Qwen-VL model only after it is actually installed and its
  memory/latency profile is measured.

The currently running Qwen3-4B endpoint must not be described as Qwen-VL; a
text-only model cannot inspect page pixels. OCR text may be passed to it for
structured parsing, but direct visual reasoning requires a deployed multimodal
model and an image-capable API contract.

### 7.5 Commit

Auto-verified proposals call one CycleForge command per pair. That command:

1. rechecks organization, account, order, shipment, and digest;
2. locks or otherwise serializes the relevant order/document idempotency key;
3. stores or links the packing slip through the existing outbound-document
   domain;
4. stores or links the shipping label with SHIPMENT primary and ORDER secondary
   when an STN is available;
5. records the batch, proposal, evidence, verifier verdict, operator identity,
   and command id;
6. emits a committed/projected acknowledgement to the mobile review queue.

No graph node emits SQL or calls Neon directly from `gex45`.

## 8. Mobile-first review and document surface

The review experience is a CycleForge mobile execution state, not a desktop
DataTable reduced to phone width.

Sticky Sandwich regions:

- top: batch progress, unresolved count, account, connection state;
- middle: paired two-document preview with extracted identifiers and conflicts;
- bottom: confirm, reassign, replace, quarantine/reject.

Primary actions use the execution action primitive described in the realtime
loop plan and the CycleForge design-system motion role. The surface keeps the
canonical scanner door and `MobileShell`. It does not add a sidebar, pagination,
or a second scan button.

Review operations:

- **Confirm**: commit the verified pair.
- **Reassign**: search within the already fixed organization/account and choose
  a different order; the adapter re-verifies before commit.
- **Replace**: upload/fetch a new source, retain the prior object's digest and
  rejection reason, and atomically promote the replacement.
- **Quarantine**: remove from the active queue without deleting evidence.
- **Reject**: terminal review verdict; source remains recoverable.
- **Delete permanently**: separate permission and confirmation, unavailable
  until the document is rejected/replaced and retention policy permits it.

Document-viewing acceptance:

- an imported ECWID order shows packing-slip state without a page reload;
- selecting the document opens an in-shell PDF/image preview with page count,
  filename/type, source account, fetched time, and digest-safe identity;
- multi-page slips support page navigation, fit/zoom, download, and print;
- a failed or pending fetch shows a typed recovery action, not a broken viewer;
- an operator can compare the packing slip and candidate shipping label side by
  side before confirming a pair;
- preview authorization is tenant- and order-scoped; object storage URLs are
  short-lived and are never sent to the inference host as reusable credentials.

The current desktop viewer and replacement path are foundations, not proof of
these requirements. Before reuse:

- replace the browser-native PDF iframe with an in-repo mobile-capable renderer
  (for example PDF.js) whose page navigation, zoom/fit, loading, and failure
  states are testable on iOS Safari and Android Chrome;
- add the `/m` review/document surface first and a true two-document comparison,
  rather than relying on the current single-active desktop slide-over;
- repair replacement so new bytes atomically update content SHA, storage
  provider, bucket/object key, and URL together while preserving a superseded
  record. The current URL-only replacement can leave GCS pointers serving stale
  bytes;
- make quarantine/rejected/superseded states recoverable. Current hard delete
  and shallow audit data cannot meet reversal requirements.

Those lifecycle fields and occurrence records require schema changes and remain
behind the explicit schema-approval stop condition.

## 9. `gex45` environment and secret boundary

### 9.1 Live execution-fleet inventory — 2026-09-17

The fleet was queried directly over the configured SSH paths. These values are
runtime evidence, not purchasing assumptions:

| Loop role | Host | Operating system | CPU / memory | Accelerator | Current capability |
|---|---|---|---|---|---|
| trusted WMS adapter, Neon/marketplace boundary, browser verification | `avion` (local) | Omarchy 4.0.2, Linux 7.1.9 | Intel i7-10700, 16 logical CPUs, 62 GiB RAM | GeForce RTX 5070 Ti, 16,303 MiB | CycleForge switchboard, OMP/ptyd, repository and browser tests |
| inference worker | `gex45` (SSH alias `gex45`) | Ubuntu 24.04, Linux 6.8.0-138 | Intel i5-13500, 20 logical CPUs, 62 GiB RAM | RTX PRO 4000 Blackwell SFF, 24,467 MiB | loopback vLLM at `127.0.0.1:8000`; served id `cf-v2-base`, root `/models/Qwen3-4B`, 16,384-token context |
| advisor/portable operator console | `prometheus` (SSH alias `prometheus`) | macOS 27.2 | Apple M5 Pro, 18 logical CPUs, 48 GiB RAM | Apple M5 Pro integrated GPU | advisor/harness client and operator review; not the trusted database adapter |

Host-selection law:

- `avion` alone owns CycleForge credentials, deterministic verification,
  document commit, Neon writes, Playwright against `http://localhost:3050`, and
  the harness receipt boundary.
- `gex45` receives bounded inference inputs and returns observations only. Its
  currently served Qwen3-4B endpoint is text-only; it may structure OCR text but
  must not be advertised or selected for direct page-image reasoning.
- `prometheus` may submit or review harness jobs, but its availability cannot be
  required for scheduled ingest or warehouse execution.
- Accelerator selection is capability-based (`text.extract`, `vision.page`,
  `ocr.page`) rather than tied to a hostname. A future vision endpoint must
  publish a successful multimodal conformance receipt before the graph routes a
  document image to it.

The inventory command deliberately reads only hardware, OS, and the local vLLM
model catalogue. It does not copy environment values or credentials between
hosts.

### 9.2 Secret boundary

The full CycleForge `.env` must never be copied to `gex45`. It contains database,
marketplace, eBay, Amazon, payment, OAuth, storage, auth, and other credentials
that the inference process does not need.

Deploy a dedicated file:

`/opt/cycleforge-loop/secrets/cycleforge-inference.env`

Allowed keys:

- `CYCLEFORGE_PHASE`
- `CYCLEFORGE_ADAPTER_HOST`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `VISION_DEVICE`
- `VISION_BIND`
- `VISION_TOKEN` (required, non-empty; the service must fail closed without it)
- `ALLOWED_ORIGINS` restricted to the authenticated adapter/proxy origins
- a dedicated inference/gateway token once the authenticated proxy exists
- source-environment fingerprint for deployment traceability

Explicitly forbidden keys include any name containing:

- `DATABASE`, `POSTGRES`, `PG`, `NEON`, `REDIS`, or `KV`;
- `ECWID`, `EBAY`, `AMAZON`, `WALMART`, `UPS`, `FEDEX`, or `SQUARE`;
- `AUTH`, `OAUTH`, `SESSION`, `COOKIE`, `BLOB`, `GCS`, or `NAS`.

ECWID credentials remain on `avion` in CycleForge's trusted server adapter.
`gex45` is loopback-bound and receives inference requests through a tailnet-only
authenticated path. The environment file is owned by root, directory mode 0700,
file mode 0600, and never committed.

Deploy a minimal inference artifact, not the entire `vision/` tree. The deployed
manifest must exclude helper/scripts that reference DB, marketplace, session,
or Zoho credentials. The remote check scans both environment key names and the
deployed artifact for forbidden dependencies. The current scoped environment
file is safe, but the service is not production-ready until a required
`VISION_TOKEN` is installed and fail-closed authentication is verified.

## 10. Phase verifier role

For the first loop execution, the OMP harness job is limited to the verifier
role and must answer these questions with file-and-symbol evidence:

1. Does the plan reuse the existing outbound-document transaction and ECWID
   invoice adapter rather than create a second document store?
2. Can any model-authored account, order id, shipment id, URL, or SQL reach a
   write without deterministic tenant-scoped resolution?
3. Are digest and command-id replays idempotent under concurrency?
4. Can a low-confidence, conflicting, corrupt, or unmatched document be safely
   quarantined without data loss?
5. Can replacement be reversed and audited?
6. Are marketplace/Neon credentials absent from the inference host?
7. Is Qwen-VL treated as unavailable until a multimodal model and endpoint pass
   an actual image fixture?
8. Does every proposed test exercise the real domain command rather than only a
   mocked DOM transition?
9. Does each successful ECWID order fetch enqueue or prove an idempotent packing
   slip ensure outcome, and can an operator view that document in the UI?
10. Can the fixed dispatcher honor editable 08:30 and 15:00 local schedules,
    DST, catch-up, and concurrent tick replay without duplicate effects?
11. Does the loop depend only on the generic harness contract, with OMP details
    contained inside the ptyd adapter and no Hermes call on this path?

The verifier produces findings only. It cannot edit source, schema, credentials,
the plan, or guard baselines.

## 11. Phase 1 Definition of Done

- [ ] The Garisek verifier job completes through the OMP/ptyd adapter with
  durable `ping`, connection, delivery, and terminal result receipts against
  this file's digest and the current CycleForge commit; no Hermes process or API
  participates.
- [ ] The unchanged harness conformance test passes for OMP and a deterministic
  fake/second adapter, proving the loop is not coupled to OMP terminal syntax.
- [ ] Every verifier finding is accepted, resolved in the plan, or explicitly
  rejected by the operator before implementation begins.
- [ ] A real ECWID test cohort is selected without committing customer documents
  or secrets to Git.
- [ ] ECWID packing slips are fetched through the existing adapter and source
  identity plus content SHA-256 prove provider replay and byte replay do not
  create duplicates.
- [ ] Every successfully ingested eligible ECWID order has a terminal packing-
  slip status (`available`, typed `not_available`, or retryable `failed`), and
  document failure never rolls back a valid order import.
- [ ] Operators can open every available ECWID packing slip in the CycleForge
  UI, navigate all pages, download/print it, compare it to the candidate label,
  and see a typed recovery state for unavailable documents.
- [ ] Default ECWID ingestion runs at 08:30 and 15:00
  `America/Los_Angeles`; an authorized operator can add/remove times, change
  timezone, enable/disable, run now, and inspect next/last/error state in the UI.
- [ ] Scheduler tests cover concurrent dispatcher ticks, retry, downtime
  catch-up, spring-forward, fall-back, and prove one effect per intended local
  occurrence.
- [ ] A mixed batch of at least 10 uploaded shipping labels is classified and
  paired against the ECWID cohort.
- [ ] Strong-identifier pairs auto-verify; ambiguous/conflicting/unmatched files
  enter review or quarantine and never auto-attach.
- [ ] Duplicate, corrupt, encrypted, rotated, low-contrast, foreign-order, and
  multipage fixtures produce typed expected outcomes.
- [ ] The model returns strict observations only; deterministic code owns account,
  order, shipment, score, verdict, and commit.
- [ ] Confirm, reassign, replace, quarantine, reject, and authorized permanent
  delete each have unit/domain tests and an audit trail.
- [ ] The mobile review surface passes the CycleForge design-system critique,
  mobile-first guard, relevant eval cohort, and Playwright verification at
  `http://localhost:3050`.
- [ ] Playwright at `http://localhost:3050` proves: changing a schedule updates
  next-run state; Run now imports an ECWID fixture order; its packing slip status
  projects without reload; and the document opens successfully in the viewer.
- [x] `gex45:/opt/cycleforge-loop/secrets/cycleforge-inference.env` exists with
  root ownership, directory mode 0700, file mode 0600, and the allowlist above.
- [x] An automated remote check proves the `gex45` file contains zero forbidden
  key names and that vLLM remains bound to `127.0.0.1`.
- [x] No full CycleForge `.env`, database credential, or marketplace token is
  present on `gex45`.
- [ ] The deployed inference artifact excludes credential-aware helper scripts;
  `VISION_TOKEN` is non-empty, unauthenticated requests fail closed, and allowed
  origins are restricted.
- [ ] The inference test records model id, GPU host, latency, schema validity,
  and evidence digest; a text-only model is never reported as vision-capable.
- [ ] Model outage produces `needs_review` or a deterministic OCR-only result,
  never an unsafe attachment or a lost batch.
- [ ] Garisek loop conformance/snapshot and CycleForge `verify:fast` pass after
  implementation, with failures retained as artifacts.

## 12. Stop conditions

Stop the coding loop and ask the operator when:

- an ECWID account cannot be deterministically selected;
- two orders share the same extracted strong identifier;
- a schema migration is required but not explicitly approved;
- protected customer documents would need to enter Git fixtures;
- the GPU service would need a database or marketplace credential;
- an existing document-domain invariant conflicts with this plan;
- the single-lane verifier returns evidence that the proposed phase duplicates
  or bypasses a live source of truth.
- the harness adapter lacks a structured terminal completion receipt or the
  amended plan digest has not passed the read-only verifier;
- schema approval has not been granted for schedule occurrences and recoverable
  document lifecycle/supersession records.

Passing Phase 1 authorizes planning the implementation increment. It does not
authorize OMP to widen scope to eBay/Amazon, purchase labels, alter tenancy,
delete migrations, or replace the Garisek loop/checkpoint infrastructure.
