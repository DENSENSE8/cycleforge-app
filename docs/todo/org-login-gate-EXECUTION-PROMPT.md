# EXECUTION PROMPT — Org login gate, SMB auth, dogfood naming burn-down

> Paste everything below the line into a fresh Claude Code / Cursor session at the repo root
> (`/Users/icecube/repos/cycleforge-app`). Multi-wave run. Stop at every **HUMAN GATE**.
> Work on `main`. Never `git stash`. Never commit/push unless the human explicitly asks —
> leave the tree for GitHub Desktop.

---

ultracode

# Mission

Execute the **org login gate + small-business auth redesign + USAV dogfood naming burn-down**
end-to-end in this Cycle Forge codebase.

**Problem:** Org #1 (USAV dogfood UUID `00000000-0000-0000-0000-000000000001`) leaks publicly
via apex-host staff-picker defaults and unscoped PIN sign-in. The default `/signin` is a warehouse
staff grid — wrong for SMB owners. Auth surfaces are split (`/signin` vs `/account/signin`),
password reset is missing, rate limits are thin, and legacy `usav_*` cookies/constants couple the
platform to dogfood branding.

**Outcome:** One unified `/signin` (email+password + magic link + Google/Microsoft + optional
station PIN). Apex never exposes tenant staff. Sessions use `cf_sid`. Silent `?? USAV_ORG_ID`
fallbacks fail closed. Enterprise OIDC wired into the same login page.

**Product framing:** Cycle Forge is a sellable multi-tenant B2B warehouse/fulfillment SaaS.
USAV is the **first dogfood tenant only** — never frame the product as a 5-person internal tool.
Do **not** build a shared “org password.” Industry standard = per-person email accounts under
one workspace URL.

# Read first (in this order, before writing any code)

1. **This prompt** + the plan SoT (if present in chat / Cursor plans): org login gate plan
   (phases 1 → 2 → 2e → 2f → 2g → 3). Prefer this prompt’s locked decisions if anything drifts.
2. `CLAUDE.md` + `.claude/rules/source-of-truth.md` + `.claude/rules/backend-patterns.md` +
   `.claude/rules/build-gotchas.md` + `.claude/rules/ui-design-system.md` +
   `.claude/rules/contextual-display.md`.
3. Identity layer: `docs/partial/identity-layer-plan.md`
4. Tenancy: `docs/tenancy/multi-tenancy-execution-plan.md`,
   `docs/tenancy/_analysis/infra.md` (apex → USAV section),
   `docs/todo/saas-commercialization-plan.md` Phase 1–2,
   `docs/cycle-forge-branding-spec.md` (product vs workspace split)
5. Skills when triggered: `new-route`, `domain-unit-test`, `org-scope`, `db-migration-author`
6. Live auth code map (read before editing):
   - Edge gate: `src/proxy.ts` (`PUBLIC_PATHS`, `SESSION_COOKIE_NAME` inline, `x-tenant-slug`)
   - Session: `src/lib/auth/session.ts` (`usav_sid` → rename to `cf_sid`)
   - API auth: `src/lib/auth/withAuth.ts`, `src/lib/auth/current-user.ts`,
     `src/lib/auth/page-guard.ts`, `src/lib/auth/pin.ts`, `src/lib/auth/auth-policy.ts`
   - Client: `src/contexts/AuthContext.tsx` (`CLIENT_PUBLIC_PATHS`)
   - Station PIN: `src/app/signin/page.tsx`, `src/app/api/auth/signin/route.ts`,
     `src/app/api/auth/staff-picker/route.ts`, `src/app/api/auth/switch/route.ts`,
     `src/app/api/auth/pin/create/route.ts`
   - Account login: `src/app/account/signin/page.tsx`,
     `src/app/api/auth/account/signin/route.ts`
   - Magic link: `src/app/api/auth/email-login/{request,verify}/route.ts`,
     `src/lib/auth/email-verification.ts`
   - Signup: `src/app/api/auth/signup/route.ts`, `src/app/signup/page.tsx`
   - Invites: `src/lib/identity/invitations.ts`, `src/app/invite/[token]/page.tsx`,
     `src/app/api/admin/staff/invite/route.ts`, `src/app/m/(shell)/enroll/[token]/page.tsx`
   - SSO (enterprise): `src/lib/auth/sso-oidc.ts`, `src/app/api/auth/sso/{start,callback}/route.ts`
   - Identity: `src/lib/identity/accounts.ts` (`setAccountPassword`, `linkAccountIdentity`,
     `getAccountIdByIdentity`), `src/lib/identity/password.ts`, `src/lib/identity/memberships.ts`
   - Tenancy constants: `src/lib/tenancy/constants.ts`, `src/lib/tenancy/db.ts`
     (`transitionalUsavOrgId`), `src/lib/tenancy/settings.ts` (unenforced auth flags)
   - Guards: `scripts/usav-fallback-guard.mjs`, `eslint.config.mjs` USAV allowlist,
     `src/lib/api-guard.ts` (rate limits)
   - Passkey cookies: `src/lib/auth/webauthn.ts` (`usav_wac`),
     `src/lib/identity/webauthn-account.ts` (`usav_acct_wac`)

# Locked decisions (do not re-litigate)

| Decision | Choice |
|---|---|
| Default login UX | **Email + password** on `/signin` — not staff picker |
| Station PIN | Optional collapsed “Signing in on a shared station?” only when workspace resolved |
| Shared org password | **Never** |
| Login identifier | **Email** (not a separate username) |
| Canonical login URL | `/signin`; redirect `/account/signin` → `/signin` (keep API routes) |
| Apex without tenant slug | **No staff list**; nil UUID org; empty picker |
| Session cookie | Rename `usav_sid` → **`cf_sid`** with 30-day dual-read |
| Passkey challenge cookies | `usav_wac` → `cf_wac`; `usav_acct_wac` → `cf_acct_wac` |
| Org constant symbol | Prefer `DOGFOOD_ORG_ID`; UUID `…0001` unchanged |
| Platform IdPs | Google first, then Microsoft; separate from Drive/Gmail OAuth |
| Enterprise SSO | Wire existing OIDC into `/signin`; admin UI; SAML deferred |
| Signup | Password (not PIN) for owner; `auth_method = 'password'` |
| Migrations | Author only under `src/lib/migrations/`; **do not apply**; do not `drizzle-kit push` |
| Git | `main` only; no stash; no commit/push unless human asks |
| RLS Phase E | **HUMAN GATE** before creating `app_tenant` role / switching pool URLs |
| Wave-2 rename (`usav-refresh-data`, localStorage) | After auth cookies + login UX land; mechanical |
| Branding on login | Cycle Forge product chrome; workspace name eyebrow only when slug known |

