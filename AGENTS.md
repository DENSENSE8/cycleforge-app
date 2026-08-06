# Cycle Forge — agent instructions

Portable hard rules for every coding agent (Claude, Grok, Codex, Cursor, …).
**This file is a map, not a manual.** Each row below links the file that holds the detail — read it
when the task touches that concern. Depth lives in [`.claude/rules/`](.claude/rules/), never here.

## Product

**Cycle Forge** is multi-tenant reseller-ops SaaS. This repo is the app; USAV is the dogfood tenant.
Vendor integrations (Zoho, Zendesk, …) are tenant connectors behind **capability facades** — never the
product itself. Operator copy uses capability nouns or runtime provider labels, never hardcoded vendor
product sentences (except the Integrations hub / deep links).

## Read when the task touches it

| Concern | File |
|---|---|
| Lanes, branches, **the dev server (attach, never start)**, work-log, commits, secrets | [`workflow-safety.md`](.claude/rules/workflow-safety.md) |
| **Source-of-truth invariants** (dates, tokens, shells, search, grids, …) | [`source-of-truth.md`](.claude/rules/source-of-truth.md) |
| Compose → grow the SoT → compound; Always / Ask first / Never | [`pattern-evolution.md`](.claude/rules/pattern-evolution.md) |
| Product UI identity + the five laws | [`kinetic-ledger.md`](.claude/rules/kinetic-ledger.md) |
| Region contracts (Station · Workbench · Monitor · Canvas) | [`contextual-display.md`](.claude/rules/contextual-display.md) (+ [`display/`](.claude/rules/display/)) |
| Density, one-row anatomy, chips, type, spacing, focus | [`ui-design-system.md`](.claude/rules/ui-design-system.md) |
| Routes, state machine, audit, tenant GUC, `Deps` injection | [`backend-patterns.md`](.claude/rules/backend-patterns.md) |
| New polymorphic / typed-fact tables | [`polymorphic-tables.md`](.claude/rules/polymorphic-tables.md) |
| Tailwind `.mjs` imports, content globs, bundle altitude | [`build-gotchas.md`](.claude/rules/build-gotchas.md) |
| Gates, DS ratchets, E2E org, how to measure | [`verify.md`](.claude/rules/verify.md) |
| Tier-1 paint content order · LCP surfaces | [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Paint content order (+ [`docs/performance/HANDOFF-lcp-streaming.md`](docs/performance/HANDOFF-lcp-streaming.md)) |

## Hard laws

Violating one of these is a bug even when the task "worked". Detail behind the links above.

- **Never commit `.env`**, and never bypass the hooks in `.claude/settings.json`.
- **Never start, restart, or kill a dev server.** The user's is already running on **`:3050`** —
  attach to it. A broken dev server is a thing you report, not a thing you repair.
- **The user manages commits.** Never `git stash`; stage only your own files; commit/push only when asked.
- **Stay on the checkout's branch.** The worktree *is* the branch — no ad-hoc branches, no mid-session switches.
- **One module per concern.** Read from the SoT; never inline, copy, or re-derive its mapping.
- **Compose from the named SoT first; grow it when it is wrong.** Never fork a page-local twin for the same job.
- **Platform-aware order / PO identity is one contract:** resolve label + paint from `source-platform.ts` / `usePlatformMeta`; hover reads `Platform full-id`, the face stays last-8, copy stays bare, and unknown stays neutral. Never concatenate or color-map platform identity in a view. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Source platform · Copy-chip.
- **Order surfaces are two jobs, not one shell.** Durable edit/notes = desk tabbed `ShippedDetailsPanel` @ `/shipping/orders?openOrderId=`; search feedback = `SearchOrderFeedback` @ `/search?sel=order:…` (never import `ShippedDetailsPanel`). `/o/[id]` is retired (redirects to search feedback). Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md).
- **Status changes only via `transition()`** — never a raw `UPDATE … current_status`.
- **`orgId` comes from `ctx`, never the body**; org-scoped writes go through `withTenantTransaction`.
- **Never build a second search engine, audit API, or status transition** outside the SoT modules.
- **Color, spacing, type, z-index, elevation, focus come from tokens** — no page-local hex, no raw `z-[N]`.
- **Motion comes from `@/design-system/motion`** — name a `motionRole.*`, never a motion package.
  `framer-motion` / `motion/react` are banned outside `src/design-system/motion/**`.
