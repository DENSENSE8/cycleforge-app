import { z } from 'zod';
import { NAV_RECENT_SURFACE_IDS, type NavRecentSurfaceId } from '@/lib/nav/recents/surfaces';
import { NAV_FACET_CONTEXTS } from '@/lib/nav/facets/contexts';
import { NAV_LOCATE_SCOPES } from '@/lib/nav/context/schema';
import { INBOUND_BUCKET_IDS } from '@/lib/nav/locate/inbound';
import { INBOUND_SOURCE_TYPES } from '@/lib/inbound/source-registry';
import { PURCHASES_AXES, PURCHASES_SORTS } from '@/lib/receiving/purchases-params';
import { FULFILLED_AXES, FULFILLED_DEFAULT_AXIS, FULFILLED_DEFAULT_SORT, FULFILLED_SCANS, FULFILLED_SORTS } from '@/lib/outbound/fulfilled-params';
import type { RecordsSort } from '@/lib/nav/records/params';
import { FULFILLED_THREAD_MAX_LINES } from '@/lib/outbound/fulfilled-thread';
import { parseDateKey } from '@/utils/date';

/** Request schemas for `/api/nav/recents` and `/api/nav/facets` (the contextual sidebar). */

const NavRecentSurfaceParam = z.enum(NAV_RECENT_SURFACE_IDS as [NavRecentSurfaceId, ...NavRecentSurfaceId[]]);

/** Hard ceiling on one recents read; each surface also caps at its own size. */
export const NAV_RECENTS_MAX_LIMIT = 50;

/** `GET /api/nav/recents?surface=&limit=[&before=][&q=]` — `before` / `q` are read only by `paged` / `find` surfaces. */
export const NavRecentsQuery = z.object({
  surface: NavRecentSurfaceParam,
  limit: z.coerce.number().int().min(1).max(NAV_RECENTS_MAX_LIMIT).optional(),
  before: z.string().trim().min(1).max(256).optional(),
  q: z.string().trim().max(200).optional(),
});
export type NavRecentsQuery = z.infer<typeof NavRecentsQuery>;

/** `POST /api/nav/recents` — record that the signed-in staffer opened an entity on a surface. */
export const NavRecentOpenBody = z
  .object({
    surface: NavRecentSurfaceParam,
    entityType: z.string().trim().min(1).max(64),
    /** Ticket ids arrive as numbers, serials as strings; stored as text. */
    entityId: z
      .union([z.string(), z.number().int().nonnegative()])
      .transform((v) => String(v).trim())
      .pipe(z.string().min(1).max(256)),
    label: z.string().trim().max(512).default(''),
  })
  .strict();
export type NavRecentOpenBody = z.infer<typeof NavRecentOpenBody>;

/** `GET /api/nav/facets?context=…` — the view's own list params ride alongside and are read per context. */
export const NavFacetsQuery = z.object({
  context: z.enum(NAV_FACET_CONTEXTS),
});
export type NavFacetsQuery = z.infer<typeof NavFacetsQuery>;

/**
 * `GET /api/nav/locate?locator=&(q=|refs=)` and `POST /api/nav/locate`
 * `{ locator, q | refs }` (a long list, past what a URL carries; `refs` may be
 * an array there, read as one ref per line) — exactly one of the field's text
 * (`q`) or a pasted list (`refs`, split, deduped and capped server-side, so
 * repeats and blank lines never count against the cap).
 */
export const NavLocateQuery = z
  .object({
    locator: z.enum(NAV_LOCATE_SCOPES),
    q: z.string().trim().min(1).max(200).optional(),
    refs: z.string().trim().min(1).max(64_000).optional(),
  })
  .refine((query) => (query.q === undefined) !== (query.refs === undefined), {
    message: 'Pass exactly one of q or refs',
  });
export type NavLocateQuery = z.infer<typeof NavLocateQuery>;

/** A `YYYY-MM-DD` PT civil day that exists on the calendar. */
const CivilDay = z
  .string()
  .trim()
  .refine((raw) => parseDateKey(raw) !== null, { message: 'Expected a YYYY-MM-DD day' });

/**
 * `GET /api/nav/purchases` — Receiving › Purchasing (`src/lib/nav/purchases`).
 * `from` / `to` are PT civil days on `axis`, inclusive; neither = the last
 * 90 days, `from=all` = no lower bound. `find` is the page's Find text (`q`
 * the same). `status` (one inbound bucket) narrows `entries` only.
 */
export const NavPurchasesQuery = z
  .object({
    status: z.enum(INBOUND_BUCKET_IDS).optional(),
    axis: z.enum(PURCHASES_AXES).default('ordered'),
    from: z.union([z.literal('all'), CivilDay]).optional(),
    to: CivilDay.optional(),
    source: z.enum(INBOUND_SOURCE_TYPES).optional(),
    vendor: z.string().trim().min(1).max(200).optional(),
    unboxedBy: z.coerce.number().int().positive().optional(),
    sort: z.enum(PURCHASES_SORTS).default('ordered'),
    dir: z.enum(['asc', 'desc']).optional(),
    find: z.string().trim().max(200).optional(),
    q: z.string().trim().max(200).optional(),
  })
  .refine((query) => !query.to || !query.from || query.from === 'all' || query.from <= query.to, {
    message: 'from is after to',
  });
export type NavPurchasesQuery = z.infer<typeof NavPurchasesQuery>;

/**
 * `GET /api/nav/fulfilled` — Fulfillment › Fulfilled (`src/lib/nav/fulfilled`).
 * `from` / `to` are PT civil days on `axis`, inclusive; neither = the last
 * 90 days, `from=all` = no lower bound. `q` is the page's Find text.
 * `status` (one `FULFILLED_BUCKETS` id) narrows `entries` only.
 */
export const NavFulfilledQuery = z
  .object({
    axis: z.enum(FULFILLED_AXES).default(FULFILLED_DEFAULT_AXIS),
    from: z.union([z.literal('all'), CivilDay]).optional(),
    to: CivilDay.optional(),
    platform: z.string().trim().toLowerCase().min(1).max(100).optional(),
    carrier: z.string().trim().toUpperCase().min(1).max(40).optional(),
    packer: z.coerce.number().int().positive().optional(),
    scan: z.enum(FULFILLED_SCANS).optional(),
    sort: z.enum(FULFILLED_SORTS as [RecordsSort, ...RecordsSort[]]).default(FULFILLED_DEFAULT_SORT),
    dir: z.enum(['asc', 'desc']).optional(),
    q: z.string().trim().max(200).optional(),
  })
  .refine((query) => !query.to || !query.from || query.from === 'all' || query.from <= query.to, {
    message: 'from is after to',
  });
export type NavFulfilledQuery = z.infer<typeof NavFulfilledQuery>;

/**
 * `GET /api/fulfilled/thread?orders=1,2` — one fulfilled order's thread: its
 * lines (`orders.id`), comma-joined (`src/lib/outbound/fulfilled-thread.ts`).
 */
export const FulfilledThreadQuery = z
  .object({
    orders: z
      .string()
      .trim()
      .transform((raw) => [...new Set(raw.split(',').map((part) => Number(part.trim())))])
      .pipe(z.array(z.number().int().positive()).min(1).max(FULFILLED_THREAD_MAX_LINES)),
  })
  .strict();
