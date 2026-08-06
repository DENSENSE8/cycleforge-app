# Research briefing — flush right-panel sheet-band: search · find · convert · grow SoT

**For:** Gemini Deep Research  
**From:** Cycle Forge engineering  
**Date:** 2026-08-05  
**Deliverable:** (a) the 2026 industry standard for dense **right-rail / push-column** form + list chrome in WMS / reseller-ops / high-throughput B2B SaaS, with named products and citations; (b) an **exact, repeatable method** to search a React/Tailwind codebase for nested-box anti-patterns, convert them to a flush “column = the card” grammar, and grow design-system SoT so the next cohort cannot regress; (c) a reconciled target for *this* codebase given §3–§7.

---

## 0. How to use this brief

You do **not** have live access to the repo. Everything needed is embedded: product frame, measured goldens already shipped, exact anti-pattern fingerprints, search recipes, conversion recipes, and open decisions.

Answer **three separate questions** — do not merge them:

1. **What is industry standard in 2026?** How do high-volume warehouse / fulfillment / logistics / reseller-ops UIs treat **right panels** (inspectors, claim drawers, ticket compose)? Zero outer pad vs consumer padding; square vs rounded cards; underline vs boxed inputs; full-bleed list rows vs nested list cards. Named products + citations. Call out what is table stakes vs fashion.
2. **What is the exact search → find → convert method?** Produce a **playbook** an engineer can run weekly: ripgrep fingerprints, cohort inventory table template, convert checklist per component archetype (search field, list, recipients strip, callout, textarea, empty state), guard assertions, SoT growth rules. This must be mechanical enough that two agents produce the same inventory.
3. **What should Cycle Forge lock as SoT?** Reconcile industry answer against §3–§7. Propose concrete DS primitives / tokens / guard strings. Where industry conflicts with Kinetic Ledger or our Station Displays vs Desk inspector law, pick a side with reasoning.

Assume the reader ships a multi-file cohort this week. Prefer **recipes with class-name before/after** over frameworks-for-thinking.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS (serialized inventory, multi-channel sell). UI identity is **Kinetic Ledger**: data-first, dense, scan-aware — **legible throughput over document calm**.

Region contracts (use this vocabulary):

| Contract | Job | Density |
|---|---|---|
| **Station** | act-and-clear (barcode) | `floor` |
| **Workbench** | pick record → edit → persist | `ops` |
| **Monitor** | observe stream | `rollup` |
| **Canvas** | reshape definitions | `studio` |

**Right edge has two grammars — do not conflate:**

| Grammar | Shell | Job |
|---|---|---|
| Station **Displays** push | `UnboxPushColumn` / `ReceivingDisplaysPushStack` | Ticket · Photos · Linkage · Claim tools beside LineEdit |
| Desk **inspector** | `RightRailHost` push column | Record peek / queue walk |

This brief targets **both** for flush chrome, with Station Claim Displays as the golden already partially shipped.

**The complaint driving this brief:** right panels still suffer **nested box syndrome** — every layer (topic tabs → verb tabs → wizard → section → field) adds `px-*`, `rounded-lg`/`rounded-xl`, and bordered cards. Operators lose scanning axis, vertical real estate, and WMS density. Consumer-app padding is wrong for hundreds of records per shift.

---

## 2. Locked visual grammar (already ratified in-product)

```text
Column = the card. No nested padded islands.

• Outer push / scroll body: px-0 py-0 (rows own gutters)
• Labels: text-role-eyebrow uppercase — not a second card header
• Short identity / search / select: underline or flush combobox
  (border-0 border-b-2 bg-transparent px-0)
• Long prose: full-bleed bg-surface-sunken + borderless inset-field face
• Lists: full-bleed divide-y / border-b hairlines — NOT rounded-xl shells
• Depth = surface step (canvas → sunken), never margin islands between boxes
• Duplicate titles that repeat scroll-spy / topic chrome: DELETE
```

**Anti-models (ban for rail create/link forms):**

- `TextField` floating-label
- `WORKSPACE_NESTED_FIELD` white inset boxes
- `rounded-lg border … bg-surface-card` / `inset-field` as outer field chrome
- `rounded-xl border` list containers
- Outer `mx-*` / `p-3` cards wrapping an entire section
- Visible step titles that duplicate sticky scroll-spy (`1. PHOTOS`, `2. TICKET`)

**Chip / media radius stays OK:** status pills (`inset-chip`), photo thumbs — those are content, not chrome.

---

## 3. What already shipped (goldens — do not re-litigate)

