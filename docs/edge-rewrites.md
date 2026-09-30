# Edge rewrites & platform Digital Link hosts

## SaaS model (current)

Printed QR / DataMatrix codes for receiving cartons mint on the **Cycle Forge
platform host** for the tenant:

```
https://{slug}.app.cycleforge.ai/m/r/{id}/qc
```

The `/qc` tail is the carton's quality control: the sticker is printed at
unbox, so its next job is QC (pass / test again / failed per unit). Stickers
printed before the tail (`/m/r/{id}`) still route to the same carton.

- **Staff wedge / in-app scan** — `routeScan()` ignores the host; the dispatch
  row `qc-carton` (`src/lib/scan/dispatch-table.ts`) opens `/m/r/{id}/qc` for
  every carton form, bare `R-{id}` included.
- **Consumer phone camera** — hits `{slug}.app.cycleforge.ai`, which *is* this
  app. Anonymous visitors see a branded **interstitial** with a button to the
  tenant’s configured customer website (`brand.publicLandingUrl` in org
  settings) — the gate is `src/app/m/(shell)/r/[id]/layout.tsx`, so it covers
  `/qc` too. Authed staff land on the carton's QC.
- Tenants do **not** configure DNS or edge rewrites for QR. They only set the
  outbound website URL under Settings → Organization → Branding.

Unit GS1 Digital Links (`/01/{gtin}/…`) follow the same host when minted with
an org slug.

### The encode decision lives in exactly one module

`encodePrintMatrix` (`src/lib/qr/platform-link.ts`) owns `{ value, symbology,
hri }` for every printable matrix. Face adapters, HTML print, the raw
TSPL/ZPL/ESC-POS builders and the on-screen previews are all thin callers, so
preview and print cannot disagree. Pinned by
`src/lib/qr/print-matrix-sot.guard.test.ts`.

| Kind | Encodes | Anon landing |
|---|---|---|
| carton | `/m/r/{id}/qc` on the slug host | `/m/r/[id]/*` → interstitial |
| unit (GTIN known) | `/01/{gtin}[/21/{serial}]` on the slug host | `/01/…` → interstitial |
| unit (no GTIN) | `(01)…(21)…` element string, `U-{serial}`, or the SKU | — |
| as-listed | bare `L-{id}` / `R-{id}` | none yet — see below |
| ticket | bare `T-{digits}` | none — `/support` is staff-only |
| repair / handling unit / manifest | bare `REP-` / `H-` / `KIT-` | none — internal-only |

**A kind stays bare until its path has an anonymous landing.** `/m/l/*` and
`/m/u/*` are proxy *rewrites* onto staff pages, so minting a URL for them today
would put a customer's phone on `/signin` — strictly worse than a handle the
staff wedge still resolves. Ship the landing first, then flip the kind in
`encodePrintMatrix`; that is the only edit needed.

### Anonymous landings

Every anon landing composes one helper — `PublicQrLanding`
(`src/components/qr/public-qr-landing.tsx`) → `PublicQrInterstitial`. It reads
the tenant from the `x-tenant-slug` header (set by the proxy from the host) and
links out to that workspace's own `brand.publicLandingUrl`. An unknown or absent
slug **fails closed**: the shell renders with no CTA rather than defaulting to
some tenant's website.

`/qr` is the catch-all for a scanned code that resolved to no entity, so
`resolvePublic()` in `src/lib/gs1/resolver.ts` has a destination that is still
the *tenant's* brand. That function used to return a hardcoded
`NEXT_PUBLIC_STOREFRONT_URL ?? 'https://usavshop.com'` — a single-tenant
assumption inside a multi-tenant resolver, which would have shipped one
workspace's customers to another workspace's shop the moment labels started
minting on `{slug}.app.cycleforge.ai`. It now echoes back the canonical Digital
Link path and lets the landing page resolve the tenant.

Behaviour is covered on the QA org by
`tests/e2e/platform-digital-link.spec.ts`.

## Legacy dogfood: usavshop.com → staff backend

Older stickers and some env defaults still encode `https://usavshop.com/…`.
For those to keep working end-to-end, the **usavshop.com** Vercel project can
*rewrite* (not redirect) a handful of paths through to the staff backend.
A 302 redirect would still leak the backend host in the browser bar —
only a rewrite keeps the browser on `usavshop.com`.

