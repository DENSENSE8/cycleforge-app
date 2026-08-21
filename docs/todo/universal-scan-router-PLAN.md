# Universal Scan Router — barcode-driven surface switching

**Status:** plan (2026-08-20) · **Lane:** WS-DOGFOOD (`main`)
**Turns** the Station scan bar from a per-host receiving control into the one
system-wide scan waist: entity scans open their entity, **command stickers move
the operator between surfaces**, and the destination's scan bar is armed on
arrival.

Governing law: `AGENTS.md` (compose-don't-fork, `transition()`, `orgId` from
`ctx`), `.claude/rules/backend-patterns.md`, `docs/rules/display/station.md`,
`.claude/skills/url-param-isolation`.

---

## 1. What already exists (do NOT rebuild any of this)

| Job | SoT today | Fit |
|---|---|---|
| One decoder for printed payloads | `routeScan` · `src/lib/barcode-routing.ts` | ✅ keep |
| "Trust only a decode, never a guess" | `decodedHandle` (same file) | ✅ keep |
| Station scan type + input mode | `detectStationScanType` · `src/lib/station-scan-routing.ts` | 🔶 grow |
| Command sticker vocabulary | `STATION_COMMAND_CODES` · `src/lib/stations/station-command-codes.ts` | 🔶 grow |
| Operator surface registry | `SURFACE_REGISTRY` · `src/lib/stations/surface-keys.ts` | 🔶 grow |
| L1/L2 nav targets + `requires` | `SIDEBAR_PAGE_NAV` · `src/lib/sidebar-navigation.ts` | ✅ reuse as the target SoT |
| Safe destination URL construction | `applyChildTarget` + `routeParamsFor` · `src/lib/routing/registry.ts` | ✅ reuse |
| Global wedge → navigate | `useGlobalWedgeScanner` · `src/hooks/useGlobalWedgeScanner.ts` | 🔶 grow |
| Non-editable-focus capture | `dispatchScanToActiveSink` · `src/lib/station-scan-sink/` | ✅ reuse |
| Focus reclaim / target stack | `src/lib/scan-hotkey/store.ts` | 🔶 grow (`armOnArrival`) |
| Server-side scan resolution | `POST /api/scan/resolve` | 🔶 grow (`desktopRoute`) |
| Status change | `transition()` · `src/lib/inventory/state-machine.ts` | ✅ the ONLY writer |
| Printed sticker face | `NumericStep` / bin-label-printer 2×1" stock | ✅ reuse |
| Tenant visibility of codes | `reason_codes` `flow_context='station_command'` (migration `2026-08-04`) | ✅ reuse; CHECK already permits |

**The bones are all here.** This is a wiring + vocabulary job, not a new engine.

---

## 2. The gaps — exactly what is missing

### G1 — `CMD-*` does not classify as a command
`detectStationScanType` hardcodes `['YES','USED','NEW','PARTS','TEST']` and never
calls `parseStationCommand`. So today `CMD-GO-QC` falls through to
`classifyInput` → `SERIAL`. **That is a live defect class, not just a gap:** the
tech bench would persist a nav sticker into `tech_serial_numbers`, exactly the
failure the `HANDLE` type was added to stop.

### G2 — no navigation vocabulary
`STATION_COMMAND_CODES` has one axis (`mode: 'batch_sort' | 'default'`) and two
codes, both Arrival-local. There is no notion of a *target surface*.

### G3 — no surface declares its scan bar
`SURFACE_REGISTRY.scan` is `'unbox' | 'triage' | 'pickup' | null`. `pack`,
`test` and `outbound` are `archetype: 'station'` with `scan: null` — so nothing
in code can answer "does the destination have a bar, and how do I focus it?"

### G4 — no arm-on-arrival
`scan-hotkey/store.ts` stacks targets (most-recently-registered wins) but has no
"you arrived by scan, take focus" signal. Navigation is a client `router.push`,
so the intent has to survive a route change.

### G5 — no permission gate on a scan-driven jump
`SIDEBAR_PAGE_NAV` children carry `requires`, and `isSidebarPageReachable` drops
unreachable pages from the UI — but a scan that pushes a route bypasses that
entirely and lands the operator on `/not-authorized`. A refused jump must nack
at the bar and never navigate.

### G6 — no subject carry
Scan a unit at QC, scan the jump sticker, and the unit is lost. There is no
hand-off channel between two surfaces.