| Golden | Path | Pattern |
|---|---|---|
| Subject underline + Body sunken | `src/design-system/components/DenseComposeFields.tsx` · `ClaimTemplateEditor.tsx` | sheet-band faces |
| Flush claim-type combobox | `SearchableSelectField` `appearance="flush"` · `ClaimComposeStep.tsx` | house combobox, not a second shadcn Popover |
| Claim scroll shell | `ReceivingClaimPanel.tsx` `px-0 py-0` + section hairlines; no duplicate h2 titles | |
| Ticket search + list | `src/components/support/link/TicketPicker.tsx` | `DenseComposeSearchInput` + hairline rows |
| Recipients / CC | `ClaimRecipientsField.tsx` · `CcEmailField.tsx` | hairline section + underline CC strip |
| Backup callout | `ClaimBackupStep.tsx` | full-bleed `bg-surface-sunken`, no `mx-3 rounded-lg` |
| Seller / reply | `ClaimSellerMessagePanel.tsx` · `ClaimTicketReply.tsx` | DenseCompose body / sunken composer |
| Guard | `claim-display-fill.guard.test.ts` | string fingerprints against regression |

Handoff inventory (cohort table + paste prompt):  
`docs/todo/claim-displays-sheet-band-cohort-HANDOFF.md`

SoT notes already live in:

- `.claude/rules/display/right-rail-inspector.md` → Segments (sheet-band create forms)
- `.claude/rules/display/station-workbench.md` → Ticket/Claim flush note
- `AGENTS.md` / `source-of-truth.md` → Displays vs inspector · depth elevation · right-rail modality

---

## 4. Exact search → find method (mechanical)

### 4.1 Scope roots (always scan these first)

```text
src/components/receiving/workspace/**          # Station Displays / Claim
src/components/support/**                      # TicketPicker, composers
src/components/right-rail/**                   # Desk inspector hosts
src/components/order-record/**                 # fact lists / peeks
src/components/shipped/details-panel/**        # desk detail bodies
src/design-system/components/**                # grow SoT here, not per-page
src/design-system/primitives/**                # Popover / Panel chrome
```

**Exclude** (different job): workbench **LedgerGrid** sheet flush (tables), marketing surfaces, mobile immersive camera, `WORKSPACE_NESTED_FIELD` glass worksheets inside Station centre (allowed by station-workbench glass law — do not flatten those into rail grammar).

### 4.2 Ripgrep fingerprints (copy-paste)

Run as separate searches; every hit is a **candidate**, then classify (chrome vs content).

**A. Nested section cards**

```bash
rg -n "rounded-lg border.*p-3|rounded-xl border|rounded-2xl border|bg-surface-canvas/40 p-3|mx-3.*rounded-lg" \
  src/components/receiving src/components/support src/components/right-rail \
  src/components/order-record src/components/shipped/details-panel
```

**B. Boxed form fields (rail anti-model)**

```bash
rg -n "rounded-lg border.*inset-field|rounded-lg border border-border-default bg-surface-card|rounded-xl border border-border-soft bg-surface-card" \
  src/components --glob '*.tsx'
```

**C. Outer scroll / panel re-inset (kills flush)**

```bash
rg -n "overflow-y-auto.*(px-4|px-5|py-4)|space-y-8 px-4" \
  src/components/receiving/workspace src/components/right-rail src/components/support
```

**D. List shells that should be hairline rows**

```bash
rg -n "max-h-\[.*\].*rounded-(xl|lg) border|overflow-y-auto rounded-(xl|lg) border" \
  src/components --glob '*.tsx'
```

**E. Duplicate identity chrome**

```bash
rg -n "Support ticket|1\. PHOTOS|2\. TICKET|text-role-caption font-semibold uppercase tracking-\[0\.14em\]" \
  src/components/receiving/workspace/claim
```

**F. Horizontal pill / slider claim-type leftovers**

```bash
rg -n "HorizontalButtonSlider|CLAIM_TYPE_OPTIONS" \
  src/components/receiving/workspace/claim
```

### 4.3 Inventory table template (every cohort)

Fill one row per hit before editing:

| ID | File | Archetype | Fingerprint | Host grammar | Convert to | SoT primitive | Guard string | Risk |
|---|---|---|---|---|---|---|---|---|
| 1 | `TicketPicker.tsx` | search+list | `rounded-xl border` | Displays + Support | underline search + hairline rows | `DenseComposeSearchInput` | no `rounded-xl border` | Shared SoT — high blast |
| 2 | … | … | … | Displays / inspector | … | … | … | … |

