# Mobile-first surface law (repo-wide)

<!--
  Callers: AGENTS.md, CLAUDE.md, .cursor/rules/mobile-first-surface.mdc,
  src/lib/mobile/mobile-first-surface.ts, all agents building UI.
  No data schemas / API.
  User: "contract into laws plus components must … span repo-wide. You must
  be able to do everything on the mobile app first."
-->

**Status:** binding · **Scope:** entire CycleForge app (Inventory, Shipping,
Receiving, Support, Admin, Studio, Search, …) — not Warehouse OS alone.  
**Operator:** 2026-09-10 — “contract into laws plus components must … span
repo-wide. You must be able to do everything on the mobile app first.”

This is the product SoT for **how we design and ship UI**. Desktop desks,
scan stations, and kiosk faces remain real surfaces; they **consume** the
mobile-first job tree — they do not invent a second IA that phones cannot run.

---

## 1. Non-negotiable product rule

**Every operator verb that exists in the product must be completable on the
mobile web app (`/m/*`) first.**

- If a verb has no `/m` path, the feature is **incomplete**, not “desktop-only.”
- Desktop may add density (tables, multi-pane, wedge scan, hotkeys) **after**
  the mobile happy path exists and is triageable.
- “Desktop-first, then squeeze” is **refused** for new work and for ports.

Exception (narrow): **public GS1 resolvers** and pure print-only hardware
bridges that have no operator session. Everything else is in scope.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **Job** | One verb the operator came to do (pick confirm, print labels, scan arrival, …). |
| **Surface** | Shell that owns chrome: `/m/*` phone, desk (`DeskPageChrome`), scan station, kiosk. |
| **Mobile SoT** | The phone layout + step machine under `/m/…` for that job. |
| **Desktop frame** | Same SoT tree shown in a fixed phone-width column with thick side gutters; optional compact recents top-left — **not** a second desktop IA. |
| **Token family** | One control grammar per job class (see §5). |
| **Triageable** | Cold open → done in a short thumb path; primary CTA sticky; no hover-only. |

---

## 3. Surface classes (every feature is classified)

| Class | Shell | When |
|---|---|---|
| **A — Floor / single-task** | `/m/(shell)/…` or `/m/(immersive)/…` | Scan, pick, print, photo, put-away, triage one carton |
| **B — Phone browse** | `/m` + sheets/lists | Queues, history, search results on phone |
| **C — Dense desk** | Desk chrome + tables | Multi-column ops after A exists |
| **D — Station / kiosk** | Station overlay / kiosk face | Wedge + large flush targets; still must not be the *only* way to do the job |

**Port rule:** design **A** (or B) first; C/D arrange the same jobs wider or denser.

---

## 4. Desktop display of mobile-first (frame law)

When showing mobile SoT on a large viewport:

1. **Center column** = phone width (`max-w-sm` / `max-w-md` — use DS radius/spacing tokens, not invented px sprawl).
2. **Left / right** = thick empty gutters **or** compact **recents** (top-left, small rows) — never a full desk rail that the phone lacks.
3. **No dual interactive trees** (`lg:hidden` full flow + `hidden lg:block` full flow both live). One step machine; optional layout variants only.
4. Desk URLs may **embed** the `/m` frame; they must not fork a separate click path.

---

## 5. Token families (use case → mount)

| Job class | Mount | Do not |
|---|---|---|
| Desk / page facet tabs | `TableTabs` (underline) | Pill path chips |
| Binary / small mode (e.g. Single \| Bulk) | `TabSwitch` segmented | Path chips; desk underline tabs |
| Ordered path (Zone → …) | Path chips (`LABEL_BUILDER_STEP` or successor) | `TabSwitch` faces |
| Primary commit | Sticky `Button` / sticky bar | Buried under long lists |
| Secondary / wipe (Reset, Change) | Outlined `Button secondary` (or danger) | Ghost next to mode switch |
| Recents | Compact recent rows / strip | Full context rail on phone SoT |
| Lists on phone | Flat hairline work rows + task-local detail | Rounded/elevated islands; full `DataTable` as SoT |

Call `ds_contract` / `ds_tokens` / `ds_critique` before UI writes. Prefer existing
`/m` redesign primitives (`MobileShell`, item-record mobile, `BottomSheet`,
`IconButton size="touch"`).

---

## 6. Hard rules (R1–R10)

1. **One job per screen** (first viewport).
2. **One primary CTA**, sticky, thumb zone (≥44px hit via DS).
3. **Token family = use case** (§5).
4. **Progressive disclosure** — current step body; path chips are status/jump-back.
5. **No hover-only**; no dual active trees.
6. **Touch ladder** via `UIModeProvider` / `IconButton size="touch"` — not random taller classes.
7. **Search only when the list is the product** (long queues), not ~10-item pickers.
8. **Secondary actions collapse** (⋯ / sheet); toolbar ≤2 trailing icons on phone.
9. **Disabled CTAs name what’s missing**.
10. **Device intent before layout** — floor verbs are class A under `/m`.