### G7 — the server resolver is mobile-only
`/api/scan/resolve` returns `mobileRoute` and is documented to *never* return a
`/receiving` route. There is no `desktopRoute`, no `surfaceKey`, and no unit
lifecycle state in the response — so "route this unit to the surface its state
belongs to" is unanswerable server-side. `scan-history-route.ts` maps only three
mobile paths to desktop.

### G8 — no home for "it passed, and now it moves"
The operator's actual intent ("it works and it's for an order → Ready to Pack")
is a **write plus a navigation**. Nothing today can do both, and doing the write
implicitly on a nav scan would be the same defect class `AGENTS.md` names under
*A safety classification is a REQUIRED parameter* — a silent status change on a
scan nobody named. It needs its own explicitly-named command and its own route.

### G9 — keyboard-country mangling
`barcode-routing.ts` already carries a recovery arm for HID wedges that drop
`:` `/` `.` and upper-case the rest. Any new vocabulary must survive that, which
means **A–Z, 0–9 and `-` only** — and the parser must also match the squashed
form (`CMDGOQC`).

### G10 — kiosk must be excluded
`/kiosk/**` classifies through `classifyKioskScan`, not `scan-resolver`. A
customer-facing tablet must never accept an operator nav sticker. The kiosk
classifier stays untouched; the nav arm must not be reachable from it.

---

## 3. The scheme

Four layers. Each one is a growth of a named SoT; none is a new twin.

```
  wedge / typed submit
        │
        ▼
  ① classifyScan()            ← src/lib/scan/classify.ts (grows station-scan-routing)
        │   NAV | ACTION | HANDLE | SERIAL | TRACKING | SKU | FNSKU | REPAIR
        ├── NAV ──────► ② resolveNavCommand()  (client, zero latency, perm-filtered)
        │                       └─► applyChildTarget() → router.push + arm
        ├── ACTION ───► ④ POST /api/stations/handoff   (transition + audit + next surface)
        └── HANDLE ───► ③ POST /api/scan/resolve  → desktopRoute (state-aware)
```

### ① Classification — one waist, `NAV` first

Grow `detectStationScanType` (`src/lib/station-scan-routing.ts`):

```ts
export type StationScanType =
  | 'NAV'        // ← new: a CMD-GO-* / CMD-CARRY-* sticker
  | 'ACTION'     // ← new: a CMD-<VERB> sticker that WRITES
  | 'TRACKING' | 'SERIAL' | 'FNSKU' | 'SKU' | 'REPAIR' | 'COMMAND' | 'HANDLE';
```

Order inside `detectStationScanType`, **before `scannedUnitKey`**:

1. `parseNavCommand(input)` → `NAV`
2. `parseActionCommand(input)` → `ACTION`
3. `parseStationCommand(input)` → `COMMAND` *(replaces the hardcoded
   `['YES','USED',…]` list — that list becomes registry rows)*
4. …existing cascade unchanged.

Command parsing normalises through `squash(v) = v.toUpperCase().replace(/[^A-Z0-9]/g,'')`
so `CMD-GO-QC`, `cmd go qc` and the country-mangled `CMDGOQC` all hit the same
row (G9). This is the same recovery discipline as `FLATTENED_MOBILE_LINK_RE`.

### ② The nav registry — `src/lib/stations/nav-command-codes.ts`

A closed, code-owned registry, sibling to `station-command-codes.ts`, keyed to
`SIDEBAR_PAGE_NAV` page/child ids so there is **one** target vocabulary:

```ts
export interface NavCommandDef {
  code: string;              // the exact sticker string
  label: string;             // Admin catalog + 2×1" face
  pageId: SidebarRouteKey;   // SIDEBAR_PAGE_NAV.id
  childId?: string;          // SIDEBAR_PAGE_NAV child id (L2 mode)
  requires: PermissionString;// checked BEFORE navigating (G5)
  /** Carry the last-resolved subject to the destination. */
  carry?: boolean;
  sortOrder: number;
}

export function parseNavCommand(raw: string): NavCommandDef | null;
```

Resolution is **client-side and synchronous** — the client already holds its
permission set (that is what filters the sidebar), and a bench scan must not pay
a round-trip. The destination URL is built by `applyChildTarget(from, def.to())`,
so param isolation is inherited, not re-implemented.

Refusal path: no permission → `nack` feedback via `useScanFeedback`, the bar
keeps its value, **no navigation, no write.**

