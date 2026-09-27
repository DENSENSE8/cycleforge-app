import { z } from 'zod';
import { NAV_RECENT_SURFACE_IDS, type NavRecentSurfaceId } from '@/lib/nav/recents/surfaces';
import { NAV_FACET_CONTEXTS } from '@/lib/nav/facets/contexts';

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
