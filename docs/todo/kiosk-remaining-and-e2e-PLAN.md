# Kiosk — what is left, and how to prove it end to end

**Audited 2026-08-20** against the running dev server (`:3050`), the applied migration ledger, and two
full Playwright runs. Supersedes the status lines in
[`kiosk-landscape-shell-PLAN.md`](./kiosk-landscape-shell-PLAN.md) §2–4 and
[`kiosk-pos-modernization-HANDOFF.md`](./kiosk-pos-modernization-HANDOFF.md) "Done when".

---

## 0. Verified state (measured, not assumed)

| Layer | State | Evidence |
|---|---|---|
| Migrations | All 5 kiosk migrations **applied** | `schema_migrations` + `information_schema.tables`: `kiosk_devices`, `counter_transactions`, `kiosk_attract_slides`, `square_transactions` |
| Counter transaction 01–05 | **Complete** | `src/lib/submit-counter-transaction.ts`; `/api/kiosk/intake` returns `counter_transaction_id`; `KIOSK_SERVICES.sales.status === 'live'` |
| POS modernization Ph 1–3 | **Landed** | `KIOSK_PILL` / `KIOSK_PILL_ACTIVE_ISSUE` in `kiosk-chrome.ts`; `ReasonSelector appearance: 'pills'`; `KioskRepairPane` `layout="all"` |
| POS modernization Ph 4 | **Not built** | no History member in `KIOSK_SERVICES`; no reprint route |
| Tablet ↔ desktop live link | **Not built** | zero `ably` / `realtime` references under `src/app/kiosk`, `src/lib/kiosk`, `src/app/api/kiosk`; tracked in the OTHER task system as `master-plan.mdx` → **ROI-F1 / PR-12**, still `pending`, whose open question #2 is *"one iPad mode-switch vs two devices (session channel)?"* |
| E2E `--project=qa-desktop` | **20 / 22 pass** | full device lifecycle, host gating, PIN step-up, pickup lookup, revoke, both form factors |
| E2E `--project=desktop` | **13 / 22 fail** | single root cause — see §1 |

---

## 1. BLOCKER — the dogfood E2E credential is dead (fix first; ~5 min, needs the user)

```
[global-setup] USAV session not minted for "Michael" — account signin failed (401): INVALID_CREDENTIALS
```

`PW_OWNER_EMAIL` / `PW_OWNER_PASSWORD` in `.env` no longer authenticate against
`POST /api/auth/account/signin`. Every one of the 13 `desktop` failures is a staff-gated call
returning 401 downstream of that — **no kiosk code is implicated**. The same spec run against
`qa-desktop` passes 20/22.

**Action (user-owned — it is a credential, not code):** re-set `PW_OWNER_PASSWORD` for
`PW_OWNER_EMAIL`, or set `PW_STAFF_PIN` so `signInPinless` takes over. Then:

```bash
rm -f tests/.auth/admin.json && npx playwright test tests/e2e/kiosk-intake-flow.spec.ts --project=desktop
```

**Standing rule this re-teaches:** per `AGENTS.md`, E2E asserts against the **QA org**, not the
dogfood tenant. Most of this spec should not have needed a dogfood session at all — see §4.

---

## 2. Open work, in dependency order

### A. Test-harness truth (do before any feature work)

| # | Item | Why it is first |
|---|---|---|
| A1 | Fix the dogfood credential (§1) | 13 red tests are lying about the system's health |
| ~~A2~~ | ~~Root-cause the Settings → Kiosk devices UI failure~~ — **DONE 2026-08-20** | **Root cause: a hydration race, not permissions.** The trace showed *zero* `/api/kiosk/enroll` requests and the snapshot showed `Give the tablet a name first.` — `label` was empty at click time. A probe proved the field held `PROBE-A` immediately after `fill` and `""` 300ms later, with the **same DOM element** still connected: React hydrated the controlled `value={label}` input and patched the typed text away. Fixed with `fillWhenHydrated` (retries the fill until the value survives a read-back), which waits for INTERACTIVITY instead of a guessed timeout. |
| A3 | Port the spec's dogfood-only assumptions to the QA org | `pair + intake succeed on the dogfood kiosk Host` (line 507) resolves the usav kiosk host while authed as QA. Either provision a QA kiosk host in `provision-qa-org.ts` or mark that one test `desktop`-only with a header comment stating why (the documented dogfood exception in `.claude/rules/verify.md`). |

### B. E2E coverage gaps (POS handoff Phase 5)

The spec today proves the **device-auth lifecycle**. It does not prove a customer can complete a
transaction. That gap is exactly what let the `activeField`-pinned-to-`extras` bug ship.

**Landed 2026-08-20** as `test.describe('Kiosk v2 — customer happy paths (iPad landscape)')`.