### ③ Surface scan contract — grow `SURFACE_REGISTRY`

`SurfaceDefinition.scan` widens from the three receiving classifiers to a small
object, so a destination can declare that it owns a bar:

```ts
scan: { classifier: 'unbox'|'triage'|'pickup'|'testing'|'pack'|'outbound'|null;
        armable: boolean;          // has a StationScanBar to focus on arrival
        accepts: StationScanType[] } | null;
```

`pack`, `test`, `outbound` flip from `scan: null` to `armable: true` — closing G3.

### ④ Arm-on-arrival — `?scanArm` + `?scanSubject`

Two declared params, registered in `src/lib/routing/` for every armable surface
(never copy-forward; `url-param-isolation` law):

| Param | Meaning | Consumed by |
|---|---|---|
| `scanArm=1` | focus + select the destination's scan bar on mount | `useRegisterScanTarget` host |
| `scanSubject=<handle>` | the carried subject (`U-1234`, `R-51189`) | destination host, prefills / acts |

Both are **mount-gated and consumed**: the arriving host reads them through
`useOptimisticUrlParam` / `resolveOptimisticParam` and strips them with
`replaceState`, so a back-nav or refresh never re-fires the arm or the subject.
`scan-hotkey/store.ts` grows one method — `armPendingTarget()` — which the host
calls once; the existing target stack does the rest. (G4, G6.)

### ⑤ The two backends

**Read path — grow `/api/scan/resolve`, do not fork a second resolver.**
It already owns every lookup (tracking, serial, PO, GTIN, GS1, handles) and the
telemetry write. Add three fields to `ResolveResponse`:

```ts
desktopRoute: { pathname: string; params: Record<string,string|null> } | null;
surfaceKey: SurfaceKey | null;    // where this entity's work lives right now
unitState: SerialState | null;    // drives state-aware routing
```

