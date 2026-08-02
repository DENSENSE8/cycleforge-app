# Handoff — Manual Zoho received check × industry standards × unreceived watch-list unification

**Copy everything below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · lane: whatever worktree you are on (attach to `:3050`; never start a server).
**Shipped predecessor (do not rebuild):** Incoming chrome **Check** CTA → push rail →
`POST /api/receiving-lines/incoming/check-zoho-received` (manual paste → Zoho received vs not).
**Related prior work:** [`ebay-delivered-not-unboxed-PLAN.md`](./ebay-delivered-not-unboxed-PLAN.md)
(phases 1–5 landed) + [`ebay-delivered-not-unboxed-RESEARCH-BRIEF.md`](./ebay-delivered-not-unboxed-RESEARCH-BRIEF.md).

---

You are Claude Code in the Cycle Forge monorepo with **fresh context**.

## Mission

Three jobs, in this order. Do **not** reorder.

1. **Audit the exact shipped Check** — read the code as it exists, confirm behavior against
   the product contract below, list gaps / bugs / UX misses. Touch code only to fix
   correctness or SoT drift you find in that audit.
2. **Industry-standard gap analysis** — compare Cycle Forge’s *whole* “unreceived /
   delivered-but-not-processed” stack (automated feeds + this manual Check) to WMS /
   retail-ops / inbound-reconciliation practice. Produce concrete upgrade recommendations
   grounded in *this* codebase (not a greenfield rewrite).
3. **Unify into the existing unreceived watch list** — design + implement (or hand back a
   phased plan if Ask-first gates fire) so the manual Zoho Check results and the existing
   Incoming watch surfaces read as **one operator system**, not two disconnected tools.

Hard product frame: Cycle Forge is multi-tenant reseller-ops SaaS. USAV is dogfood only.
Capability nouns / runtime labels — never vendor product sentences in operator copy
(except Integrations hub).

## Product contract for the shipped Check (ground truth)

Operator language: *“I have a paste list of tracking numbers — which are already received
in Zoho vs still open?”*

| Fact | Detail |
|---|---|
| Entry | Incoming `/incoming` workbench chrome trailing: `pagination → sort → **Check** → Import → Add` |
| Surface | Non-modal **push** `RightRailHost` id `detail:incoming-zoho-received-check` (`SidebarIntakeFormShell`) |
| Input | Textarea paste — newline / comma / semicolon; whitespace splits only when each piece looks like its own tracking |
| Cap | 100 unique trackings; live Zoho lookups soft-capped (50) after mirror hits; concurrency ~3 |
| Match key | Zoho PO **`reference_number`** ≡ inbound tracking (existing contract) |
| Path | Mirror-first (`zoho_po_mirror`) → live `searchPurchaseOrdersByTracking` for misses |
| Received | status ∈ `received` \| `billed` \| `closed` (`CHECK_ZOHO_RECEIVED_LIKE_STATUSES` / `ZOHO_RECEIVED_LIKE_STATUSES`) |
| Output | Two lists: **Received in Zoho** / **Not received in Zoho** (+ reason: `matched` \| `no_match` \| `ambiguous` \| `error` \| `zoho_cap`); copy-all per section |
| Writes | **None.** Read-only. Import / Sync Zoho remains the write path |
| Auth | `receiving.view` |

### Code map (read these first)

| Layer | Path |
|---|---|
| Domain | `src/lib/receiving/check-zoho-received.ts` (+ `.test.ts`) |
| Schema | `src/lib/schemas/check-zoho-received.ts` |
| API | `src/app/api/receiving-lines/incoming/check-zoho-received/route.ts` |
| Chrome CTA | `src/components/sidebar/receiving/incoming/IncomingChromeActions.tsx` |
| Header open state | `src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx` |
| Rail | `src/components/sidebar/receiving/incoming/IncomingZohoReceivedCheckRail.tsx` |
| Intake allowlist | `src/components/right-rail/right-rail-inspector-header.guard.test.ts` |

