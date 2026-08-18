# Deep Research Brief — Unifying the Station Scan Bar into a Thin, Surface-Routed Wrapper

**Audience:** Gemini Deep Research
**Requester context:** CycleForge — a multi-tenant warehouse/reverse-logistics operations app (Next.js App Router, React, TypeScript, TanStack Query, Neon Postgres, org-scoped tenancy). Operators work at physical stations with HID "wedge" barcode scanners that type into a focused field and press Enter.
**Status of the work:** A feature branch (`wip/station-scan-phase1`) adds Preview/Scan stance, a preview result card, display-edit, and `1/2/3/4` type keybinds to the station scan bar. Porting it to `main` is **paused pending this research**, because the branch has to thread the same new behavior through *every* per-page scan wrapper — which is the smell that motivated this brief.

---

## 1. What I need out of this research

I believe the station scan bar should be **one component with one behavior**, and that "which page am I on" should be the *only* input that changes what a scan does. Concretely, the thesis I want tested:

> There should be **no per-page forks of the scan bar**. There should be **one thin wrapper** that reads the current surface (page) from a registry and dispatches the scanned value to that surface's routing. "If I'm on Unbox, a scanned tracking number resolves via the Unbox route. If I'm on Ready-to-Pack, the same tracking number resolves via the pack route." Nothing else about the bar should differ.

I want a rigorous answer to: **is that the right target architecture, what is the correct seam for it, and what is the safest migration path** — grounded in prior art from real systems, not just first principles. I explicitly want the thesis *challenged* where it is wrong.

---

## 2. Current architecture (verified against the codebase)

### 2.1 The shared chrome already exists

`src/components/station/scan-bar/StationScanBar.tsx` (~16 KB) is a single presentational input with a large prop surface (`value`, `onChange`, `onSubmit`, `rightContent`, `leadingColumn`, `hotkey`, `showModeButtons`, `submitTraceClassName`, …). `ThemedStationScanBar.tsx` wraps it with staff-theme chrome. **15 files** consume one of the two.

So the *visual* layer is already unified. The forking happens above it.

### 2.2 Three near-identical domain wrappers

| Wrapper | File | Mode rail | Placeholder |
|---|---|---|---|
| Unbox | `src/components/sidebar/receiving/ReceivingUnboxScanBar.tsx` | Ticket / Tracking / PO (3) | `Ticket · Tracking · PO` |
| Testing | `src/components/sidebar/receiving/TestingScanBar.tsx` | Tracking / PO / Serial / SKU (4) | `Tracking · PO · Serial · SKU` |
| Shipping | `src/components/sidebar/tech/ShippingScanBar.tsx` | Tracking / Amz Prep / Repair / Serial (4) | `Orders · Amz SKU · Repair · Serial` |
| Packing | *(none)* | — | inherits bare `ThemedStationScanBar` |

Structurally these three files are the same file three times: a `readonly` array of mode metadata (mode key, label, icon, two Tailwind hue classes), a `modeMeta()` lookup with a hardcoded default index, a `classify*` display-hint function, a `handleSubmit` that forwards to a host callback, and a `<StationScanModeRail>` in `rightContent`. **The only genuinely different data is the mode list and where submit goes.**

### 2.3 Five competing classifiers

1. `detectStationScanType(val)` / `getStationInputMode(val)` — `src/lib/station-scan-routing.ts`. Pure string heuristics → `TRACKING | SERIAL | FNSKU | SKU | REPAIR | COMMAND`.
2. `classifyUnboxScan(raw, ctx)` — `src/lib/receiving/classify-unbox-scan.ts`. **Surface-aware.** Takes `{ surface, activeCartonNeedsSerials, knownCarrier }`, returns `{ type, intent, reclassified }`. Encodes the load-bearing rule: on Unbox, a carrier-unknown tracking-looking barcode while the active carton still owes serials is *actually a serial*.
3. `classifyUnboxScan(value)` — `src/components/sidebar/receiving/ReceivingUnboxScanBar.tsx`. **Name collision with #2**, different signature, different return type (`'ticket' | 'tracking' | 'order'`), display-hint only.
4. `classifyTestingScan(value)` — `src/components/sidebar/receiving/TestingScanBar.tsx`.
5. `resolveScanType(val, contextOrder)` — `src/hooks/useStationTestingController.ts`. Its own source comment in #2 says it **mirrors** this function. Two copies of the same serial-vs-tracking reclassification rule, in different modules, with different context shapes.