# Hard invariants (violating any is a failed run)

- **Backend skeleton:** `withAuth` → Zod → domain helper (`Deps`) → 404/409/200 → `recordAudit`
  (`AUDIT_ACTION`/`AUDIT_ENTITY` constants; never rename) → `after()` side-effects.
  `orgId` from `ctx` / session, **never** from body. Prefer fail-closed over `?? USAV_ORG_ID`.
- **Never commit `.env`.** New env vars → blank entries in `.env.example` + `docs/ENV-VARS.md`.
- **Tenant isolation:** use `withTenantTransaction` / `tenantQuery`; set `app.current_org`.
  New code must not import `USAV_ORG_ID` as a silent default — use `DOGFOOD_ORG_ID` only for
  explicit dogfood exemptions (billing gates), never for request scoping.
- **PIN verify:** always pass `orgId` into `verifyStaffPin(staffId, pin, orgId)` when org is known.
- **Edge + Node cookie sync:** `SESSION_COOKIE_NAME` in `session.ts` and the **inlined** constant
  in `proxy.ts` must stay identical (Edge cannot import the Node session module).
- **Do not rename:** applied migration filenames/SQL; DB tenant slug `usav` / name
  `USAV Solutions` / UUID `…0001`; enum `EBAY_USAV`; NAS paths; Electron `appId`.
- **UI:** Notion-like linear scaffold; semantic colors only; `HoverTooltip` not `title=`;
  icons from `@/components/Icons`; login page is a simple centered form — not a dashboard.
  Reuse `StaffPickerList` / `StaffPinPad` for station mode — do not rebuild.
- **Public paths:** any new public page/API must be added to **both** `proxy.ts` `PUBLIC_PATHS`
  and `AuthContext.tsx` `CLIENT_PUBLIC_PATHS` (or document why one side only).
- **OAuth separation:** platform Google login client ≠ tenant Google Drive / PO Gmail client.
- **Rate limits:** auth mutation/verify routes must call `checkRateLimitAsync` (per-IP; per-email
  when applicable). Warn if Upstash missing but still wire the calls.
- **Tests:** add/extend `node:test` unit tests for resolve-org, signin org-scope, cookie dual-read,
  password-reset hashing. Prefer DB-free Deps injection. Mirror patterns in
  `src/lib/tenancy/idor-regression.test.ts`.

# Orchestration directives

- Work **wave by wave** in the order below. Land each wave green (typecheck/lint on touched files +
  relevant unit tests) before starting the next.
- Prefer **reuse** of existing identity/session primitives over new auth libraries (no NextAuth,
  no Clerk, no Auth.js).
- After each wave, write a short **RUN NOTES** section at the bottom of this file (append) listing
  files changed, env vars added, and remaining HUMAN GATEs.
- If blocked on credentials (Google OAuth client, Redis, DNS wildcard), implement code + blank env
  stubs, document the HUMAN GATE, and continue with other waves.

---

# Wave 0 — Safety inventory (read-only, ~30 min)

Before any edits:

1. Confirm `AUTH_PINLESS_SIGNIN` and `AUTH_V2_ENABLED` usage sites; note production risk in RUN NOTES.
2. Grep and list every `resolveOrgId` / `?? USAV_ORG_ID` / `transitionalUsavOrgId` / `usav_sid`
   touchpoint (don’t fix yet — confirm plan coverage).
3. Confirm `verifyStaffPin` already accepts optional `orgId` in `src/lib/auth/pin.ts`.
4. Confirm `setAccountPassword` exists in `src/lib/identity/accounts.ts`.

**Exit:** inventory matches this prompt; no code changes yet.

---

# Wave 1 — Stop the leak (P0)  [`shared-resolve-org`, `scope-signin-pin`]

## 1.1 Shared org resolver

Create `src/lib/tenancy/resolve-org-from-request.ts`:

```ts
// Apex / no slug → NIL_ORG_ID (empty results), NEVER USAV_ORG_ID / DOGFOOD_ORG_ID
// Optional: if process.env.DEFAULT_TENANT_SLUG set, resolve that slug (dogfood DNS bridge only)
```

- Export `NIL_ORG_ID = '00000000-0000-0000-0000-000000000000'`
- Export `resolveOrgIdFromRequest(req: NextRequest): Promise<string>`
- Use `getOrganizationBySlug` from `src/lib/tenancy/organizations.ts`
- Unknown slug → `NIL_ORG_ID` (empty set, fail closed)

Apply to:

- `src/app/api/auth/staff-picker/route.ts` — delete local `resolveOrgId` + `USAV_ORG_ID` import
- `src/app/api/auth/switch/route.ts`
- `src/app/api/auth/pin/create/route.ts`
- `src/app/api/auth/signin/route.ts` — **critical**

## 1.2 Org-scope PIN / pinless sign-in

In `POST /api/auth/signin`:

1. `const orgId = await resolveOrgIdFromRequest(req)`
2. If `orgId === NIL_ORG_ID` → `404 NOT_FOUND` (or `400 TENANT_REQUIRED`) — do not verify PIN globally
3. Pinless path: `WHERE id = $1 AND organization_id = $2`
4. PIN path: `verifyStaffPin(staffId, pin, orgId)` — use org-scoped overload
5. Add rate limit: `checkRateLimitAsync({ routeKey: 'auth-signin', limit: 20, windowMs: 10*60*1000 })`

Update JSDoc on staff-picker: apex no longer returns USAV.

## 1.3 Tests

- Unit/regression: apex staff-picker returns `[]`; signin with cross-org staffId rejected.
- Extend or mirror `src/lib/tenancy/idor-regression.test.ts`.

**Exit criteria:**

