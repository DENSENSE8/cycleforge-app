# NAV-CONTEXTS — every page's resolved NavContext

Generated 2026-09-26 by `resolveNavContext` with the full permission set, no org nav override, no rollout overrides (all pages `legacy`). Regenerate after registry changes; `GET /api/nav/context?path=<href>` returns the same shape per caller.

## home — Daily (`/`)

```json
{
 "scope": "top",
 "page": {
  "id": "home",
  "label": "Daily"
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
     "active": true,
     "kind": "link"
    },
    {
     "id": "ops-photos",
     "label": "Media Library",
     "href": "/ops/photos",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "mode",
  "date",
  "item",
  "q",
  "filter",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "actions": [
  {
   "id": "daily.add-task",
   "label": "Add task",
   "intent": "daily:compose"
  }
 ],
 "rollout": "legacy"
}
```

## sales — Sales (`/dashboard?mode=sales`)

```json
{
 "scope": "section",
 "page": {
  "id": "sales",
  "label": "Sales"
 },
 "back": {
  "label": "Sales",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "sales.counter",
   "items": [
    {
     "id": "counter",
     "label": "Counter",
     "href": "/counter",
     "active": false,
     "kind": "link"
    },
    {
     "id": "sales",
     "label": "Sales Board",
     "href": "/dashboard?mode=sales",
     "active": true,
     "kind": "link"
    },
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/dashboard?mode=pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repairs",
     "label": "Repair Service",
     "href": "/dashboard?mode=repairs",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "session",
  "pane",
  "mode",
  "tab",
  "q",
  "map",
  "openOrderId",
  "warranty",
  "fba",
  "open",
  "wstatus",
  "wexp",
  "search",
  "sort",
  "dir",
  "openRepair",
  "dq",
  "rh_q",
  "rh_field",
  "rh_scope",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "layout",
  "weekOffset"
 ],
 "actions": [
  {
   "id": "walk-in.new-sale",
   "label": "New sale",
   "href": "/pickup?job=sales"
  },
  {
   "id": "walk-in.local-pickup",
   "label": "Local pickup",
   "href": "/pickup"
  },
  {
   "id": "walk-in.repair-intake",
   "label": "Repair intake",
   "href": "/pickup?job=repair&new=true"
  }
 ],
 "rollout": "legacy"
}
```

## operations — Operations (`/operations`)

```json
{
 "scope": "section",
 "page": {
  "id": "operations",
  "label": "Operations"
 },
 "back": {
  "label": "Operations",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "operations.live",
   "items": [
    {
     "id": "live",
     "label": "Live",
     "href": "/operations",
     "active": true,
     "kind": "link"
    },
    {
     "id": "checks",
     "label": "Checks",
     "href": "/operations?mode=checks",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packing-review",
     "label": "Packing Review",
     "href": "/review",
     "active": false,
     "kind": "link"
    },
    {
     "id": "history",
     "label": "History",
     "href": "/operations?mode=history",
     "active": false,
     "kind": "link"
    },
    {
     "id": "signals",
     "label": "Signals",
     "href": "/operations?mode=signals",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reconciliation",
     "label": "Reconcile",
     "href": "/operations?mode=reconciliation",
     "active": false,
     "kind": "link"
    },
    {
     "id": "goals",
     "label": "Goals",
     "href": "/operations?mode=goals",
     "active": false,
     "kind": "link"
    },
    {
     "id": "quality",
     "label": "Quality",
     "href": "/operations?mode=quality",
     "active": false,
     "kind": "link"
    },
    {
     "id": "staff",
     "label": "People",
     "href": "/operations?mode=staff",
     "active": false,
     "kind": "link"
    },
    {
     "id": "sync",
     "label": "Sync",
     "href": "/operations?mode=sync",
     "active": false,
     "kind": "link"
    },
    {
     "id": "logs",
     "label": "Logs",
     "href": "/operations?mode=logs",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "mode",
  "date",
  "q",
  "open",
  "view",
  "status",
  "cursor",
  "section",
  "range",
  "segment",
  "station",
  "stations",
  "types",
  "sources",
  "from",
  "until",
  "dim",
  "order",
  "serial",
  "tracking",
  "unit",
  "signalsView",
  "signalId",
  "window",
  "signalKind",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset",
  "rtab",
  "packerLogId",
  "orderId",
  "choreId",
  "exceptionId",
  "search"
 ],
 "rollout": "legacy"
}
```