### 2.4 Four parallel dispatch mechanisms for one scan

1. **Prop-drilled `onSubmit`** — Unbox (`useTrackingScan.submitTrackingScan`), Testing (`runScan` in `TestingSidebarPanel`), Shipping (`ShippingScanBand`).
2. **`station:scan` CustomEvent bus** — `src/components/stations/blocks/ScanBandBlock.tsx` dispatches `{ raw, type, intent, surface }` on `window` and lets the host surface handle it. *This is already the thin-wrapper shape*, but it lives only in the Studio blocks layer.
3. **Module-level sink registry** — `src/lib/station-scan-sink/` (`registerScanSink` / `dispatchScanToActiveSink` / `setActiveSinkId`), a `Map` + active-id ref deliberately outside React Context. **12+ consumers.**
4. **Global wedge listener** — `useGlobalWedgeScanner` / `useWedgeScanner`, dual-path with the sink store (stands down when focus is already in an editable field).

### 2.5 A surface registry that already models the answer — but is not wired to the bar

`src/lib/stations/surface-keys.ts` defines `SURFACE_KEYS` (10 surfaces: `unbox`, `triage`, `incoming`, `pickup`, `repair`, `history`, `pack`, `test`, `outbound`, `support`) and a compile-time-closed `SURFACE_REGISTRY: Record<SurfaceKey, SurfaceDefinition>`. Each definition carries `route`, `archetype`, `permission`, `pageKey`, `modeKey`, and — critically:

```ts
/** Scan policy: which focus-locked scan classifier this Station surface owns.
 *  `null` = not a scan surface. */
scan: 'unbox' | 'triage' | 'pickup' | null;
```

**This is exactly the "if under this page, then this routing" mechanism the thesis asks for — and it is under-used.** `pack`, `test`, and `outbound` are all `scan: null` even though all three render scan bars in production. There is also `surfaceForRoute(pathname)` which resolves the current surface from the URL, so the wrapper has a ready-made way to know what page it is on.

### 2.6 Divergent server routing (the part that is genuinely per-surface)

| Surface | Effective endpoints |
|---|---|
| Unbox / Triage | `/api/receiving/lookup-po` (local-only match/create), `/api/receiving/touch-scan` (attribution + milestone) |
| Testing | `/api/receiving-lines?…`, `/api/serial-units/{id}`, `/api/handling-units/{id}` (client-side cascade in `src/lib/testing/resolve-testing-scan.ts`) |
| Shipping / FBA / Repair | `/api/tech/scan`, `/api/tech/scan-sku`, `/api/tech/scan-repair-station`, `/api/fba/items/scan`, `/api/shipped/scan-out` |
| Mobile cockpit `/m/scan` | `/api/scan/resolve` — **already a universal resolver** with a documented cascade (printed-handle decode → GS1 → URL → pattern → unknown), returning `kind` + `matches` + `mobileRoute`. Its header states it **never writes to `receiving_*`**; it is intent-routing only. |

So a universal *read/classify* endpoint already exists and is proven on mobile. The write paths are what stay surface-specific — and they are correctly non-uniform: `lookup-po` carries hard attribution law (see below).

### 2.7 Constraints that any redesign must not break

- **Attribution law.** `src/app/api/receiving/lookup-scan-wiring.guard.test.ts` is a source-level guard enforcing that every `stampUnboxOpened` call passes an explicit `scanKind` (no default), that pre-existing-carton branches classify before stamping, and that a `lookup` writes only an append-only event and never `recordReceivingScan`. A real defect shipped here: a defaulted parameter silently re-attributed an *inspection* as *work* at 4 of 6 call sites. **Any unification that makes the write path more generic must not re-introduce a defaultable intent.**
- **Multi-tenancy.** All reads are org-scoped (`tenantQuery(organizationId, …)`).
- **HID wedge timing.** `WEDGE_MAX_INTER_KEY_MS = 50 ms` distinguishes a human keypress from a scanner burst. The branch's `1/2/3/4` type keybinds must yield to a scanner burst and flush the swallowed digit into the field.
- **Focus lock.** Station surfaces re-grab focus on blur; scans must never be dropped.
- **Guard-test culture.** This codebase favors source-level guard tests that pin architectural shape. A proposal should say what guard replaces the ones it invalidates.