- **Unbox centre (main dogfood): PO lines + label preview** — carton context sticky; interactive `POUnboxingSection` (condition + serial) + `UnboxLabelPreview`; dock is notes + Print · Receive. Guided `ProcedureDeck` / step dock continues on the `unbox-work` lane (`../cycleforge-unbox`). Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Unbox centre (main).
- **Scan-station centre = the LINES display** — the carton's PO items / unfound lines (`LinePoItemsSection` / `UnmatchedItemsSection`) under identity, dock below. Reference tools (Pairing/Linkage · Classify · Staging · Ticket · Photos) are right-edge **Displays** (`ReceivingDisplaysPushStack` / `UnboxPushColumn`), never a centre `SectionTabsSlider` strip and never a `RightRailHost` occupant. **Arrival carve-out:** centre = items + Classify + Staging (door flow, stacked); Displays = Pairing only. Operator copy: **Open displays** ≠ Desk Band 3 **Show inspector** (never “details editor” on the Station `←|`). Unbox is the golden; Arrival · Testing compose the same host. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Scan-station centre lines display · Displays vs inspector.
- **LedgerGrid justification:** a **magnitude** you compare down the column (qty · price · date) **end**-aligns; a **label or ID** you read (title · tag · platform · tracking · order # · SKU · serial) **start**-aligns — `resolveGridColumnAlign` only (never a per-cell `justify-*`).
- **Depth is planes, not floating gutters** — work columns are exact/flush on one shared canvas; depth = surface steps (`canvas` → `sunken` → `card`) + `elevationClass` + `nestedCorner`. Decorative outer `m-*` islands between spine · context · center · right are not depth. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Depth elevation · Frame column budget.
- **Frame width budget** — open rails must leave the center floor on desk surfaces (`MIN_WORK_SURFACE_PX`); scan stations lock the middle at **720** (`STATION_PUSH_CENTER_FLOOR_PX`) with Displays `flex-1` pinned trailing (`StationScanPaneHost`). Never dual full-width right columns (AI + ticket/detail). Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Frame column budget.
- **The right edge PUSHES; it never floats over the work surface** (ruled 2026-08-05, superseding the narrow overlay fallback). MasterNav is a push spine; context rails use `ContextPanelLayout` (resize + collapse); desktop right-rail record inspectors stay in-flow on `RightRailHost` (`modal={false}`, resize + collapse) at every width. Width pressure **never auto-closes / parks the left context rail** — both stay open; desk inspectors cap so the center keeps `MIN_WORK_SURFACE_PX`; scan-station Displays let rails close the gap against the locked ~720 center (`STATION_CENTER_COLUMN_CLASS`) — never a floating rounded card. Modal/intake, mobile, ambient AI, and station edge opt-outs remain explicit overlay contracts. **AI (header Sparkles) and record/ticket details share one right-edge slot** — detail outranks assistant; never a fifth permanent column beside both. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) (Right-rail modality · Frame column budget).
- **Scan stations that host a Workbench strip must expose a solid return-to-scan CTA** in `WorkbenchTrailingCluster.actions` (top-right of the pinned chrome — same row as, or above, any KPI display; never below it) on every strip tab. It **resumes** — re-opens the station's most recent record and re-arms the scan bar — it does not land a bare data table. Detail: [`display/workbench.md`](.claude/rules/display/workbench.md) → Multi-region pages.
- **Ops chrome is flush-square** — solid CTAs, tab bands, selects, chips and toggle rows compose `cornerClass('flush')` (`rounded-none`); soft radius (`rounded-lg`/`xl`/`2xl`/`full`) and horizontal pill bands (`HorizontalButtonSlider`, soft `TabSwitch`) are debt. `WORKBENCH_CHROME_PILL_CLASS` is now `cornerClass('flush')`. `rounded-full` survives only for status dots · avatars · Switch tracks. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) (Workbench chrome flush).
- **Host vs content pad** — outer hosts are flush (`p-0` / named sheet·rail tokens); content pad lives on the row (`inset-*` / `SIDEBAR_SCAN_DOCK_LEADING_ROW`). Desk golden: To-ship. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Host vs content pad.
- **The GlobalHeader left cluster is a fixed order with named modules** — toggle · Recents · **page identity (icon + display name, never null, one `PAGE_FACE_CLASS`)** · Pins (direct peer: no divider/padded wrapper; menu + `⌘/Ctrl+1–9`) · work order · goal. Every header dropdown composes `HeaderChromeMenu` / `HeaderChromeMenuItem`; station peers come from `stationSubgroupMembers`, never legacy `receiving.children`. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → GlobalHeader left cluster.
- **`npm run verify` before a task is done** — and never raise a ratchet baseline to make it pass.
- **E2E asserts against the QA org**, not the dogfood tenant.
- **Paint content order is firm on Tier-1 routes:** P0 shell → P1 primary work → P2 context → P3 trailing (Displays strip chrome only; bodies / inspector / AI may wait). The route’s declared LCP surface must never sit behind `next/dynamic(..., { ssr: false })` without an SSR stand-in that owns first paint. Seeding TanStack alone does not move LCP while the element is client-gated. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) → Paint content order · `src/lib/observability/tier1-paint-order.ts`.

**Do** improve an SoT module when it is incomplete or inconsistent — that is pattern evolution, not
invention. A new hard law is **one line here plus a detail file**, never a new section in this file.