## reports — Reports (`/reports`)

```json
{
 "scope": "section",
 "page": {
  "id": "reports",
  "label": "Reports"
 },
 "back": {
  "label": "Reports",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "reports.staff-day",
   "items": [
    {
     "id": "staff-day",
     "label": "Staff day",
     "href": "/reports",
     "active": true,
     "kind": "link"
    },
    {
     "id": "packer-day",
     "label": "Packer day",
     "href": "/reports?tab=packer",
     "active": false,
     "kind": "link"
    },
    {
     "id": "utilization",
     "label": "Bin Utilization",
     "href": "/reports?tab=utilization",
     "active": false,
     "kind": "link"
    },
    {
     "id": "velocity",
     "label": "Velocity (30d)",
     "href": "/reports?tab=velocity",
     "active": false,
     "kind": "link"
    },
    {
     "id": "dead-stock",
     "label": "Dead Stock",
     "href": "/reports?tab=dead",
     "active": false,
     "kind": "link"
    },
    {
     "id": "tasks",
     "label": "Tasks",
     "href": "/reports?tab=tasks",
     "active": false,
     "kind": "link"
    },
    {
     "id": "activity",
     "label": "Task time",
     "href": "/reports?tab=activity",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "tab",
  "date"
 ],
 "actions": [
  {
   "id": "reports.refresh",
   "label": "Refresh",
   "intent": "reports:refresh"
  }
 ],
 "rollout": "legacy"
}
```

## triage — Arrival (`/triage`)

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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "triview",
  "triq",
  "uf_q",
  "uf_kind",
  "composerMode",
  "staff",
  "staffId",
  "recvId",
  "lineId",
  "openReceivingId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
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

## receive — Unbox (`/unbox`)

```json
{
 "scope": "top",
 "page": {
  "id": "receive",
  "label": "Unbox"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
     "active": true,
     "kind": "link"
    },
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "unboxview",
  "unboxdesk",
  "sort",
  "photoPeekDemo",
  "ustage",
  "ulane",
  "priority_only",
  "ukpi",
  "urange",
  "uviz",
  "clayout",
  "c0",
  "c1",
  "c2",
  "c3",
  "hlayout",
  "drillPo",
  "rh_q",
  "rh_field",
  "rh_scope",
  "composerMode",
  "openLine",
  "staff",
  "staffId",
  "recvId",
  "lineId",
  "openReceivingId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "recents": {
  "endpoint": "/api/nav/recents?surface=receiving.unbox_opened",
  "surface": "receiving.unbox_opened"
 },
 "actions": [
  {
   "id": "unbox.resume",
   "label": "Unbox",
   "intent": "unbox:resume"
  },
  {
   "id": "unbox.check",
   "label": "Check",
   "intent": "unbox:check-unreceived"
  },
  {
   "id": "unbox.add-po",
   "label": "Add purchase order",
   "intent": "receiving-composer:purchase"
  }
 ],
 "scanInput": {
  "grammar": "unbox",
  "endpoint": "/api/receiving/lookup-po"
 },
 "rollout": "legacy"
}
```

## pickup — Local Pickup (`/pickup`)

