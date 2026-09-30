# Contextual sidebar — API contract

The HTTP contract of the contextual-sidebar backend (BACKEND-HANDOFF.md §Definition
of done). The web shell and the Tauri desktop app read the same routes; the web
shell may also call the pure resolvers in-process (`resolveNavContext`,
`identify`), which return byte-identical shapes.

**Source of truth is the code.** Every schema below names its export and
`file:line`; when this doc and the code disagree, the code wins and this doc is
stale. Example responses are **captured** from `http://localhost:3050` on
2026-09-26 (dogfood org `usav`, admin session minted with
`node scripts/lighthouse-mint-session.mjs`), unless marked **shape, not
captured**. Long arrays are trimmed to 2 items and end in `"… (N more)"`; long
strings end in `…`. Every captured 2xx body of a route with a zod response
schema was re-parsed with that schema (`NavContextSchema`,
`NavRecentRowSchema`, `NavFacetsResponseSchema`, `IdentifyResponseSchema`):
all passed.

## 0. Conventions shared by every route

| | |
|---|---|
| Auth | Session cookie `cf_sid=<sid>` (web) or bearer on `/api/v1/*` only. Every route here is `withAuth` or `requireRoutePerm`; org and staff **always** come from the session, never from the request. |
| 401 | `{"error":"UNAUTHENTICATED"}` (captured, no cookie). |
| 403 (route permission) | `{"error":"FORBIDDEN","permission":"<perm>","role":"<role>"}` — `withAuth` (`src/lib/auth/withAuth.ts:178`) and `requireRoutePerm` (`src/lib/auth/dynamic-route-guard.ts:51`). **Shape, not captured** (the minted session is admin). Domain 403s (recents surface, facet context, settings write) return `{"error":"FORBIDDEN","permission":"<perm>"}` without `role`. |
| 400 (zod) | `parseBody` (`src/lib/schemas/parse.ts:4`): `{"error":"INVALID_BODY","issues":[{"path","message","code"}]}` — also used for **query strings** on nav/recents, nav/facets and identify. Brand GETs answer `INVALID_QUERY` with the same issue shape. `GET /api/nav/context` answers `INVALID_QUERY` with raw zod issues (`path` is an array). |
| 500 | `errorResponse(err, label)` (`src/lib/api/errors.ts`). |

Permission strings are exact `PermissionString`s (`src/lib/auth/permissions.ts`).
`null` below = any signed-in staffer.

## 1. Wire types

All in `src/lib/nav/context/schema.ts` (framework-free, `zod`). Every object is
`.strict()` — an unknown key fails the parse.

### NavItem — `NavItemSchema` (schema.ts:20)

```ts
{
  id: string;            // child / desk-view id
  label: string;
  href: string;          // starts with '/', fully built from the child's to() (pathname + search)
  active: boolean;
  kind: 'link' | 'drill' | 'filter' | 'toggle';   // NAV_ITEM_KINDS
  badge?: 'beta';        // NO numeric count field exists on a nav item
}
```

`NavSection` (schema.ts:33) = `{ id: string; label?: string; items: NavItem[] }` —
no `label` means a thin divider without a heading.

### NavContext — `NavContextSchema` (schema.ts:129)

```ts
{
  scope: 'top' | 'section';
  page: { id: string; label: string };           // SIDEBAR_PAGE_NAV page
  back: { label: string; mode: 'local' } | null; // null exactly at scope 'top'; never navigates
  search: {                                       // NavSearchSchema (schema.ts:45)
    scope: string;                                // e.g. 'outbound.triage' | 'global'
    placeholder: string;
    source: 'desk-store' | 'url-param' | 'identify';
    param?: string;                               // URL param written for url-param / desk-store
  };
  sections: NavSection[];                         // a 'section' context never holds top-level items
  params: string[];                               // every URL param the page's views read (filter parity surface)
  filters?: {                                     // NavFiltersSchema (schema.ts:73) — declared only; counts via /api/nav/facets
    facetContext: string;                         // '<pageId>.<sectionItemId>' | '<pageId>'
    groups: { id: string; label: string; param: string; multi: boolean }[];
  };
  controls?: {                                    // NavControlsSchema — non-facet view filters (no counts)
    staff?: { param: string };                    // AssigneeCombobox via StageStaffAssignPopover; writes/clears param
    dateRange?: {                                 // DateRangePickerField variant="compact"
      fromParam: string; toParam: string;         // YYYY-MM-DD civil dates
      clearParams: string[];                      // deleted when a range is picked
      placeholder: string;                        // the window the list shows with neither set
    };
  };
  recents?: { endpoint: string /* '/api/…' */; surface: string };   // NavRecentsSchema (schema.ts:82)
  savedViews?: { storageKey: string; paramKeys: string[] };         // NavSavedViewsSchema (schema.ts:90)
  actions?: NavAction[];
  scanInput?: { grammar: string; endpoint: string /* '/api/…' */ }; // NavScanInputSchema (schema.ts:98)
  rollout: 'legacy' | 'contextual';               // NAV_ROLLOUT_STATES
}
```

### NavAction — `NavActionSchema` (schema.ts:111)

```ts
{ id: string; label: string; href?: string /* '/…' */; intent?: string /* '<surface>:<verb>' */ }
// .refine: at least one of href | intent
```

A page/view-level verb the old desk chrome hosted. `href` = navigating is the
action; `intent` = a client verb the host dispatches. Row/record verbs stay in
the page body. A decl's `requires` permission (pages.ts `NavActionDecl`) is
applied server-side and never sent.

### NavRecentRow — `NavRecentRowSchema` (schema.ts:168)

```ts
{
  id: string;             // '<entityType>:<entityId>'
  entityType: string;
  entityId: string;       // always a string on the wire
  title: string;
  subtitle: string | null;
  status: string | null;
  at: string;             // ISO timestamp
  href: string;           // '/…' — built on read, never stored
}
```

### NavFacetsResponse — `NavFacetsResponseSchema` (schema.ts:202)

```ts
{
  context: string;
  total: number;          // int ≥ 0 — the active view's list total under the current params
  groups: {               // NavFacetGroupSchema (schema.ts:184)
    id: string; label: string; param: string;
    options: { value: string; label: string; count: number /* int ≥ 0 */ }[];
  }[];
}
```

### Recents surfaces — `NAV_RECENT_SURFACES` (src/lib/nav/recents/surfaces.ts:48)

Endpoint of every surface: `/api/nav/recents?surface=<id>`.

| Surface | Source | Permission | Cap | POST entityTypes | Replaces localStorage key |
|---|---|---|---|---|---|
| `receiving.viewed` | adapter | `receiving.view` | — | read-only | — |
| `receiving.unbox_opened` | adapter | `receiving.view` | — | read-only | — |
| `receiving.scanned` | adapter | `receiving.view` | — | read-only | — |
| `testing.opened` | adapter | `tech.qc_pass` | — | read-only | — |
| `tech.scans` | adapter | `tech.view` | — | read-only | — |
| `packer.packs` | adapter | `packing.view` | — | read-only | — |
| `labels.prints` | adapter | `print.label` | — | read-only | — |
| `pickup.orders` | adapter | `walk_in.view` | — | read-only | — |
| `identify.opened` | adapter | `null` | — | read-only | — |
| `support.tickets` | nav_recents | `integrations.zendesk` | 8 | `ticket` | `support:recent-tickets` |
| `detail_stacks` | nav_recents | `null` | 8 | `order`, `receiving`, `shipment` | `assistant:recent-detail-stacks` |
| `audit_log.trace` | nav_recents | `operations.view` | 12 | `serial` | `audit-log.trace.recents` |
| `labels.lookups` | nav_recents | `sku_stock.view` | 10 | `unit` | `labels:history-recents:v1` |
| `command_bar` | nav_recents | `null` | 6 | `order`, `unit`, `receiving`, `sku`, `repair`, `fba`, `warranty`, `ticket`, `location`, `page` | `command-bar-recent` |

Adapters (`src/lib/nav/recents/adapters.ts`) call the same domain read as the
feed's own route (`/api/receiving-lines`, `/api/picking/desk/logs`, `/api/packerlogs`,
`/api/labels/recent`, `/api/local-pickup-orders/lines`, `search_query_log`
opened follow-ups) — never an HTTP self-fetch — so the sidebar and the station
rail cannot disagree.

### Facet contexts — `NAV_FACET_CONTEXTS` / `NAV_FACET_GROUPS` / `NAV_FACET_PERMISSION` (src/lib/nav/facets/contexts.ts:16/39/52)

| Context | Groups (`id` → URL `param`, all `multi: false`) | Permission |
|---|---|---|
| `outbound.exceptions` | `category` → `category` | `orders.view` |
| `outbound.triage` | `stage`, `aging`, `late`, `attention`, `ustatus` | `orders.view` |
| `outbound.pick` | `stage`, `aging`, `late`, `attention`, `ustatus` | `orders.view` |
| `outbound.po` | `aging`, `late`, `attention` | `orders.view` |
| `outbound.shipped` | `type` → `shippedFilter`, `carrier` → `carrier`, `status` → `statusCategory`, `exceptions` → `exceptions` | `packing.view` |
| `pickup` | `status` → `status` | `walk_in.view` |

The resolver copies these groups verbatim into `NavContext.filters.groups` and
omits `filters` for a caller without the context's permission.

### View controls — `NavControls` (pages.ts `NAV_PAGE_DECLS` → `NavContext.controls`)

