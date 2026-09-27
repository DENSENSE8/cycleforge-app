/**
 * NavContext — the contextual sidebar's single wire contract.
 *
 * Framework-free: the web shell and the Tauri desktop app both read this shape
 * (`resolveNavContext` in-process, `GET /api/nav/context` over HTTP). Nothing
 * here may import React, Next, or a component module.
 *
 * Laws the resolver tests pin (docs/refactors/sidebar/BACKEND-HANDOFF.md):
 * - nav items carry NO numeric count; counts live only in facet groups, fetched
 *   separately from `GET /api/nav/facets`;
 * - a `section` context never contains top-level (page) items;
 * - `back` is `null` exactly at `top` scope, and it never navigates (`mode: 'local'`).
 */

import { z } from 'zod';

export const NAV_ITEM_KINDS = ['link', 'drill', 'filter', 'toggle'] as const;
export type NavItemKind = (typeof NAV_ITEM_KINDS)[number];

export const NavItemSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** Fully built target (pathname + search), from the child's `to()`. */
    href: z.string().startsWith('/'),
    active: z.boolean(),
    kind: z.enum(NAV_ITEM_KINDS),
    badge: z.literal('beta').optional(),
  })
  .strict();
export type NavItem = z.infer<typeof NavItemSchema>;

export const NavSectionSchema = z
  .object({
    id: z.string().min(1),
    /** Small uppercase group heading; omitted = no heading (thin divider only). */
    label: z.string().min(1).optional(),
    items: z.array(NavItemSchema),
  })
  .strict();
export type NavSection = z.infer<typeof NavSectionSchema>;

export const NAV_SEARCH_SOURCES = ['desk-store', 'url-param', 'identify'] as const;

export const NavSearchSchema = z
  .object({
    /** What the box searches, e.g. `shipping.orders` or `global`. */
    scope: z.string().min(1),
    placeholder: z.string().min(1),
    source: z.enum(NAV_SEARCH_SOURCES),
    /** URL param the box writes when `source` is `url-param` / `desk-store`. */
    param: z.string().min(1).optional(),
  })
  .strict();
export type NavSearch = z.infer<typeof NavSearchSchema>;

/**
 * One facet group the sidebar can show (the Vercel Logs-panel pattern). The
 * context only DECLARES the groups; option lists and their counts come from
 * `GET /api/nav/facets?context=<facetContext>&…params`.
 */
export const NavFilterGroupSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** URL param the group writes. */
    param: z.string().min(1),
    multi: z.boolean(),
  })
  .strict();
export type NavFilterGroup = z.infer<typeof NavFilterGroupSchema>;

export const NavFiltersSchema = z
  .object({
    /** `<pageId>.<sectionItemId>` (`<pageId>` on a page without views) — the key `GET /api/nav/facets` takes. */
    facetContext: z.string().min(1),
    groups: z.array(NavFilterGroupSchema),
  })
  .strict();
export type NavFilters = z.infer<typeof NavFiltersSchema>;

/**
 * View controls that are not facet groups (no option counts), rendered
 * generically by the host. Each names the URL param(s) the view's list reads.
 */