```json
{
 "scope": "top",
 "page": {
  "id": "pickup",
  "label": "Local Pickup"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": true,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "lcpu",
  "status",
  "q",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "filters": {
  "facetContext": "pickup",
  "groups": [
   {
    "id": "status",
    "label": "Status",
    "param": "status",
    "multi": false
   }
  ]
 },
 "recents": {
  "endpoint": "/api/nav/recents?surface=pickup.orders",
  "surface": "pickup.orders"
 },
 "scanInput": {
  "grammar": "pickup",
  "endpoint": "/api/local-pickup-orders/lines"
 },
 "rollout": "legacy"
}
```

## repair — Repair Service (`/repair`)

```json
{
 "scope": "top",
 "page": {
  "id": "repair",
  "label": "Repair Service"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": true,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "tab",
  "new",
  "openRepair",
  "search",
  "sort",
  "dir",
  "needsLabel",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "rollout": "legacy"
}
```

## testing — Quality Control (`/test?view=testing`)

```json
{
 "scope": "top",
 "page": {
  "id": "testing",
  "label": "Quality Control"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": true,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "view",
  "search",
  "ship",
  "testTab",
  "packStation",
  "packPlaced",
  "composerMode",
  "stage",
  "aging",
  "attention",
  "late",
  "ustatus",
  "rowFlag",
  "cage",
  "new",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "recents": {
  "endpoint": "/api/nav/recents?surface=testing.opened",
  "surface": "testing.opened"
 },
 "scanInput": {
  "grammar": "testing",
  "endpoint": "/api/receiving-lines"
 },
 "rollout": "legacy"
}
```

## ready-to-pack — Picker (`/test?ship=urgent`)

```json
{
 "scope": "top",
 "page": {
  "id": "ready-to-pack",
  "label": "Picker"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": true,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "view",
  "search",
  "ship",
  "testTab",
  "packStation",
  "packPlaced",
  "composerMode",
  "stage",
  "aging",
  "attention",
  "late",
  "ustatus",
  "rowFlag",
  "cage",
  "new",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "recents": {
  "endpoint": "/api/nav/recents?surface=tech.scans",
  "surface": "tech.scans"
 },
 "scanInput": {
  "grammar": "station",
  "endpoint": "/api/tech/scan"
 },
 "rollout": "legacy"
}
```

## incoming — Deliveries (`/incoming`)

```json
{
 "scope": "section",
 "page": {
  "id": "incoming",
  "label": "Deliveries"
 },
 "back": {
  "label": "Deliveries",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "incoming.pipeline",
   "items": [
    {
     "id": "pipeline",
     "label": "On the way",
     "href": "/incoming",
     "active": true,
     "kind": "link"
    },
    {
     "id": "docked",
     "label": "History",
     "href": "/incoming?lane=docked",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "lane",
  "incview",
  "tracking_in",
  "state",
  "inbound",
  "inkind",
  "import",
  "sort",
  "po_from",
  "po_to",
  "page",
  "rh_q",
  "rh_field",
  "rh_scope",
  "openLine",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "actions": [
  {
   "id": "incoming.add-po",
   "label": "Add PO",
   "intent": "global-add:incoming-po"
  },
  {
   "id": "incoming.add-return",
   "label": "Add return",
   "intent": "global-add:incoming-return"
  },
  {
   "id": "incoming.import-returns",
   "label": "Import returns (CSV/TSV)",
   "intent": "global-add:incoming-returns-csv"
  },
  {
   "id": "incoming.import-zoho",
   "label": "Import Zoho POs",
   "intent": "global-add:incoming-zoho"
  },
  {
   "id": "incoming.import-ebay",
   "label": "Import eBay purchases",
   "intent": "global-add:incoming-ebay"
  }
 ],
 "rollout": "legacy"
}
```

## receiving — Receiving (`/unbox`)

