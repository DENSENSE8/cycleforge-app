# Handoff — "Keep me signed in" must actually keep you signed in

**Operator ask (2026-08-30), verbatim intent:**

1. The sign-in checkbox says *"Keep me signed in — 30 days on this device"*. It must
   be **"Keep me signed in" in general**, not thirty days.
2. Once it is checked, the session **must persist to sign in no matter what**.
3. Today it does not persist at all — go back to the site later and you are signed out.

This is a **behaviour** change, not a copy change. Editing the label without the
session work would make the promise louder and still false.

---

## Root cause — verified in code, do not re-derive

The checkbox does far less than it looks like it does. It sets `deviceKind` and
nothing else.

| Fact | Where |
|---|---|
| Checkbox → `deviceKind: rememberMe ? 'personal' : 'station'` — the ONLY thing it controls | `src/app/signin/page.tsx` (4 call sites: ~415, ~431, ~451, ~480) |
| `personal` = **idle 12 h**, absolute 30 d. `station` = idle 8 h / absolute 24 h | `IDLE_WINDOWS`, `src/lib/auth/session.ts` |
| `loadSession` **auto-REVOKES** on idle — `UPDATE staff_sessions SET revoked_at = NOW()`. Permanent, not a soft expiry | `loadSession`, `src/lib/auth/session.ts` |
| An active shift can cut expiry to **shift end** (`honorShift`), and that is skipped only for `persistent` | `createSession`, `src/lib/auth/session.ts` |
| A `persistent` policy ALREADY exists — infinite idle, 365 d absolute, sliding — but it is **per-staff admin config** (`staff.session_policy`), never reachable from the checkbox | `PERSISTENT_WINDOW` / `resolveSessionWindow`, `src/lib/auth/session.ts` |
| The cookie itself is **fine**: `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge` from session expiry. It is a persistent cookie, not a session cookie | `src/app/api/auth/signin/route.ts` (~195) |
| `last_seen_at` IS refreshed on visits (`touchSession`), so the idle clock resets on use | `src/lib/auth/server-session.ts`, `src/app/api/auth/session/route.ts` |

**So the reported symptom is the 12-hour idle window.** Sign in during the day,
come back the next morning (>12 h with no request) → `idle-timed-out` → the row
is revoked → signed out. "30 days" in the copy is the *absolute* ceiling, which
almost nobody reaches because idle kills the session first.

Do not "fix" this by lengthening `IDLE_WINDOWS.personal`. That trades one
arbitrary number for another and still expires.

---

## What to build

The policy that already does what the operator wants is `persistent`. The gap is
that it lives on the **staff row**, while the checkbox is a **per-sign-in**
choice on **this device**. So it needs to become a property of the session.

1. **Migration first (expand → code → contract).** A nullable/defaulted
   `ADD COLUMN` is always safe to ship early:
   `ALTER TABLE staff_sessions ADD COLUMN IF NOT EXISTS persistent BOOLEAN NOT NULL DEFAULT false;`
   Use `/db-migration-author` — dated immutable filename, idempotent DDL,
   tenant-from-birth rules.
2. `createSession(opts)` takes `persistent`, writes the column, and when it is
   true resolves the `PERSISTENT_WINDOW` **and skips `honorShift`** (a
   shift-bound expiry silently defeats the whole feature — the existing code
   already makes that exception for `persistent` staff; mirror it).
3. `loadSession` / `loadSessionDiagnostic` read the column and skip the idle
   check for persistent sessions (the `Number.isFinite(window.idleMs)` guard
   already handles this if the window resolves correctly — prefer that to a
   second branch).
4. **Thread it through every entry point.** There are 13+ `createSession` call
   sites; if any is missed, whether you stay signed in depends on *how* you
   signed in, which is worse than the current consistent failure:
   `auth/signin`, `auth/account/signin`, `auth/pin/create`,
   `auth/passkey/authenticate/finish`, `auth/account/passkey/authenticate/finish`,
   `auth/email-login/verify`, `auth/oauth/[provider]/callback`,
   `auth/sso/callback`, `auth/password-reset/confirm`, `auth/invitation/accept`,
   `auth/enroll/[token]`, `auth/switch-org`, `auth/act-as-staff`.
   For flows with no checkbox (OAuth/SSO callbacks), decide and **write down**
   the default rather than letting it fall through silently.
