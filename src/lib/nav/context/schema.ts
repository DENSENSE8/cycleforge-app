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
import { NAV_RECENT_ROW_VERBS } from '@/lib/nav/recents/surfaces';

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
    /** One secondary line (mode switcher): what the name means when it alone misleads (FBM). */
    description: z.string().min(1).optional(),
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
/** Sections that answer "where does this identifier live" (`GET /api/nav/locate`). */
export const NAV_LOCATORS = ['outbound', 'inbound'] as const;
export type NavLocator = (typeof NAV_LOCATORS)[number];

export const NavSearchSchema = z
  .object({
    /** What the box searches, e.g. `shipping.orders` or `global`. */
    scope: z.string().min(1),
    placeholder: z.string().min(1),
    source: z.enum(NAV_SEARCH_SOURCES),
    /** URL param the box writes when `source` is `url-param` / `desk-store`. */
    param: z.string().min(1).optional(),
    /**
     * Where a typed or pasted identifier LIVES in this section — one locator
     * answers both (`GET /api/nav/locate`):
     * - contextual: the field's text → per-bucket match counts, painted as
     *   pills under the field (click = that view, text kept);
     * - paste-a-list: a multi-number paste becomes a list (`param`,
     *   comma-joined) answered per number, with a bucket filter
     *   (`statusParam`) over it (NavBulkList).
     */
    locate: z
      .object({
        locator: z.enum(NAV_LOCATORS),
        param: z.string().min(1),
        statusParam: z.string().min(1),
      })
      .strict()
      .optional(),
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
 * generically by the host as buttons in the body (never behind a menu).
 * Each names the URL param(s) the view's list — and its facet counts — read.
 */
export const NavControlsSchema = z
  .object({
    /**
     * One staffer per role, or everyone — `AssigneeCombobox` via
     * `StageStaffAssignPopover`; each row writes/clears its `param`
     * ("Assigned" = `staff`, "Picked by" = `pickedBy`, …).
     */
    staff: z
      .array(z.object({ id: z.string().min(1), param: z.string().min(1), label: z.string().min(1) }).strict())
      .optional(),
    /**
     * Civil-date ranges (`DateRangePickerField variant="compact"`): picking
     * one writes `fromParam`/`toParam` (YYYY-MM-DD) and deletes every
     * `clearParams` key; `placeholder` names the window the list shows with
     * neither set. With `fromTimeParam`/`toTimeParam` the range also takes a
     * time of day (HH:mm, warehouse time) at each end.
     */
    dateRanges: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            fromParam: z.string().min(1),
            toParam: z.string().min(1),
            clearParams: z.array(z.string().min(1)),
            placeholder: z.string().min(1),
            fromTimeParam: z.string().min(1).optional(),
            toTimeParam: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    /**
     * The list's order: one choice writes `param` (and `dirParam` when the
     * option names a direction). A vocabulary whose ids already encode the
     * direction (`unboxed_newest`) omits `dirParam` and every option's `dir`.
     */
    sort: z
      .object({
        param: z.string().min(1),
        dirParam: z.string().min(1).optional(),
        /** The order the list shows with `param` unset. */
        defaultValue: z.string().min(1),
        options: z
          .array(
            z
              .object({ value: z.string().min(1), label: z.string().min(1), dir: z.enum(['asc', 'desc']).optional() })
              .strict(),
          )
          .min(2),
      })
      .strict()
      .optional(),
    /**
     * Single-choice filters over a fixed vocabulary, with no counts — the
     * list narrows on the value itself (a client-side predicate, or a param
     * the list endpoint takes without a facet query). Picking an option
     * writes `param`; picking it again clears it (the list's "all"). Either
     * way every `clearParams` key goes too (a page number past the new end).
     */
    choices: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            param: z.string().min(1),
            options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) }).strict()).min(2),
            clearParams: z.array(z.string().min(1)),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type NavControls = z.infer<typeof NavControlsSchema>;

/** Every URL param the controls own — what Reset clears and what the route must declare. */
export function navControlParams(controls: NavControls | undefined): string[] {
  if (!controls) return [];
  return [
    ...(controls.staff ?? []).map((row) => row.param),
    ...(controls.dateRanges ?? []).flatMap((range) => [
      range.fromParam,
      range.toParam,
      ...range.clearParams,
      ...(range.fromTimeParam ? [range.fromTimeParam] : []),
      ...(range.toTimeParam ? [range.toTimeParam] : []),
    ]),
    ...(controls.sort ? [controls.sort.param, ...(controls.sort.dirParam ? [controls.sort.dirParam] : [])] : []),
    // A choice's `clearParams` (a page number) are side effects, not filters: not counted, not reset.
    ...(controls.choices ?? []).map((choice) => choice.param),
  ];
}

