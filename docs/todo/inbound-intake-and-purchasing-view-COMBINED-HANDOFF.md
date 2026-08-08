# Combined handoff — Inbound intake + the purchasing view

**Merges two plans into one dependency-ordered build.** Neither is finishable in isolation.

- **Plan B — intake:** [`inbound-desk-add-display-FINISH-HANDOFF.md`](./inbound-desk-add-display-FINISH-HANDOFF.md)
- **Plan A — presentation:** [`unbox-view-switcher-and-custom-fields-HANDOFF.md`](./unbox-view-switcher-and-custom-fields-HANDOFF.md)

**Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart/kill). User owns commits.
**Product frame:** Cycle Forge multi-tenant ops SaaS — capability nouns in operator copy; vendor product names only on the Integrations hub / deep links ([`AGENTS.md`](../../AGENTS.md)). USAV is dogfood only.

**Binding rules (read, do not re-litigate):**
[`AGENTS.md`](../../AGENTS.md) ·
[`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → *Right-rail modality · Unboxed ≠ Received · Table definition registry · Grid column visibility* ·
[`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md) → *Tabs vs. saved views · Collection layouts* ·
[`.claude/rules/polymorphic-tables.md`](../../.claude/rules/polymorphic-tables.md) ·
[`.claude/rules/pattern-evolution.md`](../../.claude/rules/pattern-evolution.md) ·
[`.claude/rules/backend-patterns.md`](../../.claude/rules/backend-patterns.md).

---

## 0. The one-sentence thesis

**Plan B is intake; Plan A is presentation; B's spine is A's data source, and A's flagship report cannot be honest until B has filled the spine and B has emitted a per-line receiving-complete signal.** Ship them in that order.

---

## 1. Why they are one plan, not two

Both docs state the same data-grain fact independently:

| Grain | Feed | Populated by |
|---|---|---|
| **Purchased** — PO lines (what we bought / expect) | Inbound feed | `ingestPurchase` (**Plan B**) |
| **Received** — cartons (what physically arrived) | Queue feed | Arrival / Unbox scans |

Plan A §1 / R1 ruled these two feeds **cannot be reconciled left-to-right**, so the surface operators actually want — *"PO line: Dell dock ×10, 6 arrived, 4 short"* — is a **join across both grains**, not a filter of either. Plan B is the ONE upsert that writes the purchased grain (`ingestPurchase` onto `receiving_line`).

**Therefore:** the report Plan A wants reads exactly the spine Plan B fills. They are the intake half and the presentation half of one "Inbound" story, and they already physically converge in the tree — `UnboxWorkspaceHeader.tsx` now imports both `ReceivingBoxChromeActions` (B) and composes the promoted `incoming` system tab (A), and the Inbound tab was hardcoded permanent (delete/unpin button removed 2026-08-08) so B's chrome has a stable home on the tab A created.

---

## 2. The four load-bearing synergies

1. **B feeds A's flagship report its missing rows.** A's "what did we order that hasn't arrived" report is blind to any platform without a live PO feed — precisely Amazon returns and Goodwill, the motivating dogfood pain. Ship A's report on today's spine and it silently omits the exact purchases operators complain about (A's own §R1 self-warning: *"its first real use is the thing it cannot do"*). B's manual/CSV intake is what makes the report **complete**.

2. **B is where A's missing completeness signal must live.** A-R3 leaves **OPEN**: does a per-PO-line *receiving-complete* signal exist? It is required so `short = expected − counted` does not fire mid-unbox as a **false shortage** (units still in an unopened carton read as "short," and purchasing acts on "short" → wrong vendor claim). The carton accounting that answers this is stamped by B's `ingestPurchase` (expected qty + carton linkage). **Answer the completeness question inside B's ingest, not bolted onto A's report.**

3. **A's custom columns are the natural home for B's source-specific facts.** Amazon RMA reason, Goodwill lot #, eBay buyer-account chip — facts the fixed schema does not hold. B's Add/CSV intake is the write point; A's `custom_field_defs` / `custom_field_values` side tables are the store and make them sortable columns.

4. **The Inbound tab is the shared surface, already wired.** A promoted `incoming` to the first hardcoded system tab and locked it (unpin removed); B builds the Inbound desk (Check · Import · Add) and box-station Add (Arrival + Unbox) that *fills* it.

---

## 3. Where they must NOT be conflated (real tensions — enforce these)

- **A's report is CROSS-GRAIN; A's custom columns are single-`entity_type`.** R1 is explicit that custom columns on one table do **not** serve the flagship — it is a join across two feeds. B does not let you satisfy the report with a custom column. Keep **"report (join)"** and **"custom column (one entity)"** as two separate deliverables, or A's flagship regresses into a re-filter of one feed.
- **Custom fields do not travel between stations** (A, Q8), but B's spine is read by Arrival / Unbox / Testing. A source-fact that must follow the carton belongs on the **carton/unit** both stations read — not a `receiving_line`-scoped custom field. Decide per field.
- **"Arrived / counted," never "received"** (A-R3). The report's arrived column is `quantity_received` (bench count) — correct for a *purchasing* audience — but the Unboxed ≠ Received law still governs operator rails. Do not paint the report's count green or label it "Received."
- **Source vocabulary stays B's registry.** `source_type = zoho|ebay|amazon|manual` + `source_platform` (B's `source-registry.ts`). A's saved-view filters **compose** B's existing `?inbound=` / `?inkind=` params — never fork a parallel filter vocabulary. Goodwill stays `source_type=manual` + `source_platform=goodwill` (a fifth `?inbound=` slug is Ask-first SQL work, not a new `source_type`).
- **Add never invents a Zoho-primary row** (`source_type=zoho` forbidden on desk Add — B). Zoho stays pull/sync (Import → Zoho).
- **One right column** (B): Station Displays XOR RightRailHost(Add) XOR AI. A's inspector View cluster + B's Add rail are both right-edge occupants — they obey the same mutual-exclusion, never two push columns.
- **Tabs vs. saved views law** (A §2 / `workbench-ops-queue.md`): the four stages stay a **strip** (system-defined, shared, counted); operator views get a **switcher** (unbounded). A dropdown never *replaces* the strip — it hides which stage you are on and its count. Overturn only in writing.