| # | Test | State |
|---|---|---|
| B1 | **repair drop-off completes** — pair → Repair → priced `-RS` tile → issue notes → name/phone/serial/price → signature → Save to cart → Save → `Service RS-… checked in` | **PASSING** — commits a real counter transaction through `/api/kiosk/intake`; the receipt face can only render from a returned `CounterTransactionResult` |
| B3 | **cart is the session root** — repair line survives Retail → Pickup → Repair command switches | **PASSING** |
| B4 | **pickup miss teaches** — bogus order + phone → oracle-safe copy | **PASSING** |
| B2′ | **Pay demands a staff PIN** — step-up sheet opens, no card field exists | **written, unproven** — the dev server went down mid-run before it executed |
| B2 | *retail* happy path via catalog | **not possible in QA today** — retail reads the LOCAL projection (`/api/kiosk/sales/*`), and the QA org has no `platform_listings` rows, so the grid is empty. Repair reads live Ecwid (`resolveEcwidStoreCreds`, org-blind) and does return products. Either seed a QA retail projection in `provision-qa-org.ts` or accept repair-only UI coverage. |
| B5 | Stale Ph 1–2 copy assertions | **not needed** — the existing shell test already tolerates `/all (repairs\|items)/i` |

Supporting seams added: `data-testid="product-tile"` on the `ProductSelector` grid button (the tiles
carried no stable handle), and `signOn()` which draws on the `SignaturePad` **canvas** — including a
`scrollIntoViewIfNeeded`, without which `boundingBox` returns coordinates for a canvas below the fold
and the stroke lands somewhere else entirely (that was a real 20-minute red).

### C. Features still genuinely missing

| # | Item | Size | Notes |
|---|---|---|---|
| C1 | **History + reprint** (POS Ph 4) | L | PIN-gated via existing `KioskPaymentStepUpSheet` + `/api/kiosk/staff-for-stepup`. List today's org/device submissions; row → `buildRepairIntakeReceiptProps` → reprint. `orgId` from device ctx, never body. Audit every reprint. **Never on the open customer face without step-up.** |
| C2 | **Multi-slide attract reel** | M | `kiosk_attract_slides` is applied and **inert** — no reader, no writer, no carousel. Today `brand.attractMediaUrl` (a scalar) is what the kiosk serves. Either build the three legs or drop the table. |
| C3 | **`idleTimeoutSeconds` Settings field** | S | Resolver + API + consumer all exist; only the Settings UI input is missing (PATCHable today via `/api/admin/organization/profile`). |
| C4 | improve-ui density / thumb-zone pass on the v2 shell | M | Landscape plan §3, last unchecked box. |

### D. Cutover (`/kiosk` → the landscape shell)

Gated on A + B being green. Landscape plan §4:

1. E2E green on both surfaces at iPad-landscape **and** desktop
2. Flip `/kiosk` to the shell; keep `/kiosk/v2` as a redirect or delete it
3. `npm run verify` green
4. Update `KIOSK_SERVICES.welcome` semantics (the flag exists only to gate the portrait welcome tiles)

---

## 3. Cross-session tablet ↔ desktop communication — this does not exist yet

Nothing in the kiosk tree touches realtime. What is there today:

- **Device identity:** an enrolled tablet holds an httpOnly `cf_kiosk` device cookie and writes as
  *itself* via `withKioskAuth`. Solid, and the right foundation.
- **Customer face:** `KioskCustomerFace` is a **180° rotation of the same tablet**, not a second screen.
- **Dual-display pairing:** explicitly out of v1 in both plans.

So "tablet and desktop talking to each other" is **new work**, not a wiring gap. The honest shape,
composing what the repo already has (`src/lib/realtime/`, `publishInboxItem`'s channel grammar):

| Leg | Design |
|---|---|
| Channel | `org:{orgId}:kiosk:{deviceId}` — org-scoped like every other channel here |
| Token | The kiosk realtime token must be minted from the **device** principal, not a staff session. `/api/realtime/token` is staff-gated today, so this needs a device-authed sibling. |
| Tablet → desk | Publish cart mutations + submit events off `kioskSessionStore`. The store is already the session root, so it is the natural single emitter — never a second cart. |
| Desk → tablet | A desk-side pane subscribing to the device channel (which command is open, live cart, awaiting-PIN). Staff-side actions (price override, approve step-up) would be **new authenticated routes** — never a realtime message mutating state directly. |
| Ordering | Realtime is a **paint** channel, never the write path. Every mutation still goes through `/api/kiosk/*` with its `Idempotency-Key`. |

**Recommendation:** treat this as its own initiative in its own worktree lane after the cutover.
Folding it into the current v2 work would put an unproven realtime surface underneath a customer
face that does not yet have a passing happy-path test.

---

## 4. Suggested order

```
1. A1  fix the dogfood credential            (user; unblocks 13 red tests)
2. A2  root-cause Settings enroll UI red     (the only real bug on the board)
3. B1–B5  E2E happy paths                    (the actual "prove it works" ask)
4. A3  QA-org port of the host test
5. C3  idleTimeoutSeconds field              (cheap)
6. C1  History + reprint                     (largest remaining feature)
7. C2 / C4  attract reel + density pass
8. D   cutover
9. —   dual-display / desk↔tablet realtime, separate lane
```

## Verify

```bash
npx playwright test tests/e2e/kiosk-intake-flow.spec.ts --project=qa-desktop   # 20/22 today
npx playwright test tests/e2e/kiosk-intake-flow.spec.ts --project=desktop      # blocked on A1
npx tsx --test src/app/kiosk/v2/KioskRepairPane.test.ts
npm run verify
```