export const NavRecentsSchema = z
  .object({
    /** Returns the normalised recents row shape (`NavRecentRow`). */
    endpoint: z.string().startsWith('/api/'),
    surface: z.string().min(1),
    /** The page's Find narrows this list (sent as `q`). */
    find: z.literal(true).optional(),
    /** Keyset-paged: `nextBefore` in the response fetches older rows (`before=`). */
    paged: z.literal(true).optional(),
    /**
     * Row verbs, written to the feed owner's route (`endpoint` with `{id}` =
     * the row's `entityId`): rename = PATCH `{ title }`, delete = DELETE (soft),
     * its undo = PATCH `{ restore: true }`.
     */
    rowActions: z
      .object({
        endpoint: z.string().startsWith('/api/').includes('{id}'),
        verbs: z.array(z.enum(NAV_RECENT_ROW_VERBS)).min(1),
      })
      .strict()
      .optional(),
    /**
     * ⌥1…⌥9, ⌥0 (Alt on Windows / Linux) open the first ten rows in painted
     * order, from anywhere on the page — typing included; the row's chord
     * shows as a keycap on hover.
     */
    chords: z.literal(true).optional(),
  })
  .strict();
export type NavRecents = z.infer<typeof NavRecentsSchema>;

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
    /**
     * The chord that already runs this verb on the page (`mod+shift+o`),
     * painted as a keycap on hover. Display only: the page body owns the
     * binding. Never a browser-reserved chord (⌘N, ⌘T, ⌘W, ⌘1–9).
     */
    hotkey: z
      .string()
      .regex(/^(mod\+)?(shift\+)?(alt\+)?[a-z0-9/;.]$/)
      .optional(),
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
    /** The page's views answer bare `1`–`9` (`NAV_PAGE_DECLS[page].viewKeys`); painted only when bound. */
    viewKeys: z.literal(true).optional(),
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

/**
 * `GET /api/nav/locate?locator=<id>&(q=<text>|refs=<a,b,…>)` — where
 * identifiers live. `locator` is a page's `search.locate.locator`, or
 * `everywhere` = every locator the caller may read (bucket ids then carry the
 * locator: `outbound:triage`).
 *
 * A BUCKET is a place a record can be: a view of the section (To ship,
 * Shipped) or a verdict the section owns (Received). Membership is the SAME
 * predicate the bucket's list uses, so a count is the rows that list shows.
 */
export const NAV_LOCATE_SCOPES = [...NAV_LOCATORS, 'everywhere'] as const;
export type NavLocateScope = (typeof NAV_LOCATE_SCOPES)[number];
/** A bucket's ink — one meaning per tone, never a per-component hue. */
export const NAV_LOCATE_TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const;
/** Most refs one locate answers (the paste-a-list cap). */
export const NAV_LOCATE_MAX_REFS = 100;

export const NavLocateBucketSchema = z
  .object({
    /** Locator-local (`triage`, `received`); `<locator>:<id>` under `everywhere`. */
    id: z.string().min(1),
    label: z.string().min(1),
    tone: z.enum(NAV_LOCATE_TONES),
    /** The list that shows this bucket's rows; `null` = a verdict with no list of its own. */
    href: z.string().startsWith('/').nullable(),
    /** `q`: matching rows in this bucket. `refs`: pasted numbers found in it. */
    count: z.number().int().nonnegative(),
  })
  .strict();
export type NavLocateBucket = z.infer<typeof NavLocateBucketSchema>;

export const NavLocateEntrySchema = z
  .object({
    /** As pasted. */
    ref: z.string().min(1),
    /** Bucket ids holding it, in bucket order; `[]` = found nowhere. */
    buckets: z.array(z.string().min(1)),
    /** What it is ("PO 4471 · Acme"), when found. */
    title: z.string().nullable(),
    /** Why it sits there ("Delivered · not scanned"). */
    detail: z.string().nullable(),
    /** Its record, when it is one record. */
    recordHref: z.string().startsWith('/').nullable(),
  })
  .strict();
export type NavLocateEntry = z.infer<typeof NavLocateEntrySchema>;

export const NavLocateResponseSchema = z
  .object({
    locator: z.enum(NAV_LOCATE_SCOPES),
    /** Every bucket the locator declares, in its order — zero counts included. */
    buckets: z.array(NavLocateBucketSchema),
    /** `refs` only, in paste order; `q` answers counts alone. */
    entries: z.array(NavLocateEntrySchema),
    /** Refs past {@link NAV_LOCATE_MAX_REFS}, dropped. */
    truncated: z.number().int().nonnegative(),
  })
  .strict();
export type NavLocateResponse = z.infer<typeof NavLocateResponseSchema>;
