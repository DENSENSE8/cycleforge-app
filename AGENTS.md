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

## Hard laws

Violating one of these is a bug even when the task "worked". Detail behind the links above.

- **Never commit `.env`**, and never bypass the hooks in `.claude/settings.json`.
- **Never start, restart, or kill a dev server.** The user's is already running on **`:3050`** —
  attach to it. A broken dev server is a thing you report, not a thing you repair.
- **The user manages commits.** Never `git stash`; stage only your own files; commit/push only when asked.
- **Stay on the checkout's branch.** The worktree *is* the branch — no ad-hoc branches, no mid-session switches.
- **One module per concern.** Read from the SoT; never inline, copy, or re-derive its mapping.
- **Compose from the named SoT first; grow it when it is wrong.** Never fork a page-local twin for the same job.
- **Status changes only via `transition()`** — never a raw `UPDATE … current_status`.
- **`orgId` comes from `ctx`, never the body**; org-scoped writes go through `withTenantTransaction`.
- **Never build a second search engine, audit API, or status transition** outside the SoT modules.
- **Color, spacing, type, z-index, elevation, focus come from tokens** — no page-local hex, no raw `z-[N]`.
- **Motion comes from `@/design-system/motion`** — name a `motionRole.*`, never a motion package.
  `framer-motion` / `motion/react` are banned outside `src/design-system/motion/**`.
- **LedgerGrid justification:** digit / order-ID / date / tracking columns **end**-align; word / tag columns **start**-align — `resolveGridColumnAlign` only (never a per-cell `justify-*`).
- **The right edge PUSHES; it never floats over the work surface** (ruled 2026-08-01, superseding "inspectors float"). MasterNav is a push spine; context rails use `ContextPanelLayout` (resize + collapse); right-rail record inspectors push the workspace in-flow on `RightRailHost` (`modal={false}`, resize + collapse) and **displace the left spine before they overlap the grid**. Detail: [`source-of-truth.md`](.claude/rules/source-of-truth.md) (Right-rail modality).
- **Scan stations that host a Workbench strip must expose a solid return-to-scan CTA** in `WorkbenchTrailingCluster.actions` (top-right of the context bar, above KPIs) on every strip tab — re-arm Station scan work. Detail: [`display/workbench.md`](.claude/rules/display/workbench.md) → Multi-region pages.
- **`npm run verify` before a task is done** — and never raise a ratchet baseline to make it pass.
- **E2E asserts against the QA org**, not the dogfood tenant.

**Do** improve an SoT module when it is incomplete or inconsistent — that is pattern evolution, not
invention. A new hard law is **one line here plus a detail file**, never a new section in this file.
