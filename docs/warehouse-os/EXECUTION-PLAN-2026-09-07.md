# CycleForge: highest-return execution plan

Planning date: September 7, 2026. Parent: [Mission Contract v0.3](MISSION-CONTRACT-v0.3.md).

## Deadline and finite outcome

**September 28, 2026: operational foundation demonstrated on the dogfood warehouse. October 19, 2026: pilot-ready SaaS candidate demonstrated with an independent tenant.** All dates are America/Los_Angeles, end of day.

These are ambitious targets, not estimates derived from a full implementation audit. They assume focused engineering every working day, timely access to test marketplace accounts, an operator available for a daily floor check, and an independent tenant recruited during week one. External connector approvals may constrain the advertised release scope. Model throughput cannot substitute for integration access or observed floor results.

By October 19, the supported scope is Amazon/eBay orders, receiving and unit/location truth, mobile receive/pack with required pick/move steps, sourcing to an explicitly approved PO/handoff, cited desktop answers, two-organization membership isolation, onboarding/billing/recovery, and one approved workflow improvement. Universal channel coverage, unattended purchasing, full manufacturing and full 3PL billing remain outside this deadline. This is a reliable foundation for a paid pilot, not proof of every long-term mission capability or broad general availability.

## Evidence at planning time

HEAD is `636a07c24`. `node scripts/ci-status.mjs` reports HEAD queued without a receipt. Latest completed full receipt shown is `f5f0645`: lint, tenancy guard, route permissions and slot-table/shortcut/session cohorts passed; typecheck, unit tests and visual peers failed. A visual-peer quarantine entry exists. These are predecessor results, not proof of the current dirty worktree's behavior. Identify and resolve the actual failing diagnostics; do not silence gates to make a deadline.

The repository contains order, receiving, mobile pack and two-device E2E test files. Their presence is not proof they currently pass, run in CI, or assert the full business result. Their reuse is an audit task. Sourcing search and eBay discovery already exist. The operator pulse currently ranks lane, age and count, not monetary ROI. No application code or tests were changed to produce this plan.

## Ranked gaps and end-to-end contracts

This order prioritizes dependency and likely economic impact. No tenant transaction dataset was analyzed, so monetary ROI remains unmeasured. Security and data integrity are prerequisites rather than optional features ranked below profit.

| ID | Close this gap | Required end-to-end acceptance | Economic mechanism | Target |
|---|---|---|---|---|
| R0 | Reproducible release and actionable CI | Identify owned WIP; produce candidate SHA plus migration manifest; obtain required passing receipts; start candidate from documented setup; rehearse deployment rollback in staging | Stops regressions and repeated debugging from consuming every later improvement | Sep 10 |
| R1 | Organization and identity boundaries | Person belongs to A and B; switching changes data, credentials, cached results and sessions; A-only staff cannot read/write B by route, tool, file/photo, search or realtime channel; revoke membership and verify access ends | Makes any tenant rollout possible without exposing data | Sep 13 |
| R2 | Canonical order ingestion | Import a multi-line order from each channel; replay events; process updates/cancellation/partial shipment; same external ID in different accounts stays separate; reconcile authoritative source state and totals | Protects promised revenue; removes manual order reconciliation | Sep 16 |
| R3 | Unit, receiving and location truth | Receive a short/damaged carton; record quantities and evidence; create/identify serial; test/hold/release; scan item and bin; move and audit; preserve part removal/addition provenance for the supported case | Recovers missing stock and avoids false saleable quantity | Sep 20 |
| R4 | Reservation and scan-verified fulfillment | Two attempts compete for the last unit; only one reserves it; wrong serial/condition/label blocks packing; partial shipment preserves remaining demand; tracking acknowledgement reconciles; label reprint cannot duplicate purchase/shipment | Prevents oversell, wrong-item shipment and double costs | Sep 23 |
| R5 | Mobile interruption and exception recovery | Finish receive and pack on supported phone/scanner; refresh mid-step; retry scan; disconnect/reconnect; expire auth; switch device; desktop sees exception and resolution; server commit happens once | Keeps the floor productive without corrupting records | Sep 25 |
| R6 | Demand-driven sourcing and approved PO | A missing part creates one demand; exact identity/compatibility verified; landed quote compared with threshold; current incoming stock reduces need; rejected approval causes no external commitment; approved PO/handoff links to confirmation, receipt and discrepancy | Unblocks paid-for inventory; saves buying time and prevents overbuying | Sep 28 |
| R7 | Grounded desktop answers and priorities | Durable session answers scoped test questions using actual records; displayed values match queries; citations resolve; stale/missing inputs are visible; unsupported questions do not invent answers; action opens correct records | Reduces investigation time and makes next actions credible | Oct 2 |
| R8 | Customer onboarding and operating support | Independent tenant signs up, connects supported channels, imports catalog, invites staff and completes one floor flow; billing entitlement works; cancel/export works; restore rehearsal succeeds | Turns a dogfood tool into a supportable paid service | Oct 5 |
| R9 | One measured staff-request improvement | Capture pain and baseline; propose versioned procedure; preview and approve; active work retains original version; new work gets update; measure result and rehearse rollback | Enables tenant adaptation without uncontrolled forks | Oct 9 |
| R10 | Release hardening and pilot evidence | Complete all release journeys on exact candidate; clear release-blocking defects; run five consecutive operating days without unresolved critical defects; review independent-tenant evidence and publish supported scope | Reduces launch support/refund risk | Oct 19 |

