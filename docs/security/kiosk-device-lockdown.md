# Kiosk device — enrollment, auth model, and tablet lockdown (runbook)

Operational + security runbook for the customer-facing intake tablet on
**`{slug}.kiosk.app.cycleforge.ai`** (dogfood: **`https://usav.kiosk.app.cycleforge.ai`**).
Internally the app still serves path `/kiosk`; the kiosk **host** is the public
surface. Auth model owned by
[`docs/todo/foh-boh-surface-split/06-walk-in-kiosk-auth.md`](../todo/foh-boh-surface-split/06-walk-in-kiosk-auth.md);
this is the ops-facing companion (P6). It is **guidance, not app-enforced code** —
the app cannot force an iPad into single-app mode; MDM / Guided Access does that.

## The model in one line

A public tablet is **never signed in as a person.** It authenticates as an
org-scoped **device principal** (`kiosk_devices`); the customer runs anonymously
on top of the device token; a staff member only appears transiently via **PIN
step-up** for a privileged action, so those writes carry a real `staffId`.

## Host shape

| Host | Role |
|---|---|
| `{slug}.app.cycleforge.ai` | Staff workspace (Settings → Kiosk devices enroll/revoke) |
| `{slug}.kiosk.app.cycleforge.ai` | Tablet MDM home — `/` rewrites to `/kiosk`; staff APIs 404 |
| `kiosk.app.cycleforge.ai` | Platform apex — not a tenant; refused |

Org for writes still comes from the paired `kiosk_devices` row (never Host alone).
Pairing on a kiosk host also requires the enroll code’s org to match the host slug.

**Cookie:** `cf_kiosk` is **host-only** (no `Domain=`). After cutting over from the
old staff-host `/kiosk` path, **re-pair every tablet** — the old cookie does not
move to the new host.

**Env (optional):** `NEXT_PUBLIC_KIOSK_HOST_SUFFIX` overrides the suffix after
`{slug}.` (default derives as `kiosk.<NEXT_PUBLIC_APP_URL hostname>`, e.g.
`kiosk.app.cycleforge.ai`). Local: `kiosk.localhost` → `http://usav.kiosk.localhost:3000`.

**DNS (human):** wildcard `*.app.cycleforge.ai` does **not** cover
`usav.kiosk.app.cycleforge.ai`. Attach **`*.kiosk.app.cycleforge.ai`** on the
`cycleforge-app` Vercel project (see HUMAN-TODO §J7b).

## Roles / permissions

| Action | Who | Gate |
|---|---|---|
| Enroll a tablet (mint a pairing code) | Manager | `walk_in.enroll_kiosk` (`POST /api/kiosk/enroll` on **staff** host) |
| Revoke a tablet | Manager | `walk_in.enroll_kiosk` (`POST /api/kiosk/revoke` on **staff** host) |
| Pair a tablet (exchange code → token) | The tablet itself | public + one-time code (`POST /api/kiosk/pair` on **kiosk** host) |
| Create an intake | The tablet (device principal) | `withKioskAuth` (`POST /api/kiosk/intake`) |
| Privileged action (refund / repair approval / price override) | Staff, at the tablet | PIN step-up (`staffId` + `pin` on the intake body) |

Grant `walk_in.enroll_kiosk` to the manager/admin role(s) in **Settings → Roles**.
It is NOT granted by default.

## Enrollment (one-time, per tablet)

1. Manager (signed in) opens **Settings → Kiosk devices**, names the tablet, and
   clicks **Generate code**. A **one-time pairing code** (shown once) valid
   ~30 min appears. (Under the hood: `POST /api/kiosk/enroll`.)
2. On the tablet, open **`https://{slug}.kiosk.app.cycleforge.ai`** (dogfood:
   `https://usav.kiosk.app.cycleforge.ai`), tap **Set up this tablet**, and enter
   the code. The tablet exchanges it for a long-lived device token stored as the
   httpOnly `cf_kiosk` cookie. No human login after this.
3. The device is now **Paired** in the Settings list. Every intake authorizes
   off that cookie.

Revoke any tablet from the same **Settings → Kiosk devices** list.

Only **hashes** are stored server-side — never the raw code or token.

## Revocation

Revoke a lost/retired tablet: `POST /api/kiosk/revoke { deviceId }` (manager).
The token dies **server-side immediately** — the next request from that tablet
gets `401 KIOSK_UNPAIRED`. No staff-password rotation is involved. Revocation is
org-scoped: a manager can only revoke a device in their own org.

## Tablet lockdown (do this before the tablet faces a customer)

Lock the device to the **kiosk origin** so a customer cannot leave the page or
reach the OS:

- **iPad (managed):** MDM single-app mode / Autonomous Single App Mode pinned to
  `https://usav.kiosk.app.cycleforge.ai` (or the tenant’s kiosk origin) in a
  locked-down browser payload.
- **iPad (standalone):** Guided Access (Settings → Accessibility → Guided
  Access), triple-click to lock, disable hardware buttons.
- **Android:** COSU / kiosk-mode launcher pinned to the URL.
- **Windows:** Assigned Access (kiosk account) pinned to the URL.

Also: disable auto-fill / password managers on the kiosk profile, and set the
home URL to the kiosk origin so a reload returns to the intake screen.

## Why this matters (security notes)

- **Least privilege** — the device principal holds `walk_in.intake` + named
  connector capabilities and nothing else. It cannot read the staff dashboard,
  other customers' history, or any admin surface. The kiosk host allowlists only
  intake UI + device APIs (staff enroll routes 404 on that host).
- **Audit integrity** — ordinary intake is attributed to the `deviceId`;
  privileged writes carry the stepped-up `staffId`, with the device as `via`.
  Nothing is ever attributed to a shared human account.
- **Payment hygiene** — keeping the tablet off any staff session and scoped
  tight is the PCI-adjacent reason this matters most on the intake→payment leg.
- **No new token home** — connector tokens stay in `organization_integrations`
  (existing SoT); the device token is a separate, hashed `kiosk_devices`
  credential.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Tablet shows the pairing screen unexpectedly | token missing/revoked/expired cookie cleared | Re-enroll: mint a new code, pair again |
| `401 KIOSK_UNPAIRED` on intake | device revoked or cookie lost | Re-pair the tablet |
| `403 KIOSK_HOST_REQUIRED` on pair | pairing from staff host in production | Open the tenant kiosk origin, not `/kiosk` on the staff app |
| `403 STEPUP_FAILED` on a privileged action | wrong staff PIN, or PIN not set | Verify the staff PIN in Settings; base intake still works without step-up |
| Pairing code rejected | expired (>~30 min), already used, or wrong-tenant host | Mint a fresh code; use the matching `{slug}.kiosk…` host |
| Staff `/kiosk` bookmark | legacy path | 308 to `{slug}.kiosk.app…/` when the staff host has a tenant slug |
