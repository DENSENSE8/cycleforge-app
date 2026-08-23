# HANDOFF — Counter visit detail surface (plan SQ5)

Scope: the surface an operator opens to **see everything about one counter visit and act on
it** — the devices taken in, what was sold, what was paid, and by whom.

Paste everything below the line into a fresh Claude Code session.

---

## ⚠️ Read this before anything else: the brief's original framing is stale

SQ5 was written in [`counter-square-enterprise-PLAN.md`](./counter-square-enterprise-PLAN.md)
as *"compose `EntityStationPane` with `stance: 'preview'`, `CartonContextCard` and
`StationDisplaysPushColumn`; `pattern-evolution.md` §5 is explicit that a read surface
composes the SAME assembly in a declared stance."*

**Every rule document that sentence cites was deleted on 2026-08-21** — commit
`0c2fd3746`, *"delete the house-law corpus for the Warehouse OS rebuild"*, 330 files and
~104,000 lines, including all of `docs/rules/**` and `.claude/rules/**`. `AGENTS.md` now
says plainly: the app is being rebuilt from a page-oriented SaaS into a **Warehouse OS**,
the old constitution "described the architecture being replaced, so following it would
actively fight the refactor", and **"Do not re-add house laws, guards, ratchets, or SoT
doctrine."**

So do not go looking for those files, and do not cite them. What survives is:

- **The code.** `EntityStationPane` is real and still carries a **required** `stance` prop
  (`src/components/station/entity/EntityStationPane.tsx:79` — `'work' | 'preview'`, no
  default), with `stance === 'preview'` forcing `dock = null` at line 179 and stamping
  `data-station-stance` on the DOM at line 189. The *mechanism* outlived the doctrine.
- **Two working `preview` mounts**, which is better than any rule file: `/search` composes
  this exact pattern today. See §2a.
- **`AGENTS.md`** — a short security/correctness/perf constitution. Read it; it is 90 lines.
- **The Warehouse OS plan**, which is NOT on `main`. It lives in a worktree:
  `.claude/worktrees/warehouse-os-refactor-8f2dc3/docs/warehouse-os/`. Status there:
  **Phase 0 — deciding. No refactor code has been written**, and 10 decisions block coding.

### The fork you must resolve before writing UI

| Option | What it means | Cost of being wrong |
|---|---|---|
| **A — build it on `main` now**, as a page-oriented pane composing `EntityStationPane` | Ships against today's architecture, works immediately, matches every other detail surface in the app | Gets rebuilt when the Warehouse OS canvas lands |
| **B — defer**, and build it as a Warehouse OS **tool** | Aligned with the target: sessions/tabs/tools on a tiling canvas | Blocked — Phase 0 is undecided and no shell exists to mount into |

**Ask the operator which, and do not guess.** The data work below (§3) is needed under
BOTH options and is safe to do first.

---

## 2a. The pattern already works — copy these two, do not invent

The old doctrine's cautionary tale was a hand-rolled `/search` twin. **That was fixed.**
`/search` now composes the host properly, and these are the reference mounts:

| Mount | Stance | Shape |
|---|---|---|
| `src/components/search/station/SearchOrderStationPane.tsx:429` | `preview` | `surface="card"`, `centreFill`, `onCentreScroll`, **no `dock`**. Comment at `:431`: *"Read surface: no dock, centre fields inert. Displays still write."* |
| `src/components/search/station/SearchUnitStationPane.tsx:271` | `preview` | `surface="card"`, `onCentreScroll`, no `dock` |
| `src/components/support/orders/SupportOrdersFocusHost.tsx:230` | `work` | the only `work` mount — passes a real `dock` |

**Read-only-ness is the ABSENCE of a capability prop, not a forked component.** A preview
mount simply passes no `dock`; the host nulls it anyway at line 179.

