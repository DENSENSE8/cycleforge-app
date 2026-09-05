# QA Design Lab — full-reskin before/after

**Status:** shipped 2026-09-02. QA sandbox org only.

The reskin's constitution — problem, target, refuse list, the R0–R5 wave order
— is [`RESKIN.md`](RESKIN.md). This file is the **instrument**: where you go to
prove a wave against real surfaces before it reaches dogfood. Note the split of
labour: the lab's `data-reskin` attribute moves runtime colour tokens, so it
covers the per-wave *surface* sign-off; R1's radius/type/primitive rewrite is a
build-time change that needs the `:3051` worktree lane described below.

The lab exists to answer one question per surface: *does the warehouse still
work under the candidate skin?* — and, since 2026-09-02, to answer it **one
token group at a time**. The operator's ruling: *"not a mass token change — I
need to cherry pick and nit pick."* A single before/after flip can only tell you
whether you like all forty-six variables at once, which is the one question
nobody needs answered. It answers it by opening the **real route**
against **QA fixtures**, twice — once under `before`, once under `after` — not
by rendering components in a gallery. The deleted `src/app/design-demo` zoo is
why: a showroom cannot show a scan focus trap, an overlay stack, or a
slot-table header sort, which is exactly what a reskin has to survive.

## Running it

1. Sign in to the **CycleForge QA Sandbox** (`cycleforge-qa`, org `…0002`).
   Credentials and fixtures: [`src/lib/tenancy/qa-org.ts`](../../src/lib/tenancy/qa-org.ts).
   Provision with `scripts/provision-qa-org.ts` — it writes the `design_lab`
   feature-flag row from `QA_FEATURE_FLAGS`.
2. Open `/qa/design-lab`. Any other tenant gets a 404.
3. Pick a viewpoint. **Before** / **After** open the real route in a new tab;
   **Split** opens both in same-origin iframes side by side. Both follow your
   current group selection, so a card tests what you have live — not all nine.
4. Choose which groups are live with the **Skin** control at bottom-left:
   collapsed it shows `n/9`, open it is the list, each row flipping one group
   and showing how many declarations it carries. **All** and **None** are there
   for the ends of the range. The selection follows you across every route for
   the rest of the tab session.
5. Record **Pass** / **Fail** and a note per viewpoint, then
   **Copy sign-off markdown** and paste the table into the wave log below.

## How the toggle works

`data-reskin` on `<html>`, exactly the way `data-theme` already works — except
it carries a **list** of group ids, matched with the space-separated attribute
operator. The override stylesheet
([`src/design-system/themes/reskin.ts`](../../src/design-system/themes/reskin.ts))
emits **two blocks per group**, one per scheme, all at specificity `0,2,1` so
they outrank every `html[data-theme='<name>']` block (`0,1,1`):

```css
html[data-reskin~='chrome']:not([data-color-scheme='dark']) { /* light */ }
html[data-reskin~='chrome'][data-color-scheme='dark']       { /* dark  */ }
```

```
data-reskin="chrome status"   chrome planes + status tones, nothing else
data-reskin="after"           the alias — expands to every group on the way in
(attribute absent)            today's tokens, byte-identical to dogfood
```

The groups today, and what flipping each alone is meant to tell you:

| Group | Moves | Reads on |
| --- | --- | --- |
| `chrome` | canvas · surface · sunken · hover · strong | every plane in the shell |
| `text` | the four text rungs | prose, labels, column heads |
| `rules` | subtle · default · hairline · emphasis · strong | grid separators at full width |
| `status` | success / warning / danger ink, tint and edge | a status-heavy queue |
| `accent` | accent ink/tint/edge **and the staff accent set** | primary buttons, armed rings, selection |
| `bench` | bench · trough · plate · slot · stain · ply | the station mouth and its wells |
| `inverse` | inverted chrome and the ink on it | dark pills, action bars |
| `fills` | solid fills, info and fulfillment ink | progress bars, saturated indicators |
| `page` | `--background` / `--foreground` | the body behind every route |

Groups are **disjoint**: no key is owned by two, so any subset is well-defined
and emission order never changes what you see. `catalog.test.ts` asserts it —
a key claimed twice fails the build rather than painting differently depending
on which groups happen to be on.

`accent` is the one group that overrides a *staff* choice rather than a theme
fact. That is deliberate: teal IS Graphite's accent, so a sitting that kept each
staffer's blue would be judging something the reskin does not propose.

