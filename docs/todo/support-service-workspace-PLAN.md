# Plan — Support as Workbench branch `service-workspace`

**Status:** ratified 2026-08-01 (Gemini Pro research → Option B)  
**Research:** [`region-contract-branching-support-GEMINI-RESEARCH-BRIEFING.md`](./region-contract-branching-support-GEMINI-RESEARCH-BRIEFING.md)  
**Execution:** [`support-service-workspace-CLAUDE-CODE-PROMPT.md`](./support-service-workspace-CLAUDE-CODE-PROMPT.md)  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

---

## 0. One-sentence ruling

**Support is a Workbench branch (`service-workspace`), not a 5th archetype and not a Station.** Agent Workspace is a specialized Layer C shell on Layer A pick+persist physics — same contract as Linear/Stripe/Plain/Zendesk Agent Workspace.

---

## 1. Industry verdict (locked — do not re-litigate)

| Layer | Question | Support answer |
|---|---|---|
| **A — Contract** | Interaction physics | **Workbench** (URL selection, CRUD, pointer) |
| **B — Domain** | Spine nav | **Support** (Tickets · Orders · Voicemail · Calls · Warranty · Issues) |
| **C — Recipe / branch** | Layout composition | **`service-workspace`**: List \| Thread+Composer \| Context |

**Option scores (Gemini):** B Workbench Branch ≫ C Recipe-only ≫ A 5th Archetype ≫ D Keep Station.

**Closed forever:**

- No `support` / `service` / `inbox` value in `ARCHETYPE_IDS`
- No `SURFACE_REGISTRY.support.archetype: 'station'` (category error)
- No contract-per-nav-domain slope (SalesContract, FulfillmentContract, …)
- Do not force Desk **ops-queue** recipe (saved views · LedgerGrid · right inspector) onto conversation-first Support — that recipe stays for Sales / Fulfillment Desk / Inbound Desk

---

## 2. Forced decisions (D1–D12) — locked

| ID | Ruling |
|---|---|
| **D1** | Option **B** — Workbench branch |
| **D2** | Patch `SURFACE_REGISTRY.support.archetype` → `'workbench'` immediately |
| **D3** | Domain (spine) ≠ contract — Support nav elevation does not change physics |
| **D4** | No 5th `ARCHETYPE_IDS` value — four contracts remain |
| **D5** | Density stays **`ops`** — no new density token |
| **D6** | Default composition: **list \| thread \| context** |
| **D7** | Composer SoT drops Station ownership — rename/generalize to **`OmnichannelComposerDock`** (shared shell; Unbox notes keep composing it) |
| **D8** | Voicemail / Calls = **modes inside** the Service branch, not new contracts |
| **D9** | Branch slope rule — §4 |
| **D10** | Sales = standard Workbench **ops-queue** recipe only |
| **D11** | Fulfillment desk queues = standard Workbench ops-queue; Scan-out remains Station |
| **D12** | Deliverable order: (1) registry · (2) display law · (3) shells/components |

---

## 3. Branch patch spec — `service-workspace`

### 3.1 Entry test (all required to claim the branch)

A Workbench surface may declare branch `service-workspace` only when:

1. `hasOmnichannelSource === true` (helpdesk / voice / messaging capability), **and**
2. `primaryDataShape === 'thread'` (not `'ledger'` / `'document'`), **and**
3. Entity carries SLA / timer / collision-presence chrome requirements (or a clear plan to mount them)

### 3.2 Inherits from Workbench

- URL-addressable selection (e.g. `/support?ticket=…` / durable ticket id)
- CRUD (edit / reply / resolve / assign)
- Density `ops`
- Singular focus-surface crossfade (thread body) — never the queue map
- Right edge **pushes** (`RightRailHost` `modal={false}` for context when rail-hosted)

### 3.3 Overrides / forbids

| Forbid | Why |
|---|---|
| Ephemeral selection | Tickets must survive reload / share |
| Barcode-first act-and-clear auto-advance | Not a scan floor |
| Primary queue in a compact **scan** column | Station grammar |
| Mounting `StationWorkbench` / `StationContextBar` as Support’s primary shell | Station Unbox-family anatomy — wrong contract |
| Treating Support Phase 1 of desk-unification as LedgerGrid-only middle | Wrong branch recipe |

### 3.4 Primary composition

```text
┌──────────────┬────────────────────────────────────┬─────────────────────────┐
│ LEFT         │ MIDDLE                             │ RIGHT                   │
│ Ticket list  │ Thread (conversation)              │ Customer / order /      │
│ (queue map)  │ + bottom OmnichannelComposerDock   │ warranty CONTEXT rail   │
│ durable URL  │ crossfade on ticket id             │ push, resize, collapse  │
└──────────────┴────────────────────────────────────┴─────────────────────────┘
```

Modes (Tickets · Voicemail · Calls · …) switch **content** inside this branch — they do not change the contract.

