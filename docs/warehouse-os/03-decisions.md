# 03 — Decisions that block coding

Ten questions. Each one changes what gets built, so answering them *after* starting
means rework.

**Five are answered (2026-08-22) — marked ✅ RULED.** The ruling is the law now; the
recommendation below each is kept only as the reasoning that led there.

This is the **dogfood tenant**. Optimize for iteration speed over ceremony.

---

## D1 · Routing model — how does a tile exist without a route?

**The finding:** the always-mounted shell is already solved. The only thing that
unmounts is one `children` slot. But two live surfaces cannot both be "the route."

| Option | Verdict |
|---|---|
| **Parallel routes** (`@slot` dirs) | ❌ **Wrong tool.** Slot state is not recoverable from a URL or a refresh — Next falls back to `default.tsx` for unmatched slots on a hard load. That kills saved bento layouts and "resume my workspace" outright. |
| **Single client catch-all** | ✅ **Cheaper than it looks.** Only **15 of 142** pages fetch from the DB in a server component, and 13 are admin/settings. 8 export metadata, 0 use `generateStaticParams`, 48 of 90 server pages are ≤25 LOC. |
| **Canvas inside the current route** | Least disruptive, but the URL keeps naming one destination — a half-step that still needs D2 answered. |

> **Recommend:** single client catch-all for the workspace, with an explicit
> **exception list of routes that stay real**: the GS1/label resolvers
> (`/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`), auth, kiosk, and `/m/**`.

---

## D2 · The URL contract — what does the address bar mean now?

**The finding:** URL-as-state is **423 `searchParams.get()` call sites across 175
files reading 163 distinct param names**, 295 `router.push/replace` calls, and
127 `pathname.startsWith` branches — *including the table's own mode*. Of 183 e2e
specs, **341 `page.goto()` calls, 173 with query params, and 44 assert on the URL.**

Only 26 route entries have a declared param-ownership spec today.

> **Recommend:** **the URL names the focused tile only.** Deep links keep working,
> printed labels keep resolving, and `RouteParamsSpec` becomes `tab.params` with the
> active tab projecting to the address bar. Removing workspace state from the URL
> entirely invalidates every `saved_views` row, since `filters` is literally
> `{query: '<urlencoded param subset>'}`.
>
> **Consequence to budget:** the ~140 unregistered route families must get param specs
> before per-tab state works.

---

## D3 · Permissions — what replaces `requirePermission()` when a surface is not a page? ✅ RULED

> ### Ruling: nothing. Do not build per-tile permission architecture.
> Dogfood tenant, one org, trusted operators. The 969 API routes stay gated by
> `withAuth` — that is the real boundary and it is untouched by any of this. A tile
> registry carries **no** permission field until a second tenant exists. Revisit
> before the first outside tenant, not before.

**The finding — this is the sharpest one.** Auth is pathname-shaped in **six**
independent places, and **24 pages call a *server* `requirePermission()` that
`redirect()`s**. A tile mounted from a client registry never navigates, so nothing
server-side runs. The trial gate, the activation gate and the 402/PAYMENT_REQUIRED path
lose their page-level chokepoint entirely.

The 969 API routes stay gated by `withAuth`, so this is a **UI-exposure downgrade, not
an open write path** — but the `audit-route-auth` script that proved every route was
gated is among the deleted gates.

> **Recommend:** every tab/tool/session descriptor **carries its permission, derived
> from `ROUTE_PERMISSIONS`** (do not re-author it — it is load-bearing for authz, not
> chrome). The check runs **at mount**, not only at launcher-render, and a workspace
> restored from `staff_preferences` after a role change **re-checks before mounting**.
> Keep `getSidebarRouteKey`'s permission consumer; retire only its chrome consumers.

---

## D4 · Split-screen geometry — two tiles do not fit the shipped viewport