- [ ] `GET /api/auth/staff-picker` without `x-tenant-slug` → `{ staff: [] }` (unless `DEFAULT_TENANT_SLUG`)
- [ ] `POST /api/auth/signin` with staff from another org → 404/WRONG
- [ ] No new `USAV_ORG_ID` imports in those four auth routes

---

# Wave 2 — Auth hygiene P0  [`password-reset`, `auth-rate-limits`, `share-pack-public-paths`]

## 2.1 Password reset (new)

Implement:

1. `POST /api/auth/password-reset/request` — body `{ email }`; always `{ ok: true }`; rate-limited;
   look up via `account_emails`; store hashed token (reuse `email_login_tokens` pattern or new table
   via **authored** migration if needed); send email via `sendEmailBestEffort`
2. Page `/signin/reset` (or query on `/signin`) — set new password
3. `POST /api/auth/password-reset/confirm` — `{ token, password }` → `setAccountPassword` → mint session
4. Add routes to `PUBLIC_PATHS` + `CLIENT_PUBLIC_PATHS`
5. Settings → Security: “Change password” for logged-in account (if missing)

## 2.2 Rate-limit remaining auth surfaces

Wire `checkRateLimitAsync` on:

- `POST /api/auth/account/signin`
- `POST /api/auth/invitation/accept`
- `GET /api/auth/email-login/verify`, `GET /api/auth/verify-email`
- SSO start/callback (reasonable limits)
- Passkey begin/finish (abuse protection)

## 2.3 Public path gaps

In `src/proxy.ts` **and** `AuthContext.tsx`:

- `/offline`
- `/share/photos/` (page)
- `/api/photos/share-packs/[token]` GET + zip GET (token capability — keep POST gated)

**Exit criteria:**

- [ ] Forgot-password request never enumerates emails
- [ ] Confirm sets password + cookie
- [ ] Anon share-pack GET not edge-redirected to `/signin`
- [ ] `.env.example` unchanged unless new secrets (none expected for reset)

---

# Wave 3 — Unified SMB login UX  [`unified-signin-page`, `signup-password-default`, `login-display-branding`, `session-device-kind`]

## 3.1 Rebuild `/signin`

Replace staff-picker-first UI in `src/app/signin/page.tsx` with:

1. Cycle Forge branding + optional workspace eyebrow (from slug header or public org meta endpoint
   that returns **name only** when slug known — never staff list)
2. Email + password → `POST /api/auth/account/signin`
3. Remember this device → `deviceKind: 'personal'` (default checked)
4. Forgot password → reset flow
5. Email me a sign-in link → existing magic-link API
6. Passkey (optional, if supported)
7. Error banners for `?sso_error=` / `?login_error=` / `?verify_error=`
8. Collapsed: **Signing in on a shared station?** → fetch staff-picker + existing PIN components
   (only if workspace resolved; else show “Open your workspace URL”)
9. Links to `/signup`

Redirect `src/app/account/signin/page.tsx` → `/signin` (preserve query string).
`src/app/m/(shell)/signin/page.tsx` continues to re-export `/signin` (or same UX).

**Do not** call `GET /api/auth/staff-picker` on initial page load.

## 3.2 Signup → password

- UI: replace PIN fields with password + confirm; label “Workspace name” (not Company) per branding spec
- API: hash password onto `accounts`; set owner staff `auth_method = 'password'`; may keep optional
  station PIN setup as post-onboarding — owner must not be PIN-only
- Update `SignupSchema` Zod accordingly

## 3.3 Last-workspace cookie

On successful account signin: set `cf_last_workspace={slug}` (non-httpOnly, long-lived, `SameSite=Lax`).
On apex `/signin`, if present, show “Continue to {slug}” deep link helper (optional polish).

## 3.4 Session device kinds

- Account login default: `deviceKind: 'personal'` (already in account signin route — verify)
- Station PIN path: `deviceKind: 'station'`
- Document Remember me → personal/extended in Security settings if policy knobs exist

**Exit criteria:**

- [ ] Cold load `/signin` network tab: no staff-picker
- [ ] Email login works; station mode still works on subdomain
- [ ] New signup creates password account + `auth_method=password` for owner

---

# Wave 4 — Cookie + constant rename  [`dogfood-naming-burndown` wave-1, `session-device-kind`]

## 4.1 Session cookie dual-read

In `src/lib/auth/session.ts`:

- `SESSION_COOKIE_NAME = 'cf_sid'`
- `LEGACY_SESSION_COOKIE_NAME = 'usav_sid'`
- Readers: prefer `cf_sid`, fall back to `usav_sid`
- Writers (signin/signup/session heartbeat/switch): set `cf_sid`; clear `usav_sid` (`Max-Age=0`)
- Optional 7-day dual-write behind env `AUTH_DUAL_WRITE_LEGACY_SID=true` — default **off** after
  dual-read works (prefer clear-legacy-on-touch)

Sync **inline** name in `src/proxy.ts` to check **either** cookie during transition
(presence of `cf_sid` OR `usav_sid`).

Rename:

- `PASSKEY_CHALLENGE_COOKIE` → `cf_wac`
- `ACCOUNT_PASSKEY_CHALLENGE_COOKIE` → `cf_acct_wac`

Update e2e: `scripts/e2e-receiving-workflow-views.mjs`, any Playwright storage that hardcodes
`usav_sid`.

## 4.2 Symbol rename (mechanical, careful)

- In `src/lib/tenancy/constants.ts`: export `DOGFOOD_ORG_ID` as primary; keep
  `USAV_ORG_ID = DOGFOOD_ORG_ID` **deprecated alias** for one wave so eslint burn-down can proceed
  file-by-file
- Prefer new code importing `DOGFOOD_ORG_ID` only for explicit dogfood exemptions

**Do not** rename migration files or DB seed values.

**Exit criteria:**

- [ ] Fresh signin sets `cf_sid`
- [ ] Old `usav_sid` still authenticates once, then migrates
- [ ] Proxy allows either cookie during transition

---

# Wave 5 — Identity providers  [`platform-social-login`, `enterprise-sso-ui` subset]

## 5.1 Platform Google (then Microsoft)

**HUMAN GATE:** human must create Google Cloud OAuth client and paste Client ID/Secret into Vercel /
local `.env`. You stub:

- `.env.example`: `GOOGLE_OAUTH_CLIENT_ID=`, `GOOGLE_OAUTH_CLIENT_SECRET=`,
  `GOOGLE_OAUTH_REDIRECT_URI=` (and Microsoft equivalents when built)