---

## 4. Branch slope rule (D9)

A new domain may trigger a **formal Workbench branch** (like `service-workspace`) **only if**:

1. the primary **data shape** mandates a different composition axis (e.g. chronological **thread** vs tabular **ledger**), **and**
2. it requires **persistent global chrome** unique to that axis (SLA timers, collision presence, omnichannel source strip).

If the domain only introduces different business entities (SKUs vs Orders vs Quotes), it must use an **existing** Workbench recipe (ops-queue / master–detail / board / fact stack).

| Domain | Branch? | Recipe |
|---|---|---|
| **Support** | **Yes — `service-workspace`** | list \| thread \| context |
| **Sales** | No | ops-queue (grid \| inspector) |
| **Fulfillment Desk** | No | ops-queue; Scan-out = Station |
| **Inbound Desk** | No | ops-queue / boards + inspector |

---

## 5. What this supersedes

| Prior doc / decision | Fate |
|---|---|
| `SURFACE_REGISTRY.support.archetype: 'station'` | **Overturned** — patch to `workbench` |
| [`support-station-full-waist-handoff.md`](./support-station-full-waist-handoff.md) “Support = Station Workbench anatomy” | **Shell/contract overturned**. Ticket waist work (links re-key, helpdesk facade, create path) may continue as **domain** work under the new branch — do not keep porting Unbox Station chrome onto `/support` |
| [`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](./desk-contract-unification-CLAUDE-CODE-PROMPT.md) Phase 1 “Support → LedgerGrid middle” | **Superseded for Support.** Desk ops-queue recipe remains for Labels / Products / warehouse locations / Sales / Fulfillment queues — **not** conversation-first Support |
| Adding a 5th archetype | **Rejected** |

---

## 6. Phased delivery (D12)

### Phase 0 — Registry + tests (blast: low) ✅ first

- `SURFACE_REGISTRY.support.archetype: 'workbench'`
- Comment: Workbench branch `service-workspace` (not Station)
- Update any test / guard that asserts Support is `station`
- `pickArchetype` / `ARCHETYPE_IDS` **unchanged**

**Gate:** surface-keys + surface-routing + related unit tests green.

### Phase 1 — Display law (blast: safe)

- Author `.claude/rules/display/workbench-service.md` (branch law: composition, forbids, slope rule, mode matrix)
- Link from `contextual-display.md` index + `workbench.md` recipes table
- One-line SoT row in `source-of-truth.md` if a shell lands in Phase 2
- Update Kinetic Ledger / contextual-display wording only where it still says Support is Station

**Gate:** docs coherent; no code behavior change required beyond Phase 0.

### Phase 2 — Composer rename (blast: medium)

- Rename `StationComposerDock` → `OmnichannelComposerDock` (file + export)
- Keep a **deprecated re-export** `StationComposerDock` **one migration window** (or codemod all call sites in the same PR — prefer full codemod if verify stays green)
- Rename helper `handleStationComposerKeyDown` → `handleComposerKeyDown` (alias old name)
- Update SoT rows (`source-of-truth.md`, `station-workbench.md`, Design System.md) — Unbox notes still compose the same shell; ownership is no longer Station-contract

**Gate:** all former import sites compile; knip clean; no second composer shell invented.

### Phase 3 — Service workspace shell (blast: medium)

- Scaffold `service-workspace` layout template (3-pane) under a named module (prefer `@/components/support/service-workspace/` or `@/design-system/shells/service-workspace/` — **one** home)
- Wrap Tickets mode first: list map stays mounted; thread+composer is the focus surface; context on push rail
- Stop using `StationWorkbench` / `StationContextBar` as Support’s **primary** chrome (ticket identity can be a Workbench identity header, not Carton/Station context bar)
- Voicemail / Calls: same branch shell, mode-swapped middle (stub OK if voice UI incomplete — do not invent a new archetype)

**Gate:** `/support` tickets mode reads as list \| thread \| context; URL ticket selection durable; `npm run verify` green.

### Phase 4 — Follow-ons (out of this prompt’s critical path)

- Helpdesk facade / vendor-neutral copy (from support-station waist Phase 6)
- ticket_links re-key apply (ASK-FIRST / db-migrate)
- SLA / presence chrome once branch shell is stable
- Desk-unification for **non-Support** surfaces continues on its own prompt

---

## 7. Non-goals

- Redesigning Zendesk sync, ticket schema, or permissions in this lane
- Forcing LedgerGrid as the only legal Support list (list may stay a dense ticket queue component initially; growing toward LedgerGrid is optional later and must not destroy thread-first focus)
- Mobile `/m/*` Support redesign
- Creating `Sales` / `Fulfillment` branches

---

## 8. Verify

Before claiming done for any phase that touches code:

```bash
npm run verify
```

Never raise DS ratchet baselines. Attach to `:3050`; never start/restart/kill the dev server. User owns commits.