Start R1 during R0 and apply its isolation requirements to all subsequent work. Preparation of fixtures, baseline measurement and tenant recruitment can proceed independently. Finish upstream domain contracts before parallel agents edit consumers. Start R7 by repairing existing retrieval and using existing query tools; do not wait to build a new AI shell.

## Six-week schedule

| Window | Exit outcome |
|---|---|
| Sep 7–13 | Release baseline, tenant fixture and identity/isolation contracts pass; independent pilot tenant recruited; real workflow baseline recorded |
| Sep 14–20 | Order ingestion and receiving/location contracts pass; marketplace differences and source ownership documented |
| Sep 21–28 | Reservation, pack, mobile recovery and sourcing-to-PO flow close; record one continuous foundation demo |
| Sep 29–Oct 5 | Cited sessions and independent customer onboarding close; export, billing and restore verified |
| Oct 6–12 | One staff-driven procedure improvement released and measured; freeze features on Oct 12 |
| Oct 13–19 | Floor soak, defect closure and exact-candidate release evidence; pilot go/no-go on Oct 19 |

Any critical fix affecting a journey restarts its relevant soak evidence. If a milestone slips, defer optional scope or move the release date. Never label a failed required gate “done.” No fixed defect-clearance percentage can substitute for passing a critical business path.

## Ten golden journeys

Use isolated test organizations, synthetic buyers and reversible fixtures. External purchase, messaging and label charges use sandbox/stubs or separately authorized live tests. Customer production records are not disposable fixtures. Hardware acceptance includes an operator using the supported scanner/printer; a browser click test alone is insufficient.

1. **Receive to ship:** PO/expected item → carton → short/damage facts → serial/condition/photos → QC → bin → order allocation → pick → pack verification → shipment acknowledgement. Assert the durable record chain and quantities at every boundary.
2. **Two channels, last unit:** competing channel orders plus duplicate event delivery. Exactly one reservation; other demand becomes a visible exception; outbound availability and reconciliation follow the declared policy. Third-party eventual consistency means “zero oversells everywhere” is not a defensible blanket promise.
3. **Multi-line partial shipment:** one line ships, another remains open, third cancels. Order/line/shipment relationships, quantities, financial totals and queues remain correct after replay.
4. **Incorrect scan:** wrong model, serial, condition or package label blocks the relevant action and preserves prior state. Error recovery does not require re-entering correct earlier facts.
5. **Interrupted mobile session:** server accepts a scan but response is lost; retry returns the same result. Refresh/re-authentication restores committed progress; an offline screen cannot report uncommitted success.
6. **Organization switch and revocation:** switch A/B with identical SKU/external identifiers; verify query caches, sessions, downloads, tool actions, realtime and credentials are scoped. Remove access while a session is open and check subsequent reads/writes fail correctly.
7. **Source to receipt:** unmet demand → matched offer → total landed cost → approved PO/handoff → supplier confirmation → receipt. Wrong revision, unknown freight, duplicate demand and price change exercise the blocked/review paths.
8. **Return and supplier discrepancy:** trace original serial and evidence; record a return/claim; prevent double restock; distinguish saleable, held and repair inventory; actual cost updates the unit outcome without double-counting refund reserves.
9. **Question to evidence:** ask why an order is blocked, where a serial is, which part is needed and what price is worthwhile. Scope, citations, counts and math match the fixture truth. Missing evidence produces a stated limitation.
10. **Staff request to workflow version:** report friction → reviewed change → preview → approval → controlled publish → new mobile session → measured result → rollback. Existing sessions remain consistent.