- `docs/ENV-VARS.md` entries

Implement:

- `GET /api/auth/oauth/google/start` — PKCE or state+nonce; encode workspace slug in state
- `GET /api/auth/oauth/google/callback` — exchange code; read `sub`+email; 
  `getAccountIdByIdentity('google', sub)` / create+link via `linkAccountIdentity`;
  resolve membership (picker if >1); `createSession`; set `cf_sid`
- Buttons on `/signin`: Continue with Google
- Public path allowlist for oauth routes (under `/api/auth/` already public — OK)
- Audit `auth_events` / `audit` with provider detail
- Rate-limit start+callback

**Do not** reuse Drive scopes or Drive client credentials.

Microsoft: same pattern after Google works (`provider: 'microsoft'`).

## 5.2 Enterprise SSO on login page

- When workspace slug known + org has active `organization_sso_providers` row + `hasFeature(sso)`:
  show button using `button_label`
- Display `sso_error` query codes as human text
- Admin CRUD UI for providers can be Wave 5b — if time-boxed, ship read/start button first and
  leave CRUD as HUMAN GATE / follow-up with DB-seed docs

**Exit criteria:**

- [ ] Google happy path works in local when env set (or clearly gated)
- [ ] No coupling to `integrations/google-drive` OAuth
- [ ] SSO button appears only when entitled + configured

---

# Wave 6 — Auth policies + invite consolidate + magic link  [`wire-org-auth-policies`, `magic-link-account-based`, `signup-password-default` residual]

## 6.1 Enforce org settings (`src/lib/tenancy/settings.ts`)

| Flag | Behavior |
|---|---|
| `emailFirstSignin` | `/signin` hides station mode unless explicitly opened (default UX already email-first — use flag to **force** hide station) |
| `requirePasskeyForNewStaff` | Block PIN enroll / invite accept completion until account passkey registered |
| `maxConcurrentSessions` | In `createSession`, if >0, revoke oldest sessions for staff beyond limit |

## 6.2 Magic link account-based

Rewrite `email-login/request` (+ verify as needed):

- Resolve email via `account_emails` → `accounts` → memberships
- If multiple orgs: issue token bound to account; verify presents org picker or uses state
- Stop `SELECT … FROM staff WHERE email … LIMIT 1`
- Errors redirect to `/signin?login_error=`

## 6.3 Invite consolidation

Pick one (prefer A unless human says otherwise):

- **A (recommended):** StaffTable “Invite” uses identity invitations only (`/api/org/invitations`).
  Soft-deprecate `/api/admin/staff/invite` + `/m/enroll` in UI (leave API with warning log).
- **B:** On PIN enroll success, also create `accounts` + `memberships` + link `staff.account_id`.

Default new admin invites → password path; floor roles may still set `auth_method=pin` after join.

**Exit criteria:**

- [ ] Magic link works for account without `staff.email`
- [ ] Admins aren’t pushed to PIN-only enroll for normal invites
- [ ] `maxConcurrentSessions` tested with a unit test (mocked deps)

---

# Wave 7 — Fail-closed USAV fallback burn-down  [`usav-fallback-burndown`]

Systematic burn-down (use existing guards as checklist):

1. Run `node scripts/usav-fallback-guard.mjs` — capture baseline
2. For each allowlisted API route: replace `ctx.organizationId ?? USAV_ORG_ID` with
   `if (!ctx.organizationId) return NextResponse.json({ error: 'NO_ORG' }, { status: 401 })`
   (or throw in domain layer)
