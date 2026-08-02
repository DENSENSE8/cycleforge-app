# Research briefing — region-contract branching: should Support (CX) be a Workbench branch or a 5th contract?

**For:** Gemini Pro (deep research) — **you do not have the codebase.** Every product/constraint fact below was measured from source on **2026-08-01**. Do not invent file paths or claim to have inspected source.
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Subject:** Whether world-class premium B2B SaaS justifies **extending** Cycle Forge’s four region contracts (Station · Workbench · Monitor · Canvas) with a **fifth contract**, or a **named Workbench branch** (e.g. Support / Service / Conversation), now that domain nav is elevating Support to its own MasterNav root — and how that compares to Zendesk, Gorgias, Front, Plain, Intercom, Salesforce Service, Linear, Stripe, etc.
**Status:** **RATIFIED 2026-08-01 — Option B (Workbench branch `service-workspace`).**  
Plan: [`support-service-workspace-PLAN.md`](./support-service-workspace-PLAN.md) · Execution: [`support-service-workspace-CLAUDE-CODE-PROMPT.md`](./support-service-workspace-CLAUDE-CODE-PROMPT.md). Do not re-open A/C/D; do not redesign nav IA here.
**Companions (do not re-litigate):**

| Doc | Already scoped |
|---|---|
| `.claude/rules/contextual-display.md` | Four contracts + Q1→Q4 discriminator |
| `desk-domain-spine-split-*` | Support as **nav domain** (spine section) — orthogonal to region contract |
| `detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md` | Where detail lives (rail vs page) |
| `page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` | Station vs main-tier page count |

**Deliverable:** (a) industry survey of how premium SaaS separates **interaction contracts / surface types** vs **product domains** vs **recipes/templates**; (b) forced ruling: **new archetype** vs **Workbench branch** vs **recipe-only**; (c) if branch — name, discriminator signals, shells, density, what Support must not inherit from Station/generic Workbench; (d) migration impact on our measured Support surface; (e) a decision rule for the *next* candidate branch (Sales? Fulfillment desk?) so we do not invent a contract per domain.

---

## 0. Method

### 0.1 Separate three layers (mandatory — keep them separate in the answer)

Industry and this codebase mix these words. You must not.

| Layer | Question it answers | Cycle Forge today |
|---|---|---|
| **A. Region contract (archetype)** | What may *drive* the region (scanner / pointer / observe / graph)? What is selection durability? What persists? | Exactly four: Station · Workbench · Monitor · Canvas via `pickArchetype` Q1→Q4 |
| **B. Product domain (nav)** | Which *business area* owns the pages in the spine? | Moving to Inbound · Catalog · Inventory · Fulfillment · **Support** · Sales · … |
| **C. Recipe / shell** | Which *layout composition* implements the contract for a data shape? | Workbench recipes: master–detail · table+inspector · board · fact stack; Station Workbench column; etc. |

**Hypothesis under test:** Support needs something in layer A or a formalized branch of Workbench in layer C — **not** “Support is a spine section, therefore Support is a contract.”

### 0.2 Your job

1. **Survey** 2024–2026 premium SaaS for how they encode interaction models (agent workspace, inbox, issue tracker, ops queue, builder canvas) — named products + citations.
2. **Map** each named system’s primary CX / support surface onto our A/B/C layers.
3. **Take a side** on D1–D12 (§6). Default if you abstain is in the table — but prefer a defended deviation over silence.
4. **Produce a decision rule:** when does the next domain get a Workbench *branch* vs stay a recipe paragraph under `workbench.md` vs force a true 5th archetype.

### 0.3 Sources to cover (minimum)

| Class | Named systems | Look for |
|---|---|---|
| **Helpdesk / CX agent workspace** | Zendesk Agent Workspace, Gorgias, Freshdesk, Salesforce Service Cloud / Console, HubSpot Service Hub | Conversation-first vs ticket-queue-first; composer dock; customer context panel; omnichannel |
| **Shared inbox / collab** | Front, Plain, Intercom Inbox, Missive, Hiver | Thread + sidebar context; assignment; SLA |
| **Issue / work trackers (premium)** | Linear, Height, Jira Service Management | Issue detail vs queue; when “support” is just Issues |
| **Commerce ops adjacent** | Shopify Inbox / customer timeline, Amazon Seller Messaging (public docs) | Reseller-relevant CX |
| **Design systems / IA research** | NN/g complex apps; Polar / Carbon / Polaris patterns for “workspace” vs “console” | When products invent a 5th mode vs specialize templates |
| **Internal ops SaaS chrome** | Stripe Dashboard, Retool “apps”, Attio | Domain pages that still share one interaction grammar |