For each journey, require UI behavior, persisted state, audit/event evidence, permission checks and relevant external acknowledgement. End-to-end closure is not a screenshot or HTTP 200. Test controlled timeout, retry, concurrency and refusal cases where they protect an actual failure boundary.

## Existing test inventory to evaluate first

Read test assertions and setup before adding new suites. Candidate starting points:

- Orders: `tests/e2e/multi-product-order-grouping.spec.ts`, `audit-order-lifecycle.spec.ts`, `order-exceptions-workbench.spec.ts`.
- Receiving: `tests/e2e/receiving-lines-endpoints.spec.ts`, `receiving-scan-resolution.spec.ts`, `receiving-serial-absent.spec.ts`.
- Pack/mobile: `tests/e2e/mobile-packer-flow.spec.ts`, `packing-sku-qa.spec.ts`, `unit-pack-placement.spec.ts`.
- Device/session: `tests/e2e/counter-session-two-device.spec.ts`; review temporary session specs before promoting them.
- Tenancy: `src/lib/tenancy/idor-regression.test.ts` plus targeted integration scenarios covering actual authorization and cache boundaries.

These are discovered filenames, not certified coverage. Promote useful assertions into supported journeys, repair stale fixtures and avoid redundant tests that merely match source text. Keep established repository cohort laws intact.

## Agent hill-climb work contract

Every assigned slice must name: gap ID; failing user journey; starting SHA; concrete reproduction; expected persisted invariant; allowed files; dependencies; acceptance command; evidence output; and maximum scope. Begin with a verified failure or demonstrated missing behavior. Mark existing passing capability as verified instead of rebuilding it.

Use this loop: reproduce → smallest complete fix → relevant test → applicable cohort/eval → inspect candidate CI receipt → operator validation → record outcome. A tool success, new component or ticket comment is not completion.

Suggested work lanes, when delegation is explicitly enabled: one agent owns the current domain mutation, one owns independent fixtures/integration checks, one owns unrelated onboarding/retrieval work. A coordinator owns merge ordering and the release evidence. Only one agent at a time owns shared table/composer/schema infrastructure. Do not have agents race edits in the current dirty worktree.

Required repository procedure: design contract/tokens before UI edits; code graph find/impact before nontrivial shared edits; touched-file `verify:fast`; required station/table/shortcut cohorts when affected; required eval-engineering fast/full as appropriate; existing self-hosted receipt for full gates. Do not rerun the full profile locally as a substitute for receipts. New gates declare inputs. Never edit protected eval ledgers/goals/session logs.

A slice is complete only when its evidence includes candidate SHA, test scenario and result, migrations/configuration, rollback behavior and remaining limitations. Use a normal planning/evidence location outside protected eval paths. When a critical defect appears, stop dependent feature work and close it first.

## Measurement and ROI

Baseline during Sep 7–13: wrong/missing unit events, order exception age, median receive/pick/pack time, time spent sourcing/creating POs, blocked units awaiting parts, shipment error count and audited location correctness. Always record time window, sample size and case mix.

Rank feasible improvements by expected incremental contribution and realized cost reduction over a consistent horizon, then cash required and constrained labor time. Do not count full sales revenue as recovered profit. Do not count saved labor capacity as cash savings unless expense is reduced or incremental output is realized. Do not count the same recovered order against sourcing, receiving and fulfillment initiatives separately.

Suggested pilot goals: 20% reduction in median time for one selected exception or PO workflow, at least 99% correct recorded location in the audited scope, and no material regression in shipment correctness. These are proposed targets, not current performance or industry guarantees. Repeat weekly using comparable cases; small samples must be reported honestly.

Track three distinct measures: required journeys passing on the candidate; critical defects unresolved; observed customer outcomes. Avoid a single “percent complete” that hides a broken order path behind many finished screens.

## Deadline exit decision

October 19 is a go only if R0–R10 pass for the advertised scope, the independent tenant completes the workflow, restoration/export are verified, and the required soak evidence remains valid. A flaky critical gate is an unresolved release problem. Cosmetic defects may be documented if they do not compromise the supported operation.

The subsequent automatic-buying milestone is scheduled only after per-purchase approval works and an approved checkout adapter is available. Its own release gate must prove exact-item permission, price/budget/quantity/expiry checks, atomic reservation, no duplicate execution after ambiguous timeouts and immediate revocation. No fixed date here depends on an ungranted third-party approval.