```json
{
 "scope": "top",
 "page": {
  "id": "receive",
  "label": "Unbox"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
     "active": true,
     "kind": "link"
    },
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "unboxview",
  "unboxdesk",
  "sort",
  "photoPeekDemo",
  "ustage",
  "ulane",
  "priority_only",
  "ukpi",
  "urange",
  "uviz",
  "clayout",
  "c0",
  "c1",
  "c2",
  "c3",
  "hlayout",
  "drillPo",
  "rh_q",
  "rh_field",
  "rh_scope",
  "composerMode",
  "openLine",
  "staff",
  "staffId",
  "recvId",
  "lineId",
  "openReceivingId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "recents": {
  "endpoint": "/api/nav/recents?surface=receiving.unbox_opened",
  "surface": "receiving.unbox_opened"
 },
 "actions": [
  {
   "id": "unbox.resume",
   "label": "Unbox",
   "intent": "unbox:resume"
  },
  {
   "id": "unbox.check",
   "label": "Check",
   "intent": "unbox:check-unreceived"
  },
  {
   "id": "unbox.add-po",
   "label": "Add purchase order",
   "intent": "receiving-composer:purchase"
  }
 ],
 "scanInput": {
  "grammar": "unbox",
  "endpoint": "/api/receiving/lookup-po"
 },
 "rollout": "legacy"
}
```

## sourcing — Sourcing (`/sourcing`)

```json
{
 "scope": "section",
 "page": {
  "id": "sourcing",
  "label": "Sourcing"
 },
 "back": {
  "label": "Sourcing",
  "mode": "local"
 },
 "search": {
  "scope": "sourcing.queue",
  "placeholder": "Search sourcing",
  "source": "url-param",
  "param": "q"
 },
 "sections": [
  {
   "id": "sourcing.queue",
   "items": [
    {
     "id": "queue",
     "label": "Queue",
     "href": "/sourcing",
     "active": true,
     "kind": "link"
    },
    {
     "id": "scout",
     "label": "Scout",
     "href": "/sourcing?mode=scout",
     "active": false,
     "kind": "link"
    },
    {
     "id": "watchlist",
     "label": "Watchlist",
     "href": "/sourcing?mode=watchlist",
     "active": false,
     "kind": "link"
    },
    {
     "id": "searches",
     "label": "Searches",
     "href": "/sourcing?mode=searches",
     "active": false,
     "kind": "link"
    },
    {
     "id": "suppliers",
     "label": "Suppliers",
     "href": "/sourcing?mode=suppliers",
     "active": false,
     "kind": "link"
    },
    {
     "id": "models",
     "label": "Models",
     "href": "/sourcing?mode=models",
     "active": false,
     "kind": "link"
    },
    {
     "id": "compatibility",
     "label": "Compatibility",
     "href": "/sourcing?mode=compatibility",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "mode",
  "q",
  "by",
  "status",
  "type",
  "range",
  "supplier",
  "model",
  "search",
  "boseModelId",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "rollout": "legacy"
}
```

## fba — FBA (`/shipping/fba`)

```json
{
 "scope": "section",
 "page": {
  "id": "fba",
  "label": "FBA"
 },
 "back": {
  "label": "FBA",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "fba.plan",
   "items": [
    {
     "id": "plan",
     "label": "Plan",
     "href": "/shipping/fba?fbaMode=plan",
     "active": false,
     "kind": "link"
    },
    {
     "id": "combine",
     "label": "Combine",
     "href": "/shipping/fba",
     "active": true,
     "kind": "link"
    },
    {
     "id": "shipped",
     "label": "Shipped",
     "href": "/shipping/fba?fbaMode=shipped",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "q",
  "sort",
  "fbaMode",
  "rtab",
  "openShipmentId",
  "plan",
  "draft",
  "main",
  "details",
  "r",
  "search",
  "fnsku",
  "fbaFilter",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "scanInput": {
  "grammar": "fnsku",
  "endpoint": "/api/fba/fnskus/validate"
 },
 "rollout": "legacy"
}
```

## label-intake — Label intake (`/shipping/label-intake`)

```json
{
 "scope": "top",
 "page": {
  "id": "label-intake",
  "label": "Label intake"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": true,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [],
 "rollout": "legacy"
}
```