**You need a third identity adapter.** `identity` is fed by a per-entity sibling —
`src/components/station/order/OrderStationIdentity.tsx` and
`src/components/station/unit/UnitStationIdentity.tsx` exist. A counter visit needs
`CounterStationIdentity` of the same shape. That is growth (a new sibling composing the
shared card), not a fork.

Full props interface: `EntityStationPane.tsx:72-120`. The non-obvious ones:

- `entityKey` — the motion key; record→record swap crossfades on it.
- `displayTabs: SectionTab[]` + `displayIndexRows: DisplayIndexRow[]` — the right edge.
  Displays open on the **Root Index**, never a guessed leaf: an unknown `activeSideTab`
  falls back to `STATION_DISPLAY_INDEX`, never `tabs[0]` (`:156-161`).
- `activeSideTab` / `onSideTabChange` — Displays nav is **caller-controlled** by design.
- The right edge is Displays, **never `RightRailHost`** — the host's own docblock (`:22-24`)
  calls a desk inspector beside a Displays column a dual-right-edge violation.

### Two traps

1. **`stance` is an overloaded prop name in this repo.** `DeskInspectorIndexShell` uses
   `stance="standalone" | "index"` (~20 call sites) and `src/components/station/scan-bar/scan-stance.ts`
   is a third unrelated meaning. Only `'work' | 'preview'` belongs to `EntityStationPane`.
2. **`CartonInspectionPage.tsx:8-14` is NOT an example to copy.** Its own docblock says it
   has not been ported and is "a TODO, not a standing exemption."

## 1. What already exists — do not rebuild any of it

The counter domain shipped across two plans. Read these before writing anything.

| Path | What it is |
|---|---|
| `src/lib/counter/session-store.ts` | The domain waist: session CRUD, the lease, submit, Terminal checkout. `Deps`-injected. |
| `src/lib/counter/session-events.ts` | Pure reducer + the device-facing projection (`projectForDevicePrincipal`) |
| `src/lib/counter/submit-counter-transaction.ts` | The one path that writes a visit: N repairs + a staged Square order under one header |
| `src/lib/counter/counter-transaction-types.ts` | `CounterTransactionInput.services[]`, `CounterTransactionResult.repairs[]`, totals |
| `src/lib/counter/reconcile-payment.ts` | Square payment → header settlement (`staged → paid` / `partially_paid`) |
| `src/lib/counter/terminal-checkout.ts` · `terminal-device.ts` | The POS stand call + which reader serves a lane |
| `src/components/counter/CounterWorkspace.tsx` | The live desk surface at `/counter?session=<id>` |
| `src/lib/migrations/2026-08-20a_counter_sessions.sql` | `counter_sessions` + `counter_session_lines` |
| `src/lib/migrations/2026-08-21a_counter_sessions_terminal.sql` | `payment_state`, `terminal_checkout_id`, `awaiting_card_since` |
| `src/lib/migrations/2026-08-21b_kiosk_devices_terminal.sql` | `kiosk_devices.square_terminal_device_id` |

All applied. `npm run verify` is green (lint · typecheck · unit — that is the whole gate set now).

## 2. What the surface has to show

A **submitted** visit, which is the interesting case. Everything below is real data that
exists today:

- **The devices.** `repair_service` rows linked by `counter_transaction_id`. **A visit can
  have N of them** as of 2026-08-21 — do not build a UI that assumes one. Each has its own
  RS#, serial, quote, signature and lifecycle.
- **The lines**, including **voided ones**. `counter_session_lines.voided_at` /
  `void_reason` / `voided_by_staff_id`. A voided line is evidence — show it struck through
  with who and why, never hidden. (The customer-facing projection drops them; this surface
  is the operational face and must not.)
- **The money.** `counter_transactions.status` (`staged` · `paid` · `partially_paid` ·
  `abandoned` · `voided`), `staged_square_order_id`, and the linked `square_transactions`
  row with its `receipt_url`.