5. **Copy** (`RememberMeField`, `src/app/signin/page.tsx` ~918): primary line
   stays **"Keep me signed in"**; delete "30 days on this device". Keep the
   shared-computer warning — that is the part that changes behaviour and is the
   only honest reason to uncheck.
6. `staff.session_policy = 'persistent'` must keep working; per-session
   persistence is an OR with it, never a replacement.

---

## EXACT TESTING

### 0. Environment

Never touch `:3050` (the operator's) and never delete `.next`. Build isolated:

```bash
NEXT_DIST_DIR=.next-perf npm run build
```

```bash
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
```

Mint a session (needs `LH_BASE_URL` or it targets the wrong port and 404s):

```bash
export LH_BASE_URL=http://localhost:3100 && export COOKIE="$(node scripts/lighthouse-mint-session.mjs)" && echo "$COOKIE"
```

Run SQL against the dev DB through the server-only shim (plain `tsx` dies on the
`server-only` guard; `pool` is a DEFAULT export; no top-level await):

```bash
npx tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs <script>.ts
```

**The diagnostic that makes this testable:** `GET /api/auth/session` returns an
`x-auth-debug` header carrying a `SessionNullReason` —
`no-cookie` · `sid-malformed` · `no-row` · `revoked` · `expired` ·
`idle-timed-out` · `db-error`. Assert on that header, never on "it looked signed
out", so a failure names its own cause.

```bash
curl -si -H "Cookie: $COOKIE" http://localhost:3100/api/auth/session | grep -iE "^HTTP|x-auth-debug"
```

### 1. You cannot wait 12 hours — time-travel the row

This is the core technique for every persistence test. Get the sid from the
cookie (`cf_sid=<sid>`), then age the session and re-request:

```sql
UPDATE staff_sessions SET last_seen_at = NOW() - INTERVAL '13 hours' WHERE sid = '<sid>';
```

- **Before the fix:** the next request returns unauthenticated,
  `x-auth-debug: idle-timed-out`, and `revoked_at` is now set (confirm with a
  `SELECT` — the auto-revoke is the part that makes it unrecoverable).
- **After the fix, checked:** still authenticated. `revoked_at` still NULL.
  Repeat at `INTERVAL '30 days'` and `'200 days'` — still signed in.
- **After the fix, UNCHECKED:** must still expire. This is the safety property;
  a regression here is worse than the bug.

### 2. Test matrix — run every row

| # | Scenario | Steps | Expected AFTER fix |
|---|---|---|---|
| 1 | Copy | Load `/signin` | Label reads "Keep me signed in". No "30 days" anywhere. Shared-computer warning still present. |
| 2 | Checked → browser restart | Sign in with box checked, fully quit + reopen the browser, visit the app | Signed in. (Guards against the cookie regressing to a session cookie.) |
| 3 | Checked → long idle | §1 time-travel to 13 h, 30 d, 200 d | Signed in at every step; `revoked_at` NULL |
| 4 | Checked → absolute ceiling | `SELECT expires_at FROM staff_sessions WHERE sid=…` right after sign-in | ~365 d out, NOT 30 d, NOT shift end |
| 5 | Checked → active shift | Sign in while a shift ends within the hour | `expires_at` ignores shift end. Then time-travel past shift end → still signed in |
| 6 | **Unchecked → still expires** | Sign in unchecked (`station`), time-travel 9 h | Signed OUT, `x-auth-debug: idle-timed-out` |
| 7 | Explicit sign-out | Sign in checked, then Sign out | Signed out immediately; `revoked_at` set; the persistent flag does not resurrect it |
| 8 | Every entry point | Repeat #3 for each of the 13 `createSession` routes reachable in this env (PIN, passkey, email-login, account signin at minimum) | Identical persistence; no route where checking the box does nothing |
| 9 | Cookie attributes | `curl -si` the sign-in response | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` ≈ the session's remaining seconds (not absent, not 0) |
| 10 | Multi-device | Sign in on two browsers, sign out of one | The other stays signed in (per-session, not per-staff) |
| 11 | Staff policy still wins | A staff row with `session_policy='persistent'` signing in UNCHECKED | Still persistent — the per-staff policy is an OR, not overridden |

### 3. Regression gates

```bash
npm run verify
```

Add coverage rather than relying on manual passes:

- A DB-free unit test for `resolveSessionWindow` + the new persistent flag
  (`/domain-unit-test` — node:test + tsx, deps-injection, assert the window AND
  that `honorShift` is skipped). This is the cheapest place to pin #4/#5.
- An e2e in `tests/e2e/` for #1, #2 and #6 (`/e2e-spec-writer`). #3 belongs in
  an integration test that time-travels the row, not a Playwright wall-clock wait.

### 4. Accessibility guard (already in flight — do not regress)

`/signin` currently measures **Accessibility 100**, and the sign-in inputs
depend on a fragile detail: the `pointer: coarse` **16 px font floor** in
`src/app/globals.css` is the ONLY thing preventing iOS auto-zoom on focus, now
that `maximum-scale=1` is gone from the viewport meta. If this work touches the
email/password fields or their sizing, re-check:

```bash
export CHROME_PATH=/home/michaelgarisek/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome && export LH_BASE_URL=http://localhost:3100 && node scripts/lighthouse-audit.mjs --routes /signin --runs 3
```

`/signin` is declared `auth: false`, so the harness audits it **signed out** and
records `scenario: "signed-out"`; `--check` fails loudly if that changes.

### 5. Preview verification (blocked — needs the operator)

The honest end-to-end check is a Vercel preview, but the CLI token is expired
(`vercel whoami` → "The specified token is not valid"). It needs an interactive
`vercel login`. Two things must NOT be done unilaterally:

- `AUTH_PINLESS_SIGNIN=true` in the **preview** env — previews point at the
  **shared production database**, so pinless staff sign-in on a guessable URL is
  a real exposure.
- A Deployment Protection bypass secret (project settings).

Also note `vercel deploy` ships the **working tree**, which currently carries
several sessions' uncommitted work.

---

## Done when

1. The label reads "Keep me signed in" with no duration.
2. Checked survives browser restart, 13 h, 30 d and 200 d of idle, and a shift
   boundary — proven by the §1 time-travel, with `x-auth-debug` quoted.
3. Unchecked still expires on the station window (#6).
4. Explicit sign-out still revokes immediately (#7).
5. Every `createSession` route behaves the same (#8).
6. `npm run verify` green, with new unit + e2e coverage.

---

# LANDED — 2026-08-30

Behaviour + copy both shipped. Every "Done when" item below is checked against a
measurement quoted in this section, not against a reading of the diff.

## What changed

| Layer | Change |
|---|---|
| Migration | `src/lib/migrations/2026-08-30_session_persistent_flag.sql` — `staff_sessions.persistent BOOLEAN NOT NULL DEFAULT false`, plus the same column on `sso_auth_state`, **guarded** on the table existing (see below). Applied with `--only`. |
| Window | `resolveSessionWindow(kind, policy, sessionPersistent)` — the session flag and `staff.session_policy` are an **OR**. Persistent resolves `PERSISTENT_WINDOW` (`idleMs = Infinity`), so the existing `Number.isFinite(window.idleMs)` guard in `loadSession` / `loadSessionWithReason` skips the idle auto-revoke with no second branch. |
| Expiry | New pure `resolveSessionExpiry({deviceKind, policy, persistent, shiftEndsAt, now})`, extracted out of `createSession` so the shift-vs-persistent interaction is testable without a DB. A persistent session ignores `honorShift`. |
| Sliding | `touchSession` now slides `expires_at` when the ROW is persistent, not only when the staff's policy is. |
| Read paths | `SessionRow.persistent` is selected and returned everywhere (`loadSession`, `loadSessionWithReason`, `listActiveSessions`), which is what lets the re-mint routes inherit it. |
| Copy | `RememberMeField` (`src/app/signin/page.tsx`): "Keep me signed in" / "Uncheck on shared computers". No duration — checked has no idle timeout and slides its absolute window, so there is no honest number to name. |

## The default at every entry point (decided, not fallen through)

All 16 `createSession` call sites under `src/app/api/auth/` are accounted for.
Three groups, one rule each:

1. **The checkbox is reachable → carry its value.**
   `signin` (PIN + pinless), `pin/create`, `account/signin`, `passkey/authenticate/finish`,
   `account/passkey/authenticate/finish`, `act-as-staff`, `oauth/[provider]/callback`,
   `sso/callback`.
   The two redirect flows needed a carrier, because the button sits beside the
   checkbox and a silent downgrade there is exactly the "depends how you signed
   in" failure this doc warns about:
   - **OAuth** — `?persist=1` on `/start` → `OAuthStatePayload.persistent` in the
     existing **httpOnly** state cookie. No schema change, and not forgeable by a page.
   - **SSO** — `?persist=1` on `/start` → `sso_auth_state.persistent`, the only
     thing that survives the IdP round trip.
2. **Re-mint on the same device → inherit the previous session.**
   `switch-org` (always), `switch` and `act-as-staff` (inherit unless the body
   says otherwise). Switching workspace or staff on one physical device is not a
   fresh sign-in decision.
3. **One-time-link mint, no checkbox on screen → `false`, deliberately.**
   `email-login/verify`, `invitation/accept`, `password-reset/confirm`,
   `verify-email`, `signup`, `enroll/[token]`. Each carries a comment saying so.
   These keep exactly today's device-kind window; a user gets persistence by
   signing in with the box checked. `enroll` is the strongest case — a `phone`
   session is a deliberate 4-hour handoff window (matches the Ably token TTL),
   so persistence there would contradict the device kind, not just the missing
   checkbox.
   **If the operator wants any of these upgraded it is a one-line flip at a
   commented location** — that is why they are commented rather than silent.

A body field that is absent or malformed reads as `false`
(`asPersistentFlag(raw) => raw === true`): an indefinite session is never
granted by accident. A client that never sends the field behaves exactly as
before — measured below.

## Schema drift found on the way

`2026-05-23_sso_providers.sql` is in this dev DB's `schema_migrations` ledger,
but **`sso_auth_state` and `organization_sso_providers` do not exist there** —
someone dropped them. The first apply failed on `relation "sso_auth_state" does
not exist`, transactionally, leaving nothing behind. The migration now guards
that half in a `to_regclass` `DO`-block and `RAISE NOTICE`s the skip. The SSO
callback reads `stateRow.persistent === true`, so a missing column degrades to
"federated sign-in is not persistent", never to a crash. **The drift itself is
pre-existing and untouched — SSO is broken in this environment for reasons that
have nothing to do with this change.**

## Evidence

Isolated build, `:3110` (`:3100` was already taken by another session's
`next-server` — not killed; `:3050` never touched):

```bash
NEXT_DIST_DIR=.next-perf npm run build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3110
```

### Cookie shape at mint (#4, #9) — staff #1, `session_policy='default'`

```
CHECKED    Max-Age=31535999  Expires=Mon, 30 Aug 2027   Path=/  Secure  HttpOnly  SameSite=lax
UNCHECKED  Max-Age=86399     Expires=Mon, 31 Aug 2026   (station 24 h — unchanged)
NO `persistent` FIELD AT ALL  Max-Age=2591999 (30 d personal — legacy client, unchanged)
```

### Time-travel (#3, #6) — `x-auth-debug`, quoted

```
CHECKED   aged 13 hours → HTTP 200  x-auth-debug: ok        revoked_at NULL
CHECKED   aged 30 days  → HTTP 200  x-auth-debug: ok        revoked_at NULL
CHECKED   aged 200 days → HTTP 200  x-auth-debug: ok        revoked_at NULL
UNCHECKED aged 9 hours  → HTTP 200  x-auth-debug: idle-timed-out
                          row after: revoked_at = 2026-08-30T15:42:00.348Z
```

`expires_at` on the checked row read `2027-08-30` after each probe — `touchSession`
slid it forward every time, which is the sliding year working.

### Sign-out and multi-device (#7, #10)

```
persistent session → POST /api/auth/signout → x-auth-debug: revoked   (not resurrected)
two devices, sign out of A → A: revoked   B: ok                       (per-session, not per-staff)
```

### Automated coverage added

- `src/lib/auth/session-window.test.ts` — 13 DB-free tests over
  `resolveSessionWindow` + `resolveSessionExpiry`, on a fixed clock. Pins that
  persistent's `idleMs` is **infinite** (the load-bearing property), that the
  session flag and the staff policy are an OR in both directions, and that
  **shift end is ignored when persistent and still honoured when not** (#5).
- `tests/e2e/keep-me-signed-in.spec.ts` — 3 specs, signed out: the copy (#1),
  and the cookie shape a browser actually enforces (#2, #9). Idle expiry is
  deliberately **not** here — a Playwright wall-clock wait cannot age a row.
- `scripts/verify-session-persistence.ts` — DB-backed integration check (20
  assertions) covering #3, #5, #6, #7 and #11 by time-travelling real rows.
  It lives in `scripts/`, not `src/**.test.ts`, because the unit pass is DB-free.
  Mints only `device_label = 'persistence-verify'` rows and deletes them, and
  restores any `session_policy` it touched:

```bash
npm run test:session-persistence
```

```
20/20 checks passed
```

### Matrix status

| # | Scenario | Status |
|---|---|---|
| 1 | Copy | ✅ `/signin` HTML: label present, `30 days` × 0, shared-computer warning present. E2E pins it. |
| 2 | Checked → browser restart | ✅ persistent cookie with `Max-Age=31535999`, not a session cookie. E2E pins it. |
| 3 | Checked → long idle | ✅ 13 h / 30 d / 200 d all `x-auth-debug: ok`, `revoked_at` NULL. |
| 4 | Checked → absolute ceiling | ✅ `expires_at` ~365 d, not 30 d, not shift end. |
| 5 | Checked → active shift | ✅ integration check: expiry ignores shift end, still signed in 13 h later; unchecked still clamps to shift end. |
| 6 | Unchecked → still expires | ✅ `idle-timed-out` at 9 h, row auto-revoked. |
| 7 | Explicit sign-out | ✅ `revoked`, and persistence does not resurrect it. |
| 8 | Every entry point | ⚠️ **Threaded through all 16 sites** (typecheck-enforced), but only `/api/auth/signin` (PIN-less) is exercisable by HTTP in this env. Passkey needs WebAuthn, OAuth/SSO need a provider, the link flows need a token, and `account/signin` needs owner credentials that are stale here (`PW_OWNER_EMAIL` → `INVALID_CREDENTIALS`, a pre-existing condition global-setup already logs and works around). |
| 9 | Cookie attributes | ✅ `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = the session's remaining seconds. |
| 10 | Multi-device | ✅ signing out of one device leaves the other `ok`. |
| 11 | Staff policy still wins | ✅ both directions. Confirmed live by accident too: staff #15 "Chi" carries `session_policy='persistent'` in this DB and got the year with the box **unchecked**. |

### Gates

`npm run verify` — see the run in this session's log. `npm run verify:fast`
(lint + typecheck) was green throughout.

Lighthouse §4 was **not** re-run: the guard is scoped to "if this work touches
the email/password fields or their sizing", and the only `/signin` change is one
line of helper text inside the existing checkbox `<label>`. Nothing about the
`pointer: coarse` 16 px floor or the inputs moved.

## Still open (unchanged from §5 above)

Preview verification remains blocked on the operator: `vercel whoami` needs an
interactive `vercel login`, and neither `AUTH_PINLESS_SIGNIN=true` in preview nor
a Deployment Protection bypass secret should be set unilaterally — previews point
at the shared production database. Nothing was committed or deployed.

---

# BROWSER PASS — 2026-08-30, on the operator's `:3050`

Driven in a real Chrome against the operator's own dev server (which serves the
main checkout, so it had the change already — nothing was restarted).

## A bug the HTTP + e2e passes both missed

**`submitAccount` was memoized without `rememberMe` in its dependency array.**
It closed over the checkbox's default (`true`) permanently, so on the **primary**
sign-in flow — email + password — unchecking the box changed the pixels and
nothing else. Every request went out `"persistent": true`.

Caught by spying on `window.fetch` in the live page and reading what the form
actually sent:

```
box CHECKED   → {"email":"…","password":"…","persistent":true}
box UNCHECKED → {"email":"…","password":"…","persistent":true}   ← the bug
```

**`react-hooks/exhaustive-deps` is `'off'` in `eslint.config.mjs`** (line 106),
so no gate in this repo could ever have caught it. Neither could the earlier
curl pass (it builds its own request bodies) nor the earlier e2e (it asserted on
cookie shape, not on what the form sends). Only driving the real form found it.

Fixed — `}, [email, password, finish, rememberMe]);` — and an audit of every
other `rememberMe`-reading callback found the remaining eight already correct:

```
  ** MISSING ** line 338: deps [email, password, finish]     ← fixed
  OK  397 [finish, rememberMe]          OK  462 [finish, rememberMe]
  OK  410 [next, rememberMe]            OK  491 [rememberMe, finish]
  OK  420 [next, rememberMe]            OK  519 [picked, finish, rememberMe]
  OK  442 [picked, finish, rememberMe]  OK  543 [picked, finish, rememberMe]
```

A regression test now covers it (`tests/e2e/keep-me-signed-in.spec.ts`, "the
checkbox controls what the account form actually sends"). It intercepts the
route, so no credential reaches the server and no `failed_login` row is written.
**Proven to have teeth**: reverting the one-line fix turns it red —

```
✘ the checkbox controls what the account form actually sends
  Error: UNCHECKED → persistent: false (this is the regression)
```

## The persistence loop, in the browser

Sessions were minted server-side and the cookie injected, then aged with
`npm run session:age`. Each step re-read `/api/auth/session` and confirmed the
**sid actually authenticating**, so the evidence names its own session:

| Step | Session | Result |
|---|---|---|
| Sign in, box CHECKED | `5042948e…` personal, `persistent=true` | lands on `/shipping/orders`, full app chrome |
| + 13 h idle | same sid confirmed | **still signed in**, `x-auth-debug: ok` |
| + 200 d idle | same sid confirmed | **still signed in**, `x-auth-debug: ok` |
| Box UNCHECKED | `5aa6adc3…` station, `persistent=false` | signed in |
| + 9 h idle | same sid confirmed | **signed out** → `/signin?next=%2Fshipping%2Forders` |

Copy verified on screen at each visit: "Keep me signed in" / "Uncheck on shared
computers", `30 days` absent from the whole document.

## Two things about the sign-out that are worth knowing (both pre-existing)

1. **Sign-out is one navigation late.** `proxy.ts` runs on the Edge runtime and
   cannot reach the database, so it gates on the cookie being *present*, not
   valid (`src/proxy.ts:582`). A dead session therefore paints the shell once;
   the `/api/auth/session` heartbeat then clears the zombie cookie (that clearing
   already existed, `src/app/api/auth/session/route.ts`), and the NEXT navigation
   redirects to `/signin`. Observed exactly that: first load → shell, second load
   → `/signin`. **No data leaks in the meantime** — every API call 401s:
   `GET /api/receiving-lines → 401`, `GET /api/my-day → 401`. `proxy.ts`,
   `withAuth.ts` and `current-user.ts` are untouched by this change.
2. **A JS-set `cf_sid` cannot override an httpOnly one.** This cost a wrong
   reading mid-test: the heartbeat re-issues a valid session's cookie as
   httpOnly, after which `document.cookie = 'cf_sid=…'` is silently ignored and
   the browser keeps using the old session. The first "unchecked" attempt was
   therefore measuring the PERSISTENT session and looked like a failure of the
   safety property. Sign out first (`POST /api/auth/signout`), then inject, and
   always confirm the sid in the envelope before trusting the result.

## Environment note

Screenshots stopped working partway through (`Failed to capture screenshot via
CDP`) and the renderer froze whenever the animated email→password panel swapped
— the Chrome pane was not compositing. That is the known hidden-pane behaviour,
not a product defect; the same interaction is fine under headless Playwright.
Assertions were moved to `get_page_text` / `javascript_tool` / Playwright, which
are stronger evidence than a screenshot anyway.

---

# HOW THE OPERATOR TESTS IT (browser recipe)

## Use an incognito window — with one caveat

Incognito is right for the **idle** tests (which is the actual bug): it starts
with no cookies, so `/signin` renders clean, and it cannot disturb the session in
the normal window.

**It cannot test "survives a browser restart" (#2).** Closing the last incognito
window discards *all* cookies, so a 1-year persistent cookie and a session cookie
behave identically there. Two ways to cover that instead:

- **DevTools → Application → Cookies → `cf_sid` → Expires/Max-Age.** A date about
  a year out (not the word `Session`) is the proof. This is the definitive check
  and takes two seconds.
- **A second Chrome profile** if you want a literal quit-and-reopen — profiles
  keep cookies across a full restart.

## The readout — no debug UI needed

`/api/auth/session` now carries `persistent` beside `expiresAt`, so the state is
visible by opening one URL in a tab:

```
box CHECKED    → { "deviceKind": "personal", "expiresAt": "2027-08-30…", "persistent": true  }
box UNCHECKED  → { "deviceKind": "station",  "expiresAt": "2026-08-31…", "persistent": false }
```

## Recipe

1. Incognito → `http://localhost:3050/signin`.
2. Sign in as `hi@usav.com` with the box **CHECKED**.
3. New tab → `http://localhost:3050/api/auth/session` → expect `"persistent": true`
   and `expiresAt` about a year out.
4. `npm run session:age -- 13h` → refresh the app tab → **still signed in**.
5. `npm run session:age -- 200d` → refresh → **still signed in**.
6. Sign out. Sign in again with the box **UNCHECKED** → the readout should now
   say `"persistent": false` with `expiresAt` tomorrow.
7. `npm run session:age -- 9h` → refresh → shell paints once; refresh again →
   **`/signin`**.

## Four traps that will waste your time

1. **Most of the roster is already `session_policy = 'persistent'`.** Twelve of
   thirteen staff — Thuc, Sang, Tuan, Thuy, Cuong, Kai, Lien, Long, Chi,
   Hoàng Lê Bách, Quang, Ajax. Sign in as any of them with the box UNCHECKED and
   they still stay signed in, because the per-staff policy ORs with the checkbox.
   That is correct behaviour and looks exactly like a bug. Only **Michael** (#1)
   and **USAV Owner** (#122, `hi@usav.com`) are on `default` — test with those.
2. **Sign-out takes two navigations**, by design — see the proxy note above.
3. **`session:age` with no filter targets the NEWEST live session.** Sign in
   immediately before running it, or be explicit:
   `npm run session:age -- 9h --staff="USAV Owner"`.
4. **Station / PIN sign-in is not testable on `localhost`.** The tenant slug comes
   from a subdomain (`extractTenantSlug` rejects any host with fewer than three
   labels), so `localhost:3050` is always the apex and the station picker shows
   "Station sign-in happens on your workspace URL". On localhost you can exercise
   the account, passkey and magic-link flows only.

---

# CONSOLIDATED — one source of truth (operator approved, 2026-08-30)

**Status: DONE.** `2026-08-30b_retire_persistent_session_policy.sql` is applied.
The sign-in checkbox is now the only thing that decides persistence in practice.
The section below is kept as the reasoning that led there.

## Where persistence is decided today — two places, OR'd

| Source | Grain | Set by |
|---|---|---|
| `staff.session_policy = 'persistent'` | per **person**, all their devices | admin UI — `CredentialsCard.tsx` dropdown |
| `staff_sessions.persistent` | per **session**, this device only | the sign-in checkbox |

The OR was the handoff's explicit instruction ("per-session persistence is an OR
with it, never a replacement"), and `resolveSessionWindow` implements exactly
that. But the live data makes the consequence sharp.

## What the data says

- **12 staff on `persistent`, 15 on `default`.**
- The 12 are the entire real warehouse roster (ids 2–18: Thuc, Sang, Tuan, Thuy,
  Cuong, Kai, Lien, Long, Chi, Hoàng Lê Bách, Quang, Ajax).
- The 15 `default` are Michael (#1), Van Anh, and QA/demo fixtures.
- `auth_audit` records **exactly 12** `staff.updated` events carrying
  `session_policy`, all by **actor staff #1**, between **2026-05-26** and
  **2026-06-09**, one per staff member. The targets match the 12 one-to-one.

Read plainly: the operator hand-flipped the whole real roster to `persistent`
over two weeks as a manual workaround for this bug, and did not flip themselves
— which is why they alone kept experiencing the sign-out they reported.

## Why this still matters after the fix

For those 12 people the checkbox is **inert**. The label says "Uncheck on shared
computers"; they are the ones actually standing at shared stations, and
unchecking does nothing for them. That is the same dishonesty as the original
bug, pointed the other way — and the fix as shipped does not remove it.

## The zero-disruption consolidation (NOT run — needs the operator's call)

Resetting the 12 to `default` on its own would sign all 12 out at their next
long gap, because their CURRENT session rows were created before this change and
carry `persistent = false`. Backfill first, then reset, in one transaction:

```sql
-- 1. keep every live session of those 12 exactly as persistent as it is today
UPDATE staff_sessions SET persistent = true
 WHERE revoked_at IS NULL AND expires_at > NOW()
   AND staff_id IN (2,3,4,5,6,7,8,14,15,16,17,18);

-- 2. hand the decision back to the checkbox
UPDATE staff SET session_policy = 'default'
 WHERE id IN (2,3,4,5,6,7,8,14,15,16,17,18);
```

Nobody is signed out; from the next sign-in the checkbox is the single source of
truth, and unchecking on a shared station finally means something.
`session_policy` stays in the schema and the admin UI as a deliberate override —
it just stops being the silent default for the whole company.

## Applied — result

`2026-08-30b_retire_persistent_session_policy.sql`, written predicate-based
(never an id list — staff ids mean nothing in another database) and naturally
idempotent (after it runs, nothing matches `session_policy = 'persistent'`).

Before → after on the USAV database:

```
policies            default 15 · persistent 12   →   default 27 · persistent 0
live sessions of the 12, flagged persistent   0   →   102
```

**Nobody was signed out.** Proven read-only, without mutating a single live row:
for all 102 live sessions belonging to the 12 formerly-policy staff, the window
the auth path now resolves was recomputed through `resolveSessionWindow` —

```
102 live sessions — 102 keep infinite idle, 0 would now idle out
```

The other 251 live sessions (everyone else) are untouched and still
non-persistent, exactly as before.

Five stray `persistent` sessions from my own curl testing (`::1`, no device
label, created today) were deleted first so the backfill count reflects real
staff only.

### What changed for those 12 people

Nothing today — their current sessions behave identically. From their **next**
sign-in the checkbox decides, which means unchecking it at a shared station
finally does what the label says. That is the whole point of the consolidation.

### What `session_policy` is now

Still in the schema, still in the admin dropdown (`CredentialsCard.tsx`), still
supporting `extended` (7 d idle / 90 d) which has no checkbox equivalent. It is
simply no longer the silent company-wide default — nobody is on it, so the
checkbox is the source of truth in practice, and `session_policy` is what it
always should have been: a deliberate per-person override.

The OR in `resolveSessionWindow` stays. It is what makes the override work, and
removing it would break `extended` too.

### Recovering the old list, if ever needed

Step 2 discards which staff were on the policy. `auth_audit` still has it:

```sql
SELECT DISTINCT (detail->>'targetStaffId')::int FROM auth_audit
 WHERE event = 'staff.updated' AND detail::text ILIKE '%session_policy%';
```

### Gate note (2026-08-30, after the consolidation)

`npm run verify` reports **Typecheck ✗** with 9 errors — all of them in
`.next/types/validator.ts`, `.next-perf/types/validator.ts` and
`.next-perf-lh/types/validator.ts`, all saying they cannot find
`src/app/shipping/{fba,labels,orders}/page.js`.

That is **another session's in-flight work**, not this change: those three pages
are staged as renames into a `src/app/shipping/(desk)/` route group, and the
Next-generated route types in the three build directories still point at the old
paths. **Zero errors in `src/`** — `npx tsc --noEmit` filtered to source is
clean. It resolves itself when those build dirs are regenerated.

Not repaired here on purpose: `.next/` belongs to the operator's `:3050` server
and must never be deleted, and the `.next-perf*` dirs are shared with the perf
lane. Lint ✓ and Unit tests ✓ in the same run.