**Archetypes (closed set — map every hit to one):**

1. **Shell** — scroll body / aside padding  
2. **Search** — single-line find  
3. **Select** — combobox / type ahead  
4. **Identity line** — subject / title  
5. **Prose band** — body / seller message / note  
6. **List** — recent tickets / results  
7. **Chip well** — CC emails  
8. **Callout** — backup / notice strip  
9. **Empty state** — dashed capture tile  
10. **Segment** — recipients header + toggle (not a card)

### 4.4 Classification rules (chrome vs content)

| Keep radius / pad | Flatten |
|---|---|
| Photo thumbs, status chips, badges | Section cards, field boxes, list shells |
| Modal intake create (`SidebarIntakeFormShell`) when truly modal overlay | Resident push Displays / inspector bodies |
| Popover menus (may keep slight radius) | Trigger face inside the rail (flush) |
| Primary footer CTA band padding | Nested cards *above* the footer |

---

## 5. Exact convert recipes (before → after)

### 5.1 Shell

```text
BEFORE: overflow-y-auto space-y-8 px-4 py-4
AFTER:  overflow-y-auto px-0 py-0
        sections: border-b border-border-hairline; titles → aria-label only if scroll-spy exists
        rows: px-3 on labels/controls; full-bleed bands cancel pad (no mx-hack if parent is already px-0)
```

### 5.2 Search / identity

```text
BEFORE: rounded-lg border … inset-field px-3
AFTER:  DenseComposeSearchInput / DenseComposeSubjectInput
        (border-0 border-b-2 bg-transparent px-0 h-8|h-9 text-role-caption)
```

### 5.3 Select

```text
BEFORE: HorizontalButtonSlider / native <select> / padded pills
AFTER:  SearchableSelectField appearance="flush"
        (rounded-none, no trigger pad, square Popover className rounded-none)
```

### 5.4 Prose

```text
BEFORE: <textarea className="rounded-lg border … inset-field" />
AFTER:  <DenseComposeBodyBand>
          <DenseComposeBodyTextarea className={overlayPads?} />
        </DenseComposeBodyBand>
```

### 5.5 List

```text
BEFORE: <div className="max-h-… overflow-y-auto rounded-xl border …"> rows </div>
AFTER:  <div className="max-h-… overflow-y-auto"> 
          rows with border-b border-border-hairline px-3 py-2.5
        </div>
```

### 5.6 Segment / recipients

```text
BEFORE: <section className="rounded-lg border … p-3">…</section>
AFTER:  <section className="border-t border-border-hairline px-3 pt-3 space-y-2">…</section>
```

### 5.7 Callout

```text
BEFORE: mx-3 rounded-lg border bg-surface-sunken px-3 py-3
AFTER:  bg-surface-sunken px-3 py-3   # full-bleed, no radius, no mx
```

### 5.8 Empty state (capture)

```text
BEFORE: rounded-2xl border-dashed …
AFTER:  rounded-none border-dashed …  # flush band; icon circles may stay round
```

---

## 6. Design-system growth (SoT evolution — Ask-first vs Always)

**Always (compose first):**

- `DenseComposeFields` — label, subject, search, body band/textarea  
- `SearchableSelectField` `appearance="flush"`  
- DS `Popover` (never import a second shadcn Popover twin under primitives)

**Grow SoT when** ≥2 call sites need the same flush face and a page-local class string would fork:

| Candidate | Job | When to extract |
|---|---|---|
| `DenseComposeSearchInput` | already exists | use everywhere TicketPicker-class search appears |
| `DenseSheetList` / flush list shell | max-h + hairline rows + empty/error | if 3+ pickers share markup |
| `DenseCcChipStrip` | underline CC well | if Support chat + Claim both need identical flush |
| Spacing intent | document that rail create forms must **not** stack `inset-field` as outer chrome | update `ui-design-system.md` / right-rail-inspector |

**Never:**

- Raise DS ratchet / knip baselines to pass  
- Fork `ClaimTicketPicker` UI away from shared `TicketPicker`  
- Mount Station Displays as `RightRailHost` occupants  
- Use `framer-motion` outside `@/design-system/motion`

---

## 7. Guard recipe (ratchet down)

Extend string guards (pattern from `claim-display-fill.guard.test.ts`):

```text
assert.doesNotMatch(src, /rounded-xl border/)
assert.doesNotMatch(src, /rounded-lg border border-border-soft bg-surface-card inset-field/)
assert.doesNotMatch(src, /rounded-lg border border-border-soft[\s\S]*p-3/)
assert.match(src, /DenseComposeSearchInput|DenseComposeBodyBand|appearance="flush"/)
assert.doesNotMatch(scrollBody, /overflow-y-auto space-y-8 px-4 py-4/)
```

