# HANDOFF — Hard-caching the thumbnail images in data-table rows

**Session:** 2026-08-20 · **Status:** investigated, NOT started · **Owner:** next pass
**Companion:** [`one-table-engine-orders-host-PLAN.md`](one-table-engine-orders-host-PLAN.md) (the compound row this lands in)

---

## 0. One-sentence problem

The compound row renders a remote **third-party** catalog image per line with
`next/image unoptimized`, so nothing we control decides its size, its
`Cache-Control`, or whether a virtualized re-mount costs another network round
trip — and on a 500-row Unbox History that is the difference between a grid that
paints instantly and one that dribbles thumbnails in as you scroll.

---

## 1. Verified current state (2026-08-20 — re-check before trusting)

| Fact | Where |
|---|---|
| The thumbnail is rendered by `CompoundThumb` | `src/components/tables/compound/CompoundCells.tsx` |
| It passes **`unoptimized`** + `loading="lazy"` | same file |
| Box is a fixed 32px square inside a fixed 4rem track | `compound-row-chrome.ts` |
| Source is `ReceivingLineRow.image_url` | `src/components/station/receiving-line-row.ts:249` |
| …which originates from **`sku_catalog.image_url`** | `src/lib/migrations/2026-04-07_backfill_sku_catalog.sql` |
| `next.config` `remotePatterns` allows only 4 first-party hosts | `next.config.*` → `images.remotePatterns` |
| Orders rows have **no image at all** (`thumbUrl: null`) | `src/lib/orders/orders-compound-view.ts` |
| Rows are virtualized and re-mount on scroll | `VirtualGroupedSections` (`virtualizer.measureElement`) |

**`unoptimized` is not laziness — it is load-bearing today.** `sku_catalog.image_url`
points at whatever marketplace/vendor CDN the listing came from. Those hostnames
are unbounded, and `next/image` throws *"hostname not configured"* for anything
outside `remotePatterns` (the config comments record that exact incident taking
out the mobile photo gallery). Removing `unoptimized` without solving host
provenance **will** error-boundary the grid.

---

## 2. Why this is specifically a TABLE problem

A virtualized row unmounts when it leaves the overscan window and re-mounts when
it returns. That is fine *if* the image response is cacheable — the browser
serves the re-mount from its HTTP cache and no request leaves the machine. It is
not fine when the upstream sends `no-store`, a short `max-age`, or a `Vary` we
can't satisfy, which is common on marketplace CDNs and entirely outside our
control. Then every scroll up and back down is a fresh fetch per visible row.

So the goal is not "add a cache header". It is **own the URL**, because you can
only set caching on a response you serve.

---

## 3. Options, with the trade nobody should skip

| # | Approach | Cost | Verdict |
|---|---|---|---|
| A | Add each vendor host to `remotePatterns`, drop `unoptimized` | Unbounded allowlist that grows with every new marketplace; Vercel bills per **source image** optimized; still a third-party origin fetch on cache miss | **No** — the allowlist can never be complete, and an incomplete one is a runtime crash, not a degraded image |
| B | **Materialize a derived thumbnail at ingest** into our own bucket | One fetch + resize per catalog row, ever; URL becomes first-party and immutable; `storage.googleapis.com/usav-photos-*` is **already** in `remotePatterns` | **Recommended** |
| C | Runtime proxy route (`/api/thumb?sku=…`) with immutable headers | No schema change; but every cold URL is a synchronous third-party fetch on the request path, and it puts image bytes through a serverless function | Middle ground / fallback for B's backfill gap |

**B is recommended** because it is the only one where the steady state involves
no third-party request at all, and because the storage adapter, the bucket, and
the `remotePatterns` entry all already exist (`src/lib/photos/storage/gcs-adapter.ts`,
`PHOTOS_GCS_BUCKET`).

---

## 4. The cut (option B)

1. **Schema (expand first — `backend-patterns.md` law).** Add
   `sku_catalog.thumb_url text` and `sku_catalog.thumb_etag text`, nullable.
   The migration lands and deploys BEFORE any reader.
2. **Derive on catalog sync.** Where `sku_catalog` is upserted, enqueue a job
   that: fetches `image_url` once → resizes to a **2× of the largest rendered
   box** (64px box ⇒ 128px source, so the same asset survives a future density
   toggle) → writes to `PHOTOS_GCS_BUCKET` under a **content-addressed** key
   (`thumb/<sha256-of-source-bytes>.webp`).
3. **Serve immutably.** Content-addressed key ⇒ the URL changes when the bytes
   change ⇒ safe to send
   `Cache-Control: public, max-age=31536000, immutable`. This is the whole
   caching win; everything before it exists to make this header truthful.
4. **Read path.** `receiving-compound-view.ts` / `orders-compound-view.ts` set
   `thumbUrl: row.thumb_url ?? null`. **Do not fall back to the raw
   `image_url`** — a mixed feed re-introduces the uncacheable case for exactly
   the rows that lack a derived asset, which is the population you most want to
   see failing loudly during rollout.
5. **Drop `unoptimized`** in `CompoundThumb` once (4) ships, since every URL is
   now a first-party host already present in `remotePatterns`.
6. **Backfill** existing `sku_catalog` rows in a batched job; rows without a
   thumb keep rendering the typed `Package` placeholder, which is already the
   designed empty state.

### Client-side, after the above

Almost nothing is needed — an immutable URL plus the browser cache solves the
re-mount problem. Two small things worth doing:

- `decoding="async"` so a decode never blocks the row paint.
- A module-level `Set<string>` of URLs already seen this session, so a re-mounted
  row skips any fade-in and paints synchronously from cache. Keep it a plain Set,
  not state — it must not trigger a render.

**Do NOT build an in-memory image/blob cache.** The browser already has one, it
is shared across tabs, it survives reload, and a hand-rolled one on a 500-row
grid is a memory leak with extra steps.

---

## 5. Non-goals

- Any density/row-height work (deliberately one fixed row box today).
- Giving Orders a thumbnail — that needs `ShippedOrder` to join a catalog image
  first; it is a query + row-model change, tracked separately.
- Putting image bytes through a serverless function in the steady state.
- Touching `LedgerGridSurface` / the virtualizer.

---

## 6. Acceptance

- Scrolling Unbox History to row 400 and back to row 1 issues **zero** image
  requests for rows already seen (verify in the Network panel, disable-cache OFF).
- A cold load of 50 visible rows issues at most 50 image requests, all to
  `storage.googleapis.com`, all `200` then `304`/memory-cache on re-visit.
- No row renders a broken image; missing thumb ⇒ the `Package` placeholder.
- `next build` green with `unoptimized` removed (proves host provenance is real).
- Lighthouse LCP on `/unbox?unboxview=history` no worse than before.

## 7. Trap to avoid

The tempting shortcut is to keep `unoptimized` and just add `loading="lazy"` and
call it cached. Lazy-loading changes **when** the request happens, never whether
it is cacheable. If the upstream says `no-store`, a lazily-loaded image is
re-fetched on every single re-mount — the exact scroll behaviour this handoff
exists to fix.