`desktopRoute` is computed from `surfaceForRoute` + the full mobile→desktop map
(absorbing `scan-history-route.ts`'s three-entry table, which becomes the
registry's read rather than a second one). Permission is filtered against `ctx`
before the route is returned — the server never hands back a page the caller
cannot open. Closes G7.

**Write path — new `POST /api/stations/handoff`.** This is the *only* place a
scan may change status, and it exists precisely so the change is never implicit
(G8). Canonical skeleton per `.claude/rules/backend-patterns.md`:

```ts
export const POST = withAuth(async (request, ctx) => {
  // 1. Zod: { code, unitKey, clientEventId, from: { pathname, search } }
  // 2. parseActionCommand(code) → { transition?, target } or 400 UNKNOWN_COMMAND
  // 3. resolve unitKey → unitId via unwrapScannedSerial + serial_units (org-scoped)
  // 4. withTenantTransaction(ctx.organizationId, …):
  //      transition({ unitId, to, eventType, expectedFrom, clientEventId })
  //      → 409 on expectedFrom mismatch  ⇒ client NACKs and does NOT navigate
  // 5. await recordAudit(pool, ctx, request, { action, entity, entityId })
  // 6. after(): Ably nudge to the destination surface's live feed
  // 7. 200 { ok, to: { pathname, params }, arm: true, subject }
}, { permission: 'tech.qc_pass' });   // the command's own declared permission
```

`clientEventId` threads to `inventory_events.client_event_id` (UNIQUE), so a
double trigger-pull is idempotent, not a double transition.

**Navigation happens only after a 2xx.** A failed write never moves the
operator — otherwise the bench believes work landed that did not.

---

## 4. The exact barcode strings

### Grammar

```
CMD-GO-<TARGET>              navigate, no subject
CMD-CARRY-<TARGET>           navigate, carrying the last-resolved subject
CMD-<VERB>                   write at the current station (existing family)
CMD-<VERB>-GO-<TARGET>       write, then navigate — BOTH effects named on the face
```

Charset `[A-Z0-9-]` only. Symbology: **Code 128 B** (or DataMatrix on the
existing 2×1" stock). No `:` `/` `.` — that is what makes the strings survive a
wedge running the wrong keyboard country (G9).

### Navigation stickers

| Barcode string | Destination | `requires` |
|---|---|---|
| `CMD-GO-ARRIVAL` | `/triage` | `receiving.view` |
| `CMD-GO-UNBOX` | `/unbox` | `receiving.view` |
| `CMD-GO-INBOUND` | `/incoming` | `receiving.view` |
| `CMD-GO-PICKUP` | `/pickup` | `receiving.view` |
| `CMD-GO-REPAIR` | `/repair` | `receiving.view` |
| `CMD-GO-HISTORY` | `/receiving/history` | `receiving.view` |
| `CMD-GO-QC` | `/test?view=testing` | `tech.view` |
| `CMD-GO-READY` | `/test` *(view cleared)* | `tech.view` |
| `CMD-GO-PACK` | `/pack` | `packing.view` |
| `CMD-GO-SCANOUT` | `/shipping/scan-out` | `shipping.view` |
| `CMD-GO-SHIPPING` | `/shipping` | `shipping.view` |
| `CMD-GO-COUNTER` | `/counter` | `walk_in.view` |
| `CMD-GO-SUPPORT` | `/support` | `integrations.zendesk` |
| `CMD-GO-WIPE` | `/wipe` | `tech.data_wipe` |

`CMD-GO-QC` / `CMD-GO-READY` are **the operator's exact ask**: Quality Control
and Ready to Pack are `SIDEBAR_PAGE_NAV` children `testing` / `shipping` of page
`tech`, i.e. `?view=testing` and `?view=null` on `/test`.

### Carry stickers (navigate + bring the subject)

| Barcode string | Destination | Carries |
|---|---|---|
| `CMD-CARRY-QC` | `/test?view=testing&scanArm=1&scanSubject=…` | last unit |
| `CMD-CARRY-READY` | `/test?scanArm=1&scanSubject=…` | last unit |
| `CMD-CARRY-PACK` | `/pack?scanArm=1&scanSubject=…` | last unit / order |
| `CMD-CARRY-REPAIR` | `/repair?scanArm=1&scanSubject=…` | last unit |
| `CMD-CARRY-UNBOX` | `/unbox?scanArm=1&scanSubject=…` | last carton |

No subject in hand → nack, stay put. Never navigate with an empty carry.

### Action stickers (write at the current station)

| Barcode string | Effect | `expectedFrom` → `to` | Permission |
|---|---|---|---|
| `CMD-PASS` | verdict `PASS` | → `TESTED` | `tech.qc_pass` |
| `CMD-FAIL` | verdict `TESTING_FAILED` | → `ON_HOLD` | `tech.qc_fail` |
| `CMD-TEST-AGAIN` | verdict `TEST_AGAIN` | → `IN_TEST` | `tech.qc_pass` |

**Corrected while building.** This table first said `CMD-FAIL` lands `IN_REPAIR`
and listed `CMD-SCRAP` / `CMD-HOLD`. The verdict SoT is `recordTestVerdict`, and
its `VERDICT_TO_STATUS` maps `TESTING_FAILED` → **`ON_HOLD`** — hold is where a
failed unit waits for someone to choose repair or scrap. Writing `IN_REPAIR` to
match the sentence would have meant forking the verdict path (and skipping the
`tech_serial_numbers` row, the `testing_results` feed, the line rollup and the
workflow tap that helper also owns). `CMD-SCRAP` / `CMD-HOLD` are not verdicts at
all and are deferred rather than smuggled through the verdict endpoint.

### Compound stickers (the headline flow)

| Barcode string | Does | Then goes to |
|---|---|---|
| `CMD-PASS-GO-READY` | verdict `PASS` → `TESTED` via `recordTestVerdict` | `/test` (Ready to Pack) |
| `CMD-FAIL-GO-REPAIR` | verdict `TESTING_FAILED` → `ON_HOLD` | `/repair` — the operator goes there to decide repair vs scrap |
| `CMD-PASS-GO-PACK` | verdict `PASS` → `TESTED` | `/pack` |

**The compound form is deliberate and the write is named on the face.** A plain
`CMD-GO-*` sticker MUST NOT write. The moment a navigation sticker also changes
status, the operator has no way to move between surfaces without side effects —
the same silent-opt-out trap as a defaulted safety parameter.

### Session commands (existing, unchanged)

`CMD-BATCH-SORT` · `CMD-DEFAULT` — Arrival session modes, already live.

### Reserved / refused

`CMD-` is claimed wholesale by this vocabulary. An unrecognised `CMD-*` string
returns `UNKNOWN_COMMAND` and nacks — it must **never** fall through to
`classifyInput` and be read as a serial (G1).

---

## 5. Build order

| Phase | Ships | Verify |
|---|---|---|
| **P0** | `parseNavCommand` + `NAV`/`ACTION` types + registry; classification order fixed | unit: every `CMD-*` classifies `NAV`/`ACTION`, never `SERIAL`; squashed forms hit |
| **P1** | Client resolve + `applyChildTarget` push + permission nack | unit on `resolveNavCommand`; E2E `qa-desktop`: QC → Ready to Pack by scan |
| **P2** | `scanArm` / `scanSubject` params + `armPendingTarget()`; `SURFACE_REGISTRY.scan` widened | DOM test: bar focused on arrival; params stripped after consume |
| **P3** | `/api/scan/resolve` grows `desktopRoute` / `surfaceKey` / `unitState` | route test + permission-filter test |
| **P4** ✅ | `POST /api/stations/handoff` + action/compound codes + subject store; full nav vocabulary (19 codes) | ✅ `action-command-codes.test.ts`, `scan-subject-store.test.ts`, registry-integrity guard. ⚠️ route has no test yet |
| **P5** ✅ | Admin-catalog seed: derived per-org seeder + backfill for existing orgs | ✅ `command-seed-coverage.test.ts`; applied + verified — 27 codes × 8 orgs, no sort ties |
| **P6** 🟡 | **Global scan dock** — persistent input in `GlobalHeader` (§7) | ✅ store + mount + tests. ⚠️ **no surface migrated yet** |
| **P7** ✅ | **Command book** — `/settings/commands`, printable catalog | ✅ `command-book.test.ts` — the book cannot drift from the parser |
| **P8** 🟡 | **Custom codes (aliases)** — table, CRUD API, resolver, editor (§8) | ✅ `command-alias.test.ts`. ⚠️ **migration not applied** |

Each phase is independently shippable and none of them forks an SoT.

---

## 6. Rulings worth writing into `AGENTS.md` when P1 lands

- **`CMD-*` is a closed, code-owned vocabulary.** A `reason_codes` row makes a
  command visible and printable; it does not arm behaviour. Same contract
  `station-command-codes.ts` already states.
- **A navigation scan never writes.** Write + move is a compound command whose
  face names both effects.
- **A scan-driven jump is permission-checked before the push**, and a refusal
  nacks at the bar rather than landing on `/not-authorized`.


---

## 7. P6 — the global scan dock (why the bar moves to the header)

**The defect is a remount, not a layout.** Every station bar lives inside its
surface's sidebar panel, and those panels are swapped by component identity:
[`TechSidebarPanel`](../../src/components/sidebar/TechSidebarPanel.tsx) renders
`TestingSidebarPanel` **or** `ShippingSidebarPanel` depending on the mode, so
React unmounts one and mounts the other. The scan input goes with it — value,
focus, and the DOM node. On the QC → Ready to Pack jump P1 ships, the operator's
cursor lands nowhere.

`GlobalHeader` is mounted once by `ResponsiveLayout`, which lives in the **root**
layout, and the App Router never remounts that across a client navigation. An
input mounted there survives every jump.

### Where in the header

A **fourth zone**, sibling to nav / context / actions — **not** `panelContent`.
That middle slot is republished by each page through `useHeader()`; it is the one
part of the header that *does* churn per route, so putting the bar there hands
back the remount the dock exists to escape.

### The split

| Owner | What |
|---|---|
| **Dock** (`GlobalScanDock`) | the input: value, focus, DOM node, command claim |
| **Surface** (`useScanDock`) | the policy: placeholder, `onSubmit` resolver, mode rail, staff theme, resolving state |

The mode rail rides along as a node, so a migrating surface loses nothing —
folding every station's modes into one dock-owned union would be the twin this
design exists to avoid.

On a policy change the dock **clears the value and keeps the focus**. Both halves
are deliberate: focus continuity is the point, while carrying a half-typed serial
from QC to Ready to Pack would hand the next bench a string its resolver never
saw scanned.

### What this deletes

**P2 in full.** `?scanArm=` and `armPendingTarget()` exist only to re-focus a bar
that remounted. An input that never unmounts needs neither.

### Migration recipe (one surface at a time)

The dock renders nothing until a surface publishes, so mounting it is inert and
surfaces move independently:

1. Delete the surface's `<ScanBandShell><XScanBar …/></ScanBandShell>`.
2. Call `useScanDock({ id: 'tech:testing', placeholder, onSubmit, staffId, rightContent: <ModeRail …/> })`
   with the state that used to live in the panel.
3. Check the band's vertical space — the sidebar reflows without it.

**Not yet migrated.** Tech is the intended golden (it is the pair the command
router already serves). It is a visible change to a live bench and wants eyes on
the screen, not a green typecheck.


---

## 8. P8 — custom codes are ALIASES, and only aliases

An alias is a second **name** for a command that already exists. It is never a
new behaviour, and the boundary is the whole design.

**Why it cannot be more than that.** The command registries are code, and that
is deliberate: a scan that moves an operator between surfaces or writes a
verdict to a unit must be PR-reviewed, not creatable from an admin form. So an
alias carries a `target_code` naming a built-in, everything downstream
(permission gate, destination, verdict) is decided by the **target**, and an
alias can rename a jump but can never widen one.

### The namespace rule is a safety control

`code` must match `^CMD-[A-Z0-9][A-Z0-9-]*$`, enforced by a DB CHECK *and* by
`validateAlias`. The classifier claims `CMD-` wholesale so a command can never be
read as a serial. An alias outside it breaks that in **both** directions:
`BENCH-3` would classify as a serial fragment and be looked up against
`tech_serial_numbers`, and a real serial shaped like the alias would silently
trigger a station jump.

Shadowing a built-in is refused for a different reason: it would make the
built-in unreachable by its own printed sticker, and every book already bound in
the building would be wrong.

### Two resolutions, one of them authoritative

| Where | What | Why |
|---|---|---|
| Client (`command-alias-store`) | hydrated once per session, resolved synchronously | a bench scan that waits on the network is a scan the operator out-runs |
| Server (`resolve-alias-server`) | re-read from the DB on every write | a `code` at `/api/stations/handoff` is a wire value; trusting the client's resolution would let a caller name any command it liked |

The client's copy is a latency optimisation. The server's is the gate.

### Why a table, not a `reason_codes` column

Commands are already seeded into `reason_codes` for Admin visibility and print.
An alias is a different shape — it carries a target, and no other row in that
table would ever use one. `alias_target` there would be a discriminator-shaped
column with no discriminator, NULL on every other vocabulary. The vocabulary
stays in `reason_codes`; the **mapping** lives in `station_command_aliases`.

### Retire, never delete

`DELETE` sets `is_active = false`. A printed sticker outlives its row, and an
operator scanning a retired one deserves "this code was retired" rather than the
generic unknown-command nack. The row is what lets us say that.


---

## 9. P5 — the Admin catalog, and the defect it uncovered

Seeding the vocabulary into `reason_codes` (`flow_context = 'station_command'`)
is what makes the codes visible, relabellable and printable in Admin. Behaviour
stays code-owned: a row here arms nothing.

**The real bug was in the per-org seeder, not the missing rows.**
`seedOrgCatalog` iterated `STATION_COMMAND_CODES` alone — correct when that was
the whole vocabulary, and silently wrong from the moment a second registry
existed. Every code added to the nav or action registry would have been invisible
for every org, forever, with nothing able to notice: the seeder was not wrong
about anything it knew about. It now derives from `listSeedableCommandCodes()`,
a union of all three registries, so **new orgs are correct by construction**.

Two migrations cover the orgs that already exist:

| Migration | Does |
|---|---|
| `2026-08-20d` | backfills the 25 new codes for every org (`ON CONFLICT DO NOTHING`) |
| `2026-08-20e` | re-sorts the two 2026-08-04 session rows, **only where they still hold their seeded value** |

`20e` exists because verifying `20d` showed something its own header had got
wrong. The header predicted the legacy rows would "sort above" the new ones and
accepted that. They did not — they **tied**: `CMD-BATCH-SORT` and
`CMD-GO-ARRIVAL` both at `sort_order` 10, ordered arbitrarily by the planner. An
admin list whose order changes between reads is worse than one with an odd but
stable order. The fix stays safe by updating only rows still holding the exact
original value, so a tenant who reordered is untouched — the same reason `20d`
used `DO NOTHING`.

**Guard:** `command-seed-coverage.test.ts` asserts the seedable list equals the
registered set, that sort orders are unique and ascending, and that every
registered code appears in *some* `station_command` seed migration. That last one
is a union across migrations rather than one named file, because an applied
migration is immutable (the ledger is keyed on sha256) — code #28 gets a new
migration, and failing this test is the prompt to write it.