---

## 3. Why this is blocking a port (the concrete forcing function)

The paused branch adds four cross-cutting behaviors — **Preview/Scan stance**, **preview result card**, **display-edit**, **type keybinds** — and to do so it had to modify **7 host files**: all three domain wrappers, `ShippingScanBand`, `ReceivingSidebarPanel`, `TestingSidebarPanel`, and `usePhoneScanBridge`. Each host had to independently consult `isScanPreview()` before its live write, because each host owns its own submit path.

That is N-way threading for a behavior that should be implemented once. If the wrappers unify first, stance/preview/keybinds land in one place. **The research question is whether unifying first is genuinely cheaper than porting first and unifying later** — and if so, what the minimum unification is that makes the port land once.

---

## 4. The proposed target (please critique, don't just validate)

A single `<StationScanBar>` that takes **no domain props**. A surface descriptor supplies everything:

```ts
interface SurfaceScanPolicy {
  surface: SurfaceKey;              // from surfaceForRoute(pathname)
  modes: ScanModeDefinition[];      // the rail — data, not a bespoke component
  classify(raw, ctx): ScanIntent;   // one classifier, surface-parameterized
  dispatch(intent, raw): Promise<ScanOutcome>;  // the ONLY per-surface fork
}
```

The bar owns: input, focus lock, wedge handling, stance (preview/scan), keybinds, mode rail rendering, preview card, display-edit, accessibility. The surface owns: its mode list and its dispatch. Everything currently in the three wrapper files collapses into registry data plus one `dispatch` per surface.