export const NavControlsSchema = z
  .object({
    /** One staffer or everyone — `AssigneeCombobox` via `StageStaffAssignPopover`; writes/clears `param`. */
    staff: z.object({ param: z.string().min(1) }).strict().optional(),
    /**
     * A civil-date range (`DateRangePickerField variant="compact"`): picking one
     * writes `fromParam`/`toParam` (YYYY-MM-DD) and deletes every `clearParams`
     * key; `placeholder` names the window the list shows with neither set.
     */
    dateRange: z
      .object({
        fromParam: z.string().min(1),
        toParam: z.string().min(1),
        clearParams: z.array(z.string().min(1)),
        placeholder: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type NavControls = z.infer<typeof NavControlsSchema>;

export const NavRecentsSchema = z
  .object({
    /** Returns the normalised recents row shape (`NavRecentRow`). */
    endpoint: z.string().startsWith('/api/'),
    surface: z.string().min(1),
  })
  .strict();

export const NavSavedViewsSchema = z
  .object({
    /** `saved_views` surface key (see `src/lib/saved-views/surfaces.ts`). */
    storageKey: z.string().min(1),
    paramKeys: z.array(z.string().min(1)),
  })
  .strict();

export const NavScanInputSchema = z
  .object({
    /** Grammar id the station's classifier understands. */
    grammar: z.string().min(1),
    /** Where a scan is submitted. */
    endpoint: z.string().startsWith('/api/'),
  })
  .strict();

/**
 * A page/view-level verb the old desk chrome hosted (header CTA, panel button)
 * that the sidebar now carries. Row / record verbs stay in the page body.
 */
export const NavActionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** Navigating here IS the action (pathname + search). */
    href: z.string().startsWith('/').optional(),
    /** Client verb (`<surface>:<verb>`) the host dispatches when no URL expresses the action. */
    intent: z.string().min(1).optional(),
  })
  .strict()
  .refine((action) => action.href !== undefined || action.intent !== undefined, {
    message: 'an action needs an href or an intent',
  });
export type NavAction = z.infer<typeof NavActionSchema>;

export const NAV_ROLLOUT_STATES = ['legacy', 'contextual'] as const;
export type NavRolloutState = (typeof NAV_ROLLOUT_STATES)[number];

export const NavContextSchema = z
  .object({
    scope: z.enum(['top', 'section']),
    page: z.object({ id: z.string().min(1), label: z.string().min(1) }).strict(),
    /** `‹ <page label>` row. Moves the sidebar up one level; never navigates. */
    back: z.object({ label: z.string().min(1), mode: z.literal('local') }).strict().nullable(),
    search: NavSearchSchema,
    sections: z.array(NavSectionSchema),
    /** Every URL param the page's views read — the parity surface for filters. */
    params: z.array(z.string().min(1)),
    filters: NavFiltersSchema.optional(),
    /** Non-facet view filters (staff, date range) the active view's list reads. */
    controls: NavControlsSchema.optional(),
    recents: NavRecentsSchema.optional(),
    savedViews: NavSavedViewsSchema.optional(),
    /** Page / active-view verbs the old desk chrome hosted. */
    actions: z.array(NavActionSchema).optional(),
    scanInput: NavScanInputSchema.optional(),
    rollout: z.enum(NAV_ROLLOUT_STATES),
  })
  .strict();
export type NavContext = z.infer<typeof NavContextSchema>;

/** `GET /api/nav/context?path=<pathname+search>[&view=top]`. */
export const NavContextQuerySchema = z
  .object({
    /** An in-app URL: pathname plus optional search. Never another origin. */
    path: z
      .string()
      .min(1)
      .max(2048)
      .refine((path) => path.startsWith('/') && !path.startsWith('//') && !path.includes('\\'), {
        message: 'path must be an in-app pathname',
      }),
    /** `top` = the ‹ peek (lane map with the page lit). */
    view: z.literal('top').optional(),
  })
  .strict();
export type NavContextQuery = z.infer<typeof NavContextQuerySchema>;

/** Normalised recents row — every recents endpoint returns `{ rows: NavRecentRow[] }`. */
export const NavRecentRowSchema = z
  .object({
    id: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    title: z.string(),
    subtitle: z.string().nullable(),
    status: z.string().nullable(),
    /** ISO timestamp. */
    at: z.string().min(1),
    href: z.string().startsWith('/'),
  })
  .strict();
export type NavRecentRow = z.infer<typeof NavRecentRowSchema>;

/** Facet option list — `GET /api/nav/facets` returns `{ context, total, groups }`. */
export const NavFacetGroupSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    param: z.string().min(1),
    options: z.array(
      z
        .object({
          value: z.string(),
          label: z.string().min(1),
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export type NavFacetGroup = z.infer<typeof NavFacetGroupSchema>;

export const NavFacetsResponseSchema = z
  .object({
    context: z.string().min(1),
    /** Row total of the active view's list under the current params. */
    total: z.number().int().nonnegative(),
    groups: z.array(NavFacetGroupSchema),
  })
  .strict();
export type NavFacetsResponse = z.infer<typeof NavFacetsResponseSchema>;