| View | `controls` |
|---|---|
| Allocate | `{ staff: { param: 'staff' } }` (`useToShipChrome.ts:59`, `UnshippedTable.tsx:220`) |
| Shipped | `{ staff: { param: 'staff' }, dateRange: { fromParam: 'dateFrom', toParam: 'dateTo', clearParams: ['shippedWeekOffset', 'allDates'], placeholder: 'This week' } }` (`useShippedTableFilters`: `effStaffId`, `setPeriodRange`) |
| Exceptions | none (the workbench reads no staff or date param) |

### Scan grammars — `NAV_SCAN_GRAMMARS` (src/lib/nav/context/pages.ts:54)

The wire value of `NavContext.scanInput.grammar`; one per classifier a station
bar runs before submitting.

| Grammar | Classifier order | Station page → `scanInput.endpoint` (pages.ts `NAV_PAGE_DECLS`) |
|---|---|---|
| `arrival` | command → (batch sort) location → tracking (`classifyArrivalScan`) | `triage` → `/api/receiving/lookup-po` |
| `unbox` | ticket · tracking · PO, receiving handles (`useTrackingScan`) | `receive` → `/api/receiving/lookup-po` |
| `pickup` | id → exact PO/ref → customer → unique partial (`resolvePickupScan`, client-side; hit writes `?lcpu=`) | `pickup` → `/api/local-pickup-orders/lines` |
| `testing` | handle/unit/serial → PO → tracking → partial → SKU (`resolveTestingScan`) | `testing` → `/api/receiving-lines` |
| `station` | command → unit key → handle → SKU → FNSKU → tracking → serial (`detectStationScanType`) | `ready-to-pack` → `/api/picking/desk/scan` |
| `pack` | unit QR → FNSKU → tracking → packing log (`PackScanColumn`) | `packer` → `/api/packing-logs` |
| `scan-out` | tracking-shaped commits, anything else is a note (`isScanOutTrackingCommit`) | `scan-out` → `/api/shipped/scan-out` |
| `fnsku` | FNSKU / ASIN / FBA shipment id (`useFbaScanRouting`) | `fba` → `/api/fba/fnskus/validate` |

## 2. Nav context

### `GET /api/nav/context`

- **Route:** `src/app/api/nav/context/route.ts:12` · **Auth:** `withAuth`, permission `null` (the context is permission-filtered by `ctx.permissions`).
- **Query:** `NavContextQuerySchema` (schema.ts:151)

  ```ts
  z.object({
    path: z.string().min(1).max(2048)
      .refine(p => p.startsWith('/') && !p.startsWith('//') && !p.includes('\\'),
              'path must be an in-app pathname'),   // pathname + optional search
    view: z.literal('top').optional(),               // 'top' = the ‹ peek: lane map with the page lit
  }).strict()
  ```

- **Status:** 200 · 400 `INVALID_QUERY` · 401.
- **Domain:** `getNavContextForStaff` (`src/lib/nav/context/service.ts:66`) → `resolveNavContext` (`src/lib/nav/context/resolve.ts:29`).
- **Notes:**
  - **One tenant statement** (the org's active `nav_definitions.config` + the staffer's `staff_preferences.prefs -> 'nav.contextual.<pageId>'`) plus the in-process-cached organization row and entitlements.
  - `Cache-Control: private, no-store` (captured).
  - The page id comes from `getSidebarNavPageId(pathname, search)` — a route table, not a URL-prefix match.
  - **Rollout clamp:** `rollout` = the staff pick → the org value → `NAV_CONTEXT_ROLLOUT[pageId]` (`src/lib/nav/context/rollout.ts`; every page `legacy` today). `resolveNavContext` then returns `contextual` **only when `parityGaps(pageId)` is empty** (`src/lib/nav/context/parity.ts`, memoised per page) **and the page is not a scan station** (`NAV_CONTEXT_PINNED_LEGACY`, every `kind: 'station'` page, operator ruling 2026-09-26: stations keep their desktop surface and move to mobile later). Otherwise it forces `legacy`.

Example — a Shipping view (`?path=/shipping/orders?view=triage`, section scope;
`params`, `actions` and `savedViews.paramKeys` trimmed, `sections` and `filters` in full):

```json
{
  "scope": "section",
  "page": {
    "id": "outbound",
    "label": "Shipping"
  },
  "back": {
    "label": "Shipping",
    "mode": "local"
  },
  "search": {
    "scope": "outbound.triage",
    "placeholder": "Search orders to ship",
    "source": "desk-store"
  },
  "sections": [
    {
      "id": "outbound.triage",
      "items": [
        {
          "id": "triage",
          "label": "Allocate",
          "href": "/shipping/orders",
          "active": true,
          "kind": "link"
        },
        {
          "id": "exceptions",
          "label": "Exceptions",
          "href": "/shipping/exceptions",
          "active": false,
          "kind": "link"
        },
        {
          "id": "shipped",
          "label": "Shipped",
          "href": "/shipping/shipped?shippedFilter=orders",
          "active": false,
          "kind": "link"
        }
      ]
    }
  ],
  "params": [
    "openOrderId",
    "sort",
    "dir",
    "stage",
    "aging",
    "… (52 more)"
  ],
  "filters": {
    "facetContext": "outbound.triage",
    "groups": [
      {
        "id": "stage",
        "label": "Stage",
        "param": "stage",
        "multi": false
      },
      {
        "id": "aging",
        "label": "Ship by",
        "param": "aging",
        "multi": false
      },
      {
        "id": "late",
        "label": "Must ship",
        "param": "late",
        "multi": false
      },
      {
        "id": "attention",
        "label": "Urgent",
        "param": "attention",
        "multi": false
      },
      {
        "id": "ustatus",
        "label": "Stock",
        "param": "ustatus",
        "multi": false
      }
    ]
  },
  "savedViews": {
    "storageKey": "unshipped_saved_views",
    "paramKeys": [
      "stage",
      "ustatus",
      "staff",
      "late",
      "… (6 more)"
    ]
  },
  "actions": [
    {
      "id": "orders.sync",
      "label": "Sync ShipStation",
      "intent": "orders-intake:sync"
    },
    {
      "id": "orders.sync-platforms",
      "label": "Sync a platform…",
      "intent": "orders-intake:platforms"
    },
    {
      "id": "orders.upload-csv",
      "label": "Upload orders CSV",
      "intent": "orders-intake:file"
    },
    "… (6 more)"
  ],
  "rollout": "legacy"
}
```

Example — a scan station at top scope (`?path=/triage`):

```json
{
  "scope": "top",
  "page": {
    "id": "triage",
    "label": "Arrival"
  },
  "back": null,
  "search": {
    "scope": "global",
    "placeholder": "Find anything — scan or type",
    "source": "identify"
  },
  "sections": [
    {
      "id": "top",
      "items": [
        {
          "id": "home",
          "label": "Daily",
          "href": "/",
          "active": false,
          "kind": "link"
        },
        {
          "id": "ops-photos",
          "label": "Media Library",
          "href": "/ops/photos",
          "active": false,
          "kind": "link"
        },
        "… (2 more)"
      ]
    },
    {
      "id": "floor",
      "label": "Scan Stations",
      "items": [
        {
          "id": "triage",
          "label": "Arrival",
          "href": "/triage",
          "active": true,
          "kind": "link"
        },
        {
          "id": "receive",
          "label": "Unbox",
          "href": "/unbox",
          "active": false,
          "kind": "link"
        },
        "… (6 more)"
      ]
    },
    "… (6 more)"
  ],
  "params": [
    "triview",
    "triq",
    "… (13 more)"
  ],
  "recents": {
    "endpoint": "/api/nav/recents?surface=receiving.scanned",
    "surface": "receiving.scanned"
  },
  "scanInput": {
    "grammar": "arrival",
    "endpoint": "/api/receiving/lookup-po"
  },
  "rollout": "legacy"
}
```

Example — the `‹` peek (`?path=/shipping/orders&view=top`): same page, `scope: "top"`,
`back: null`, the lane map with the page lit, the page's filters/actions kept:

```json
{
  "scope": "top",
  "page": {
    "id": "outbound",
    "label": "Shipping"
  },
  "back": null,
  "search": {
    "scope": "outbound.triage",
    "placeholder": "Search orders to ship",
    "source": "desk-store"
  },
  "sections": [
    {
      "id": "top",
      "items": [
        {
          "id": "home",
          "label": "Daily",
          "href": "/",
          "active": false,
          "kind": "link"
        },
        {
          "id": "ops-photos",
          "label": "Media Library",
          "href": "/ops/photos",
          "active": false,
          "kind": "link"
        },
        "… (2 more)"
      ]
    },
    {
      "id": "floor",
      "label": "Scan Stations",
      "items": [
        {
          "id": "triage",
          "label": "Arrival",
          "href": "/triage",
          "active": false,
          "kind": "link"
        },
        {
          "id": "receive",
          "label": "Unbox",
          "href": "/unbox",
          "active": false,
          "kind": "link"
        },
        "… (6 more)"
      ]
    },
    "… (6 more)"
  ],
  "params": [
    "pair",
    "openOrderId",
    "… (56 more)"
  ],
  "filters": {
    "facetContext": "outbound.triage",
    "groups": [
      {
        "id": "stage",
        "label": "Stage",
        "param": "stage",
        "multi": false
      },
      {
        "id": "aging",
        "label": "Ship by",
        "param": "aging",
        "multi": false
      },
      "… (3 more)"
    ]
  },
  "savedViews": {
    "storageKey": "unshipped_saved_views",
    "paramKeys": [
      "stage",
      "ustatus",
      "… (8 more)"
    ]
  },
  "actions": [
    {
      "id": "orders.sync",
      "label": "Sync ShipStation",
      "intent": "orders-intake:sync"
    },
    {
      "id": "orders.sync-platforms",
      "label": "Sync a platform…",
      "intent": "orders-intake:platforms"
    },
    "… (7 more)"
  ],
  "rollout": "legacy"
}
```