**Open design tension I want resolved:** should `dispatch` be (a) a function on the registry, (b) a `station:scan` CustomEvent the surface subscribes to (mechanism #2, already exists), or (c) a sink registration (mechanism #3, already exists with 12+ consumers)? There are already three answers in the tree and I need a defensible reason to pick one and delete the others.

---

## 5. Research questions

### A. Prior art — single-input, multi-intent scanners
1. How do mature WMS / warehouse execution systems (Manhattan, Blue Yonder, Körber, Fishbowl, Odoo, ERPNext, Shopify/Amazon FC tooling) structure a **single scan field whose meaning depends on the operator's current task**? Is the dominant pattern a per-screen scan handler, a central dispatcher with a task/context key, or a server-side intent resolver?
2. Is there a named, documented pattern for this? (Candidate framings: "command palette for barcodes", front controller, intent router, polymorphic dispatch on context, finite-state scanning workflow.) What is the actual industry vocabulary?
3. Where has "one universal scan endpoint" been tried and **failed**? I want the failure modes, specifically around auditability and per-workflow write semantics.

### B. Client-side vs server-side intent resolution
4. Given `/api/scan/resolve` already exists as a read-only universal resolver, what is the tradeoff of moving classification fully server-side vs keeping the current hybrid (client heuristics + surface context)? Latency budgets matter: an operator scans continuously and a round trip per scan is a real cost. What round-trip budget do comparable systems accept?
5. The load-bearing reclassification rule ("carrier-unknown tracking-looking barcode while the carton still owes serials → it's a serial") depends on **client-held UI state**. How do other systems get context-dependent classification right without shipping UI state to the server or duplicating the rule?
6. Is "classify on the client, authorize + write on the server, never trust the client's intent for attribution" the right split — and how is that enforced structurally elsewhere?

### C. Registry / config-driven surface behavior
7. Best practices for a **closed, compile-time-checked capability registry** (`Record<SurfaceKey, Definition>`) that carries behavior, not just metadata. When does a registry entry holding a *function* become an anti-pattern versus a clean strategy-pattern table? Bundle-splitting implications for Next.js App Router if every surface's dispatch is reachable from one registry.
8. This app separates **code** (the closed capability registry, PR-reviewed) from **data** (per-org `station_definitions` rows published from a Studio). If mode rails become registry data, which side should they live on — is a per-org-configurable scan mode rail a feature or a support nightmare?
9. How should a registry-driven design handle surfaces that legitimately need a *different* interaction, not just different routing (e.g. Packing has no mode rail at all, FBA has Plan/Select mode buttons instead)? Is "no rail" just an empty array, or is that flattening a real distinction?

### D. Operator ergonomics and correctness
10. Evidence on **modal vs modeless** scanning UIs in warehouse work. This design has an armed "type" mode (Ticket/Tracking/PO) plus an armed "stance" (Preview vs Scan) — two orthogonal modes on one field. What does the human-factors literature say about mode errors in high-throughput, keyboard-driven, glance-free workflows? Is a Preview stance on a scan field a known good idea or a known hazard?
11. Best practice for **HID wedge disambiguation** — distinguishing scanner bursts from human typing. Is a ~50 ms inter-key threshold defensible? What do scanner vendors (Zebra, Honeywell, Datalogic) recommend, and are prefix/suffix framing characters the more robust answer than timing?
12. Accessibility for a mode-armed scan field: correct ARIA for an armed state, `aria-live` for a preview result, and keyboard-only reachability of a mode rail — without breaking screen-reader-free scanner throughput.

### E. Migration strategy
13. For a consolidation like this (3 wrappers + 5 classifiers + 4 dispatch mechanisms → 1 bar + 1 classifier + 1 dispatch), what is the empirically safer sequence: strangler-fig behind a per-surface flag, big-bang with heavy guard tests, or unify-the-classifier-first then the dispatch then the chrome?
14. Should the paused feature branch be **ported first onto the current forked structure** (accepting the N-way threading, then unifying), or should unification land first and the branch be re-implemented once on top? Give a decision rule keyed to observable factors (branch size, conflict surface, test coverage, number of forks), not a generic preference.
15. What test strategy proves "a scan on page X still routes to endpoint Y" across ~7 surfaces? Contract tests per surface, a routing table snapshot test, source-level guards (this repo's existing style), or E2E per station?

---

## 6. Deliverables requested

1. **Verdict on the thesis** — is "one bar, surface-supplied routing" right? If partially, state precisely which parts of the current forking are *essential complexity* and must survive.
2. **A recommended seam**, choosing between registry-function / CustomEvent / sink-registry, with the reasoning and the cost of deleting the other two.
3. **A target module map** — what each file becomes, what gets deleted, what new files appear.
4. **A sequenced migration plan** with a clear answer to Q14 (port-then-unify vs unify-then-port).
5. **A risk register** — ranked, with the attribution-correctness risk (§2.7) explicitly addressed and a proposed guard test that replaces `lookup-scan-wiring.guard.test.ts`'s coverage under the new shape.
6. **Prior-art citations** — real systems and sources, with what specifically was learned from each. Flag clearly where you found no evidence rather than reasoning from first principles and presenting it as established practice.

## 7. Evaluation criteria

- Cites **actual systems and sources**; separates documented practice from inference.
- Engages the **specific constraints** in §2.7 — a plan that ignores attribution law or wedge timing is not useful.
- **Challenges the thesis** where warranted. If per-page scan bars are correct and the real problem is only the duplicated classifiers, say so plainly.
- Concrete enough to execute: names files, sequences steps, defines the guard tests.

## 8. Glossary

- **Surface** — an operator "page"/job (Unbox, Triage, Packing, Testing, Shipping), keyed semantically, not by URL hash.
- **Wedge / HID scanner** — a barcode gun that emulates a keyboard, typing the payload and an Enter.
- **Armed mode** — the operator has forced the next scan to a specific lookup type, overriding auto-detection.
- **Stance** — Preview (decode + show, no write) vs Scan (commit). New in the paused branch.
- **Carton** — a received box; **PO line** — a purchase-order line item; **FNSKU** — Amazon fulfillment SKU barcode.
- **`scanKind`** — `work` vs `lookup`; whether a scan represents doing the work or merely inspecting already-done work. Attribution-critical.
- **Sink** — a registered handler that receives a wedge payload when focus is not in an editable field.