**The finding:** current floors are `MIN_WORK_SURFACE_PX = 784` and
`STATION_PUSH_CENTER_FLOOR_PX = 720`, with spine 240 and right rail 420. Two tiles at
the 784 floor is **1,568px before any rail**; with the spine, 1,808px.

**Playwright runs at 1440×900. The Electron window opens at 1600×1000.** On both the
tested and the shipped desktop viewport, two tiles cannot render at their declared
minimum.

Pick one — every downstream geometry decision depends on it:
- **(a)** Drop the 784 floor (a product statement about how narrow a work surface may be).
- **(b)** Gate split-screen to ≥1920 and ship single-tile below it.
- **(c)** Tiles **overlap** rather than tile below a threshold.

> **Recommend (b) + (a) together:** keep 784 as the *session* floor, introduce a
> smaller `MIN_TABLE_TILE_PX` (~520 — a table degrades gracefully, a scan bench does
> not), and gate the 2-up session+session case to ≥1920.

---

## D5 · Hover-to-reveal rails — the floor hardware says no

**The finding, four independent verifications:**
1. **Warehouse tablets get the desktop shell.** `proxy.ts` deliberately excludes
   iPad/Android tablets from the mobile rewrite — and iPadOS reports a macOS UA. On
   `(hover: none) and (pointer: coarse)`, **a hover-only rail is simply unreachable.**
2. **No touch fallback exists to inherit** — `isTouchPrimary` has 3 references, all
   inside one provider; nothing branches on it.
3. **The hover engine is tuned against this** — `useHoverSurface` uses `OPEN_MS: 0`
   ("the bench cannot afford hover-intent latency") on a one-at-a-time registry that
   *evicts* whatever is open. A 0ms screen-edge rail opens on any pointer transit and
   evicts the menu the operator is mid-interaction with.
4. **Scanning has no pointer at all** — the wedge listener never reads or writes focus.

The prior slide-over rail was deleted for exactly this: "on a bench it landed on the
rail the operator was working from."

> **Recommend:** **click-toggle + hotkey + auto-hide-on-focus-elsewhere.** Keep the
> *feeling* of the ask (maximum screen real estate, rails out of the way) and drop the
> *mechanism*. Offer hover-reveal as a per-staff opt-in for mouse-primary desks only.
> This is the one place where the brain dump's mechanism fights the hardware.

---

## D6 · Tab residency — do open tabs stay mounted?

**The finding:** splitting the sidebar panels into per-route dynamic chunks was
recorded as "**the single largest lever (-1 MB gz on /signin)**." Per-route initial JS
is still ~971 KB gz for `/unbox` and 1,030 KB for `/test`. Separately, react-query
`gcTime` was cut from 30 min to 5 min with the comment "*was 30 min, causing massive
memory retention*" — against 373 files using react-query and 15 holding Ably channels.

Four live tabs means four feature graphs resident — exactly the condition that lever
removed.

> **Recommend: tabs suspend from version one.** Unmount the subtree, preserve
> serialized state, restore on focus. **Retrofitting suspension after tabs ship means
> rewriting every session's state ownership.** Keep at most 1–2 tiles hot.

---

## D7 · Scan ownership — which tile owns the next scan? ✅ RULED

> ### Ruling: scan ownership is not a tile problem. It is a session-kind problem.
> A session is one of two kinds:
>
> ```
> Session
>   kind: 'scan'  → carries a scanType.  EXACTLY ONE scan session armed at a time.
>   kind: 'task'  → no scanType.         N task sessions may be open at once.
> ```
>
> The global wedge listener routes every scan to **the one armed scan session**.
> Tiles never compete for a scan, so there is no `scanFocusTileId`, no per-tile
> focus model, and no mount-order race — arming a second scan session disarms the
> first, by construction.
>
> This also collapses the seven competing "what kind of surface is this"
> vocabularies into one discriminator: **scan or task**, then the type within it.

**The finding:** the wedge cascade's claim protocol is a `window` CustomEvent where
"claimed" means `event.defaultPrevented`. There are 2 listeners today and at most one
station mounted, so the winner is **deterministic by accident.** With N session tiles,
every tile hears every scan and React mount order decides.