The light block is scheme-**scoped**, not scheme-agnostic. A shared block looks
tidier and is wrong: it pushes light-scheme values onto every dark theme for any
key the dark half does not restate — `text-secondary: #3f4c60` on a `#0b1017`
canvas. Each scheme carries its own complete candidate and nothing crosses the
light/dark line; `catalog.test.ts` fails an unscoped block.

`before` deliberately emits **nothing**. "Before" is today's tokens — the live
default — not a frozen copy of them. A snapshot would drift the moment someone
tuned a palette, and the two sides must differ only by the candidate diff.

Persistence is `sessionStorage` (a QA sitting, not a preference), with
`?reskin=` on the URL winning over storage so deep links and the split iframes
are self-describing. A split iframe reads its side off the URL and never writes
it back — same-origin frames share the tab's storage.

### What a reskin can and cannot move

| Axis | Movable by the toggle? | Why |
| --- | --- | --- |
| `--ds-color-*`, `--background` / `--foreground` | **Yes** | Runtime CSS variables. Declared per scheme as `lightVars` / `darkVars` (and `lightPage` / `darkPage`). |
| `--ds-color-accent-*` (the staff accent set) | **Yes** | Declared per scheme as `lightAccent` / `darkAccent` on the `accent` group. |
| Corner radius, type scale | **No** | Tailwind classes (`rounded-*`, `text-role-*`) resolved at build; `radius.ts` is deliberately not wired into `tailwind.config.mjs`. |

A radius or type reskin is a **primitive-level** change. That is the job of the
secondary `:3051` worktree lane below, not of this attribute. Do not "fix" this
by pointing `theme.extend.borderRadius` at `radius.ts` to make the lab prettier
— that remaps every `rounded-*` call site in the app at once.

## The gate

Two locks, both required, one function
([`src/lib/design-lab/access.ts`](../../src/lib/design-lab/access.ts)):

1. the session's org **is** the QA sandbox (`QA_ORG_ID`), and
2. `organization_feature_flags(flag='design_lab')` is enabled.

Fail-closed. The org check runs first, so every other tenant pays one string
compare and ships **none** of the reskin bytes — no override stylesheet, no
boot script, no HUD. The route tree 404s (not 403, not a redirect) and
`src/app/layout.tsx` reads the same helper, so the two can never disagree.

## Catalog coverage

[`src/lib/design-lab/catalog.ts`](../../src/lib/design-lab/catalog.ts) is
mostly derived, and
[`catalog.test.ts`](../../src/lib/design-lab/catalog.test.ts) is the tripwire:

- **Floor stations** come from `SCAN_STATION_OVERLAY_COHORT` — a new station
  joins the lab automatically and cannot drift from its cohort route.
- **Desks** are checked against `PRODUCT_TABLES`: every product table is either
  routed or listed in `DESK_TABLES_WITHOUT_ROUTE` with a reason. Route one and
  delete its line.
- Every static route is asserted to resolve to a real `page.tsx` (route groups
  included), so a rename breaks the test rather than the lab.
- **Composers** and **`/m/*`** are hand-listed; there is no cohort registry for
  either.

## When to use the `:3051` worktree instead

The lab is the day-to-day compare tool. Reach for a worktree **only** when the
change would brick `:3050` dogfood mid-edit — rewriting radius/type
foundations, or a primitive whose signature every surface consumes.

```bash
git worktree add ../cycleforge-app-reskin -b reskin/candidate
```

Worktrees do not carry gitignored env: copy `.env` from main. Launch on
`:3051` only on explicit instruction, and never touch `:3050`.

## Promoting After → default

1. Exercise the viewpoint under **Before** (baseline behavior).
2. Flip to **After**. The same clicks/scans must still complete.
3. Record the verdict in the lab, copy the markdown into a wave log below.
4. When a GROUP passes everywhere it matters, fold its values into the theme
   palettes (`src/design-system/themes/*.ts`) and **delete the group** from
   `RESKIN_GROUPS`. Dogfood inherits by default — the final skin carries no org
   gate. The group is the unit of promotion precisely because it is the unit of
   judgement: "rules yes, bench wells no" is a shippable verdict.
5. When `RESKIN_GROUPS` is empty the candidate has nothing left to prove;
   retire it. `catalog.test.ts` fails an empty group to force the call.

A reskin is CSS + primitives, but the contracts must stay green. Per wave:

```bash
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

plus `pnpm run eval:cohort slot-table` for any surface on the table engine and
`pnpm run eval:station <id>` for each floor station touched.

## Wave log

_No wave signed off yet. Paste the lab's copied markdown table under a dated
heading when one passes._