Prefer primary docs, changelogs, design posts **2024–2026**.

### 0.4 Scoring (for “add branch” vs “add archetype” vs “recipe only”)

Score each option 1–5 on all axes; report a table.

| Axis | Meaning |
|---|---|
| **Discriminator clarity** | Can a new hire run a mechanical Q-test without feature-area folklore? |
| **Industry fit** | Matches how premium CX products actually behave |
| **Compose ROI** | Unlocks shared shells/composer/context that generic Workbench lacks |
| **Blast radius** | Touches `ARCHETYPE_IDS`, SurfaceRegistry, display law, every Support region |
| **Slope risk** | Likelihood we then invent SalesContract, FulfillmentContract, … (5 = low slope risk) |

**Pick the option with best (clarity × industry × compose × slope) / blast.**

### 0.5 Closed forever (unless Ask-first with overwhelming evidence)

- A contract per **nav domain** (Support contract because Support is a spine section)
- Weakening Station’s “no browse list in scan column” for ticket queues
- Making Support a Monitor (tickets are edited, assigned, replied — not observe-only)
- Replacing Kinetic Ledger with a chat-app visual language wholesale
- A second `pickArchetype` implementation outside `archetype.ts`

---

## 1. Product constraints (ground truth)

**Cycle Forge** is multi-tenant **reseller-operations SaaS** (used-goods / electronics refurb dogfood only). UI identity **Kinetic Ledger**: dense, state-colored, scan-aware, Linear/Stripe discipline — not whitespace chat-app calm.

Operators are **mixed-role**: same person may Unbox a carton, then answer a Zendesk ticket, then print a shipping label. CX is not a separate “call center only” product — but Support is becoming a **first-class nav domain**.

### 1a. The four contracts (house law — use these words)

Discriminator — first yes wins:

1. **Scanner / wedge?** → **Station** (ephemeral selection, act-and-clear, density `floor`)
2. **Observe-only, no durable selection?** → **Monitor** (density `rollup`)
3. **Pan/zoom node-graph?** → **Canvas** (density `studio`)
4. **Else pick + edit + persist** → **Workbench** (URL-addressable selection, CRUD, density `ops`)

Code: `ARCHETYPE_IDS = ['station','workbench','monitor','canvas']`; `pickArchetype()` in `src/lib/stations/archetype.ts`. Explicit `SURFACE_REGISTRY` hint wins over the algorithm.

**Law:** contracts are **not layout skins**. Workbench ≠ “must be sidebar + right pane.” Recipes choose composition after the contract.

### 1b. Workbench recipes already exist (layer C)

Documented under Workbench:

- Master–detail (sidebar map + workspace)
- Table / queue + optional inspector
- Board + detail
- Fact stack / form

Desk-contract unification wants many pointer collections → **saved views left · LedgerGrid middle · non-modal right rail**. That is a **recipe**, still Workbench.

### 1c. Measured Support surface (the candidate)

| Fact | Value |
|---|---|
| Route | `/support` |
| Nav (target IA) | Own root domain **Support** with modes: Tickets · Orders · Voicemail · Calls · Warranty · Issues |
| `SURFACE_REGISTRY.support.archetype` **today** | **`station`** — declared “helpdesk/ticket station” |
| Actual interaction (measured intent) | Pointer-driven ticket queue + thread + customer/context chrome; durable URL modes; reply composer; **not** barcode-first act-and-clear |
| Shared chrome already | `StationComposerDock` / `SupportChatComposer` (ticket reply) — **Station-named dock reused for tickets** |
| Tension | Registry says **Station**; discriminator Q1 (scanner?) is **no** → algorithm would return **Workbench**; nav IA treats Support as a **domain** |