## outbound — Shipping (`/shipping/orders`)

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
   "id": "outbound.exceptions",
   "items": [
    {
     "id": "exceptions",
     "label": "Exceptions",
     "href": "/shipping/exceptions",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "outbound.shortage",
   "label": "Picking",
   "items": [
    {
     "id": "po",
     "label": "PO paired",
     "href": "/shipping/shortage?pair=po",
     "active": false,
     "kind": "link"
    },
    {
     "id": "pick",
     "label": "Pick list",
     "href": "/shipping/orders?queue=pick",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "outbound.triage",
   "items": [
    {
     "id": "triage",
     "label": "To ship",
     "href": "/shipping/orders",
     "active": true,
     "kind": "link"
    },
    {
     "id": "shipped",
     "label": "Shipped",
     "href": "/shipping/shipped",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "order",
  "category",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset",
  "pair",
  "openOrderId",
  "sort",
  "dir",
  "stage",
  "aging",
  "attention",
  "late",
  "ustatus",
  "rowFlag",
  "cage",
  "packStation",
  "packPlaced",
  "context",
  "createTicket",
  "unshipped",
  "pending",
  "packed",
  "tested",
  "shipped",
  "open",
  "rtab",
  "search",
  "new",
  "ingest",
  "triage",
  "paperwork",
  "queue",
  "import",
  "shippedFilter",
  "shippedSearchField",
  "shippedWeekOffset",
  "ostatus",
  "exceptions",
  "carrier",
  "statusCategory",
  "packedBy",
  "testedBy",
  "dateFrom",
  "dateTo",
  "allDates",
  "olayout",
  "drillOrder",
  "clayout",
  "c0",
  "c1",
  "c2",
  "c3",
  "shipment"
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
 "controls": {
  "staff": {
   "param": "staff"
  }
 },
 "savedViews": {
  "storageKey": "unshipped_saved_views",
  "paramKeys": [
   "stage",
   "ustatus",
   "staff",
   "late",
   "aging",
   "attention",
   "packPlaced",
   "packStation",
   "sort",
   "dir"
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
  {
   "id": "orders.export-csv",
   "label": "Export to CSV",
   "intent": "desk-export:csv"
  },
  {
   "id": "orders.add",
   "label": "Add one order (review first)",
   "href": "/shipping/orders?triage=new"
  },
  {
   "id": "orders.add-test",
   "label": "Add test order",
   "intent": "orders-intake:test"
  },
  {
   "id": "orders.demo-sync",
   "label": "Demo sync (sample data)",
   "intent": "orders-intake:demo"
  },
  {
   "id": "orders.past-imports",
   "label": "Past imports",
   "intent": "orders:past-imports"
  },
  {
   "id": "orders.labels",
   "label": "Labels",
   "intent": "orders:labels-walk"
  }
 ],
 "rollout": "legacy"
}
```

## scan-out — Scan out (`/shipping/scan-out`)

```json
{
 "scope": "top",
 "page": {
  "id": "scan-out",
  "label": "Scan out"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": true,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "q",
  "sort",
  "open",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "scanInput": {
  "grammar": "scan-out",
  "endpoint": "/api/shipped/scan-out"
 },
 "rollout": "legacy"
}
```

## packer — Packing (`/pack`)

```json
{
 "scope": "top",
 "page": {
  "id": "packer",
  "label": "Packing"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": false,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": true,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "packview",
  "packMode",
  "stage",
  "aging",
  "attention",
  "late",
  "ustatus",
  "rowFlag",
  "cage",
  "new",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "recents": {
  "endpoint": "/api/nav/recents?surface=packer.packs",
  "surface": "packer.packs"
 },
 "scanInput": {
  "grammar": "pack",
  "endpoint": "/api/packing-logs"
 },
 "rollout": "legacy"
}
```

## products — Products (`/products`)

```json
{
 "scope": "section",
 "page": {
  "id": "products",
  "label": "Products"
 },
 "back": {
  "label": "Products",
  "mode": "local"
 },
 "search": {
  "scope": "products.manuals",
  "placeholder": "Search manuals",
  "source": "url-param",
  "param": "q"
 },
 "sections": [
  {
   "id": "products.manuals",
   "items": [
    {
     "id": "manuals",
     "label": "Manuals",
     "href": "/products",
     "active": true,
     "kind": "link"
    },
    {
     "id": "labels",
     "label": "SKU Barcodes",
     "href": "/products?view=labels",
     "active": false,
     "kind": "link"
    },
    {
     "id": "pairing",
     "label": "Pairing",
     "href": "/products?view=pairing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "qc",
     "label": "QC Checklist",
     "href": "/products?view=qc",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "view",
  "q",
  "sort",
  "skuId",
  "sku",
  "labelsView",
  "historyId",
  "id",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "rollout": "legacy"
}
```

## inventory — Inventory (`/inventory`)

```json
{
 "scope": "section",
 "page": {
  "id": "inventory",
  "label": "Inventory"
 },
 "back": {
  "label": "Inventory",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "inventory.stock",
   "items": [
    {
     "id": "stock",
     "label": "Stock",
     "href": "/inventory/stock",
     "active": false,
     "kind": "link"
    },
    {
     "id": "sku-exceptions",
     "label": "SKU Exceptions",
     "href": "/inventory/sku-exceptions",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ledger",
     "label": "Ledger",
     "href": "/inventory",
     "active": true,
     "kind": "link"
    },
    {
     "id": "replenish",
     "label": "Replenish",
     "href": "/inventory?section=replenish",
     "active": false,
     "kind": "link"
    },
    {
     "id": "locations",
     "label": "Locations",
     "href": "/inventory/locations",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "q",
  "room",
  "status",
  "open",
  "sku",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset",
  "mode",
  "section",
  "field",
  "filter",
  "bin",
  "unit",
  "state",
  "condition",
  "view",
  "tab",
  "code",
  "showEmpty",
  "serial",
  "new",
  "edit"
 ],
 "rollout": "legacy"
}
```

## tech — Testing (`/test`)

```json
{
 "scope": "top",
 "page": {
  "id": "ready-to-pack",
  "label": "Picker"
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
    {
     "id": "ai-chat",
     "label": "Chat",
     "href": "/ai-chat",
     "active": false,
     "kind": "link"
    },
    {
     "id": "reports",
     "label": "Reports",
     "href": "/reports",
     "active": false,
     "kind": "drill"
    }
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
    {
     "id": "pickup",
     "label": "Local Pickup",
     "href": "/pickup",
     "active": false,
     "kind": "link"
    },
    {
     "id": "repair",
     "label": "Repair Service",
     "href": "/repair",
     "active": false,
     "kind": "link"
    },
    {
     "id": "testing",
     "label": "Quality Control",
     "href": "/test?view=testing",
     "active": false,
     "kind": "link"
    },
    {
     "id": "ready-to-pack",
     "label": "Picker",
     "href": "/test?ship=urgent",
     "active": true,
     "kind": "link"
    },
    {
     "id": "packer",
     "label": "Packing",
     "href": "/pack",
     "active": false,
     "kind": "link"
    },
    {
     "id": "scan-out",
     "label": "Scan out",
     "href": "/shipping/scan-out",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inbound",
   "label": "Inbound",
   "items": [
    {
     "id": "incoming",
     "label": "Deliveries",
     "href": "/incoming",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "sourcing",
     "label": "Sourcing",
     "href": "/sourcing",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "fulfillment",
   "label": "Outbound",
   "items": [
    {
     "id": "outbound",
     "label": "Shipping",
     "href": "/shipping/orders",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "fba",
     "label": "FBA",
     "href": "/shipping/fba",
     "active": false,
     "kind": "drill"
    },
    {
     "id": "label-intake",
     "label": "Label intake",
     "href": "/shipping/label-intake",
     "active": false,
     "kind": "link"
    }
   ]
  },
  {
   "id": "inventory",
   "items": [
    {
     "id": "inventory",
     "label": "Inventory",
     "href": "/inventory",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "catalog",
   "items": [
    {
     "id": "products",
     "label": "Products",
     "href": "/products",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "sales",
   "items": [
    {
     "id": "sales",
     "label": "Sales",
     "href": "/dashboard?mode=sales",
     "active": false,
     "kind": "drill"
    }
   ]
  },
  {
   "id": "studio",
   "items": [
    {
     "id": "studio",
     "label": "Automations",
     "href": "/studio",
     "active": false,
     "kind": "drill"
    }
   ]
  }
 ],
 "params": [
  "view",
  "search",
  "ship",
  "testTab",
  "packStation",
  "packPlaced",
  "composerMode",
  "stage",
  "aging",
  "attention",
  "late",
  "ustatus",
  "rowFlag",
  "cage",
  "new",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "recents": {
  "endpoint": "/api/nav/recents?surface=tech.scans",
  "surface": "tech.scans"
 },
 "scanInput": {
  "grammar": "station",
  "endpoint": "/api/tech/scan"
 },
 "rollout": "legacy"
}
```

## support — Support (`/support`)

```json
{
 "scope": "section",
 "page": {
  "id": "support",
  "label": "Support"
 },
 "back": {
  "label": "Support",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "support.tickets",
   "items": [
    {
     "id": "tickets",
     "label": "Tickets",
     "href": "/support",
     "active": true,
     "kind": "link"
    },
    {
     "id": "voicemail",
     "label": "Voicemail",
     "href": "/support?mode=voicemail",
     "active": false,
     "kind": "link"
    },
    {
     "id": "calls",
     "label": "Calls",
     "href": "/support?mode=calls",
     "active": false,
     "kind": "link"
    },
    {
     "id": "warranty",
     "label": "Warranty",
     "href": "/support?mode=warranty",
     "active": false,
     "kind": "link"
    },
    {
     "id": "issues",
     "label": "Issues",
     "href": "/support?mode=issues",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "mode",
  "ticket",
  "vm",
  "issueId",
  "open",
  "openOrderId",
  "q",
  "search",
  "status",
  "assignee",
  "direction",
  "range",
  "type",
  "reporter",
  "stage",
  "wstatus",
  "wexp",
  "ustatus",
  "attention",
  "tq",
  "tstatus",
  "staff",
  "staffId",
  "colsort",
  "coldir",
  "pane",
  "layout",
  "weekOffset"
 ],
 "recents": {
  "endpoint": "/api/nav/recents?surface=support.tickets",
  "surface": "support.tickets"
 },
 "rollout": "legacy"
}
```

## studio — Automations (`/studio`)

```json
{
 "scope": "section",
 "page": {
  "id": "studio",
  "label": "Automations"
 },
 "back": {
  "label": "Automations",
  "mode": "local"
 },
 "search": {
  "scope": "global",
  "placeholder": "Find anything — scan or type",
  "source": "identify"
 },
 "sections": [
  {
   "id": "studio.graph",
   "items": [
    {
     "id": "graph",
     "label": "Studio",
     "href": "/studio",
     "active": true,
     "kind": "link"
    },
    {
     "id": "rules",
     "label": "Rules",
     "href": "/studio/automations",
     "active": false,
     "kind": "link"
    },
    {
     "id": "catalog",
     "label": "Catalog",
     "href": "/studio/catalog",
     "active": false,
     "kind": "link"
    }
   ]
  }
 ],
 "params": [
  "v",
  "focus",
  "z",
  "lens",
  "mode",
  "selectedId"
 ],
 "rollout": "legacy"
}
```