Pass/fail: fail any of R1–R4 on the mobile SoT → not done.

---

## 7. Component kit (build toward; share repo-wide)

| Component | Responsibility |
|---|---|
| `MobilePhoneFrame` | Fixed max-width column + side gutters on `lg+`; hosts SoT |
| `MobileRecentStrip` | Top-left compact recents / back MRU |
| `MobileStepShell` | Title + optional path status + body + sticky CTA slot |
| `MobileQueueShell` | Search + banded list + row → sheet (Pick / Work pattern) |
| `MobileActionSlot` | The page's **one** top-bar verb, painted left of the permanent SCAN seat. Registrar + provider, mirroring the desk's `DeskActionSlot` |
| Existing | `RedesignedMobileShell`, `BottomSheet`, item-record mobile faces, Pick `_picker/*` |

New jobs **compose** these; they do not invent a parallel mobile design system.

**The phone top bar reads title-left / action-right** (`MobileTopBar`): menu ·
page title … page action · **SCAN**. Scan owns the corner permanently (ruling
2026-08-21) and the page action sits immediately to its LEFT, registered from
the page body through `MobileActionSlotRegistrar` — never passed as a prop,
because the host mounts the bar and the page is `children`.

Unlike the desk's three-role slot, the phone slot holds **exactly one** action:
390px has no room for a cluster, and R1/R2 already say one job, one CTA. A
page with a second verb puts it in a `BottomSheet`, not a second corner.

---

## 8. Route map (extend as verbs land)

Canonical phone entrypoints (non-exhaustive; grow this table, don’t fork):

| Verb area | Mobile SoT |
|---|---|
| Pick queue (line-grained, location-directed) | `/m/pick` |
| Pick session | `/m/pick/[orderId]` · claim `/m/id/pick/[orderId]` |
| Orders / to-ship | `/m/orders` (canonical) · `/m/work` (compatibility alias; never a second nav door) |
| Unbox / receive / location scan | `/m/unbox`, `/m/receive`, `/m/receiving`, `/m/scan` |
| Identification kernel (QC-done, claim, scan-out) | `/m/id/*` — `/m/id/methods`, `/m/id/[job]/[entityId]`, `/m/id/scan-out/[orderId]` |
| Packing | **`/m/p/[id]/photos`** — the photo feed reached from the desk `scan_ready` bridge. There is **no `/m/pack` queue**: deleted 2026-09-14 by operator ruling. Do not recreate it. |
| Claim / on-hold | `/m/claim`, `/m/on-hold` |
| Locations / labels (port target) | `/m/…` TBD — must exist before desk Labels is “done” |

**Outbound / inbound verb order** (operator, 2026-09-14) is the ledger in
`src/lib/mobile/mobile-first-surface.ts` → `MOBILE_FIRST_VERB_GAPS`:
import → pick list auto-created → pick by location → label → box → stage
(location scan) → carrier scan-out; inbound delivery → unbox + photos → QC
inspect → QC test → ID kernel marks QC done → place at location → **pre-box**
(labelled, graded, location-paired, ready to pick). Pre-box is the hinge that
makes outbound a lookup instead of a computation.

Machine checklist: `src/lib/mobile/mobile-first-surface.ts`.

### Outbound projection rule

`OUTBOUND_WORKFLOW_SURFACES` and `OUTBOUND_WORKFLOW_STAGES` in the machine
checklist are the root contract for Shipping / Outbound. Mobile owns the job
sequence and completion paths. Desktop consumes the same workflow facts.
Industrial desk pages render the industrial record ledger
([BRIEF.md](../design-system/BRIEF.md) §4 industrial). `DataTable` remains for
triage and admin tables. Adoption is page by page. Stations
consume the same stage/action contract through their station host. A legacy
route may mount the canonical mobile component, but may not gain a second nav
door or a second status/filter implementation.

Entering a task may navigate from its queue to the task route. Once the active
task starts, exception correction, quantity changes, barcode input, and retry
stay in that task surface (inline or in a task-local sheet); they must not send
the operator through a second page tree.

---

## 9. Agent / eval obligations

- Cursor rule: `.cursor/rules/mobile-first-surface.mdc` (`alwaysApply`).
- `AGENTS.md` / `CLAUDE.md` point here.
- Before claiming a **new** product verb done: `/m` path exists and passes §6.
- Design-mcp before UI. Graph impact before shared `/m` shell edits.
- Future: `eval:cohort mobile-first` when peer routes are listed in the cohort file.

---

## 10. Refusals

- “Desktop-only for now; mobile later.”
- Shrinking a desk page and calling it mobile-first.
- A second control grammar that phones don’t share.
- Recents as a full left warehouse rail on the phone SoT.
- Marketing/landing taste skills as law for ops surfaces (out of scope for those skills).