**This tension is the brief’s crux.** Either:

- the registry hint is wrong and Support should be Workbench (+ optional branch/recipe), or  
- Support truly needs a distinct contract/branch that is *neither* scan-Station nor generic Workbench queue, or  
- “Station” was used loosely for “operator workplace” and must be corrected.

### 1d. What Support regions typically contain (jobs)

Split into regions when answering — a page may host multiple contracts:

| Region job | Feels like | Candidate contract today |
|---|---|---|
| Ticket / conversation queue | Many records, pick one | Workbench (table/queue recipe) |
| Thread + reply composer | Edit conversation, send | Workbench fact/composer (or CX branch) |
| Customer / order / warranty context | Related records beside thread | Workbench inspector / context rail |
| Live call/voicemail stream | Observe? or act? | Possibly Monitor strip vs Workbench |
| Warranty logger form | CRUD form | Workbench |

Do **not** force one contract onto the whole `/support` page if jobs differ — but also do not invent five contracts for five modes.

---

## 2. Operator / eng hypothesis

> We already have Station / Workbench / Monitor / Canvas. Domain nav is splitting Desk into Support, Sales, Catalog, etc. Support feels special (conversation, omnichannel, SLA, customer context). Should we add a **UX/UI contract** that is a **branch of Workbench** — or a true fifth archetype — so Support (and peers) match world-class premium SaaS agent workspaces, without turning every domain into its own contract?

Translate:

1. Is “agent workspace / inbox / service console” a **distinct interaction model** in industry, or a **template** on top of pick+edit?
2. If distinct, is it distinct enough to change `ARCHETYPE_IDS`, or only enough for `display/support.md` (or `display/workbench-service.md`) + shared shells?
3. How do we stop the slope: Sales branch, Fulfillment branch, Inbound branch…?

---

## 3. Industry questions (answer with named systems)

### 3.1 Do premium products expose a 5th “mode of use”?

Compare:

- Zendesk **Agent Workspace** vs Zendesk Admin / reporting  
- Front **shared inbox** vs Front analytics  
- Linear **Issues** vs Linear **Insights** / Cycles  
- Stripe **Dashboard** work vs Stripe **Sigma**/reporting  

For each: is the CX surface a different *interaction contract* (selection, persistence, input model), or the same pick+edit grammar with different chrome?

### 3.2 Conversation-first vs record-first

World-class CX often centers a **thread + composer**, with queue and customer context as satellites. Ops Workbench often centers a **LedgerGrid + inspector**.

Questions:

1. Is conversation-first a different **contract**, or a Workbench recipe where the “record” is a thread?
2. When do top products keep a dense ticket **table** vs a **split inbox** (list | thread | context)?
3. What do they share with issue trackers (Linear) vs diverge?

### 3.3 Omnichannel / presence / SLA

Do SLA timers, assignment, collision detection, and channel icons justify a new archetype, or cross-cutting **capabilities** that any Workbench can mount (like our composer dock)?

### 3.4 Domain ≠ contract (force the distinction)

Shopify has Products vs Orders vs Customers — still one admin interaction grammar.  
Amazon has Manage Inventory vs Messaging — different chrome, same browser-app grammar.

**Rule we need from you:** a test that says “this domain gets a Workbench *branch*” vs “this domain only gets a spine section + existing Workbench recipe.”

---

## 4. Options under evaluation (score all)

### Option A — Fifth archetype: e.g. `service` / `inbox` / `console`

- Extends `ARCHETYPE_IDS`
- New Q in discriminator (where? after scanner? before Workbench fallthrough?)
- New density token? or reuse `ops`?
- Support registry becomes that archetype; composer/context become contract-level SoT

**Strongest case for A:** if industry shows a different **selection + persistence + input** model that Workbench’s definition cannot hold without lying.

### Option B — Workbench branch (recommended strawman to attack)

- Archetype stays `workbench`
- Formalize `WorkbenchBranchId = 'ops-queue' | 'service' | …` (or recipe id)
- New display law file: e.g. `.claude/rules/display/workbench-service.md`
- Shared shells: conversation column · customer context · composer dock · SLA/assignment chip row
- Discriminator unchanged; branch chosen by **job signals** (conversation-centric, omnichannel, customer-context-required) — not by route name