400 (`?path=//evil.com`):

```json
{
  "error": "INVALID_QUERY",
  "issues": [
    {
      "code": "custom",
      "path": [
        "path"
      ],
      "message": "path must be an in-app pathname"
    }
  ]
}
```

## 3. Recents

### `GET /api/nav/recents`

- **Route:** `src/app/api/nav/recents/route.ts:18` · **Auth:** `withAuth`; then the **surface's** permission (table above; `null` = any staffer).
- **Query:** `NavRecentsQuery` (`src/lib/schemas/nav.ts:13`)

  ```ts
  z.object({
    surface: z.enum(NAV_RECENT_SURFACE_IDS),
    limit: z.coerce.number().int().min(1).max(50 /* NAV_RECENTS_MAX_LIMIT */).optional(),
  })
  ```

- **Response:** `{ surface: string; rows: NavRecentRow[] }`.
- **Status:** 200 · 400 `INVALID_BODY` · 401 · 403 `{"error":"FORBIDDEN","permission":"<surface permission>"}`.
- **Domain:** `listNavRecents` (`src/lib/nav/recents/service.ts`).
- **Notes:**
  - **Cap semantics:** a `nav_recents` surface returns `min(limit ?? cap, cap)` rows; an adapter surface returns `limit ?? 25` rows.
  - Store reads are one statement on the `(organization_id, staff_id, surface, opened_at DESC)` index (`LIST_SQL`, `src/lib/nav/recents/store.ts:81`).
  - Rows are per staffer (session staff id).
  - A store row's `href` is built on read from `(surface, entityType, entityId)` (`src/lib/nav/recents/hrefs.ts`), so a moved route re-points every old recent.
  - No cache headers (fresh per request).

Example — adapter surface (`?surface=receiving.scanned&limit=2`):

```json
{
  "surface": "receiving.scanned",
  "rows": [
    {
      "id": "receiving_line:32479",
      "entityType": "receiving_line",
      "entityId": "32479",
      "title": "Bose PS48 Series III Subwoofer - White",
      "subtitle": "65411580 · 877377316970",
      "status": "MATCHED",
      "at": "2026-09-21T23:39:59.475Z",
      "href": "/triage?recvId=53048&lineId=32479"
    },
    {
      "id": "receiving_line:31919",
      "entityType": "receiving_line",
      "entityId": "31919",
      "title": "Band accordion fixture",
      "subtitle": "E2E-BAND-mti980qa8696",
      "status": "MATCHED",
      "at": "2026-09-01T05:56:23.158Z",
      "href": "/triage?recvId=52333&lineId=31919"
    }
  ]
}
```

Example — the identify opened follow-up surface (`?surface=identify.opened&limit=2`):

```json
{
  "surface": "identify.opened",
  "rows": [
    {
      "id": "order:7109",
      "entityType": "order",
      "entityId": "7109",
      "title": "Bose CineMate GS Series II Digital Home Theater Speaker System",
      "subtitle": "FBA19JY9D8PV",
      "status": null,
      "at": "2026-09-25T23:07:28.472Z",
      "href": "/search?sel=order:7109"
    }
  ]
}
```

Example — store surface after the POST below (`?surface=command_bar`):

```json
{
  "surface": "command_bar",
  "rows": [
    {
      "id": "page:/shipping/orders?view=triage",
      "entityType": "page",
      "entityId": "/shipping/orders?view=triage",
      "title": "Shipping · To ship",
      "subtitle": null,
      "status": null,
      "at": "2026-09-26T19:57:49.554Z",
      "href": "/shipping/orders?view=triage"
    }
  ]
}
```

400 (`?surface=nope`):

```json
{
  "error": "INVALID_BODY",
  "issues": [
    {
      "path": "surface",
      "message": "Invalid option: expected one of \"receiving.viewed\"|\"receiving.unbox_opened\"|\"receiving.scanned\"|\"testing.opened\"|\"tech.scans\"|\"packer.packs\"|\"labels.prints\"|\"pi…",
      "code": "invalid_value"
    }
  ]
}
```

### `POST /api/nav/recents`

- **Route:** `src/app/api/nav/recents/route.ts:39` · **Auth:** `withAuth`; then the surface's permission.
- **Body:** `NavRecentOpenBody` (`src/lib/schemas/nav.ts:20`)

  ```ts
  z.object({
    surface: z.enum(NAV_RECENT_SURFACE_IDS),
    entityType: z.string().trim().min(1).max(64),
    entityId: z.union([z.string(), z.number().int().nonnegative()])
      .transform(v => String(v).trim()).pipe(z.string().min(1).max(256)), // ticket ids arrive as numbers, serials as strings
    label: z.string().trim().max(512).default(''),                         // stored as label_snapshot
  }).strict()
  ```

