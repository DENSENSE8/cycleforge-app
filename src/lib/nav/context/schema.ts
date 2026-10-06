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
 * - `back` is `null` exactly at `top` scope. It moves the sidebar up one level
 *   without navigating (`mode: 'local'`).
 */

import { z } from 'zod';
import { NAV_RECENT_ROW_VERBS } from '@/lib/nav/recents/surfaces';
import { CHECK_ZOHO_RECEIVED_MAX_INPUTS } from '@/lib/receiving/tracking-paste';
import { CHECK_IN_OUTCOMES, ORDER_CHECK_IN_STATES } from '@/lib/support/conversation/model';

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
export const NAV_LOCATORS = ['outbound', 'inbound', 'support'] as const;
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
     *   (`statusParam`) over it (NavBulkList), and optionally a facet
     *   filter inside the bucket (`facetParam`, an entry's `facet.id`).
     */
    locate: z
      .object({
        locator: z.enum(NAV_LOCATORS),
        param: z.string().min(1),
        statusParam: z.string().min(1),
        facetParam: z.string().min(1).optional(),
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
    /** Optional comma-list param that removes matching facet options. */
    excludeParam: z.string().min(1).optional(),
    multi: z.boolean(),
  /** Options render inline, always open (short ordered sets like aisles). */
  inline: z.boolean().optional(),
  /** A long open set (vendors): a filter field narrows the options by name. */
  searchable: z.boolean().optional(),
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
 * The default paint order of {@link NavControls}' kinds (`controls.order` overrides it).
 * `facets` is where the context's counted facet groups (`NavContext.filters`) paint — last by default.
 */
export const NAV_CONTROL_KINDS = ['sort', 'group', 'staff', 'dates', 'dateRanges', 'choices', 'exclude', 'facets'] as const;
export type NavControlKind = (typeof NAV_CONTROL_KINDS)[number];

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
    /** One civil day (`YYYY-MM-DD`) rendered with the compact date field. */
    dates: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            param: z.string().min(1),
            clearParams: z.array(z.string().min(1)),
          })
          .strict(),
      )
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
     * How the list bands its records — view state like `sort`, never a
     * filter: one choice writes `param` (`defaultValue` = unset, e.g. no
     * grouping), painted as the Sort row (pressed, never a check) and never
     * counted or cleared by Reset. `choices` cannot say this: it is a
     * clearable filter (a check per option, counted by Reset).
     */
    group: z
      .object({
        param: z.string().min(1),
        /** The grouping the list shows with `param` unset. */
        defaultValue: z.string().min(1),
        options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) }).strict()).min(2),
      })
      .strict()
      .optional(),
    /**
     * Multi-select status exclusions. Options are published by the owning
     * triage desk's status vocabulary and write one shared comma-list param.
     */
    exclude: z
      .object({
        id: z.string().min(1),
        label: z.string().min(1),
        param: z.string().min(1),
        options: z
          .array(
            z
              .object({
                value: z.string().min(1),
                label: z.string().min(1),
                tone: z.enum(['neutral', 'info', 'success', 'warning', 'danger', 'fulfillment']).optional(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
    /**
     * Single-choice filters over a fixed vocabulary, with no counts — the
     * list narrows on the value itself (a client-side predicate, or a param
     * the list endpoint takes without a facet query). Picking an option
     * writes `param`; picking it again clears it (the list's "all"). Either
     * way every `clearParams` key goes too (a page number past the new end).
     * With `defaultValue` the choice is never empty: unset reads as that
     * option (lit), picking it clears `param`, and a lit option pressed again
     * stays lit (Tasks' Open · Waiting · Done · All, unset = Open).
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
            /** The option (one of `options`) the list shows with `param` unset. */
            defaultValue: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    /**
     * Paint order of the control KINDS when a page's spec fixes one (Labels &
     * docs › Bulk: Sort · Print status (its facet) · Uploaded · Printed).
     * Omitted = the default order {@link NAV_CONTROL_KINDS}. A kind left out
     * of the list paints after the listed ones.
     */
    order: z.array(z.enum(NAV_CONTROL_KINDS)).optional(),
  })
  .strict();
export type NavControls = z.infer<typeof NavControlsSchema>;

/** Every URL param the controls own — what Reset clears and what the route must declare. */
export function navControlParams(controls: NavControls | undefined): string[] {
  if (!controls) return [];
  return [
    ...(controls.staff ?? []).map((row) => row.param),
    ...(controls.dates ?? []).map((row) => row.param),
    ...(controls.dateRanges ?? []).flatMap((range) => [
      range.fromParam,
      range.toParam,
      ...range.clearParams,
      ...(range.fromTimeParam ? [range.fromTimeParam] : []),
      ...(range.toTimeParam ? [range.toTimeParam] : []),
    ]),
    ...(controls.sort ? [controls.sort.param, ...(controls.sort.dirParam ? [controls.sort.dirParam] : [])] : []),
    ...(controls.group ? [controls.group.param] : []),
    ...(controls.exclude ? [controls.exclude.param] : []),
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
    /** `‹ <page label>` row: up one level, without navigating (the ‹ peek). */
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
    /** Reports-style verbs that belong under the contextual filters, not in the desk header. */
    actionsPlacement: z.literal('sidebar').optional(),
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
    /**
     * An in-app URL: pathname plus optional search. Never another origin.
     * Room for a pasted list (`NAV_LOCATE_MAX_REFS` numbers ride the search, ~7–10KB).
     */
    path: z
      .string()
      .min(1)
      .max(16384)
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
 * `GET|POST /api/nav/locate?locator=<id>&(q=<text>|refs=<a,b,…>)` — where
 * identifiers live. `locator` is a page's `search.locate.locator`, or
 * `everywhere` = every locator the caller may read (bucket ids then carry the
 * locator: `outbound:triage`).
 *
 * A BUCKET is a place a record can be: a view of the section (To ship,
 * Shipped) or a verdict the section owns (Received). Membership is the SAME
 * predicate the bucket's list uses, so a count is the rows that list shows.
 *
 * FOUND ELSEWHERE: under a section locator, a pasted ref the section holds
 * nowhere is asked of every other section the caller may read. Its hits come
 * back exactly as under `everywhere` — `<locator>:<id>` bucket ids, labels
 * the bare status ("Received", never "Receiving · Received": a client names
 * the section — {@link NAV_LOCATOR_SECTION_LABEL} — only to tell two
 * same-word statuses apart) — AFTER the page's own
 * buckets, which keep their unprefixed ids and order. Another section's
 * bucket is listed only when it holds a ref. So `entry.buckets: []` always
 * means found nowhere the caller can see. The typed field (`q`) answers its
 * own section only. Support answers on /support alone: it is never asked
 * under `everywhere` nor for another section's misses (a pasted order or
 * tracking list is a shipping question), while ITS misses ask the shipping
 * sections like any other.
 */
export const NAV_LOCATE_SCOPES = [...NAV_LOCATORS, 'everywhere'] as const;
export type NavLocateScope = (typeof NAV_LOCATE_SCOPES)[number];
/** The section a locator answers for — painted only to tell two same-word buckets of different sections apart. */
export const NAV_LOCATOR_SECTION_LABEL: Readonly<Record<NavLocator, string>> = {
  outbound: 'Fulfillment',
  inbound: 'Receiving',
  support: 'Support',
};
/** The status filter for pasted refs found nowhere (no bucket holds them) — the Not found chip; never a bucket id. */
export const NAV_LOCATE_NOWHERE = 'nowhere';
/** A bucket's ink — one meaning per tone, never a per-component hue. */
export const NAV_LOCATE_TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const;
/** Most refs one locate answers (the paste-a-list cap — the Check's, `CHECK_ZOHO_RECEIVED_MAX_INPUTS`). */
export const NAV_LOCATE_MAX_REFS = CHECK_ZOHO_RECEIVED_MAX_INPUTS;
/** Most records a typed `q` lists as entries (the field's dropdown); the rest are `truncated`. */
export const NAV_LOCATE_MAX_MATCHES = 8;

export const NavLocateBucketSchema = z
  .object({
    /** Locator-local (`triage`, `received`); `<locator>:<id>` under `everywhere` or for a ref found in another section. */
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

/** A staffer on a fact, by id (colour — `StaffCell`) and name (the row's own words). */
export const NavLocateStaffSchema = z
  .object({
    id: z.number().int().positive().nullable(),
    name: z.string().nullable(),
  })
  .strict();
export type NavLocateStaff = z.infer<typeof NavLocateStaffSchema>;

/**
 * The facts the pasted-list page paints per number — ONE shape for both
 * sections, so the page renders one row type. `section` names whose facts
 * these are; each locator fills the fields it knows and leaves the rest null.
 * Read in the SAME round trip as the verdict (outbound: the refs statement;
 * inbound: the ledger's reconcile lines), never a second read. Every `*At`
 * is a full ISO-8601 UTC instant (`2026-09-09T21:14:00.000Z`); `shipBy` is
 * the one calendar date (`YYYY-MM-DD`).
 *
 * - both: `title`, `sku`, `tracking`, `deliveredAt` (carrier said delivered);
 * - outbound (the order — the lead order when the ref names several):
 *   `channelStatus` (`orders.status` — what the order's SOURCE reported on
 *   import / sync: marketplace or ShipStation, `CanonicalOrder.status`; NOT
 *   the warehouse stage, which is the entry's bucket. An Amazon order
 *   imported as `shipped` with its tracking, never packed or scanned out
 *   here, reads channel `shipped` in Allocate — a real gap, not a
 *   contradiction), `shipBy` (`YYYY-MM-DD`, the ship-by
 *   deadline the desk sorts by), `packedAt` + `packer` (who packed it, else
 *   the pack assignee), `shippedAt` (dock scan-out `SHIP_CONFIRM`, else the
 *   packer log the Shipped list reads; the warehouse's own stamps only);
 *   `lines` = order lines the ref names;
 * - inbound (the number's receiving lines): `po` (the PO# the Check /
 *   lines name — `ReconEntry.poNumber`), `vendor`, `lines` (receiving
 *   lines it holds), `unboxedAt` + `unboxedBy` (latest unbox; who completed
 *   it, else who opened the carton), `units` — `received` = units counted
 *   in at the Unbox bench (Σ `receiving_line.quantity_received`, written by
 *   the bench's receive, `receiveLineUnits`; never the carrier's or Zoho's
 *   word) / `expected` = units bought (Σ `quantity_expected`; null = a line
 *   has no expected qty). A purchase counts ONCE: an unreceived eBay-import
 *   line that is the same purchase as a Zoho PO line of the number
 *   (`duplicatePurchaseLineIds`, the eBay ↔ Zoho merge's `matchZohoPo`) is
 *   left out of `lines` / `units` / every fact and named in `duplicates`
 *   (its receiving_line ids) — a data defect to clean up, never a short.
 *   Outbound: `duplicates` is always `[]`.
 * - fulfilled (`GET /api/nav/fulfilled` only; optional, absent elsewhere):
 *   `channel` (label), `customer`, `qty`, `orderTotal`, `orderedAt`
 *   (`COALESCE(order_date, created_at)`), `scannedOutBy`, `scanSource`
 *   (`live` = the dock's scan-out, `backfill` = a backdated stamp, null =
 *   never scanned out), the package's `carrier` / `service` /
 *   `labelCreatedAt` / `labelCost`, carrier `firstScanAt` / `lastEvent` /
 *   `eta` / `attempts` / `exceptionCode`, `lastPoll` (`error` non-null = the
 *   poll is failing), `packages` + `trackings` (every tracking when > 1),
 *   `returnRef` (a receiving return naming the order), `shipstationStatus`,
 *   `transitDays`, `claim` (carrier claim window, no-movement / stalled /
 *   exception rows only), `lineCount` (order grain: lines combined).
 *   Absent = null (the Fulfilled wire omits nulls, {@link NavFulfilledResponseSchema}).
 */
export const NavLocateFactsSchema = z
  .object({
    section: z.enum(NAV_LOCATORS),
    title: z.string().nullable(),
    sku: z.string().nullable(),
    tracking: z.string().nullable(),
    deliveredAt: z.string().nullable(),
    channelStatus: z.string().nullable(),
    shipBy: z.string().nullable(),
    packedAt: z.string().nullable(),
    shippedAt: z.string().nullable(),
    packer: NavLocateStaffSchema.nullable(),
    po: z.string().nullable(),
    vendor: z.string().nullable(),
    lines: z.number().int().nonnegative(),
    duplicates: z.array(z.number().int()),
    unboxedAt: z.string().nullable(),
    unboxedBy: NavLocateStaffSchema.nullable(),
    units: z.object({ received: z.number().nonnegative(), expected: z.number().nonnegative().nullable() }).strict().nullable(),
    channel: z.string().nullable().optional(),
    customer: z.string().nullable().optional(),
    qty: z.number().nullable().optional(),
    orderTotal: z.number().nullable().optional(),
    orderedAt: z.string().nullable().optional(),
    scannedOutBy: NavLocateStaffSchema.nullable().optional(),
    scanSource: z.enum(['live', 'backfill']).nullable().optional(),
    carrier: z.string().nullable().optional(),
    service: z.string().nullable().optional(),
    labelCreatedAt: z.string().nullable().optional(),
    labelCost: z.number().nullable().optional(),
    firstScanAt: z.string().nullable().optional(),
    /** The latest carrier event: the carrier's words, when, and (Fulfilled) the plain status word of its normalized category (`In transit`). */
    lastEvent: z.object({ label: z.string().nullable(), at: z.string().nullable(), status: z.string().nullable().optional() }).strict().nullable().optional(),
    /** Where the latest carrier event happened (`City, ST`), null when the carrier gave no place. Fulfilled only. */
    lastEventPlace: z.string().nullable().optional(),
    eta: z.string().nullable().optional(),
    attempts: z.number().int().nonnegative().nullable().optional(),
    exceptionCode: z.string().nullable().optional(),
    lastPoll: z.object({ at: z.string().nullable(), error: z.string().nullable() }).strict().nullable().optional(),
    packages: z.number().int().nonnegative().nullable().optional(),
    trackings: z.array(z.string()).nullable().optional(),
    returnRef: z.string().nullable().optional(),
    shipstationStatus: z.string().nullable().optional(),
    transitDays: z.number().nullable().optional(),
    claim: z.object({ opensAt: z.string(), closesAt: z.string() }).strict().nullable().optional(),
    lineCount: z.number().int().nonnegative().nullable().optional(),
    /**
     * Journey (Fulfilled only, operator 2026-10-05). `shipmentId` = the lead
     * package (`shipping_tracking_numbers.id`, the record `?shipment=` opens);
     * `promisedAt` = the carrier's FIRST promised delivery instant
     * (`first_estimated_delivery_at`, kept after delivery — `eta` is the
     * newest promise and clears on delivery); `clock` = when the row's
     * current bucket started (`since`) and when it breaches its threshold
     * (`due`, null = no threshold: the age alone is painted) — the client
     * computes age / ratio against its own now (`journeyClockFace`);
     * `checkIn` = the order's post-purchase check-in
     * (`order_support_follow_ups`, null = no projection: before the program
     * start, or never delivered).
     */
    shipmentId: z.number().int().positive().nullable().optional(),
    promisedAt: z.string().nullable().optional(),
    clock: z.object({ since: z.string(), due: z.string().nullable() }).strict().nullable().optional(),
    checkIn: z
      .object({
        state: z.enum(ORDER_CHECK_IN_STATES),
        supportItemId: z.number().int().positive().nullable(),
        dueAt: z.string().nullable(),
        contactedAt: z.string().nullable(),
        nextFollowUpAt: z.string().nullable(),
        /** The latest inbound customer message's instant. */
        repliedAt: z.string().nullable(),
        closedAt: z.string().nullable(),
        outcome: z.enum(CHECK_IN_OUTCOMES).nullable(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type NavLocateFacts = z.infer<typeof NavLocateFactsSchema>;

export const NavLocateEntrySchema = z
  .object({
    /** As pasted. */
    ref: z.string().min(1),
    /** A unique row key when `ref` can repeat (`GET /api/nav/fulfilled`: `order:<order #>` / `line:<orders.id>`); absent = `ref` is the key. */
    key: z.string().min(1).optional(),
    /** Bucket ids holding it, in bucket order; `[]` = found nowhere. */
    buckets: z.array(z.string().min(1)),
    /** What it is ("PO 4471 · Acme"), when found. */
    title: z.string().nullable(),
    /** Why it sits there ("Delivered · not scanned"). */
    detail: z.string().nullable(),
    /**
     * Its own durable record (the order; the receiving carton / PO record),
     * when it is one record — never a list URL, so opening it never rewrites
     * a list the operator holds (`/incoming?ref_in=`).
     */
    recordHref: z.string().startsWith('/').nullable(),
    /** Why it sits in its bucket, as a filterable id + words (`facetParam`). Absent = no facet. */
    facet: z.object({ id: z.string().min(1), label: z.string().min(1) }).strict().nullable().optional(),
    /** What the house knows about it ({@link NavLocateFactsSchema}); outbound / inbound `refs` answers only. Absent/null = found nowhere, or a section that keeps no row facts (support). */
    facts: NavLocateFactsSchema.nullable().optional(),
  })
  .strict();
export type NavLocateEntry = z.infer<typeof NavLocateEntrySchema>;

export const NavLocateResponseSchema = z
  .object({
    locator: z.enum(NAV_LOCATE_SCOPES),
    /** Every bucket the locator declares, in its order — zero counts included — then any other section's buckets holding a pasted ref (`<locator>:<id>`). */
    buckets: z.array(NavLocateBucketSchema),
    /**
     * `refs`: one per pasted ref, in paste order. `q`: a locator whose
     * records open on their own (support) lists its best matches, at most
     * {@link NAV_LOCATE_MAX_MATCHES}, ref = the record's `#<id>`; the others
     * answer counts alone (`[]`).
     */
    entries: z.array(NavLocateEntrySchema),
    /** `refs`: refs past {@link NAV_LOCATE_MAX_REFS}, dropped. `q`: matches past {@link NAV_LOCATE_MAX_MATCHES}, not listed. */
    truncated: z.number().int().nonnegative(),
  })
  .strict();
export type NavLocateResponse = z.infer<typeof NavLocateResponseSchema>;

/** One facet value with the purchases it holds (every OTHER filter applied). */
const NavPurchasesFacetOptionSchema = z
  .object({ value: z.string().min(1), label: z.string().min(1), count: z.number().int().nonnegative() })
  .strict();

export const NavPurchasesFacetsSchema = z
  .object({
    /** The row's vendor label (`facts.vendor`) — `?vendor=` matches it exactly. */
    vendors: z.array(NavPurchasesFacetOptionSchema),
    /** The purchase's source (`INBOUND_SOURCE_TYPES`), labelled `INBOUND_SOURCE_LABELS`. */
    sources: z.array(NavPurchasesFacetOptionSchema),
    /** Who unboxed it (`facts.unboxedBy`, by staff id). */
    unboxedBy: z
      .array(z.object({ id: z.number().int().positive(), name: z.string().nullable(), count: z.number().int().nonnegative() }).strict()),
  })
  .strict();
export type NavPurchasesFacets = z.infer<typeof NavPurchasesFacetsSchema>;

/**
 * `GET /api/nav/purchases` — every inbound purchase in a window (Deliveries ›
 * Purchases, `src/lib/nav/purchases`), read as the pasted list reads a
 * number: one entry per purchase (ref = its PO# / order number) with the
 * inbound locator's own buckets, detail, record and facts.
 */
export const NavPurchasesResponseSchema = z
  .object({
    locator: z.literal('inbound'),
    /** The inbound buckets in their order, counted over every filter EXCEPT `status` (zero counts included). */
    buckets: z.array(NavLocateBucketSchema),
    /** The purchases every filter keeps (`status` too), sorted server-side. */
    entries: z.array(NavLocateEntrySchema),
    /** `entries.length`. */
    total: z.number().int().nonnegative(),
    facets: NavPurchasesFacetsSchema,
  })
  .strict();
export type NavPurchasesResponse = z.infer<typeof NavPurchasesResponseSchema>;

/** One Fulfilled facet value with the rows it holds (every OTHER filter applied). */
const NavFulfilledFacetOptionSchema = z
  .object({ value: z.string().min(1), label: z.string().min(1), count: z.number().int().nonnegative() })
  .strict();

export const NavFulfilledFacetsSchema = z
  .object({
    /** Lower-cased `orders.account_source` — `?channel=` matches it exactly. */
    channels: z.array(NavFulfilledFacetOptionSchema),
    /** Upper-cased package carrier — `?carrier=`. */
    carriers: z.array(NavFulfilledFacetOptionSchema),
    /** Who packed it (`facts.packer`, by staff id) — `?packer=`. */
    packers: z
      .array(z.object({ id: z.number().int().positive(), name: z.string().nullable(), count: z.number().int().nonnegative() }).strict()),
    /** `live` / `backfill` / `none` (`FULFILLED_SCANS`) — `?scan=`. */
    scans: z.array(NavFulfilledFacetOptionSchema),
  })
  .strict();
export type NavFulfilledFacets = z.infer<typeof NavFulfilledFacetsSchema>;

/**
 * The Fulfilled facts the wire leaves out when they hold their common value
 * — the one list the route compacts by and {@link NavFulfilledWireFactsSchema}
 * restores from. A row whose value differs (null included) sends it.
 */
export const NAV_FULFILLED_WIRE_DEFAULTS = {
  section: 'outbound',
  lines: 1,
  duplicates: [] as number[],
  channelStatus: 'shipped',
  scanSource: 'backfill',
  packages: 1,
  attempts: 0,
} as const;
const WIRE = NAV_FULFILLED_WIRE_DEFAULTS;

/**
 * One Fulfilled row ON THE WIRE: a {@link NavLocateEntrySchema} with every
 * null and every {@link NAV_FULFILLED_WIRE_DEFAULTS} value left out
 * (thousands of rows, most facts empty or alike) — parsing restores them, so
 * the client holds plain `NavLocateEntry`s.
 */
const NavFulfilledWireFactsSchema = NavLocateFactsSchema.extend({
  section: z.enum(NAV_LOCATORS).default(WIRE.section),
  title: z.string().nullable().default(null),
  sku: z.string().nullable().default(null),
  tracking: z.string().nullable().default(null),
  deliveredAt: z.string().nullable().default(null),
  channelStatus: z.string().nullable().default(WIRE.channelStatus),
  shipBy: z.string().nullable().default(null),
  packedAt: z.string().nullable().default(null),
  shippedAt: z.string().nullable().default(null),
  packer: NavLocateStaffSchema.nullable().default(null),
  po: z.string().nullable().default(null),
  vendor: z.string().nullable().default(null),
  lines: z.number().int().nonnegative().default(WIRE.lines),
  duplicates: z.array(z.number().int()).default(() => []),
  unboxedAt: z.string().nullable().default(null),
  unboxedBy: NavLocateStaffSchema.nullable().default(null),
  units: NavLocateFactsSchema.shape.units.default(null),
  scanSource: z.enum(['live', 'backfill']).nullable().default(WIRE.scanSource),
  packages: z.number().int().nonnegative().nullable().default(WIRE.packages),
  attempts: z.number().int().nonnegative().nullable().default(WIRE.attempts),
});
const NavFulfilledWireEntrySchema = NavLocateEntrySchema.extend({
  title: z.string().nullable().default(null),
  detail: z.string().nullable().default(null),
  recordHref: z.string().startsWith('/').nullable().default(null),
  facts: NavFulfilledWireFactsSchema.nullable().optional(),
});

/**
 * Is each carrier's tracking being refreshed (`CarrierSyncHealth`,
 * src/lib/shipping/carrier-sync-health.ts) — the board's "UPS sync failing
 * since …". `lastOkAt` = newest successful poll; `configFault` = the runtime
 * lacks the carrier's credentials, so none of it is polled.
 */
const NavFulfilledSyncHealthSchema = z
  .object({
    carriers: z.array(
      z
        .object({
          carrier: z.enum(['UPS', 'FEDEX', 'USPS']),
          enabled: z.boolean(),
          open: z.number().int().nonnegative(),
          failingOpen: z.number().int().nonnegative(),
          lastOkAt: z.string().nullable(),
          configFault: z.boolean(),
          lastError: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type NavFulfilledSyncHealth = z.infer<typeof NavFulfilledSyncHealthSchema>;

/**
 * `GET /api/nav/fulfilled` — every shipped order in a window (Fulfillment ›
 * Fulfilled, `src/lib/nav/fulfilled`): one entry per order (or per order line
 * at `grain=line`), ref = the channel order #, exactly one bucket
 * (`FULFILLED_BUCKETS`), its record and facts. Entries travel compact
 * ({@link NavFulfilledWireEntrySchema}); `NavFulfilledResponse` is the parsed,
 * complete shape, `NavFulfilledWire` what the route sends.
 */
export const NavFulfilledResponseSchema = z
  .object({
    locator: z.literal('outbound'),
    /** `FULFILLED_BUCKETS` in precedence order, counted over every filter EXCEPT `status` (zero counts included). */
    buckets: z.array(NavLocateBucketSchema),
    /** The rows every filter keeps (`status` too), sorted server-side. */
    entries: z.array(NavFulfilledWireEntrySchema),
    /** `entries.length`. */
    total: z.number().int().nonnegative(),
    facets: NavFulfilledFacetsSchema,
    /** Carrier sync health for the org; absent when its read failed (the list still answers). */
    syncHealth: NavFulfilledSyncHealthSchema.optional(),
  })
  .strict();
export type NavFulfilledResponse = z.output<typeof NavFulfilledResponseSchema>;
export type NavFulfilledWire = z.input<typeof NavFulfilledResponseSchema>;