**Strongest case for B:** Support fails Q1–Q3, is Workbench by law, but generic ops-queue recipe (LedgerGrid-first) is the wrong default chrome vs agent workspace.

### Option C — Recipe-only (minimal)

- Fix `SURFACE_REGISTRY.support` from `station` → `workbench`
- Document Support under existing Workbench recipes (table+inspector + composer as dock)
- No new branch type in code — prose + components only

**Strongest case for C:** industry agent workspaces are still pick+edit; our Station hint was a category error; Desk-contract grid+rail already covers it.

### Option D — Keep Support as Station (status quo registry)

Only defend if you can show Support is scanner/act-and-clear. (Strawman: almost certainly wrong — attack it.)

---

## 5. If you recommend a Workbench branch — specify the contract patch

Do not stop at “add a branch.” Deliver:

1. **Branch name** (Service / Inbox / Agent / Conversation — pick one, defend)
2. **Entry test** (mechanical signals: job, dataShape, presence of composer+customer context, etc.)
3. **Inherits from Workbench** (URL selection, CRUD, density default, right-rail push rules)
4. **Overrides / forbids** (e.g. must not use Station ephemeral selection; must not put thread list in a scan column; composer SoT; collision/assignment chrome)
5. **Primary composition** (list|thread|context vs grid|inspector — pick a default)
6. **Density** (`ops` vs new token — defend)
7. **Code touch list** (archetype.ts? new type? SURFACE_REGISTRY? display law path?)
8. **Who else may use the branch** later (Warranty-only? Issues? Orders exceptions under Support?) without inventing more branches

---

## 6. Forced decisions (D1–D12)

| ID | Decision | Default if abstain |
|---|---|---|
| **D1** | Option A / B / C / D for Support | **B** (Workbench branch) |
| **D2** | Correct `SURFACE_REGISTRY.support` archetype immediately? | Yes → `workbench` (or new branch’s parent) |
| **D3** | Does spine domain “Support” require any archetype change? | **No** — domain ≠ contract |
| **D4** | Fifth `ARCHETYPE_IDS` value? | **No** unless A wins with clear discriminator |
| **D5** | New density token for CX? | **No** — reuse `ops` unless proven |
| **D6** | Default Support composition | list \| thread \| context **or** grid \| inspector — pick one |
| **D7** | Composer ownership | Stay `StationComposerDock` SoT vs rename/generalize to neutral SoT |
| **D8** | Voicemail/Calls modes | Same branch as Tickets vs Monitor strips vs separate recipe |
| **D9** | Slope rule: next branch allowed only when… | Write the rule in one sentence |
| **D10** | Sales domain | Workbench recipe only vs share Service branch vs own branch — pick |
| **D11** | Fulfillment desk queues | Stay ops-queue Workbench recipe — confirm |
| **D12** | Doc/code deliverable order | display law first vs registry fix first vs shells first |

---

## 7. Deliverable format

1. **Industry findings** (≤1.5 pages) — named systems, citations, whether “agent workspace” is a contract or a template  
2. **Layer A/B/C map** — table of 6+ products  
3. **Option scores** — A/B/C/D table  
4. **D1–D12 rulings**  
5. **If branch:** §5 patch spec (name, tests, inherits, forbids, composition)  
6. **Migration plan** for Support only (registry, docs, composer naming, guards) — blast radius ordered  
7. **Decision rule** for future branches (one paragraph + 3 examples: Sales, Fulfillment, Inbound)  
8. **What not to do**

---

## 8. Paste prompt for Gemini

```
Read docs/todo/region-contract-branching-support-GEMINI-RESEARCH-BRIEFING.md
end-to-end. You do not have the codebase — treat §1 as ground truth.

Keep layers A (archetype) / B (nav domain) / C (recipe) separate.
Force D1–D12. Prefer a defended Workbench branch or recipe-only fix over a
5th archetype unless the discriminator truly needs a new Q.

Compare against world-class premium SaaS agent workspaces (Zendesk, Gorgias,
Front, Plain, Intercom, Salesforce Service, Linear, Stripe). Cite 2024–2026
sources. Deliver §7 exactly.
```
