# HANDOFF — page-to-page scanning (`CMD-GO-*`)

**Scope: navigation only.** An operator scans a printed sticker at any bench and
the app moves to that surface. Nothing is written, nothing is created. The
verdict/compound family (`CMD-PASS-GO-READY`), the tenant alias layer, and the
global scan dock are SEPARATE work — named at the bottom so you don't trip over
them, not yours to touch.

Print the sticker sheet from **`/settings/commands`** (Print book).

---

## 1. What already works

Scan `CMD-GO-QC` anywhere → `/test?view=testing`. Scan `CMD-GO-READY` → `/test`
with `view` cleared. Nineteen codes, live, committed, seeded.

### The path a scan takes

```
  wedge trigger (or Enter in a scan bar)
        │
        ├─ focus IS in a scan bar → StationScanBar.handleInternalSubmit
        │                            src/components/station/scan-bar/StationScanBar.tsx
        │
        └─ focus is elsewhere    → useGlobalWedgeScanner
                                     src/hooks/useGlobalWedgeScanner.ts
        │
        ▼
   useStationCommandScan()          src/hooks/useStationCommandScan.ts
        │  claims synchronously, returns boolean
        ├─ parseNavCommand           src/lib/stations/nav-command-codes.ts
        ├─ navCommandPermission      src/lib/stations/nav-command-target.ts
        └─ resolveNavCommandTarget   → applyChildTarget → router.push
```

**Both entry points are required.** The wedge listener stands down when focus is
in an editable field, so a scan into a focused bar never reaches it — the bar's
own submit is the only place that scan can be caught. Conversely a scan landing
on a row or the chrome never reaches the bar. Neither one alone covers a bench.

### Files that matter

| File | Role |
|---|---|
| `src/lib/stations/nav-command-codes.ts` | the closed registry + `parseNavCommand` (pure) |
| `src/lib/stations/nav-command-target.ts` | `resolveNavCommandTarget`, `navCommandPermission`, `isAlreadyAtNavCommand` |
| `src/hooks/useStationCommandScan.ts` | the one client waist — claim, gate, push |
| `src/lib/station-scan-routing.ts` | `detectStationScanType` — commands read FIRST |
| `src/components/station/scan-bar/StationScanBar.tsx` | claim on submit (all ~20 hosts inherit it) |
| `src/hooks/useGlobalWedgeScanner.ts` | claim ahead of every page claimer |
| `src/components/stations/CommandBookSheet.tsx` | the printable book |

Tests: `nav-command-codes.test.ts`, `nav-command-target.test.ts`,
`command-seed-coverage.test.ts`.

---

## 2. The rules you must not break

**Targets are `SIDEBAR_PAGE_NAV` ids, never URLs.** A registry entry names a
`pageId` + optional `childId`. That registry already owns the route, its
`?view=`/`?mode=` delta and its permission gate, so a sticker inherits all three.
Writing a literal path forks a fourth copy of the vocabulary and it will drift.

**The permission is DERIVED, never declared.** `navCommandPermission()` reads
`child.requires ?? page.requires` — the same resolution `filterPageChildren`
uses. Do not add a `requires` field back to `NavCommandDef`: a hand-copied gate
goes stale silently when the page's own gate changes, and the failure is a jump
refused for someone who should have it, or allowed for someone who should not.

**A refused jump nacks in place.** `flashScanBand('reject')` + a toast, no
`router.push`. Never let a scan land the operator on `/not-authorized` — they
were trying not to touch the mouse, and now they need it to get back.

**A `CMD-GO-*` scan NEVER writes.** Not a status, not a session mode, nothing.
If a jump also needs a write it is a compound in the ACTION family, whose face
names both effects. An implicit write on a navigation scan is a change nobody
named: the operator sees a page turn and cannot know a unit moved lifecycle.

**The `CMD-` namespace is claimed wholesale.** An unregistered `CMD-…` answers
`COMMAND` and gets nacked — it must never fall through to `classifyInput`, which
types it `serial_partial` and lets the tech bench persist a sticker into
`tech_serial_numbers` as a unit identity. That was a live defect; do not reopen
it. The namespace check stays narrow (`CMD-` with a real hyphen, plus squashed
`CMDGO…`) so a manufacturer serial beginning `CMD` is not swallowed.

**Codes are `[A-Z0-9-]` only and resolve from their squashed form.** An HID
wedge on the wrong keyboard country drops every separator and upper-cases the
rest — the same failure `FLATTENED_MOBILE_LINK_RE` in `barcode-routing.ts`
exists for. `squashCommandCode` is the one normaliser; do not "fix" a mangled
scan at a call site.

**Resolution is synchronous and client-side.** The session already carries the
permission set. A scan that waits on the network to decide whether it is
navigation is a scan the operator out-runs, and their second trigger-pull lands
on the old surface.

---

## 3. Adding a code

1. Add a row to `NAV_COMMAND_CODES` — `code`, `label`, `pageId`, `childId`,
   `sortOrder`. Check the ids against `SIDEBAR_PAGE_NAV`; the registry guard
   test will fail if either does not exist.
2. Write a seed migration so orgs that ALREADY EXIST get the Admin row
   (`flow_context = 'station_command'`). New orgs are handled automatically by
   `seedOrgCatalog`, which derives from `listSeedableCommandCodes()`.
   `command-seed-coverage.test.ts` fails until you do — that failure IS the
   prompt. An applied migration is immutable (ledger keyed on sha256), so this
   is always a NEW file, never an edit to `2026-08-20d`.
3. `npm run verify`, then reprint the book.

Deliberately absent, so the gaps read as decisions: `/receiving/history` (no nav
entry — a sticker would need a literal URL), `/wipe` (intentionally out of
master nav), `/studio` · `/settings` · `/admin` (nothing about them is
hands-full work, which is the only thing a sticker is for).

---

## 4. Open work on THIS slice

- **E2E.** No Playwright spec proves the jump end to end. Target the
  `qa-desktop` project against `QA_ORG_ID` (never the dogfood tenant): focus the
  Testing scan bar, type `CMD-GO-READY`, Enter, assert the URL is `/test` with
  no `view` param. Then the reverse with `CMD-GO-QC`.
- **Never verified in a browser.** Every claim above rests on unit tests and
  typecheck. Nobody has watched a real scan move a real page — do that first.
- **Permission refusal is untested end to end.** Sign in as a role without
  `tech.view`, scan `CMD-GO-QC`, confirm it nacks and does not navigate.
- **The bar remounts across the jump.** Going QC → Ready to Pack swaps
  `TestingSidebarPanel` for `ShippingSidebarPanel`, so the scan input unmounts
  and focus is lost on arrival. The dock that fixes this exists
  (`src/lib/scan-dock/`) but no surface has migrated. Until then, the operator
  must re-focus after a jump. **This is the biggest gap in the feature.**

## 5. NOT in this scope

Verdict + compound codes (`CMD-PASS*`, `/api/stations/handoff`), tenant aliases
(`station_command_aliases`), and the global scan dock migration. Full plan:
[`universal-scan-router-PLAN.md`](universal-scan-router-PLAN.md).