### Existing unreceived **watch list** stack (already built — do not reinvent)

These are the surfaces Job 3 must **compose into**, not replace with a twin:

| Feed / surface | Role |
|---|---|
| `src/lib/receiving/delivered-unscanned.ts` | Delivered + **never dock-scanned** (hunt queue; age bands; `CARRIER_MISMATCH`) |
| `src/lib/receiving/delivered-not-unboxed.ts` | Delivered + **not unboxed** (broader; includes scanned-stuck; SLA / claim clocks) |
| `GET …/incoming/delivered-not-unboxed` (+ unscanned sibling) | Org-scoped APIs |
| Incoming sidebar tiles / `delivery_state` | `IncomingSidebarPanel` + `CASE` in `src/app/api/receiving-lines/route.ts` (`DELIVERED_UNOPENED`, `STALLED`, …) |
| Zoho terminal hide | `NOT_ZOHO_RECEIVED_PREDICATE` / mirror status — Incoming drops Zoho-received POs |
| Manual Check (new) | Paste list → Zoho received? — **ERP truth probe**, not carrier delivery |

Three-way reconciliation reminder (from the research brief):

1. Marketplace / purchase record (eBay or vendor PO)
2. Carrier **delivered**
3. Warehouse processed (dock scan / unbox / Zoho **received**)

Today: (2)↔(3) is strong on the automated feeds. The new Check is a **manual (3)·Zoho-received** probe. Job 2–3 ask whether industry practice expects that probe to *feed* the same watch list operators already work from.

## Read before writing code

- `AGENTS.md` + `.claude/rules/workflow-safety.md` — **never start/restart/kill** `:3050`; user owns commits
- `.claude/rules/source-of-truth.md` — Right-rail modality (push); one module per concern
- `.claude/rules/display/workbench.md` + `workbench-ops-queue.md` — trailing cluster / chrome
- `.claude/rules/display/right-rail-inspector.md` — intake shell vs record `PaneHeader`
- `.claude/rules/backend-patterns.md` — route skeleton, `orgId` from `ctx`, Zoho via `withZohoOrg`
- `.claude/rules/verify.md` — `npm run verify` before done; **never raise a ratchet baseline**
- Prior research: `docs/todo/ebay-delivered-not-unboxed-RESEARCH-BRIEF.md` + `…-PLAN.md`
  (SLA / claim / exception codes already landed — do not reopen unless the industry analysis
  finds a real gap those phases missed)

## Job 1 — Audit the shipped Check

**Do:**

- Trace one happy path and one miss path in code (mirror hit received; mirror miss → Zoho
  issued; no match; ambiguous; over-cap).
- Confirm UI: Check placement, push (not float/scrim), results split, copy, empty/oversize errors.
- Confirm no writes, correct permission, route in `docs/security/route-permissions.json`.
- Note any SoT drift (e.g. `CHECK_ZOHO_RECEIVED_LIKE_STATUSES` vs `ZOHO_RECEIVED_LIKE_STATUSES`
  twin — prefer one module if you touch classification).
- Manual smoke on `:3050` `/incoming` with 3–5 known trackings (received / issued / garbage).

**Do not:** restyle Import/Add, expand to eBay marketplace status, or auto-mark-received.

**Deliverable:** short audit section in your reply (pass / fix list). Fix correctness bugs you find.

## Job 2 — Industry standards gap analysis

Self-contained research. Assume the reader has Job 1’s code map. Compare against WMS /
3PL / retail inbound practice (ASN / receipt variance, “delivered not received”, dock
appointment, claim SLA, ERP ↔ WMS reconciliation).

Answer explicitly:

1. Is a **manual paste → ERP received?** tool industry-standard, or should it be an
   automated exception feed (and when is paste still justified — e.g. carrier portal export,
   marketplace CSV, claim packet)?