One guard file per **cohort golden** (Claim Displays, TicketPicker shared, later Desk inspector body). Baselines only shrink.

Verify: `npm run verify` — lint, typecheck, unit+DS guards, knip, route-auth, schema.

---

## 8. Industry research prompts (Gemini must answer)

1. **Density law:** Which 2026 WMS / 3PL / seller-ops / logistics products use **zero outer padding** and **square** right drawers? Cite Manhattan, Blue Yonder, ShipHero, Linnworks, Brightpearl, Extensiv, Shopify admin dense modes, Linear issue panel, Stripe Dashboard drawers, Amazon Seller Central, eBay Seller Hub — which match, which stay consumer-padded?
2. **Field chrome:** Is **underline / bottom-border only** the dominant pattern for identity fields in dense rails, or do boxed inputs remain standard? When does sunken full-bleed compose win for multi-line body?
3. **Lists:** Are **card-wrapped** recent-ticket / SKU lists considered outdated for ops rails? Evidence for hairline full-bleed rows.
4. **Creatable combobox:** For claim/reason/type taxonomies, when is inline create table stakes vs settings-only? (Cycle Forge claim types are still a **fixed enum** — recommend whether SoT should grow a tenant dictionary.)
5. **Hierarchy without boxes:** How do best-in-class panels signal Recipients vs Body vs Backup without nested cards (type roles, hairlines, surface steps only)?
6. **Failure modes:** What breaks when you zero-pad (touch targets, focus rings, scanner focus order, accessibility)? Minimum safe gutters (`px-3` on rows only?) backed by a11y guidance.
7. **Migration economics:** Propose a **scoring model** to prioritize files from an rg inventory (blast radius × operator minutes × SoT reuse).

---

## 9. Deliverable format (required structure)

```markdown
## A. Industry standard (2026)
### A1. Right-panel chrome
### A2. Field + list grammar
### A3. Citations

## B. Search → find → convert playbook
### B1. Fingerprint catalog (final)
### B2. Inventory template + scoring
### B3. Archetype convert recipes (class before/after)
### B4. Guard catalog

## C. Cycle Forge SoT proposal
### C1. Primitives to keep / grow / delete
### C2. Rule text patches (paths under .claude/rules/display/)
### C3. Cohort backlog ordered (Displays Claim → shared Support → Desk inspectors)
### C4. Explicit non-goals

## D. Risks & a11y floor
```

---

## 10. Explicit non-goals for the research answer

- Redesigning Station centre LineEdit / procedure deck  
- LedgerGrid workbench table flush (separate sheets-flush cohort)  
- Creatable claim-type product build (recommend only)  
- Importing a second shadcn Combobox stack beside DS Popover  
- Renaming Displays vs inspector nouns  

---

## 11. Paste-ready Gemini prompt (short)

```
You are researching 2026 industry standards for dense right-rail / push-column
UI in WMS and reseller-ops SaaS, then producing an exact search→find→convert
playbook for Cycle Forge.

Read the full briefing "flush right-panel sheet-band" (attached). Answer sections
A–D in the required format.

Hard constraints from the product:
- Kinetic Ledger: density over consumer whitespace
- Column = the card; no nested rounded padded islands
- Goldens already exist: DenseComposeFields, SearchableSelectField appearance=flush,
  TicketPicker underline+hairline list, Claim scroll px-0
- Grow SoT — never fork TicketPicker or add a second Popover/Combobox twin
- Station Displays ≠ Desk inspector (two host grammars, one flush field grammar)

Be concrete: named products, citations, ripgrep fingerprints, before/after Tailwind
recipes, guard strings, and a prioritized backlog for remaining right-panel cohorts.
```

---

## 12. Coordinates (do not conflate)

| Doc | Job |
|---|---|
| `docs/todo/claim-displays-sheet-band-cohort-HANDOFF.md` | Execution handoff for Claim cohort |
| `docs/todo/spacex-displays-topic-plate-flush-HANDOFF.md` | Topic **tab plate** chrome, not form fields |
| `docs/todo/sheets-flush-workbench-cohort-PLAN.md` | Workbench **table** flush |
| `.claude/rules/display/right-rail-inspector.md` | Inspector body / segments law |
| `.claude/rules/display/station-workbench.md` | Displays push + Claim note |
| `.claude/rules/kinetic-ledger.md` | Product UI identity |
