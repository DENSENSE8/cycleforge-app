# Claude Code prompt — Support Workbench branch `service-workspace`

**For:** Claude Code / Cursor Agent implementing session  
**From:** Cycle Forge engineering  
**Status:** ready to execute — architecture locked by Gemini Option B (2026-08-01)  
**Plan:** [`support-service-workspace-PLAN.md`](./support-service-workspace-PLAN.md)  
**Research:** [`region-contract-branching-support-GEMINI-RESEARCH-BRIEFING.md`](./region-contract-branching-support-GEMINI-RESEARCH-BRIEFING.md)  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Supersedes (Support shell/contract only):**

- `SURFACE_REGISTRY.support.archetype: 'station'`
- Support-as-Station Workbench anatomy in [`support-station-full-waist-handoff.md`](./support-station-full-waist-handoff.md)
- Desk-unification Phase 1 “Support → LedgerGrid middle” in [`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](./desk-contract-unification-CLAUDE-CODE-PROMPT.md) — **do not execute that Support slice**

---

## Paste this into a new Claude Code session

**Run as THREE sessions** (Phase 0 → stop → Phase 1 → stop → Phase 2+3). Do not sprawl.

### Session A — registry fix only

```
Read docs/todo/support-service-workspace-PLAN.md and
docs/todo/support-service-workspace-CLAUDE-CODE-PROMPT.md end-to-end.
Execute §4 Phase 0 ONLY. Stop at the Phase 0 gate.

GOAL
Patch SURFACE_REGISTRY.support.archetype from 'station' to 'workbench'.
Document that Support is Workbench branch service-workspace.
Update tests/guards that assert Support is station.
Do NOT touch ARCHETYPE_IDS. Do NOT rename StationComposerDock yet.
Do NOT rebuild Support UI yet.

HARD LAWS
- AGENTS.md + .claude/rules/source-of-truth.md + contextual-display.md
- Four contracts only: station | workbench | monitor | canvas
- Domain nav ≠ region contract
- Attach to :3050; never start/restart/kill the server; user owns commits
- npm run verify before done; never raise ratchet baselines
```

### Session B — display law only

```
Read docs/todo/support-service-workspace-PLAN.md §3–§4 and
docs/todo/support-service-workspace-CLAUDE-CODE-PROMPT.md §2 + §4 Phase 1.
Execute Phase 1 ONLY.

GOAL
Author .claude/rules/display/workbench-service.md (service-workspace branch law).
Link it from contextual-display.md + workbench.md.
Encode the Branch Slope Rule and the list|thread|context composition.
Forbid Station ephemeral / scan-column / StationWorkbench-as-Support-primary.

Do not rename the composer or scaffold the shell in this session.
```

### Session C — composer rename + shell scaffold

```
Read docs/todo/support-service-workspace-PLAN.md and
.claude/rules/display/workbench-service.md (must already exist from Session B).
Execute §4 Phase 2 then Phase 3.

GOAL
1. Rename StationComposerDock → OmnichannelComposerDock (full codemod; update SoT docs).
2. Scaffold service-workspace 3-pane shell; wrap /support Tickets mode:
   list | thread + composer | context rail.
3. Stop using StationWorkbench / StationContextBar as Support’s primary chrome.

HARD LAWS
- Same OmnichannelComposerDock shell remains Unbox notes SoT — do not fork a second dock
- Right edge pushes (RightRailHost modal={false}) for context when rail-hosted
- Crossfade only the thread focus surface — never the ticket list
- Voicemail/Calls stay modes in this branch — no new archetype
- npm run verify before done
```

---

## 0. One-sentence goal

**Correct the category error:** Support is Workbench `service-workspace` (agent workspace: list \| thread \| context) — then rename the shared composer so it is not Station-owned, and wrap Tickets in that shell.

---

## 1. Locked architecture

```text
Layer A  Workbench          (pick + URL persist + CRUD, density ops)
Layer B  Support domain     (spine section / modes)
Layer C  service-workspace  (list | thread+OmnichannelComposerDock | context)
```

| Slot | Owns | Must not |
|---|---|---|
| **List** | Durable ticket/queue map; stays mounted on selection | Ephemeral scan-column; act-and-clear auto-advance |
| **Thread** | Conversation body; singular focus crossfade on ticket id | Replacing the whole page with Station focus card |
| **Composer** | `OmnichannelComposerDock` bottom-docked on thread | Hand-rolled second sticky amber composer |
| **Context** | Customer / order / warranty / linkage push rail | Floating overlay covering the thread; Station push-column twin for CX |

**Branch entry test** (all required): omnichannel source · `primaryDataShape === 'thread'` · SLA/presence chrome needs.

**Slope rule:** new Workbench branch only when data shape **and** persistent chrome differ; Sales / Fulfillment Desk / Inbound Desk stay ops-queue recipes.

---

## 2. Measured ground truth (2026-08-01)

| Fact | Value |
|---|---|
| `SURFACE_REGISTRY.support.archetype` | **`station`** ← wrong; patch to **`workbench`** |
| `scan` | `null` (already not scanner-driven) |
| Route | `/support` |
| Composer SoT today | `StationComposerDock` — also Unbox notes + `SupportChatComposer` |
| Focus today | `SupportTicketFocus` composes **Station** Workbench / ContextBar |
| Queue today | `SupportTicketsBoard` + recent rail — Station-shaped, not service-workspace |

**Absolute paths:**

```
src/lib/stations/surface-keys.ts          # support registry row
src/lib/stations/archetype.ts             # DO NOT add a 5th id
src/design-system/primitives/StationComposerDock.tsx
src/components/support/zendesk/SupportTicketsWorkspace.tsx
src/components/support/zendesk/SupportTicketsBoard.tsx
src/components/support/station/SupportTicketFocus.tsx
src/components/support/zendesk/chat/SupportChatComposer.tsx
src/components/support/zendesk/chat/SupportTicketComposerDock.tsx
src/components/sidebar/SupportSidebarPanel.tsx
.claude/rules/contextual-display.md
.claude/rules/display/workbench.md
.claude/rules/source-of-truth.md
```

---

## 3. Industry contract (why this shape)

Premium CX (Zendesk Agent Workspace, Plain, Front, Intercom) = **same pick+persist physics** as Linear/Stripe, with a **3-pane agent shell**. It is not act-and-clear Station and not a 5th archetype. Kinetic Ledger stays: dense ops chrome, not a consumer chat-app skin.

---

## 4. Execution phases

### Phase 0 — Registry patch (Session A)

1. In `src/lib/stations/surface-keys.ts`, set `support.archetype: 'workbench'`.
2. Comment block on the row:
   - Workbench branch **`service-workspace`**
   - Not Station; `scan: null` remains
   - Law: `display/workbench-service.md` (may say “forthcoming” until Phase 1)
3. Fix tests that expect Support `station` (search `support` + `station` in `src/lib/stations/*.test.ts`, studio vocab fixtures, nav guards).
4. Do **not** change `ARCHETYPE_IDS` or `pickArchetype` Q1–Q4.

**Gate:**

```bash
npx tsx --test src/lib/stations/surface-keys.test.ts src/lib/stations/surface-routing.test.ts
npm run verify -- --fast
```

Stop. Do not start Phase 1 in the same session unless the user explicitly continues.

---

### Phase 1 — Display law (Session B)

Author **`.claude/rules/display/workbench-service.md`** with at least:

1. Branch name + Layer A/B/C one-liner  
2. Entry test (omnichannel · thread · SLA/presence)  
3. Inherits / overrides / forbids table from the plan  
4. Composition ASCII (list \| thread \| context)  
5. Mode matrix: Tickets · Voicemail · Calls · Orders · Warranty · Issues — all **same branch**, different middle content  
6. Branch Slope Rule + Sales / Fulfillment / Inbound examples  
7. Motion: crossfade thread only; list stable; reduced-motion via house bridge  
8. Composer: `OmnichannelComposerDock` (Phase 2 rename) — never a Support-only fork  
9. Explicit ban: `StationWorkbench` / scan-column / ephemeral selection as Support primary

Wire links:

- `contextual-display.md` → child index entry  
- `workbench.md` → new recipe row **Service workspace (thread-first)** pointing at `workbench-service.md`  
- Optional one-liner in `AGENTS.md` only if you add a hard law (prefer detail in display law; keep AGENTS slim)

**Gate:** docs only (or tiny comment fixes). No UI rebuild.

---

### Phase 2 — Composer rename (Session C first half)

1. Rename file `StationComposerDock.tsx` → `OmnichannelComposerDock.tsx`.
2. Export `OmnichannelComposerDock` + `handleComposerKeyDown` from primitives barrel.
3. Codemod every import site (Unbox notes, Support chat, tests, docs comments in touched files).
4. Update SoT:
   - `source-of-truth.md` row “Station composer dock” → “Omnichannel / chat-style composer dock”
   - `station-workbench.md` / `DESIGN_SYSTEM.md` references
5. Prefer **no** long-lived `StationComposerDock` alias (full rename in one PR). If a temporary alias is required for a mid-migrate green tree, delete it before claiming done.
6. Do **not** invent `SupportComposerDock` beside it.

**Gate:** typecheck + knip + composer unit tests green.

---

### Phase 3 — Shell scaffold (Session C second half)

1. Create a named shell module for the 3-pane service workspace (pick **one** home; do not scatter):
   - Preferred: `src/components/support/service-workspace/` with `ServiceWorkspaceShell.tsx` (+ thin layout tokens if needed)
2. Tickets mode composition target:

```text
LEFT   = existing ticket list / board map (keep mounted; URL selection)
MIDDLE = thread focus (migrate body out of StationWorkbench) + OmnichannelComposerDock
RIGHT  = context / linkage / customer cards on push rail (RightRailHost modal={false}
         or ContextPanelLayout — match house right-edge push law; no float-over-thread)
```

3. Replace `SupportTicketFocus` primary dependency on `StationWorkbench` / `StationContextBar` with Workbench-appropriate identity + section chrome (compose existing PaneHeader / identity chips where possible — **grow SoT**, don’t fork Unbox carton chrome).
4. Keep `SupportChatComposer` → `OmnichannelComposerDock` wiring.
5. Voicemail / Calls: if incomplete, mount the **same shell** with a honest empty/teaching middle — do not add archetype or Station scan UI.
6. Add a small guard if useful: Support surface archetype must remain `workbench`; Support primary shell must not import `StationWorkbench` (ratchet down only).

**Gate:**

```bash
npm run verify
```

Dogfood `/support` on `:3050`: select ticket → URL sticks → thread+composer center → context available without covering the list as a scan column.

---

## 5. Explicit do / don’t

| Do | Don’t |
|---|---|
| Patch registry to `workbench` first | Add `service` to `ARCHETYPE_IDS` |
| Author `workbench-service.md` | Put branch law only in a todo doc |
| One shared `OmnichannelComposerDock` | Second Support-only composer |
| 3-pane service shell for Tickets | Force Desk LedgerGrid-only middle as the Support MVP |
| Modes inside the branch | New contract per Voicemail/Calls |
| Preserve ticket waist domain work (links, helpdesk) as follow-ons | Port more Unbox Station anatomy onto Support |

---

## 6. Acceptance checklist

- [ ] `SURFACE_REGISTRY.support.archetype === 'workbench'`
- [ ] `ARCHETYPE_IDS` still length 4
- [ ] `.claude/rules/display/workbench-service.md` exists and is linked
- [ ] Branch slope rule documented (Sales/Fulfillment = ops-queue, not branches)
- [ ] `OmnichannelComposerDock` is the SoT; no `StationComposerDock` left in `src/`
- [ ] `/support` Tickets = list \| thread+composer \| context (or clearly staged toward it with Station primary chrome removed)
- [ ] `npm run verify` green; no baseline raises
- [ ] Work-log entry only if the user asks for a commit / log

---

## 7. Paste-ready stop conditions

Stop and ask the user if:

1. A guard requires Support to stay `kind: 'station'` in **nav** and you cannot tell nav-kind from region-archetype apart (nav kind may stay station-*group* folklore — **do not** conflate with `SURFACE_REGISTRY.archetype`)
2. Right-rail push vs left context panel choice for the context column is blocked by an unfinished right-rail header SoT — pick push-rail with `PaneHeader` blocks and note follow-up; do not float
3. Full composer rename breaks an out-of-tree worktree — report paths; still finish rename on this checkout