2. How do best-in-class stacks combine **carrier delivery**, **dock receipt**, and **ERP
   received** into one watch list (age bands, owners, escalation)? Map each row to what
   Cycle Forge already has vs GAP.
3. Should “not received in Zoho” from a paste check **promote** into
   `delivered-not-unboxed` / unscanned / a new exception code, or stay ephemeral?
4. What must **never** change here (tenant isolation, `transition()` / no raw status
   writes, free carrier polling architecture, Zoho `reference_number` = tracking contract)?

**Deliverable:** gap table + ranked recommendations (Must / Should / Later). No paid
webhook aggregators as a default fix (architecture already decided — see research brief §2.3).

## Job 3 — Unify into the existing unreceived watch list

Translate Job 2’s Must/Should into a **code-grounded** design, then implement only what
passes Ask-first and fits one session — otherwise write a phased PLAN and stop after Phase 0.

### Locked product intent (operator)

- One mental model: “things that should be here / received but aren’t done.”
- Manual Check is an **input method** into that system (or a diagnostic that can *add /
  highlight* rows), not a forever-separate report buried in a rail.
- Automated feeds keep owning continuous monitoring; paste owns ad-hoc external lists.

### Design constraints

- Compose from named SoT feeds / tiles — **no page-local twin** of
  `delivered-not-unboxed` or a second Incoming sidebar.
- Right edge **pushes**; intake forms use `SidebarIntakeFormShell` + allowlist.
- Zoho live calls stay rate-aware (mirror-first; caps; soft-fail).
- Status / exception writes only via existing receiving state-machine / exception helpers
  — never raw `UPDATE … workflow_status`.
- eBay claim / loss codes already seeded — reuse; don’t invent a parallel vocabulary.

### Likely shape (validate; do not cargo-cult)

Propose one of these after Job 2, then implement the chosen one if Must:

**A. Promote:** Check results with `not_received_in_zoho` + local STN delivered → surface
in existing tile / feed (deep-link `?state=` / open delivered-not-unboxed lane with those
trackings highlighted).

**B. Seed watch rows:** durable org-scoped “reconciliation check” exceptions (or reuse
`receiving_exceptions` / reason-code sub-vocab) so paste isn’t ephemeral.

**C. Chrome continuity only:** Keep Check as diagnostic but add “Open in watch list” /
count chip that filters Incoming to matching trackings — no new persistence.

Default preference if industry analysis is ambiguous: **A then C**, avoid **B** until
operators prove paste lists must survive sessions (Ask first before new tables).

### Implementation checklist (when coding)

1. Single SoT helper for “tracking → watch-list membership” shared by Check results UI and
   Incoming tiles — no duplicated predicates.
2. Wire Check result actions (e.g. “Show in Incoming”) without leaving the push-rail family.
3. Guards / tests for any new predicate; route-auth emit if new routes.
4. `npm run verify` green. Attribute red gates to your files first.
5. Manual `:3050` script: paste list → see same items on the watch surface operators already use.

## Explicit non-goals

- Replacing carrier polling with paid Shippo/EasyPost/AfterShip
- Auto `mark-received` / write Zoho receives from Check
- Renaming `ARRIVED/MATCHED/UNBOXED` to WMS vocabulary
- Reopening eBay claim cron arming (`RECEIVING_CLAIMS_ESCALATION`) without human ask
- Centered modals / floating inspectors for this flow

## Done means

- [ ] Job 1 audit written; correctness fixes landed (or none needed)
- [ ] Job 2 gap table + Must/Should/Later
- [ ] Job 3: either phased PLAN committed under `docs/todo/` **or** Phase 0+1 code landed
- [ ] `npm run verify` green if you changed code
- [ ] Short operator note: how Check and the watch list now relate in one sentence

## Reply shape

1. **Audit** (Job 1)
2. **Industry gaps** (Job 2) — table first
3. **Unification decision** A / B / C (or hybrid) + why
4. **What you shipped** / **what remains** (phases)
5. **Manual check steps** on `:3050`