Worse, the cascade's fallback is `router.push` — an unrecognised barcode would
**navigate the whole window and destroy the layout.**

> **Recommend:** the shell owns a **`scanFocusTileId`**, set by click/hotkey and shown
> in the header. The CustomEvent claim path becomes the legacy fallback. The
> `router.push` fallback becomes "open a tile" or "show a disambiguation" — never a
> navigation. **This must land before a second session tile can ever be mounted.**

---

## D8 · Session boundaries are payroll events ✅ RULED

> ### Ruling: sessions and sign-ins are PERSISTENT.
> No 24h absolute wall killing a mounted shell mid-shift. Station devices move to
> the `persistent` session policy (no idle timeout, long sliding window) — the
> policy already exists in `src/lib/auth/session.ts`; it just is not what stations
> use. Work sessions survive reload, device change and re-auth; they end when the
> operator ends them or they are explicitly reclaimed by lease expiry, never on a
> timer the operator cannot see.
>
> Still required: the **identity epoch** on staff switch (tear down and re-key the
> realtime client, purge the API cache). That is a correctness fix, not a timeout.

**The finding:** `shift-clock.ts` opens a `time_punches` row on authentication and
closes it on sign-out with automatic lunch deduction. Auth sessions also have hard
absolute caps — **station 24h, phone 4h** — plus mid-session 403 `STEPUP_REQUIRED` and
402 `PAYMENT_REQUIRED` interrupts, and `enforceMaxConcurrentSessions` can revoke a
staffer's oldest session when they sign in elsewhere.

A shell that stays mounted across shifts **will** hit the 24h wall with open tiles
holding unsaved drafts. Today that is benign because the next navigation redirects; in
a never-navigating shell the first symptom is API calls quietly returning 401.

> **Recommend:** name the two concepts differently in code and UI from day one —
> **auth session** (identity, payroll) vs **work session** (a unit of warehouse work).
> The shell needs an explicit **identity epoch** that, on staff switch or auth
> expiry: tears down and re-establishes the Ably client (it is created once and never
> re-keyed today), purges the service-worker API cache (nothing purges it today), and
> re-checks every mounted tile's permission.

---

## D9 · Which surfaces actually get used?

**The finding:** **123 of 142 pages have no nav entry** — reachable only by redirect,
deep link, or printed QR. Nobody currently knows which are real. Meanwhile PostHog is
configured with `capture_pageview: true`, so **detached sessions emit no analytics at
all** — usage data goes dark for exactly the surfaces being rebuilt.

> **Recommend:** capture the usage baseline **before** collapsing routes — from
> PostHog where keyed, otherwise from `audit_logs` / `ops_events` — and design explicit
> `session_open` / `tile_open` events to replace pageviews. Otherwise the "+" master
> index is built on guesswork.

---

## D10 · What enforces any of this?

**The finding:** `npm run verify` is lint + typecheck + unit. Zero `*.guard.test.ts`.
No clone detection, no dead-code check, no import boundaries, no schema-drift check.
A refactor this size **will be green** while forking a twin or naming a column the DB
does not have. `next.config.ts` also sets `typescript: { ignoreBuildErrors: true }`, so
a production build does not typecheck — CI's `tsc --noEmit` is the only typecheck.

59 surviving tests use `readFileSync` + regex against source paths and cluster exactly
where this refactor lands. **They will fail mechanically the moment files move**, and
the tempting fix is deletion — which removes the last protection against a re-forked
closer or a second scan bar.

> **Recommend:** the enforcement this refactor actually needs is **the compiler, not a
> gate.** Lean on required-props-with-no-default (`toolKey`, `sessionType`, `target`,
> `permission`) so every unmigrated call site is a **type error**, not a lint warning.
> Budget rewriting the 59 source-text tests to the new contract inside the same change.
> Do not re-add the deleted gate layer — that decision was deliberate.