---

## 4. Dependency-ordered build (the merged sequence)

Each step names its owning plan and its blocker.

| # | Step | Plan | Blocked on | Ask-first? |
|---|---|---|---|---|
| 1 | **Intake lands + is connector-gated.** Add/CSV land Amazon/Goodwill/manual rows on the spine with correct `source_platform` paint, `?inkind` kind, tracking/listing, expected qty + carton link; Import gated on org connection health. | B | — | no (Zoho *create*-PO is Ask-first; pull only) |
| 2 | **Per-line receiving-complete signal** emitted from `ingestPurchase` / carton accounting (a PO may span cartons/shipments, so it is not one column today). | B (answers A-R3) | 1 | surface the derivation choice |
| 3 | **Flagship purchasing report** = cross-grain join (purchased spine ⋈ received cartons) over the now-complete spine. Column labeled **arrived/counted**; `short` gated on step 2's completeness so no false shortages; History exempt (day-banded). | A (R1/R3) | 1, 2 | no |
| 4 | **Saved-view switcher** beside the strip (never replacing it). Personal / Team / **Locked** tiers; **placement** (which station) is a separate axis from **visibility** (A-R2). Publishing org-wide gated by permission (Salesforce split) to stop view sprawl. Filters compose B's `?inbound=`/`?inkind=`. | A | 3 | tiers/permission = confirm |
| 5 | **Org-authored custom columns** — two org-scoped side tables per `polymorphic-tables.md` (`custom_field_defs` + typed `custom_field_values`; one aggregated jsonb-map join, never one JOIN per field — run `neon-cost-reviewer`; add to `build-search-text.ts` + outbox if searchable). B's Add/CSV is the primary write point for source-specific facts. | A | 4 | `entity_type` scope, first entity |
| 6 | **Amazon `fact_kind` registration** — only when a real SP-API/buyer sync lands; the upgrade must UPSERT the same spine identity as manual Add (idempotent `ingestPurchase`). | B | real sync | Ask-first + migration + new CHECK enum |

**Do not start at 3 or 5.** A report over an incomplete spine, or a custom column with no completeness signal, both ship the failure mode each plan's own rulings predict.

---

## 5. Files where the two plans meet

```text
Shared seam (both plans touch)
  src/components/receiving/unbox/UnboxWorkspaceHeader.tsx   # A: Inbound tab · B: ReceivingBoxChromeActions + Add overlay
  src/utils/unbox-workspace-state.ts                        # A: UNBOX_WORKSPACE_TABS order + labels

Plan B — intake (spine + chrome)
  src/lib/inbound/ingest-purchase.ts        # THE upsert onto receiving_line  ← A's report data source
  src/lib/inbound/source-registry.ts        # source_type registry            ← A's saved-view filter vocabulary
  src/lib/inbound/desk-import.ts · desk-csv.ts
  src/components/sidebar/receiving/incoming/IncomingAddInboundOverlay.tsx · IncomingImportCsvOverlay.tsx
  src/components/receiving/ReceivingBoxChromeActions.tsx    # Arrival + Unbox only (never Import)
  src/lib/receiving/lines/build-sql.ts      # ?inbound= / ?inkind= membership ← A composes these

Plan A — presentation (report + views + columns)
  .claude/rules/display/workbench-ops-queue.md   # tabs-vs-views law · collection layouts (List | Drill)
  src/lib/tables/table-definition.ts             # definition boundary (AI authors Zod defs only)
  src/components/ui/table-column-config/GridColumnDetailsPanel.tsx  # "Add column" is a new verb here
  (new) custom_field_defs / custom_field_values migration + Drizzle models (step 5)
```

---

## 6. Verify (this lane's ownership)

- Inner loop: `npm run verify -- --fast`
- Targeted: `desk-csv.test.ts` · `incoming-add-right-edge.guard.test.ts` · `receiving-box-chrome-actions.guard.test.ts` · `unbox-pinned-inbound.guard.test.ts` · `unbox-workspace-state.test.ts` · SearchableSelectField consumers typecheck.
- Full `npm run verify` before done; document dirty-tree noise from other workstreams rather than adopting or fixing it. **Never raise a ratchet baseline.**
- `:3050` bounces to `/signin`; an agent must not sign in. Dogfood by eye with the user, or drive Playwright against the QA org (`pnpm provision:qa-org`, `--project=qa-desktop`) — never assert against the dogfood tenant.

---

## 7. Open questions (Ask first — inherited from both plans)

- **A-R3 / B step 2:** how is per-PO-line receiving-complete derived (workflow_status per line vs expected-carton accounting)? This is the seam between the two plans.
- **A-R2:** confirm the Locked tier + the publish-permission gate before building sharing.
- **A Q10 / step 5:** which `entity_type` first (receiving lines vs orders vs SKUs)? `entity_type` is a closed CHECK; scoping v1 to one entity is the difference between a focused build and an open-ended one.
- **B:** Should Goodwill get its own Pipeline Source chip (`source_platform`) or stay under Manual?
- **B:** Should Add ever *create* a Zoho PO, or stay pull-only forever?

---

*Read the two source handoffs for the fine-grained checklists; this doc owns the dependency order and the boundaries where they must not merge.*