In-app scans don't need any of this; `routeScan()` parses the path and
ignores the host. This config only matters for **phone-camera scans of
legacy brand-domain labels**.

## What to paste into the usavshop.com project (legacy)

Add this to `vercel.json` at the root of the usavshop.com Next.js
project (the consumer storefront). Replace
`https://staff-backend.usavshop.com` with whatever hostname currently
serves this staff app (Vercel preview, prod alias, or a CNAME — any host
that resolves to the staff deploy):

```json
{
  "rewrites": [
    { "source": "/m/r/:id*",        "destination": "https://staff-backend.usavshop.com/m/r/:id*" },
    { "source": "/m/l/:id*",        "destination": "https://staff-backend.usavshop.com/m/l/:id*" },
    { "source": "/m/u/:id*",        "destination": "https://staff-backend.usavshop.com/m/u/:id*" },
    { "source": "/m/b/:barcode*",   "destination": "https://staff-backend.usavshop.com/m/b/:barcode*" },
    { "source": "/m/p/:id*",        "destination": "https://staff-backend.usavshop.com/m/p/:id*" },
    { "source": "/m/enroll/:token*","destination": "https://staff-backend.usavshop.com/m/enroll/:token*" },
    { "source": "/m/scan",          "destination": "https://staff-backend.usavshop.com/m/scan" },
    { "source": "/m/signin",        "destination": "https://staff-backend.usavshop.com/m/signin" },
    { "source": "/repair/:id*",     "destination": "https://staff-backend.usavshop.com/repair/:id*" },
    { "source": "/warehouse",       "destination": "https://staff-backend.usavshop.com/warehouse" },
    { "source": "/warehouse/:path*","destination": "https://staff-backend.usavshop.com/warehouse/:path*" },
    { "source": "/inventory",       "destination": "https://staff-backend.usavshop.com/inventory" },
    { "source": "/inventory/:path*","destination": "https://staff-backend.usavshop.com/inventory/:path*" },
    { "source": "/01/:gtin*",       "destination": "https://staff-backend.usavshop.com/01/:gtin*" },
    { "source": "/414/:gln/254/:code*", "destination": "https://staff-backend.usavshop.com/414/:gln/254/:code*" }
  ]
}
```

## Why a CNAME (not the *.vercel.app host) for the rewrite destination

Vercel rewrites copy the destination URL onto outgoing fetch traffic
*server-side*. The browser still only sees `usavshop.com`. Pointing the
rewrite target at `*.vercel.app` works functionally, but if Vercel ever
exposes the rewrite target in a header or error page, the IaaS hostname
leaks again. Setting up a custom alias on the staff project (e.g.
`staff-backend.usavshop.com` via Vercel → Project → Domains, plus the
matching CNAME at your DNS provider) eliminates that surface entirely.

## Cloudflare Worker alternative

If usavshop.com isn't on Vercel and you'd rather not move it, the same
result can be achieved with a Cloudflare Worker on the usavshop.com
zone:

```js
const BACKEND = 'https://staff-backend.usavshop.com';
const PROXY_PREFIXES = ['/m/', '/repair/', '/warehouse', '/inventory', '/01/', '/414/'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (PROXY_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      const proxied = new URL(url.pathname + url.search, BACKEND);
      return fetch(new Request(proxied, request));
    }
    return fetch(request); // everything else stays on the storefront
  },
};
```

## Smoke test

1. Print an unbox carton label while signed into `{slug}.app.cycleforge.ai`.
   Confirm the matrix encodes
   `https://{slug}.app.cycleforge.ai/m/r/<id>/qc` and the HRI under it is `R-<id>`.
2. Phone-camera scan (signed out) → branded interstitial; tap **Continue to
   website** → org `publicLandingUrl`.
3. Phone-camera scan (signed in) and the in-app scan button → the carton's QC;
   a one-unit carton opens that unit's verdict directly.
4. Legacy bare `R-<id>` and pre-tail `/m/r/<id>` stickers still resolve in-app.

## Environment variables

Staff / platform app:

```
NEXT_PUBLIC_APP_URL=https://app.cycleforge.ai
```

(`staffOriginForSlug` derives `{slug}.app.cycleforge.ai` from this hostname.)

Optional legacy unit/public defaults (still read by older helpers):

```
NEXT_PUBLIC_STOREFRONT_URL=https://usavshop.com
NEXT_PUBLIC_LABEL_QR_BASE_URL=https://usavshop.com
```