- **The card.** `counter_sessions.payment_state` — and note `approved` is the *Terminal's*
  answer while `paid` is the *money's*; they arrive on two different webhooks and a visit
  can honestly be one and not the other.
- **Who.** `claimed_by_staff_id` (the lease), plus the audit trail:
  `AUDIT_ACTION.COUNTER_LINE_PRICE_OVERRIDE` · `COUNTER_LINE_VOID` · `COUNTER_SESSION_SUBMIT`
  · `COUNTER_TERMINAL_CHECKOUT`, all on `AUDIT_ENTITY.COUNTER_SESSION`.

## 3. The one thing that must be built either way — start here

**There is no reader for a submitted visit.** Verified: the only `FROM counter_transactions`
queries in the tree are inside `submit-counter-transaction.ts` (the replay check) and
`reconcile-payment.ts` (the settlement lookup). Nothing loads a visit *with* its repairs,
its lines, its payment and its audit for display.

Build that first, as a `Deps`-injected domain function with DB-free tests, e.g.
`src/lib/counter/read-visit.ts` → `loadCounterVisit(orgId, counterTransactionId)`. It is
required under option A and option B alike, it is testable with no UI, and it is the piece
that will not be thrown away.

Shape it to answer the §2 list in ONE round trip. Org-scope it through
`withTenantTransaction` / `tenantQuery` — `orgId` comes from `ctx.organizationId`, never a
request body.

## 4. Constraints that are still live

From `AGENTS.md` (the short one, on `main`):

- **No layout animations.** *"This is WMS software and it has to be fast."* Nothing may
  tween `height`, `width`, `top`, `left`, margin, padding, or use framer's `layout` /
  `layoutScroll`. Opacity and colour only. A detail pane that animates open is exactly the
  thing this bans.
- **Migrations land before the code that reads them.** A nullable `ADD COLUMN` ships early;
  the reverse never does.
- **`npm run verify` before done** — lint · typecheck · unit.
- **Never start, restart, or kill the dev server.** The operator owns `:3050`. A broken dev
  server is a report, not a repair.
- **Never create a branch. Work on `main`** (a worktree is the isolation, still on `main`).
- **Do not write new house laws, guards or ratchets.** If an invariant is worth pinning, pin
  it where it can be observed — a mounted DOM test, an ESLint AST rule, or a type — never a
  regex over source text.

## 5. Two collisions to be aware of

1. **`work_sessions` is not `counter_sessions`.** The Warehouse OS worktree has landed a
   `work_sessions` table (staff work lifecycle: start/arm/park/resume/end). The counter's
   `counter_sessions` is a customer visit. They are different nouns that both got called
   "session" — decide explicitly whether a counter visit should eventually *be* a
   `work_sessions` row before you couple them.
2. **The kiosk is mid-redesign by another lane.** `kiosk-counter-surface.ts` ratified a
   deliberately **rounded** customer-form scale for `/kiosk/**` (a customer form is not ops
   chrome). If this surface ever renders on the tablet, it inherits that scale — not
   `cornerClass('flush')`.

## 6. Definition of done

- `loadCounterVisit` exists, is `Deps`-injected, and has DB-free tests covering: a
  retail-only visit, a visit with **two** repairs, a visit with a voided line, and a
  `partially_paid` header.
- The chosen option (A or B) is stated in the PR description with the operator's answer.
- `npm run verify` green.
- No new rule files, no new guards, no regex-over-source tests.

## 7. One coverage gap to know about

**No test anywhere names `EntityStationPane`** — searched every `*.test.ts(x)` / `*.spec.ts`
under `src/` and `tests/`. The stance contract is held only by the required TS prop and the
dock-nulling at line 179; nothing asserts that a preview mount stays dockless. The
structural guards that would have covered it were deleted deliberately, and `AGENTS.md`
says not to re-add that genre. If you want this pinned, the sanctioned shape is a **mounted
DOM test** asserting `data-station-stance="preview"` renders no dock — not a source-text
regex.