- **Response:** `{"ok":true}`.
- **Status:**
  - 200.
  - 400 — `INVALID_BODY` (zod), or a domain error: `{"error":"SURFACE_NOT_WRITABLE"}` (an adapter surface), `{"error":"ENTITY_TYPE_NOT_ALLOWED"}` (not in the surface's `entityTypes`), `{"error":"INVALID_ENTITY_ID"}` (`isValidNavRecentEntityId`: `page` → same-origin app path; numeric kinds → positive int; `labels.lookups` / `audit_log.trace` → any non-empty).
  - 401.
  - 403 `FORBIDDEN` + `permission`.
- **Notes:**
  - **Upsert + cap trim in ONE SQL statement** (`UPSERT_AND_TRIM_SQL`, store.ts:58): the MRU bump and the delete-beyond-`cap` run as one data-modifying CTE in one tenant transaction. The list never exceeds `cap`, and re-opening an entity moves it to the top instead of duplicating it.
  - Navigation telemetry, not an audited business mutation.

Captured request/response:

```http
POST /api/nav/recents
{"surface":"command_bar","entityType":"page","entityId":"/shipping/orders?view=triage","label":"Shipping · To ship"}
```

```json
{
  "ok": true
}
```

400s (captured): adapter surface → `{"error":"SURFACE_NOT_WRITABLE"}`; `command_bar` + `entityType: "serial"` → `{"error":"ENTITY_TYPE_NOT_ALLOWED"}`.

## 4. Facets

### `GET /api/nav/facets`

- **Route:** `src/app/api/nav/facets/route.ts:16` · **Auth:** `withAuth`; then `NAV_FACET_PERMISSION[context]` (`orders.view` for the `outbound.*` queue and exceptions contexts, `packing.view` for `outbound.shipped` — `/api/packerlogs`' gate, `walk_in.view` for `pickup`).
- **Query:** `NavFacetsQuery` (`src/lib/schemas/nav.ts:35`) — `z.object({ context: z.enum(NAV_FACET_CONTEXTS) })`. The view's **own list params** ride alongside and are read per context:
  - `outbound.triage` / `outbound.pick` / `outbound.po`: `stage` (`pending|tested|packed`), `aging` (`overdue|today|upcoming|unscheduled`), `late=1`, `attention=1`, `ustatus=BLOCKED`, `staff=<id>`.
  - `outbound.exceptions`: `category`, `search`.
  - `outbound.shipped`: `shippedFilter` (`all|orders|sku|fba`; absent counts as `all`), `carrier` (`UPS|USPS|FEDEX`), `statusCategory`, `exceptions=1`, `staff` / `packedBy` / `testedBy`, and the window (`dateFrom`/`dateTo`, `shippedWeekOffset`, `allDates=1`; default this week).
  - `pickup`: `status`, `q`.
- **Response:** `NavFacetsResponse`. **Status:** 200 · 400 `INVALID_BODY` · 401 · 403 `{"error":"FORBIDDEN","permission":…}`.
- **Domain:** `getNavFacets` (`src/lib/nav/facets/service.ts`) → `outboundFacets` / `shippedFacets` / `pickupFacets` → `computeFacets` (`src/lib/nav/facets/compute.ts`).
- **Notes:**
  - **One statement per request** for the `outbound.*` contexts. It returns one row per combination of facet values with its count, over the **same predicates the list reads** (`sqlDeskQueueScope`, `sqlOrderDeskStage`, `sqlOrderAssignedToStaff`, `sqlOrderTestDeadlineAt`, exception scope/category SQL).
  - `outbound.shipped` reads the Shipped list's own population (`buildPackerLogBaseWhere`, `src/lib/neon/packer-logs-week.ts`) and its filter fragments (`src/lib/shipping/shipped-filter/shipped-filter-sql.ts` — the same ones `fetchPackerLogRows` puts in its page WHERE), clips to the window's days and counts **packages** (the list shows one row per package). Not reflected: the desk-store search, `?ostatus`, and a type preference kept only in the browser.
  - `pickup` reuses the workbench read (`listLocalPickupLines`) and its in-memory predicate.
  - `total` = rows matching every active filter. An option's count = rows matching every **other** group's filter plus that option (a group never narrows its own options), so picking an option makes the list total equal the count.
  - The To-ship free-text `q` is **not** reflected (the list switches to an unscoped search feed when it is set).
  - `Cache-Control: private, no-store`.

Example (`?context=outbound.triage`; `total` 38 = `GET /api/orders?inWarehouse=true` count 38 = desk-counts `triage` 38 = queue-counts `total` 38, all captured in the same run):

```json
{
  "context": "outbound.triage",
  "total": 38,
  "groups": [
    {
      "id": "stage",
      "label": "Stage",
      "param": "stage",
      "options": [
        {
          "value": "pending",
          "label": "Not tested",
          "count": 24
        },
        {
          "value": "tested",
          "label": "Tested",
          "count": 6
        },
        "… (1 more)"
      ]
    },
    {
      "id": "aging",
      "label": "Ship by",
      "param": "aging",
      "options": [
        {
          "value": "overdue",
          "label": "Overdue",
          "count": 4
        },
        {
          "value": "today",
          "label": "Due today",
          "count": 0
        },
        "… (2 more)"
      ]
    },
    "… (3 more)"
  ]
}
```

Example (`?context=outbound.exceptions`; `total` 382 = desk-counts `exceptions` 382):

```json
{
  "context": "outbound.exceptions",
  "total": 382,
  "groups": [
    {
      "id": "category",
      "label": "Category",
      "param": "category",
      "options": [
        {
          "value": "SKU Mapping",
          "label": "SKU Mapping",
          "count": 342
        },
        {
          "value": "Out of Stock",
          "label": "Out of Stock",
          "count": 39
        },
        "… (6 more)"
      ]
    }
  ]
}
```

Example (`?context=pickup`):

```json
{
  "context": "pickup",
  "total": 243,
  "groups": [
    {
      "id": "status",
      "label": "Status",
      "param": "status",
      "options": [
        {
          "value": "process",
          "label": "Need to process",
          "count": 238
        },
        {
          "value": "draft",
          "label": "Draft",
          "count": 238
        },
        "… (1 more)"
      ]
    }
  ]
}
```

400 (an unknown context, e.g. `?context=outbound.fba`):

```json
{
  "error": "INVALID_BODY",
  "issues": [
    {
      "path": "context",
      "message": "Invalid option: expected one of \"outbound.exceptions\"|\"outbound.triage\"|\"outbound.pick\"|\"outbound.po\"|\"outbound.shipped\"|\"pickup\"",
      "code": "invalid_value"
    }
  ]
}
```

## 5. Identify

Wire types: `src/lib/identify/schema.ts` (framework-free). Limits:
`IDENTIFY_MAX_LINES` 50, `IDENTIFY_MAX_LINE_CHARS` 256,
`IDENTIFY_MAX_INPUT_CHARS` 20 000, `IDENTIFY_DEFAULT_LIMIT` 8,
`IDENTIFY_MAX_LIMIT` 25.

### `POST /api/identify` · `GET /api/identify?q=&context=&limit=`

- **Route:** `src/app/api/identify/route.ts:56` (POST), `:40` (GET, the same call, for probes) · **Auth:** `withAuth`, permission **`sku_stock.view`**.
- **Request:** `IdentifyRequestSchema` (schema.ts:80)

  ```ts
  z.object({
    q: z.string().max(20_000).refine(v => v.trim().length > 0, 'q is empty'), // one identifier per line = batch
    context: z.string().trim().max(96)
      .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)?$/i).optional(),  // '<pageId>' | '<pageId>.<sectionId>' — ranks that scope first
    limit: z.coerce.number().int().min(1).max(25).optional(),  // candidates per line
  }).strict()
  ```

- **Response:** `IdentifyResponseSchema` (schema.ts:161)

  ```ts
  {
    mode: 'single' | 'list' | 'none' | 'batch';   // 'batch' when > 1 line
    truncated: boolean;                           // > 50 distinct lines pasted; the rest dropped
    context: string | null;
    lines: {                                      // IdentifyLineSchema (schema.ts:140)
      input: string;
      mode: 'single' | 'list' | 'none';           // 'single' = one exact unique identifier → open it
      tokens: { text: string; kinds: IdentifyTokenKind[] }[];
        // handle | digital_link | gs1 | tracking | order_number | marketplace_item | gtin | fnsku | asin | po | serial | sku | model | grade | word
      filters: {
        brands: { id: number; name: string; token: string }[];   // brand-alias hit → brand filter
        conditions: ConditionGrade[];                            // grade words → condition filter
      };
      candidates: {                               // IdentifyCandidateSchema (schema.ts:118)
        kind: 'order' | 'unit' | 'receiving' | 'sku' | 'repair' | 'fba' | 'warranty' | 'ticket' | 'location';
        entityId: number;
        title: string;
        subtitle: string | null;
        brand: {                                  // IdentifyBrandSchema (schema.ts:95)
          id: number; name: string; kind: string; confidence: number; source: string;
          root: { id: number; name: string } | null;   // display brand ('Bose' for a Wave SKU)
        } | null;
        confidence: number;                       // 0..1
        matchedOn: { field: IdentifyMatchField; token: string };   // the "why" line
        href: string;                             // page + sidebar context + record param
        actions: { id: string; label: string; href?: string }[];   // absent href = on the record's own page
        stage: 'exception' | 'picking' | 'to_ship' | 'shipped' | 'receiving' | null;
        inContext: boolean;                       // belongs to the caller's context (ranked first)
      }[];
    }[];
  }
  ```

- **Status:** 200 · 400 `INVALID_BODY` · 401 · 403 (`sku_stock.view`).
- **Notes:**
  - Read-only.
  - **Cache:** the whole answer is cached per org (`getOrSet(CACHE_NS.identify, …)`, TTL 60 s, `src/lib/identify/identify.ts:64`). Tags `orders`, `sku-catalog`, `receiving-logs`, `fba-fnskus`, `tech-logs` drop it on any write. Key = sha256 of the normalised lines + `context` + `limit`.
  - Exact lookups and free text run through `tenantQueryOneTrip` (one round trip).
  - **Query log:** every call lands in `search_query_log` (surface `identify`) via `after()`.
  - **Opened follow-up:** when the operator opens a candidate, post it to `POST /api/search/opened` (below). Those rows feed the `identify.opened` recents surface.

Captured — batch POST with context:

```http
POST /api/identify
{"q":"jbl flip\n21-15107-47310","context":"outbound.triage","limit":2}
```

```json
{
  "mode": "batch",
  "lines": [
    {
      "input": "jbl flip",
      "mode": "none",
      "tokens": [
        {
          "text": "jbl",
          "kinds": [
            "word"
          ]
        },
        {
          "text": "flip",
          "kinds": [
            "word"
          ]
        }
      ],
      "filters": {
        "brands": [
          {
            "id": 48,
            "name": "JBL",
            "token": "jbl"
          }
        ],
        "conditions": []
      },
      "candidates": []
    },
    {
      "input": "21-15107-47310",
      "mode": "list",
      "tokens": [
        {
          "text": "21-15107-47310",
          "kinds": [
            "tracking",
            "order_number",
            "… (5 more)"
          ]
        }
      ],
      "filters": {
        "brands": [],
        "conditions": []
      },
      "candidates": [
        {
          "kind": "order",
          "entityId": 13867,
          "title": "Replacement PCB Board Rear Panel for Bose Acoustimass 10 Subwoofer Series III",
          "subtitle": "21-15107-47310 · eBay",
          "brand": null,
          "confidence": 0.97,
          "matchedOn": {
            "field": "order_id",
            "token": "21-15107-47310"
          },
          "href": "/shipping/exceptions?order=13867",
          "actions": [
            {
              "id": "open",
              "label": "Open"
            },
            {
              "id": "resolve_exception",
              "label": "Resolve exception",
              "href": "/shipping/exceptions?order=13867"
            },
            "… (2 more)"
          ],
          "stage": "exception",
          "inContext": true
        },
        {
          "kind": "receiving",
          "entityId": 53219,
          "title": "Receiving #53219",
          "subtitle": "9434650206217290326467",
          "brand": null,
          "confidence": 0.93,
          "matchedOn": {
            "field": "po",
            "token": "21-15107-47310"
          },
          "href": "/search?sel=receiving:53219",
          "actions": [
            {
              "id": "open",
              "label": "Open"
            },
            {
              "id": "trace",
              "label": "Trace history",
              "href": "/operations?mode=history&dim=tracking&tracking=9434650206217290326467"
            }
          ],
          "stage": "receiving",
          "inContext": false
        }
      ]
    }
  ],
  "truncated": false,
  "context": "outbound.triage"
}
```

Captured — brand free text (`GET ?q=bose%20wave&limit=2`):

```json
{
  "mode": "list",
  "lines": [
    {
      "input": "bose wave",
      "mode": "list",
      "tokens": [
        {
          "text": "bose",
          "kinds": [
            "word"
          ]
        },
        {
          "text": "wave",
          "kinds": [
            "word"
          ]
        }
      ],
      "filters": {
        "brands": [
          {
            "id": 35,
            "name": "Wave",
            "token": "bose wave"
          }
        ],
        "conditions": []
      },
      "candidates": [
        {
          "kind": "sku",
          "entityId": 2845,
          "title": "Wave Radio/ CD power cord",
          "subtitle": "TMP-AGY3D-F4XZK",
          "brand": {
            "id": 35,
            "name": "Wave",
            "kind": "product_line",
            "confidence": 0.9,
            "source": "product_line",
            "root": {
              "id": 34,
              "name": "Bose"
            }
          },
          "confidence": 0.8,
          "matchedOn": {
            "field": "brand",
            "token": "bose wave"
          },
          "href": "/products?view=qc&skuId=2845",
          "actions": [
            {
              "id": "open",
              "label": "Open"
            },
            {
              "id": "find_stock",
              "label": "Find in inventory",
              "href": "/inventory/skus?q=TMP-AGY3D-F4XZK"
            }
          ],
          "stage": null,
          "inContext": false
        },
        {
          "kind": "sku",
          "entityId": 2786,
          "title": "Bose Wave iPod dock",
          "subtitle": "TMP-ZCWZV-VMN1Q",
          "brand": {
            "id": 35,
            "name": "Wave",
            "kind": "product_line",
            "confidence": 0.9,
            "source": "product_line",
            "root": {
              "id": 34,
              "name": "Bose"
            }
          },
          "confidence": 0.8,
          "matchedOn": {
            "field": "brand",
            "token": "bose wave"
          },
          "href": "/products?view=qc&skuId=2786",
          "actions": [
            {
              "id": "open",
              "label": "Open"
            },
            {
              "id": "find_stock",
              "label": "Find in inventory",
              "href": "/inventory/skus?q=TMP-ZCWZV-VMN1Q"
            }
          ],
          "stage": null,
          "inContext": false
        }
      ]
    }
  ],
  "truncated": false,
  "context": null
}
```

400 (`GET ?q=`):

```json
{
  "error": "INVALID_BODY",
  "issues": [
    {
      "path": "q",
      "message": "q is empty",
      "code": "custom"
    }
  ]
}
```

### `POST /api/search/opened` (the identify / search click follow-up)

- **Route:** `src/app/api/search/opened/route.ts:16` · **Auth:** `withAuth`, permission `null`.
- **Body:** inline `bodySchema` (route.ts:9)

  ```ts
  z.object({
    query: z.string().min(1).max(512),         // the query the row was found with (matched on its normalised form)
    entityType: z.string().min(1).max(64),     // IdentifyCandidate.kind / search hit entityType
    entityId: z.coerce.number().int().positive(),
  })
  ```

- **Status:** 202 (empty body; the write runs in `after()`, `markSearchResultOpened`) · 400 `{"error":"Invalid body"}` · 401.

Captured: `{"query":"bose","entityType":"order","entityId":19453}` → `202`, empty body. `{"query":""}` → `400 {"error":"Invalid body"}`.

## 6. Brands

Brand kinds: `brand | franchise | product_line` (`BRAND_KINDS`,
`src/lib/brands/normalize.ts`). Route cores live in `src/lib/brands/http.ts`;
route files are one-line gates. Reads use `tenantQueryOneTrip` (**one round
trip**); writes run in one `withTenantTransaction`. Brand responses have **no zod
response schema**: the shapes are the TS interfaces in `src/lib/brands/store.ts`
(`BrandListItem`, `BrandDetail`, `BrandProduct`, `BrandProposal`). Brand errors
answer `{"success":false,"error":"<message>"}`, plus `collisions` on an alias 409.

### `GET /api/brands`

- **Route:** `src/app/api/brands/route.ts:9` · **Auth:** `withAuth`, permission **`sku_stock.view`**.
- **Query:** `BrandListQuery` (`src/lib/schemas/brands.ts:12`) — unknown params are ignored.

  ```ts
  z.object({
    q: z.string().max(80).optional().default(''),       // normalised (lower-case, punctuation-folded) before matching
    kind: z.enum(['brand','franchise','product_line']).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  ```

- **Response:** `{ success: true, brands: BrandListItem[] }`. `BrandListItem` = `{ id, name, slug, kind, parentBrandId, publisher, matchedAlias: string|null, aliasRank: 0|1|2|null /* exact, prefix, contains */, activeSkuCount }`.
- **Order:** alias hit rank, then `activeSkuCount` (the brand plus its descendants).
- **Status:** 200 · 400 `INVALID_QUERY` · 401 · 403.

Captured (`?q=bo&limit=3`):

```json
{
  "success": true,
  "brands": [
    {
      "id": 34,
      "name": "Bose",
      "slug": "bose",
      "kind": "brand",
      "parentBrandId": null,
      "publisher": null,
      "matchedAlias": "Bose",
      "aliasRank": 1,
      "activeSkuCount": 221
    },
    {
      "id": 35,
      "name": "Wave",
      "slug": "wave",
      "kind": "product_line",
      "parentBrandId": 34,
      "publisher": null,
      "matchedAlias": "Bose Wave",
      "aliasRank": 1,
      "activeSkuCount": 37
    },
    "… (1 more)"
  ]
}
```

400 (`?kind=bogus`):

```json
{
  "error": "INVALID_QUERY",
  "issues": [
    {
      "path": "kind",
      "message": "Invalid option: expected one of \"brand\"|\"franchise\"|\"product_line\"",
      "code": "invalid_value"
    }
  ]
}
```

### `POST /api/brands`

- **Route:** `src/app/api/brands/route.ts:12` · **Auth:** `withAuth`, permission **`sku_stock.manage`**.
- **Body:** `BrandCreateBody` (`src/lib/schemas/brands.ts:29`) — strict; an `organizationId` or any unknown key is refused.

  ```ts
  z.object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(BRAND_KINDS).optional().default('brand'),
    parentBrandId: z.number().int().positive().nullable().optional(),  // required when kind = product_line
    publisher: z.string().trim().max(120).nullable().optional(),
    aliases: z.array(z.string().trim().min(1).max(80)).max(50).optional().default([]),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),     // or the Idempotency-Key header
  }).strict()
  ```

- **Response 201 (shape, not captured):** `{ success: true, brand: BrandRow, aliases: BrandAliasRow[] }`. `BrandRow` is the `brand` object of `GET /api/brands/[id]`; the brand's own name is always stored as an alias.
- **Status:**
  - 201.
  - 400 — `INVALID_BODY`, or a domain error: `brand name has no letters or digits`, `a product_line needs a parent brand`, `alias has no letters or digits: …`, `a brand cannot be its own parent`, `parent would create a cycle …`, `brand tree may be at most N levels deep`.
  - 401. 403. 404 — `parent brand N not found`.
  - 409 — `alias already belongs to another brand: …` with `collisions: [{ alias, normalizedAlias, ownerBrandId, ownerBrandName }]`, or `slug "x" already belongs to Name (#id)`.
- **Notes:**
  - Audited (`brand.create`, entity `product_brand`).
  - With an idempotency key, a retried POST replays the stored 201 instead of colliding (`src/lib/brands/http.test.ts:124`).
  - A refused create is not audited.
  - When the assistant proposes a brand change, it goes through `agent_mutations` (`brand.create` / `brand.update` / `sku_brand.assign`, review class), **not** this route.

Captured 409 (`POST {"name":"Bose","aliases":["Bose Corp"]}` — refused before any insert, so nothing was written):

```json
{
  "success": false,
  "error": "alias already belongs to another brand: \"Bose\" → Bose (#34), \"Bose Corp\" → Bose (#34)",
  "collisions": [
    {
      "alias": "Bose",
      "normalizedAlias": "bose",
      "ownerBrandId": 34,
      "ownerBrandName": "Bose"
    },
    {
      "alias": "Bose Corp",
      "normalizedAlias": "bose corp",
      "ownerBrandId": 34,
      "ownerBrandName": "Bose"
    }
  ]
}
```

Captured 400 (`POST {"name":"X","organizationId":"x"}`): `{"error":"INVALID_BODY","issues":[{"path":"","message":"Unrecognized key: \"organizationId\"","code":"unrecognized_keys"}]}`.

PATCH refusals captured (no row changed): `PATCH /api/brands/34 {}` → `400 {"error":"INVALID_BODY","issues":[{"path":"","message":"no changes","code":"custom"}]}`; `PATCH /api/brands/999999 {"name":"Nope"}` → `404 {"success":false,"error":"Not found"}`.

### `GET /api/brands/[id]`

- **Route:** `src/app/api/brands/[id]/route.ts:9` · **Auth:** `requireRoutePerm`, permission **`sku_stock.view`**.
- **Params:** `id` = positive int32 (else 400 `Invalid ID`).
- **Response:** `{ success: true } & BrandDetail`:
  - `brand: BrandRow` = `{ id, name, slug, normalizedName, kind, parentBrandId, publisher, isActive, createdAt, updatedAt }`;
  - `aliases: BrandAliasRow[]` = `{ id, brandId, alias, normalizedAlias, source: 'seed'|'zoho'|'listing'|'operator'|'agent', reviewOnly }[]`;
  - `parent: { id, name, kind } | null`;
  - `children: { id, name, kind, isActive }[]`;
  - `counts: { skuCount, activeSkuCount, openOrderCount, onHandUnits }` — rolled up over the brand and its descendants.
- **Status:** 200 · 400 · 401 · 403 · 404 `{"success":false,"error":"Not found"}` (also for another org's brand: org isolation is RLS + `organization_id`).

Captured (`/api/brands/34`):

```json
{
  "success": true,
  "brand": {
    "id": 34,
    "name": "Bose",
    "slug": "bose",
    "normalizedName": "bose",
    "kind": "brand",
    "parentBrandId": null,
    "publisher": null,
    "isActive": true,
    "createdAt": "2026-09-26 12:45:11.870817-07",
    "updatedAt": "2026-09-26 12:45:11.870817-07"
  },
  "aliases": [
    {
      "id": 67,
      "brandId": 34,
      "alias": "Bose",
      "normalizedAlias": "bose",
      "source": "seed",
      "reviewOnly": false
    },
    {
      "id": 68,
      "brandId": 34,
      "alias": "Bose Corp",
      "normalizedAlias": "bose corp",
      "source": "seed",
      "reviewOnly": false
    },
    "… (5 more)"
  ],
  "parent": null,
  "children": [
    {
      "id": 46,
      "name": "3-2-1",
      "kind": "product_line",
      "isActive": true
    },
    {
      "id": 40,
      "name": "Acoustimass",
      "kind": "product_line",
      "isActive": true
    },
    "… (10 more)"
  ],
  "counts": {
    "skuCount": 1148,
    "activeSkuCount": 221,
    "openOrderCount": 145,
    "onHandUnits": 732
  }
}
```

Captured refusals: `/api/brands/999999` → `404 {"success":false,"error":"Not found"}`; `/api/brands/abc` → `400 {"success":false,"error":"Invalid ID"}`.

### `PATCH /api/brands/[id]`

- **Route:** `src/app/api/brands/[id]/route.ts:17` · **Auth:** `requireRoutePerm`, permission **`sku_stock.manage`**.
- **Body:** `BrandUpdateBody` (`src/lib/schemas/brands.ts:41`) — strict, at least one field.

  ```ts
  z.object({
    name: brandName.optional(),
    kind: z.enum(BRAND_KINDS).optional(),
    parentBrandId: z.number().int().positive().nullable().optional(),
    publisher: z.string().trim().max(120).nullable().optional(),
    isActive: z.boolean().optional(),
    aliasesAdd: z.array(aliasText).max(50).optional(),
    aliasesRemove: z.array(aliasText).max(50).optional(),
  }).strict().refine(b => Object.values(b).some(v => v !== undefined), 'no changes')
  ```

- **Response 200 (shape, not captured):** `{ success: true, brand: BrandRow, aliases: BrandAliasRow[], changed: boolean }`.
- **Status:**
  - 200.
  - 400 — `INVALID_BODY` / `Invalid ID`, or a domain error: `a brand's own name cannot be removed from its aliases`, `not an alias of this brand: …`, parent/cycle/depth errors, `the brand name cannot be a review-only alias`.
  - 401. 403. 404 `Not found`.
  - 409 — alias collision (`collisions`) or slug owner.
- **Notes:** audited (`brand.update`, with `extra.aliasesAdded` / `aliasesRemoved`) only when `changed`.

### `GET /api/brands/[id]/products`

- **Route:** `src/app/api/brands/[id]/products/route.ts:9` · **Auth:** `requireRoutePerm`, permission **`sku_stock.view`**.
- **Query:** `BrandProductsQuery` (`src/lib/schemas/brands.ts:19`)

  ```ts
  z.object({
    cursor: z.string().max(400).optional(),     // opaque: base64url(JSON [sku, skuCatalogId])
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    status: z.enum(['active','inactive','all']).optional().default('active'),
  })
  ```

- **Response:** `{ success: true, items: BrandProduct[], nextCursor: string | null }`. `BrandProduct` = `{ skuCatalogId, sku, title /* identity title: the Zoho item governs */, isActive, imageUrl, brand: { id, name, kind }, brandConfidence, brandSource, onHandUnits }`. Includes descendant lines (a Bose query returns Wave SKUs).
- **Status:** 200 · 400 (`INVALID_QUERY`, `Invalid ID`, `Invalid cursor` — a bad cursor never silently restarts at page one) · 401 · 403 · 404 (unknown brand, first page only).
- **Notes:** keyset on `(sku, id)`; fetches `limit + 1` to mint `nextCursor`.

Captured (`/api/brands/34/products?limit=2`):

```json
{
  "success": true,
  "items": [
    {
      "skuCatalogId": 1,
      "sku": "00000",
      "title": "Bose 321 Series II Home Entertainment System",
      "isActive": true,
      "imageUrl": "https://d2j6dbq0eux0bg.cloudfront.net/images/16593703/1017352277.jpg",
      "brand": {
        "id": 46,
        "name": "3-2-1",
        "kind": "product_line"
      },
      "brandConfidence": 0.9,
      "brandSource": "product_line",
      "onHandUnits": 0
    },
    {
      "skuCatalogId": 2,
      "sku": "00001",
      "title": "Bose VCS-10 Center Channel Speaker",
      "isActive": true,
      "imageUrl": null,
      "brand": {
        "id": 34,
        "name": "Bose",
        "kind": "brand"
      },
      "brandConfidence": 0.95,
      "brandSource": "title",
      "onHandUnits": 0
    }
  ],
  "nextCursor": "WyIwMDAwMSIsMl0"
}
```

Captured: `?cursor=zzz` → `400 {"success":false,"error":"Invalid cursor"}`.

### `GET /api/brands/proposals`

- **Route:** `src/app/api/brands/proposals/route.ts:9` · **Auth:** `withAuth`, permission **`sku_stock.view`**.
- **Query:** inline `ProposalListQuery` (`src/lib/brands/http.ts:213`)

  ```ts
  z.object({
    status: z.enum(AGENT_MUTATION_STATUSES).optional().default('proposed'),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    before: z.coerce.number().int().positive().optional(),   // mutationId keyset (newest first)
  })
  ```

- **Response:** `{ success: true, proposals: BrandProposal[], nextBefore: number | null }`. `BrandProposal` = `{ mutationId, kind: 'sku_brand.assign'|'brand.create'|'brand.update', status, createdAt, proposedByStaffId, reviewNotes, payload, sku: { id, sku, title, isActive } | null, currentBrand: { id, name, confidence, source } | null }`.
- **Status:** 200 · 400 `INVALID_QUERY` · 401 · 403.
- **Notes:** the approval-first review queue (LAWS T28). The backfill writes proposals below the confidence threshold; a human (or the org's auto-approve setting) applies them.

Captured (`?limit=2`):

```json
{
  "success": true,
  "proposals": [
    {
      "mutationId": 46,
      "kind": "sku_brand.assign",
      "status": "proposed",
      "createdAt": "2026-09-26 12:46:36.643896-07",
      "proposedByStaffId": null,
      "reviewNotes": null,
      "payload": {
        "sku": "TMP-J7WXH-25GSD",
        "reason": "compat_mention",
        "source": "compat",
        "brandId": null,
        "matched": "solo",
        "brandName": null,
        "dedupeKey": "sku_brand:2830:none:compat:compat_mention",
        "confidence": 0.3,
        "suggestion": "Compatibility title (\"for Solo\"): the brand is a third party or the house brand, not Solo. Pick the brand when approving.",
        "skuCatalogId": 2830,
        "compatBrandId": 44
      },
      "sku": {
        "id": 2830,
        "sku": "TMP-J7WXH-25GSD",
        "title": "OEM AC adpater 18.5 V for solo TV",
        "isActive": false
      },
      "currentBrand": null
    },
    {
      "mutationId": 45,
      "kind": "sku_brand.assign",
      "status": "proposed",
      "createdAt": "2026-09-26 12:46:35.996406-07",
      "proposedByStaffId": null,
      "reviewNotes": null,
      "payload": {
        "sku": "TMP-5JBXA-ZQSZ7",
        "reason": "compat_mention",
        "source": "compat",
        "brandId": null,
        "matched": "companion",
        "brandName": null,
        "dedupeKey": "sku_brand:2827:none:compat:compat_mention",
        "confidence": 0.3,
        "suggestion": "Compatibility title (\"for Companion\"): the brand is a third party or the house brand, not Companion. Pick the brand when approving.",
        "skuCatalogId": 2827,
        "compatBrandId": 42
      },
      "sku": {
        "id": 2827,
        "sku": "TMP-5JBXA-ZQSZ7",
        "title": "bluetooth adatper for companion 5",
        "isActive": false
      },
      "currentBrand": null
    }
  ],
  "nextBefore": 45
}
```

### `POST /api/brands/proposals/[id]`

- **Route:** `src/app/api/brands/proposals/[id]/route.ts:9` · **Auth:** `requireRoutePerm`, permission **`sku_stock.manage`**, plus the mutation kind's own review permission (checked by `reviewAgentMutation`).
- **Params:** `id` = the `agent_mutations` id (`mutationId`).
- **Body:** inline `ProposalReviewBody` (`src/lib/brands/http.ts:235`)

  ```ts
  z.object({
    decision: z.enum(['approve', 'reject']),
    notes: z.string().trim().max(1000).optional(),
    brandId: z.number().int().positive().nullable().optional(),  // sku_brand.assign only: the brand to set
                                                                 // (required to approve a compat proposal with brandId null)
  }).strict()
  ```

- **Response 200 (shape, not captured):** `{ success: true, mutationId: number, status: 'applied' | 'rejected', targetRef: string | null }`.
- **Status:**
  - 200.
  - 400 — `INVALID_BODY` / `Invalid ID` / `a "<kind>" mutation cannot be reviewed here` / an invalid payload.
  - 401.
  - 403 — `reviewing "<kind>" requires <perm>`.
  - 404 — `mutation not found`.
  - 409 — `mutation is <status>; only proposed mutations can be reviewed`.
- **Notes:** `reviewAgentMutation` writes the audit row itself (`agent_mutation.apply` / `.reject`). With `brandId` present, only `sku_brand.assign` mutations are reviewable through that call.

Captured refusals (nothing reviewed): `POST /api/brands/proposals/999999 {"decision":"reject"}` → `404 {"success":false,"error":"mutation not found"}`; `POST /api/brands/proposals/46 {"decision":"maybe"}` → `400 {"error":"INVALID_BODY","issues":[{"path":"decision","message":"Invalid option: expected one of \"approve\"|\"reject\"","code":"invalid_value"}]}`. No `applied` proposal existed at capture time (`?status=applied` → `{"success":true,"proposals":[],"nextBefore":null}`), so the 409 is **shape, not captured**: `{"success":false,"error":"mutation is applied; only proposed mutations can be reviewed"}`.

## 7. Search & scan changes

### `GET /api/global-search` — `axis=brand`, `facets.brand`

- **Route:** `src/app/api/global-search/route.ts:23` · **Auth:** `withAuth`, permission `null`.
- **Query (hand-parsed, no zod):**
  - `q` (or `search`), trimmed; empty → an empty payload (no search, no log).
  - `limit` 1..50, default 20.
  - `axis`: `order | tracking | serial | ticket | internal` (`SEARCH_BY_SCOPES`) **or `brand`** (`BRAND_SEARCH_AXIS`, API-only, not a header picker scope). Any other value is ignored (an unscoped search).
  - `surface`: `palette | search-page`, for the query log.
- **Response:**

  ```ts
  {
    rows: SearchHit[]; count: number; query: string;
    relaxed: boolean;           // rows came from a broadened retry
    effectiveQuery: string;     // equals query unless relaxed
    usedSemantic: boolean;
    facets: { brand: { id: number; name: string; count: number }[] };  // NEW: ROOT-brand buckets (a Wave hit counts under Bose)
  }
  ```

- **`axis=brand`:** records whose product is the named brand or one of its lines. The filter is `entity_search_docs.brand_id = ANY($ids::int[])` (int equality stays an Index Cond under FORCE RLS); hierarchy work runs in TS over the org's brand tree (`src/lib/search/brand-search.ts`).
- **Notes:**
  - Upstash cache per org, namespace `api:global-search:v6:<org>` (v6 = the payload gained `facets.brand`). Key = `{org, q, limit, axis}`, TTL 60 s. Tags `global-search`, `orders`, `repair-service`, `fba`, `receiving-logs`, `sku-catalog`. `x-cache: HIT|MISS`.
  - Every call, cache hits included, is logged to `search_query_log` in `after()`.
- **Status:** 200 · 401 · 500.

Captured (`?q=bose&limit=2`, `x-cache: MISS`):

```json
{
  "rows": [
    {
      "id": 19453,
      "entityType": "order",
      "title": "Bose Wave Music System III Update Disc CD Fix \"Please Update\" Error Repair III 3",
      "subtitle": "sean mcgillowey · 17-15201-54064 · 00031-P-25 · USAV",
      "href": "/search?sel=order:19453",
      "matchField": "order",
      "facets": {
        "status": "unassigned",
        "condition_grade": "",
        "source_platform": "USAV",
        "tracking_number": null,
        "carrier": null,
        "serial_number": null,
        "order_id": "17-15201-54064",
        "happened_at": "2026-09-25T13:24:03.000Z"
      }
    },
    {
      "id": 1752,
      "entityType": "import_exception",
      "title": "Bose Wave Music System III, IV CD Drive. (360148-0010) NEW",
      "subtitle": "17-15185-36635 · eBay · no_item_number",
      "href": "/review?mode=catalog-link&section=missing-item-number&exceptionId=1752",
      "matchField": "tracking",
      "facets": {
        "status": "open",
        "source_platform": "eBay",
        "tracking_number": "9434608106245603001420",
        "order_id": "17-15185-36635",
        "happened_at": "2026-09-22T17:05:54.000Z"
      }
    }
  ],
  "count": 2,
  "query": "bose",
  "relaxed": false,
  "effectiveQuery": "bose",
  "usedSemantic": false,
  "facets": {
    "brand": []
  }
}
```

Captured (`?q=bose&axis=brand&limit=2`):

```json
{
  "rows": [],
  "count": 0,
  "query": "bose",
  "relaxed": false,
  "effectiveQuery": "bose",
  "usedSemantic": false,
  "facets": {
    "brand": []
  }
}
```

> **Data gap at capture time:** `axis=brand` and `facets.brand` came back empty.
> The shape is correct, but `entity_search_docs.brand_id` was stamped on
> **0 of 12 533** docs, while `sku_catalog.brand_id` was set on 1 240 SKUs
> (`psql` on the dev branch, same run). Brand search needs the search-doc
> reindex/worker to stamp `brand_id` before it returns rows.

### `GET|POST /api/scan/resolve` — `brand` on every product-bearing match

- **Route:** `src/app/api/scan/resolve/route.ts:504` (GET `?input=`), `:510` (POST `{ input, device? }`) · **Auth:** `withAuth`, permission **`sku_stock.view`**.
- **Change:** each `matches[]` row now carries `brand: SkuBrandFact | null` (`withBrands`, route.ts:187). One statement covers all matched SKUs (`brandsForSkus`, `src/lib/brands/lookup.ts:150`); a SKU without a brand fact → `null`.

  ```ts
  // SkuBrandFact (lookup.ts:139)
  { id: number; name: string; kind: 'brand'|'franchise'|'product_line'; confidence: number; source: string;
    root: { id: number; name: string } }   // top ancestor = display brand
  ```

- **Response (TS `ResolveResponse`, no zod):**
  - `ok: true`, `kind`, `source: 'ai'|'url'|'pattern'|'none'`, `raw`;
  - `url?`, `ais?`, `entity?`, `redirectTo?`;
  - `matches: (OrderMatch & { brand })[]`;
  - `matchOutcome: 'single'|'multi'|'none'`;
  - `mobileRoute`.
- **Status:** 200 · 401 · 403.
- **Notes:** every resolve also writes a scan-log event (`logScanEvent`).

Captured (`?input=00280`, a SKU of the Wave line under Bose):

```json
{
  "ok": true,
  "raw": "00280",
  "matches": [
    {
      "id": 19461,
      "order_id": "02-15232-05028",
      "sku": "00280",
      "product_title": "BOSE Wave Music System IV AM/FM Radio/CD Player w/Bluetooth (Black)  Refurbished",
      "status": "unassigned",
      "quantity": "1",
      "account_source": "USAV",
      "brand": {
        "id": 35,
        "name": "Wave",
        "kind": "product_line",
        "confidence": 0.9,
        "source": "product_line",
        "root": {
          "id": 34,
          "name": "Bose"
        }
      }
    },
    {
      "id": 19452,
      "order_id": "01-15232-55088",
      "sku": "00280",
      "product_title": "FULLY REFURBISHED Bose Wave Music System AM/FM Radio and CD Player AWRCC1",
      "status": "unassigned",
      "quantity": "1",
      "account_source": "MEKONG",
      "brand": {
        "id": 35,
        "name": "Wave",
        "kind": "product_line",
        "confidence": 0.9,
        "source": "product_line",
        "root": {
          "id": 34,
          "name": "Bose"
        }
      }
    }
  ],
  "matchOutcome": "multi",
  "mobileRoute": null,
  "kind": "serial_partial",
  "source": "pattern",
  "entity": {
    "normalized": "00280",
    "carrier": null
  }
}
```

## 8. Orders (To-ship fixes)

### `GET /api/orders` — cache key honours `limit` / `cursor`

- **Route:** `src/app/api/orders/route.ts:13` · **Auth:** `withAuth`, permission **`orders.view`**.
- **Query:** hand-parsed by `parseOrdersListQuery` (`src/lib/orders/orders-list-query.ts:93`; no zod). Sidebar-relevant params:
  - `inWarehouse=true` (the To-ship scope);
  - `pair=po` (the parked Shortage desk lens);
  - `stage=pending|tested|packed`, `staff=<id>`;
  - `limit` (1..500; absent = unbounded, the legacy callers);
  - `cursor` (opaque base64 `{d, id}` keyset over `deadline_at, id`);
  - `listShape=queue`, `q`, `orderId`;
  - plus the full legacy set (`status`, `weekStart`, `carrier`, `statusCategory`, …).
- **Response:** `{ orders: OrderRow[], count, nextCursor: string|null, truncated: boolean, weekStart, weekEnd }`. On DB outage: `200 { orders: [], count: 0, weekStart: null, weekEnd: null, dbUnavailable: true }` with `x-db-fallback: unavailable`.
- **Status:** 200 · 401 · 403 · 500 `{error, details}`.
- **Cache-key fix:**
  - `ordersListCacheLookupKey` (orders-list-query.ts:168) builds the Upstash key from **every** parsed field, so a new param is keyed automatically. `cursor` is keyed as `d|id`.
  - Version `orders_list_v3_to_ship_scope_sal_columns`; namespace `api:orders`, TTL 300 s, tag `orders`.
  - Search (`q`) and single-row (`orderId`) reads bypass the cache.
  - `Cache-Control: private, max-age=300, stale-while-revalidate=60`; `x-cache: HIT|MISS|BYPASS`.

Captured proof (same run):

| Request | x-cache | `orders[].id` |
|---|---|---|
| `?inWarehouse=true&limit=3` | MISS | 13867, 13964, 14031 |
| `?inWarehouse=true&limit=3 (repeat)` | HIT | 13867, 13964, 14031 |
| `?inWarehouse=true&limit=5` | MISS | 13867, 13964, 14031, 14208, 13631 |
| `?inWarehouse=true&limit=3&cursor=<nextCursor of page 1>` | MISS | 14208, 13631, 13632 |
| `?inWarehouse=true` (no limit) | MISS | 38 rows, `truncated: false` |

Before the fix, `limit=3` after `limit=30` HIT with 30 rows and a cursor page returned the same page (phase0-findings §3.2).

Captured (`?inWarehouse=true&limit=3`, envelope only — each order row has ~70 columns):

```json
{
  "orders": [
    {
      "id": 13867,
      "order_id": "21-15107-47310",
      "sku": "00224-P-1",
      "product_title": "Replacement PCB Board Rear Panel for Bose Acoustimass 10 Subwoofer Series III",
      "status": "shipped",
      "deadline_at": "2026-09-10T06:59:59.999Z",
      "is_urgent": false,
      "has_pick_scan": true,
      "is_out_of_stock": false,
      "…": "91 more columns"
    },
    "… (2 more)"
  ],
  "count": 3,
  "nextCursor": "eyJkIjoiMjAyNi0wOS0xN1QwNjo1OTo1OS45OTlaIiwiaWQiOjE0MDMxfQ==",
  "truncated": true,
  "weekStart": null,
  "weekEnd": null
}
```

### `GET /api/orders/queue-counts`

- **Route:** `src/app/api/orders/queue-counts/route.ts:10` · **Auth:** `withAuth`, permission **`orders.view`**.
- **Query:** `staff=<positive int>` (optional; anything else = all staff).
- **Response (`UnshippedQueueCounts`):** `{ total, byStage: { all, tested, pending, packed }, urgent, mustShip, shippedToday, combos: { hasPickScan, blocked, count }[], packPlacement: { counts: [...], totalPlaced }, paperworkIncomplete }`. On error: **200** with zero counts plus `degraded: true, error: 'queue_counts_unavailable'` and `x-db-fallback: error`. A sidebar count must not 500 the queue, and zero must not pass for an honest all-clear.
- **Status:** 200 · 401 · 403.
- **Shared To-ship predicate:** every count is over `sqlOrderInWarehouseToShip` (`src/lib/orders/desk-view-sql.ts:64`), the same predicate `/api/orders?inWarehouse=true` lists and desk-counts `triage` counts. It used to mirror `fulfillmentScope` (orders without a label too) and printed 406 over a 38-row list. Orders without a label belong to the Labels queue (`awaitingOnly`).
- **Notes:**
  - **One statement** (`buildQueueCountsSql`, `src/lib/orders/queue-counts.ts:60`), plus the pack-placement read in parallel.
  - Upstash key `{org, staff, cacheVersion: 'to_ship_in_warehouse_v2'}`, TTL 60 s, tag `orders`.
  - **Single-flight:** concurrent cold misses for one key run the SQL once (`x-cache: HIT|MISS|JOINED`).
  - `Cache-Control: private, max-age=60, stale-while-revalidate=30`.

Captured (`x-cache: HIT`; `total` 38 = `/api/orders?inWarehouse=true` count 38):

```json
{
  "total": 38,
  "byStage": {
    "all": 38,
    "tested": 6,
    "pending": 24,
    "packed": 8
  },
  "urgent": 2,
  "mustShip": 4,
  "shippedToday": 0,
  "combos": [
    {
      "hasPickScan": false,
      "blocked": true,
      "count": 5
    },
    {
      "hasPickScan": false,
      "blocked": false,
      "count": 19
    },
    "… (1 more)"
  ],
  "packPlacement": {
    "counts": [
      {
        "locationId": 113,
        "locationName": "Pack Desk 1",
        "locationBarcode": "PACK-DESK-01",
        "locationKind": "DESK",
        "count": 0
      },
      {
        "locationId": 111,
        "locationName": "Pack Desk 2",
        "locationBarcode": "PACK-DESK-02",
        "locationKind": "DESK",
        "count": 0
      },
      "… (2 more)"
    ],
    "totalPlaced": 0
  },
  "paperworkIncomplete": 32
}
```

`?staff=1` captured: 200, `total` 0, `x-cache: MISS`, 921 ms.

### `GET /api/orders/desk-counts`

- **Route:** `src/app/api/orders/desk-counts/route.ts:14` · **Auth:** `withAuth`, permission **`orders.view`**.
- **Query:** none.
- **Response (`DeskCounts`, `src/lib/orders/desk-view-filters.ts`):** `{ exceptions, po, pick, triage, shippedToday }`.
- **Status:** 200 · 401 · 403 · 500.
- **Notes:**
  - `triage` / `pick` / `po` use `sqlDeskQueueScope(view)` (desk-view-sql.ts:97). `triage` is `sqlOrderInWarehouseToShip`, the predicate queue-counts and the To-ship list share; `pick` = To-ship ∩ `sqlOrderAwaitingPick`.
  - `triage`, `pick`, `po` and `shippedToday` come from **one statement** (`DESK_COUNTS_SQL`, `src/lib/orders/desk-counts.ts:18`); `exceptions` comes from `countOrderExceptions(org, 'actionable')` in parallel.
  - Upstash `api:orders-desk-counts`, key `{org, version: 'desk_counts_v1'}`, TTL 60 s, tag `orders`.
  - `Cache-Control: private, max-age=60, stale-while-revalidate=30`.

Captured:

```json
{
  "exceptions": 382,
  "po": 0,
  "pick": 30,
  "triage": 38,
  "shippedToday": 0
}
```

## 9. Settings — the per-page switch

### `GET /api/settings?page=nav` · `PUT /api/settings`

- **Route:** `src/app/api/settings/route.ts:22` (GET), `:53` (PUT) · **Auth:** `withAuth`, permission `null` to read. An **org-scope** write needs the setting's permission, **`admin.manage_features`**; a staff self-write (`target: 'staff'`) needs none.
- **Keys:** `nav.contextual.<pageId>`, one per `SIDEBAR_PAGE_NAV` page (`NAV_CONTEXTUAL_SETTINGS`, `src/lib/settings/registry.ts:69`). Scope `org`, `personalizable: true`, page `nav`. Value schema `z.enum(['inherit','legacy','contextual']).default('inherit')` (`NAV_ROLLOUT_SETTING_VALUES`, rollout.ts:41).
- **Resolution:**
  - `navRolloutOverride` (rollout.ts:54) takes the staffer's value when they made one, else the org's. `inherit` defers to the next level, and the rollout map is the floor.
  - The result is then clamped in `resolveNavContext`: a `contextual` pick on a page with parity gaps, or on a scan station, still resolves `legacy`.
- **GET response:** `{ page: 'nav', plan, canManageOrg, items: ResolvedSetting[] }`, each item `{ key, value, orgValue, source, locked, lockedOptions }`.
- **PUT body (hand-parsed):** `{ key: string, value: unknown, target?: 'org' | 'staff' }`; `value` is validated with the setting's own zod schema.
- **PUT response (shape, not captured):** `{ ok: true, item: ResolvedSetting }`.
- **Status:**
  - GET: 200 · 400 `{"error":"UNKNOWN_PAGE","page":…}` · 401.
  - PUT:
    - 200.
    - 400 `{"error":"INVALID_VALUE","key","detail"}`.
    - 401.
    - 403 — `{"error":"FORBIDDEN","permission":"admin.manage_features"}`, or `FEATURE_GATED`.
    - 404 `{"error":"UNKNOWN_SETTING","key"}`.
    - 409 `{"error":"SETTING_NOT_AVAILABLE","key"}` (a `comingSoon` setting).
  - Every PUT is audited (`settings.update`, with `extra.scope`).

Captured (`?page=nav`):

```json
{
  "page": "nav",
  "plan": "enterprise",
  "canManageOrg": true,
  "items": [
    {
      "key": "nav.contextual.home",
      "value": "inherit",
      "orgValue": "inherit",
      "source": "default",
      "locked": false,
      "lockedOptions": []
    },
    {
      "key": "nav.contextual.sales",
      "value": "inherit",
      "orgValue": "inherit",
      "source": "default",
      "locked": false,
      "lockedOptions": []
    },
    "… (21 more)"
  ]
}
```

Captured: `?page=bogus` → `400 {"error":"UNKNOWN_PAGE","page":"bogus"}`.

Staff dogfood write (**shape, not captured** — it would flip the capturing
staffer's switch):

```http
PUT /api/settings
{"key":"nav.contextual.outbound","value":"contextual","target":"staff"}
```

## 10. Schema conformance of the captures

| Route | Response schema | Captured bodies re-parsed | Result |
|---|---|---|---|
| `GET /api/nav/context` | `NavContextSchema` | Shipping section, `/triage` top, `view=top` peek, `/pickup` | pass |
| `GET /api/nav/recents` | `{ surface, rows: NavRecentRowSchema[] }` | `receiving.scanned`, `identify.opened`, `command_bar` | pass |
| `GET /api/nav/facets` | `NavFacetsResponseSchema` | `outbound.triage`, `outbound.exceptions`, `pickup` | pass |
| `GET/POST /api/identify` | `IdentifyResponseSchema` | batch POST with context, `bose`, `bose wave` | pass |
| brands, global-search, scan/resolve, orders, settings | TS interfaces only (no zod response schema) | checked by hand against the interfaces above | match |