3. Remove file from eslint allowlist + guard allowlist when clean
4. Priority order: receiving-entry, receiving-logs, repair/*, zoho receive/ingest, locations,
   import-orders, post-multi-sn, then domain libs (state-machines, warranty, ebay browse, sourcing)

Rename `transitionalUsavOrgId` → `transitionalDogfoodOrgId` then delete callers where possible.
Leave cron `includeUsavTransitional` behind a comment + TODO if vault migration not ready —
do not silently expand USAV inclusion.

**HUMAN GATE before:** applying `2026-07-09a_drop_usav_fallback_org_defaults.sql`
(confirm webhook org-resolution already live).

**Exit criteria:**

- [ ] Guard script green or allowlist strictly smaller
- [ ] Touched routes fail closed
- [ ] No new allowlist entries

---

# Wave 8 — Naming wave-2 + RLS prep  [`dogfood-naming-burndown` wave-2, `rls-phase-e` prep only]

## 8.1 Client storage / events (mechanical)

Follow `search-recents.ts` migrate-on-read pattern:

- `usav_staff_colors_v1` → `cf_staff_colors_v1`
- Other `usav.*` keys listed in the plan (print, appearance, workstation, quickAccess, queues, …)
- `USAV_REFRESH_DATA` / `usav-refresh-data` → `cf-refresh-data` (update ~65 call sites)
- Observability strings `usav-orders` → `cycleforge-app` where safe

Update e2e asserts that reference old keys.

## 8.2 RLS Phase E — STOP

**HUMAN GATE:** Do **not** create `app_tenant` role or switch `DATABASE_URL` without human
approval. You may:

- Draft migration SQL (unapplied) for role + grants
- Document `TENANT_APP_DATABASE_URL` in ENV-VARS
- Expand cross-org harness tests that will pass once Phase E is live
- Design per-org `sync_cursors` composite key migration (author only)

---

# Verification matrix (run what you can locally)

| Test | Expected |
|---|---|
| `GET /api/auth/staff-picker` no slug | `{ staff: [] }` |
| Cross-org PIN signin | Rejected |
| `/signin` cold load | No staff-picker fetch |
| Account email login | `cf_sid` set; app loads |
| Legacy `usav_sid` once | Accepted → re-issued as `cf_sid` |
| Password reset | Email → confirm → signed in |
| Rate-limit burst | 429 |
| Share pack anon GET | 200 |
| Signup | Password owner; `auth_method=password` |
| Google OAuth | Works when env present; otherwise documented GATE |
| Missing orgId on burned-down route | 401 — never stamps dogfood org |

Commands (adjust to repo scripts):

```bash
npx tsc --noEmit -p tsconfig.json   # or project’s typecheck script
node scripts/usav-fallback-guard.mjs
node --test src/lib/tenancy/*.test.ts src/lib/auth/*.test.ts src/lib/identity/*.test.ts
```

---

# Out of scope (unless human expands)

- SAML implementation
- JWKS full id_token signature verification (note as follow-up)
- SCIM
- Session collapse cutover (`active_org_id` switch without re-mint) — groundwork exists; don’t cut over
  unless wave finishes early **and** human approves
- Account merge admin UI
- Renaming live tenant `USAV Solutions` / slug `usav` in DB
- Marketing site / DNS wildcard creation (document only)
- Applying migrations to production Neon
- Electron appId change

---

# HUMAN GATES (hard stops)

1. **Google / Microsoft OAuth client creation** in cloud consoles + redirect URI allowlist
2. **Production env audit:** `AUTH_PINLESS_SIGNIN` off; `AUTH_V2_ENABLED` on; Upstash Redis set
3. **DNS wildcard** `*.app.cycleforge.ai` + dogfood cutover to `usav.app.…`
4. **Apply** `2026-07-09a_drop_usav_fallback_org_defaults.sql`
5. **RLS Phase E** pool role switch
6. **Any commit/push** — only if human asks

---

# Done means

- [ ] Apex does not leak org #1 staff
- [ ] `/signin` is email-first SMB login with station mode optional
- [ ] Password reset works
- [ ] Auth routes rate-limited
- [ ] Cookies are `cf_*` with legacy dual-read
- [ ] Google button present (env-gated if needed)
- [ ] `?? USAV_ORG_ID` allowlist shrunk; critical routes fail closed
- [ ] Share packs + `/offline` public at edge
- [ ] RUN NOTES appended below with files + env + remaining gates
- [ ] No commit unless requested

---

# RUN NOTES (agent: append below this line)

## Wave 0 — Safety inventory (2026-07-11, read-only)

- `AUTH_PINLESS_SIGNIN`: read in `src/app/api/auth/staff-picker/route.ts` + `src/app/api/auth/signin/route.ts`.
  **Prod risk:** when `true`, an empty PIN signs in ANY active staff by `staffId` alone — and pre-Wave-1 this
  was *unscoped by org*, so combined with the apex→USAV default it leaked/enabled org #1 sign-in publicly.
  Wave 1 org-scopes the pinless path; the env flag must be OFF in production regardless (HUMAN GATE #2).
- `AUTH_V2_ENABLED`: read in `src/proxy.ts` (edge gate shadow/enforce switch). No change this wave.
- `resolveOrgId` local copies found in 3 routes (staff-picker, switch, pin/create) — all defaulted apex→`USAV_ORG_ID`.
  Replaced in Wave 1. `?? USAV_ORG_ID` fallbacks catalogued across ~25 route/lib files (Wave 7 burn-down list).
  `transitionalUsavOrgId` callers catalogued (session-less crons/pipelines — Wave 7 rename).
- Confirmed `verifyStaffPin(staffId, pin, orgId?)` already accepts optional org (`src/lib/auth/pin.ts:153`).
- Confirmed `setAccountPassword` exists (`src/lib/identity/accounts.ts:123`), plus `getAccountIdByIdentity`/`linkAccountIdentity`.

## Wave 1 — Stop the leak (P0) — DONE, green

- **New:** `src/lib/tenancy/resolve-org-from-request.ts` — `resolveOrgIdFromRequest(req)` + `NIL_ORG_ID`.
  Apex/unknown-slug → `NIL_ORG_ID` (fail closed). Optional `DEFAULT_TENANT_SLUG` env bridges one dogfood tenant
  onto the apex host (explicit opt-in, never a silent USAV default).
- **Edited routes** (deleted local `resolveOrgId` + `USAV_ORG_ID` import, wired shared resolver, fail-closed on NIL):
  - `staff-picker/route.ts` — apex → `{ staff: [] }`; JSDoc updated.
  - `switch/route.ts` — target org from prior session or `resolveOrgIdFromRequest`.
  - `pin/create/route.ts` — NIL → 404 `TENANT_REQUIRED`.
  - `signin/route.ts` (**critical**) — resolve org first; NIL → 404 `TENANT_REQUIRED`; pinless SELECT now
    `AND organization_id = $2`; PIN path `verifyStaffPin(staffId, pin, orgId)`; added per-IP rate limit
    (`checkRateLimitAsync`, routeKey `auth-signin`, 20 / 10min → 429).
- **Tests:** `src/lib/tenancy/resolve-org-from-request.test.ts` (apex→NIL DB-free; slug cases DB-gated) — 3 pass.
  Extended `idor-regression.test.ts`: apex staff-picker → empty; cross-org signin → 404 + no cookie — 9 pass.
- **Green:** `npx tsc --noEmit` 0 errors; eslint clean on touched files.
- **Env added:** `DEFAULT_TENANT_SLUG` (optional; blank in `.env.example` — added in Wave 2 pass).
- Remaining HUMAN GATEs unchanged.

## Wave 2 — Auth hygiene P0 — DONE, green

**2.1 Password reset (new)**
- Migration `src/lib/migrations/2026-07-11b_password_reset_tokens.sql` (UNAPPLIED) — dedicated
  `password_reset_tokens` (account-keyed, hashed, single-use). NOT reusing `email_login_tokens` (a login
  token mints a session; a reset token must not).
- Lib `src/lib/auth/password-reset.ts` — `mintPasswordResetToken` / `claimPasswordResetToken` (atomic
  single-use `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING`) / `hashResetToken` / links.
- Routes: `POST /api/auth/password-reset/request` (always `{ok:true}`, per-IP + per-email rate limited,
  never enumerates) and `POST /api/auth/password-reset/confirm` (claim → `setAccountPassword` → mint session
  when exactly 1 membership, else `needsOrgChoice`; sets `cf_/usav` session cookie via SESSION_COOKIE_NAME).
- Page `src/app/signin/reset/page.tsx` — both request (no token) + confirm (token) modes, centered form.
- Change-password: `POST /api/auth/account/change-password` (withAuth; verifies current pw when set;
  resolves account from session, never body) + card added to `SecuritySection`.
- Public paths: reset page + APIs already covered by existing `^/signin` and `^/api/auth/` PUBLIC_PATHS.

**2.2 Rate limits** — `checkRateLimitAsync` wired into: account/signin (per-IP 20 + per-email 10),
invitation/accept, email-login/verify, verify-email, sso/start, sso/callback, and the four passkey
*authenticate* begin/finish routes (plain + account). signin already got its limiter in Wave 1.

**2.3 Public path gaps** — added to `proxy.ts` PUBLIC_PATHS: `/offline`, `/share/photos/`,
`/api/photos/share-packs/[^/]+` (token GET + zip; bare-collection POST stays gated). Added `/share/photos/`
to `AuthContext` CLIENT_PUBLIC_PATHS (`/offline` was already there).

- **Tests:** `src/lib/auth/password-reset.test.ts` — hash determinism (DB-free) + single-use claim
  (round-trip ran green; table present in dev DB). 2 pass.
- **Green:** touched files typecheck + lint clean. (One pre-existing tsc error in the UNTRACKED
  `src/lib/studio/template-package.ts` from separate template-platform WIP — not this run's code.)
- **Env added:** `DEFAULT_TENANT_SLUG`, documented `AUTH_PINLESS_SIGNIN`/`AUTH_V2_ENABLED`/
  `AUTH_DUAL_WRITE_LEGACY_SID` in `docs/ENV-VARS.md`.
  **HUMAN TODO:** the `.env.example` edit is blocked by a repo hook — manually add a blank
  `DEFAULT_TENANT_SLUG=` (+ `AUTH_DUAL_WRITE_LEGACY_SID=`) line under the `AUTH_PINLESS_SIGNIN=` entry.

## Wave 3 — Unified SMB login UX — DONE, green

- **New:** `GET /api/auth/workspace` (public) — resolves tenant via `resolveOrgIdFromRequest` and returns
  **name + slug only** (never staff). Apex/unknown → `{ resolved: false }`.
- **Rebuilt `src/app/signin/page.tsx`** email-first: Cycle Forge branding + workspace eyebrow (from
  `/api/auth/workspace`); email+password → `/api/auth/account/signin` (+ multi-org workspace picker);
  "Remember this device" default-checked (personal); Forgot → `/signin/reset`; magic link →
  `/api/auth/email-login/request`; account passkey; SSO/login/verify error banners; collapsed
  "Signing in on a shared station?" that mounts `StaffPickerList`+`StaffPinPad`/`SetPinPad` ONLY when
  opened AND a workspace is resolved (apex shows the workspace-URL hint instead); link to `/signup`.
  **Does not fetch `/api/auth/staff-picker` on load** (only when station mode is expanded).
- `src/app/account/signin/page.tsx` → query-preserving redirect to `/signin` (Suspense-wrapped).
  `src/app/m/(shell)/signin/page.tsx` re-exports `/signin` (inherits new UX). API routes unchanged.
- **3.2 Signup → password:** `SignupSchema` now requires `password` (min 8), `pin` optional; owner staff
  `auth_method='password'`, `pin_hash` null unless a PIN was supplied; account created with the password
  (and back-fills password on a pre-existing password-less account). `src/app/signup/page.tsx` swapped PIN
  fields → password + confirm; "Workspace name" label already in place.
- **3.3 Last-workspace cookie:** account/signin sets `cf_last_workspace={slug}` (non-httpOnly, Lax, 180d).
- **3.4 Device kinds:** account/passkey login = `personal`; station PIN path = `personal|station` via the
  Remember toggle. Verified.
- **Green:** touched files typecheck + lint clean (project-wide 0 errors excl. the untracked
  template-package.ts WIP).

## Wave 4 — Cookie + constant rename — DONE, green

**4.1 Session cookie dual-read**
- `src/lib/auth/session.ts`: `SESSION_COOKIE_NAME='cf_sid'`, `LEGACY_SESSION_COOKIE_NAME='usav_sid'`, new
  `readSessionCookie(store)` → `{ sid, legacy }` and `readSessionSid(store)` (prefer cf_sid, fall back usav_sid).
- **All 17 readers** converted to `readSessionSid(...)` (pages `01`/`414`, sku-stock, locations x3, photos x3,
  auth switch/switch-org/signout/session, withAuth, current-user, dynamic-route-guard).
- **Writers** set `cf_sid` (unchanged constant) and now clear `usav_sid` (Max-Age=0): signin, account/signin,
  switch, switch-org, signout. **Migrate-on-touch** in the `/api/auth/session` heartbeat: a request presenting
  only `usav_sid` re-issues `cf_sid` and clears the legacy cookie exactly once (`readSessionCookie().legacy`).
- `src/proxy.ts` (Edge): inlined `SESSION_COOKIE_NAME='cf_sid'` + `LEGACY_SESSION_COOKIE_NAME='usav_sid'`;
  `hasCookie` accepts EITHER during transition. Kept in sync with session.ts (Edge can't import it).
- Passkey challenge cookies renamed (ephemeral, no dual-read): `PASSKEY_CHALLENGE_COOKIE='cf_wac'`,
  `ACCOUNT_PASSKEY_CHALLENGE_COOKIE='cf_acct_wac'`.
- e2e `scripts/e2e-receiving-workflow-views.mjs` COOKIE_NAME → `cf_sid`. Doc comments updated across auth routes.
- **Note:** the optional 7-day dual-WRITE (`AUTH_DUAL_WRITE_LEGACY_SID`) was intentionally NOT wired — the plan
  says default off and prefers clear-legacy-on-touch, which is what shipped. Env documented for future use.

**4.2 Constant rename** — `src/lib/tenancy/constants.ts`: `DOGFOOD_ORG_ID` is now primary (UUID `…0001`
unchanged); `USAV_ORG_ID = DOGFOOD_ORG_ID` kept as a `@deprecated` alias for the Wave-7 burn-down. DB
seed/slug/enum untouched.

- **Tests:** `src/lib/auth/session-cookie.test.ts` (5, DB-free dual-read). Full auth+tenancy sweep: 19 pass.
- **Green:** `npx tsc --noEmit` 0 errors (excl. untracked template-package.ts); eslint clean on all touched files.

## Wave 5 — Identity providers — DONE (code complete; Google creds are a HUMAN GATE)

**5.1 Platform Google (+ Microsoft-ready)**
- **New lib** `src/lib/auth/platform-oauth.ts` — provider config gated on env (`GOOGLE_OAUTH_*`,
  `MICROSOFT_OAUTH_*`), `openid email profile` scope ONLY (never Drive/Gmail), CSRF state cookie
  (`cf_oauth`, httpOnly, 10-min) encode/decode. Reuses generic OIDC helpers from `sso-oidc.ts`
  (`generatePkce`/`exchangeCode`/`decodeIdTokenClaimsUnsafe`/`fetchUserInfo`) — NOT the Drive client.
- **Routes** (dynamic `[provider]` → google | microsoft, both public under `/api/auth/`):
  - `GET /api/auth/oauth/[provider]/start` — PKCE + state+nonce cookie, `prompt=select_account`, rate-limited.
  - `GET /api/auth/oauth/[provider]/callback` — verifies state (double-submit) + nonce, exchanges code,
    `getAccountIdByIdentity`/`getAccountByEmail`→`linkAccountIdentity`/`createAccount`, resolves membership
    (prefers the slug the login started from), `createSession` → `cf_sid` (+ clears legacy, sets
    `cf_last_workspace`), rate-limited. Failures redirect `/signin?login_error=…`.
- **Buttons** on `/signin`: `GET /api/auth/workspace` now returns `platformProviders` (host-independent) so
  "Continue with Google/Microsoft" render only when configured.
- **JWKS note (follow-up, out of scope):** id_token claims are decoded unsafely; the code is exchanged over
  TLS with our client secret so the token is provider-authenticated, but full JWKS signature verification is
  deferred (matches the existing enterprise SSO posture).

**5.2 Enterprise SSO on login** — `/api/auth/workspace` also returns `sso: { label, slug }` when the workspace
is resolved, has an active `organization_sso_providers` row, AND `hasFeature(org,'sso')`. The button posts to
the existing `GET /api/auth/sso/start?slug=…`. Admin CRUD UI for providers is deferred (Wave 5b / HUMAN GATE,
DB-seed for now).

- **HUMAN GATE #1:** create the Google Cloud OAuth 2.0 Web client (+ Microsoft Entra app later) and set
  `GOOGLE_OAUTH_CLIENT_ID/SECRET` (+ `MICROSOFT_OAUTH_*`) in Vercel/.env. Redirect URI (if not set) is
  `{origin}/api/auth/oauth/google/callback`. Until set, the button is hidden and `/start` fails closed.
  **HUMAN TODO:** add the blank `GOOGLE_OAUTH_*` / `MICROSOFT_OAUTH_*` lines to `.env.example` (hook-blocked);
  documented in `docs/ENV-VARS.md`.
- **Tests:** `src/lib/auth/platform-oauth.test.ts` (3, DB-free: state round-trip, tamper rejection, env-gated
  config + scope + derived redirect). Pass.
- **Green:** my files typecheck + lint clean. (Two pre-existing tsc errors remain in UNTRACKED template-platform
  WIP: `src/lib/studio/template-package.ts`, `src/lib/studio/ai-template-vocab.ts` — not this run's code.)

## Wave 6 — Auth policies + magic link + invite consolidation — DONE, green

**6.1 Enforce org settings** (`src/lib/tenancy/settings.ts` flags)
- `maxConcurrentSessions`: new Deps-injected `src/lib/auth/session-concurrency.ts`
  (`enforceMaxConcurrentSessions` — keep-newest, revoke-oldest), wired into `createSession` (loads the org
  setting; best-effort, never breaks sign-in). Unit-tested DB-free (3 cases).
- `emailFirstSignin`: `/api/auth/workspace` returns it; `/signin` hides the shared-station PIN block entirely
  when set.
- `requirePasskeyForNewStaff`: self-serve `POST /api/auth/pin/create` now 403 `PASSKEY_REQUIRED` when the org
  requires passkeys (a PIN-only account can't slip past the policy).

**6.2 Magic link account-based** — `POST /api/auth/email-login/request` rewritten to resolve
`getAccountByEmail` → `listMembershipsForAccount` (prefers the request's tenant slug, else first membership)
instead of `SELECT … FROM staff WHERE email LIMIT 1`. Still constant `{ok:true}` (no enumeration).
`email-login/verify` now redirects failures to `/signin?login_error=` (was `/`).

**6.3 Invite consolidation (option A)** — `StaffTable` "Invite" now POSTs the identity flow
`/api/org/invitations` (`{email, role}` → email link → account + membership + password path); email is now
required. Legacy `POST /api/admin/staff/invite` (PIN enrollment) kept for back-compat but soft-deprecated with
a `console.warn` on every call. Both routes share `admin.manage_staff`, so the switch is permission-safe.

- **Note (parallel codemod):** a concurrent USAV→DOGFOOD codemod completed the Wave-4.2/Wave-7 symbol rename —
  `USAV_ORG_ID` is gone; `constants.ts` now exports only `DOGFOOD_ORG_ID` (the alias I'd added was removed).
  End-state is consistent; the fail-closed replacement of `?? DOGFOOD_ORG_ID` fallbacks is still Wave 7's job.
- **Tests:** `session-concurrency.test.ts` (3) + full auth/tenancy/identity sweep: 126 pass / 0 fail / 7 skip.
- **Green:** touched files typecheck + lint clean.

## Wave 7 — Fail-closed fallback burn-down — DONE, green

- **Baseline:** `node scripts/dogfood-fallback-guard.mjs` → 28 allowlisted offenders. (Guard was renamed by the
  parallel codemod: `usav-fallback-guard.mjs` now re-exports `dogfood-fallback-guard.mjs`; TOKENS cover both
  USAV + DOGFOOD spellings.)
- **20 interactive `withAuth` routes** dropped `ctx.organizationId ?? DOGFOOD_ORG_ID`. Key insight: on a
  non-anonymous `withAuth` route `ctx.organizationId` is a **non-null `string`** (`AuthContext`), so the `??`
  branch was unreachable dead code AND withAuth already 401s before the handler — replacing it with plain
  `ctx.organizationId` IS fail-closed. Routes: receiving-entry, receiving-logs, post-multi-sn, import-orders,
  sync-sheets, ecwid/sync-exception-tracking, repair/{submit,actions,actions/[id]},
  repair-service/{route,repaired,pickup}, zoho/{orders/ingest,purchase-orders/receive},
  admin/po-gmail/create-zoho-draft, receiving/po/attach-box, receiving/zendesk-claim/link.
- **2 non-withAuth routes** made explicitly fail-closed: `admin/po-gmail/triage/[id]/extract` (requireRoutePerm
  → `if (!organizationId) 401`); `repair-service` CRUD list/search/update → `throw ApiError.unauthorized(...)`
  (added `ApiError.unauthorized` = 401).
- **2 routes kept the fallback deliberately + re-allowlisted:** `locations/[barcode]/route` + `/swap` — a
  legitimate anonymous legacy-QR path where the dogfood fallback scopes only the idempotency CACHE key
  namespace (the data write stays unscoped for anon), NOT tenant data.
- **Allowlist shrunk 28 → 10** (guard GREEN). Remaining 10 = genuinely session-less crons /
  `transitionalDogfoodOrgId()` service-org bridge / cron-or-dogfood auth gate / 2 comment-only mentions /
  the 2 locations idempotency-namespace cases. **No new scoping fallbacks.**
- `transitionalUsavOrgId` → `transitionalDogfoodOrgId` rename: already completed by the parallel codemod
  (only immutable migration + release-notes retain the old spelling).
- **HUMAN GATE #4 (unchanged):** do NOT apply `2026-07-09a_drop_usav_fallback_org_defaults.sql` until webhook
  org-resolution is confirmed live. Not applied.
- **Green:** full `npx tsc --noEmit` = **0 errors** project-wide (the earlier transient errors in untracked
  template-platform files + the parallel receiving-cutover file were resolved by that parallel session).
  eslint on touched routes = 0 errors (6 pre-existing warnings, none from this run). Guard green (allowlist=10).

## Wave 8 — Naming wave-2 + RLS prep — DONE (8.1 by codemod; 8.2 authored, HUMAN-GATED)

**8.1 Client storage / events** — already completed by the parallel USAV→CF codemod (verified):
- All current localStorage keys are `cf_*` / `cf.*` (`cf_staff_colors_v1`, `cf.appearance`, `cf.quickAccess`,
  `cf.silentPrint`, `cf_search_recents_v1`, …); the `usav.*` names survive only as `LEGACY_*` constants driving
  migrate-on-read (the `search-recents.ts` pattern).
- `usav-refresh-data` / `USAV_REFRESH_DATA` → 0 occurrences (fully renamed to `cf-refresh-data`).
- `usav-orders` remains only in a proxy.ts comment about the Vercel preview hostname (a real deploy host, not an
  observability string) — correctly left. No e2e asserts reference old keys.

**8.2 RLS Phase E — STOP respected** (no `app_tenant` role created, no `DATABASE_URL` switch):
- The role migration already exists as `src/lib/migrations/2026-06-21_app_tenant_role.sql.template` (gated,
  unapplied) + `2026-06-28_app_tenant_grants_reaffirm.sql`; `TENANT_APP_DATABASE_URL` is already wired in
  `src/lib/db.ts` and the cross-org harness/isolation test.
- **Documented** `TENANT_APP_DATABASE_URL` in `docs/ENV-VARS.md` (Database section) with the Phase-E flip note.
- **Authored** `src/lib/migrations/2026-07-11c_sync_cursors_per_org_key.sql` (UNAPPLIED) — re-keys `sync_cursors`
  from the global `resource` PK to the per-org composite `(organization_id, resource)` so tenants don't collide
  on a shared resource cursor. Header documents the required matching `sync-cursors.ts` caller change
  (`getSyncCursor(resource, orgId)` / `updateSyncCursor(..., orgId)` with `ON CONFLICT (organization_id,
  resource)`) to ship in the same PR that applies it.
- Cross-org harness test expansion for per-org `sync_cursors` is left as a follow-up tied to applying the
  composite-key migration (would fail against today's global PK; the existing RLS proofs already skip without
  `TENANT_APP_DATABASE_URL`).

- **HUMAN GATE #5 (unchanged):** create `app_tenant` role + switch the pool to `TENANT_APP_DATABASE_URL` — human only.
- **Green:** guard OK (allowlist=10); `npx tsc --noEmit` = 0 errors project-wide.

---

## Run summary — all waves complete

| Wave | Status |
|---|---|
| 0 Safety inventory | ✅ done |
| 1 Stop the leak (P0) | ✅ done, green (12 tests) |
| 2 Auth hygiene P0 (reset, rate limits, public paths) | ✅ done, green |
| 3 Unified SMB login UX | ✅ done, green |
| 4 Cookie + constant rename (cf_sid dual-read) | ✅ done, green (5 tests) |
| 5 Identity providers (Google/MS + SSO button) | ✅ code complete (HUMAN GATE #1: OAuth creds) |
| 6 Auth policies + magic link + invite consolidation | ✅ done, green |
| 7 Fail-closed burn-down | ✅ done (allowlist 28→10, guard green) |
| 8 Naming wave-2 + RLS prep | ✅ 8.1 done (codemod); 8.2 authored (HUMAN GATE #5) |

**Final state:** `npx tsc --noEmit` = 0 errors project-wide · `dogfood-fallback-guard` green (allowlist=10) ·
auth/tenancy/identity test sweep 126 pass / 0 fail. No commits made (none requested).

**Remaining HUMAN GATES:** #1 Google/MS OAuth client creation + env · #2 prod env audit
(`AUTH_PINLESS_SIGNIN` off, `AUTH_V2_ENABLED` on, Upstash set) · #3 DNS wildcard + dogfood cutover ·
#4 apply `2026-07-09a_drop_usav_fallback_org_defaults.sql` · #5 RLS Phase E role + pool switch · commit/push.

**HUMAN TODO (hook-blocked `.env.example`):** add blank lines for `DEFAULT_TENANT_SLUG`,
`AUTH_DUAL_WRITE_LEGACY_SID`, `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`, `MICROSOFT_OAUTH_*`,
`TENANT_APP_DATABASE_URL` (all documented in `docs/ENV-VARS.md`).

**Authored-but-UNAPPLIED migrations:** `2026-07-11b_password_reset_tokens.sql`,
`2026-07-11c_sync_cursors_per_org_key.sql`.
