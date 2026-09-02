# Packing and Quality-Control Display Unification Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Remove the packing and QC display-layout forks so operational station content uses the same accordion/band geometry and item-row face as the Unbox line-edit panels.

**Architecture:** Treat the Unbox station centre as the visual contract: `StationBandStack` owns the full-width `Items`/`Label` disclosure rows, `StationCollapsibleBlock` owns the fixed disclosure header height (`min-h-8`), and `ItemRecordRow` owns the item identity/meta face and per-line disclosure. Packing and QC keep their domain-specific actions and data adapters, but do not paint their own headers, chevrons, card shells, or row geometry. The existing Testing centre already composes this contract; the work should preserve it and eliminate the remaining checklist-specific forks rather than create another generic station shell.

**Tech Stack:** Next.js/React, TypeScript, Tailwind utility classes, the CycleForge design-system primitives, `StationBandStack`, `PoItemsSection`, `ItemRecordRow`, Node test runner with `tsx`, ESLint, and the existing build/eval gates.

---

## Confirmed current state

- **Unbox is the reference implementation.** `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx:158-277` builds `Items` and `Label` through `StationBandStack`; `src/components/station/collapse/StationCollapsibleBlock.tsx:147-195` owns the full-row disclosure and fixed `min-h-8` face.
- **The canonical PO item display already exists.** `PoItemsSection` → `PoLinesAccordion` → `PoLineRow` → `ItemRecordRow` is the shared item surface used by Unbox, Testing, Search, and scan-out. `ItemRecordRow` also owns the canonical disclosure behavior and instant body unmount.
- **Packing is still forked.** `src/components/packer/PackOrderPanel.tsx:276-309` renders `OrderPackChecklist` directly inside the scan well. `src/components/packing/OrderPackChecklist.tsx:173-189` adds its own bordered card and visible `Pack checklist` header, while `src/components/packing/PackChecklistLineRow.tsx:232-307` paints a separate row face and chevron.
- **Testing/QC centre is already mostly corrected.** `src/components/tech/TestingPanel.tsx:481-519` uses the shared `StationBandStack` with `Items` and `Label`, and `TestingPoUnboxingSection` delegates to the shared `PoItemsSection` path.
- **QC still has separate display bodies.** The operational QC checklist leaf uses `TestingSkuChecklistPanel` → `ChecklistSection` → `ChecklistStepRow`; catalog authoring uses `QcChecklistWorkspace` → `QcChecklistSection`. These are different grains and mutation contracts, so they should share the neutral surface geometry, not be forced into the packing DTO or the Unbox capture controller.
- The working tree is already dirty, including the packing host files and unrelated warehouse refactor files. Implementation must preserve existing changes and must not reset or broad-format the tree. The current uncommitted `EbayPackLabelCard` change in `PackOrderPanel` is outside this layout plan and must remain intact.

## Display contract / acceptance criteria

1. The packing work centre opens with the same disclosure grammar as Unbox: a full-width `Items` row, the same header height, same left-aligned label/icon, same trailing chevron behavior, and no visible `Pack checklist` header.
2. Packing item rows use the same `ItemRecordRow` face as Unbox/PO line rows: same thumb column, title band, metadata ledger, disclosure affordance, and instant collapsed-body unmount. Packing-only kit-part, insert-document, readiness, and pack-confirmation behavior remains intact inside the row body.
3. No packing-specific outer rounded card, header strip, or second chevron remains around the same content. Progress/readiness may remain as trailing metadata or a body footer, but must not create a second competing section header.
4. Testing/QC centre continues to use `StationBandStack` and the shared `PoItemsSection` path. Do not regress its `Items`/`Label` band names or height.
5. The operational QC checklist display has flush, fixed-height rows and no duplicate section title when embedded in the Displays column. The authoring QC page remains functionally complete and may retain edit controls, but its list must use the same row-height/surface tokens rather than inventing station chrome.
6. Empty/loading/unknown-order states retain their semantics and do not render a dead disclosure control.
7. Existing scan, keyboard, checklist persistence, kit-document preview/print, readiness blocking, QC result recording, and authoring CRUD behavior remain unchanged.

## Open wording decision

Use **`Items`** as the packing operational band label because that is the exact label in the Unbox and Testing station contracts. Keep **`Checklist`** only as the right-edge QC display/tab identity where it describes a distinct display, not as a centre header over the packing rows. If the product owner intended a different literal label than `Items`, settle that before implementation; do not introduce a new synonym such as `Packer Checklist`.

---

### Task 1: Lock the shared display contract with focused tests

**Objective:** Add regression coverage before changing the packing and QC render paths.

**Files:**
- Modify: `src/components/station/collapse/station-collapse-chrome.test.ts`
- Create: `src/components/packing/packing-display-layout.test.ts`
- Create or modify: `src/components/tech/sku-testing/checklist-display-layout.test.ts` (only if a focused render/structural test is needed for the operational QC leaf)

**Steps:**

1. Extend the station chrome test to treat the packing centre as a consumer of `StationBandStack` once migrated, and assert that Unbox, Testing, and Packing use the shared stack rather than hand-rolled collapsible blocks.
2. Add a packing contract test that checks the host exposes the `Items` band, `OrderPackChecklist` does not render the user-visible `Pack checklist` heading, and the packing line adapter composes `ItemRecordRow` rather than a custom title/chevron face.
3. Add assertions for the important negative space: no local `StationBandStack` well class, no second disclosure header, and no layout-height transition in the packing row path.
4. If the QC checklist leaf changes, add a test for embedded mode proving the checklist does not add a second section title/card around the Displays body; keep authoring tests separate from station execution tests.
5. Run focused tests and confirm they fail against the current packing implementation before proceeding.

**Verification:**

```bash
pnpm exec tsx --test src/components/station/collapse/station-collapse-chrome.test.ts
pnpm exec tsx --test src/components/packing/packing-display-layout.test.ts
```

Expected initial result: the new packing assertions fail because `PackOrderPanel` does not yet use `StationBandStack`, `OrderPackChecklist` still emits `Pack checklist`, and `PackChecklistLineRow` still owns custom geometry.

---

### Task 2: Add the packing station band controller and `Items` wrapper

**Objective:** Put packing content under the same full-width disclosure row used by Unbox.

**Files:**
- Modify: `src/components/packer/PackOrderPanel.tsx:12-40, 245-313`
- Possibly modify: `src/components/packer/PackOrderWorkspace.tsx` only if state must be lifted to preserve the existing active-order swap behavior

**Steps:**

1. Mirror the existing Unbox/Testing controller composition: create the auto-collapse controller and a band controller with the label band behavior appropriate to packing. Do not create a packing-only disclosure hook.
2. Import `StationBandStack` and the existing station icon/token sources through the established barrel paths. Do not guess new Tailwind geometry; the stack must supply the header and body well.
3. Replace the direct checklist-in-well composition with an `Items` band whose body is the existing packing checklist. Preserve the `EbayPackLabelCard` placement and all current `OrderPackChecklist` props unless browser review proves that card is intended to be part of the Items body.
4. Put any packing progress action/count on the shared band’s trailing action slot or inside the checklist body; do not add another top-level header strip.
5. Preserve the current unit-scan branch, Displays push stack, label card, readiness callback, unknown-order path, and reset key.
6. Make the band collapse instant and host-owned, matching `useBandCollapse` and the existing Unbox rule. Do not add height animation.

**Verification:** Re-run the Task 1 packing test and inspect the rendered DOM for exactly one `Items` disclosure header around the order checklist.

---

### Task 3: Remove the packing checklist header/card fork

**Objective:** Make `OrderPackChecklist` a body component when embedded under the packing `Items` band.

**Files:**
- Modify: `src/components/packing/OrderPackChecklist.tsx:16-33, 147-189`
- Test: `src/components/packing/packing-display-layout.test.ts`

**Steps:**

1. Add the smallest explicit presentation contract needed by the host, preferably an `embedded`/`suppressHeader` prop consistent with `PoLinesAccordion` and `ChecklistSection`, rather than making the component infer its host.
2. When embedded, remove the bordered card shell and the visible `Pack checklist` heading. Keep the list, readiness status, document slide-over sibling, loading state, and unknown-order behavior intact.
3. Keep a standalone mode only if another live caller needs it; enumerate callers first and preserve their behavior. If the mobile caller is the only other consumer, keep its current mobile-specific presentation and do not silently change it.
4. Move the `done/total verified` information to the approved body/band action location without changing its calculation or wording unless the display contract explicitly requires it.
5. Assert that no visible `Packer Checklist`/`Pack checklist` heading is emitted in the operational embedded path, while the checklist data and readiness messages remain present.

**Verification:**

```bash
pnpm exec tsx --test src/components/packing/packing-display-layout.test.ts
```

Expected result: the checklist is a flush body under `Items`, with no duplicate outer header.

---

### Task 4: Port the packing line face to the canonical item-row geometry

**Objective:** Make each packing line visually and behaviorally match the Unbox line-edit item row while retaining packing-specific body behavior.

**Files:**
- Modify: `src/components/packing/PackChecklistLineRow.tsx:214-407`
- Modify: `src/components/packing/OrderPackChecklist.tsx:191-264` only for the adapter props/state if needed
- Test: `src/components/packing/packing-display-layout.test.ts`

**Steps:**

1. Map `PackChecklistLineDto` to the neutral `ItemRecord` shape in the packing adapter: `orderRowId` as the stable id, `productTitle`, catalog image, SKU, quantity, condition, and serial preview.
2. Render `ItemRecordRow` for the identity face. Let it own the thumb column, title/meta ledger, disclosure control, active/collapsed attributes, and instant body unmount.
3. Pass the existing packing detail content as `ItemRecordRow.body`: visual match, catalog facts, pack notes, kit parts/document strips, and `Verify before sealing` QC sub-checks. Preserve all callback wiring to `persistTick` and document preview/print.
4. Use the shared disclosure controller shape. Keep the existing one-expanded-line policy if it is intentional; if it is not compatible with `ItemRecordRow`, adapt the parent state without adding local row state or a second chevron.
5. Remove the custom packing title grid, custom expand button, custom `PO_LINE_HEADER_FACE` dependency, and any duplicate row-height classes that conflict with `ItemRecordRow`.
6. Keep the packing checkbox as a domain action, but place it in an allowed `ItemRecordRow` action/body slot or a domain-neutral overlay without replacing the canonical item face. Avoid nested buttons and preserve keyboard/accessibility semantics.
7. Verify that collapsed rows retain thumb/title/meta identity and remove their detail body from the tree, just as the Unbox line rows do.

**Verification:**

```bash
pnpm exec tsx --test src/design-system/components/item-record/item-record-disclosure.test.ts
pnpm exec tsx --test src/components/packing/packing-display-layout.test.ts
```

Expected result: packing rows expose the same `data-item-record-*` structure and disclosure behavior as Unbox rows, while kit/QC/document behavior still renders in the expanded body.

---

### Task 5: Normalize the operational QC checklist display body

**Objective:** Remove the remaining QC display chrome fork without coupling QC execution to packing data.

**Files:**
- Modify: `src/components/tech/testing-panel/TestingSkuChecklistPanel.tsx`
- Modify: `src/components/tech/sku-testing/ChecklistSection.tsx:13-151`
- Modify: `src/components/tech/sku-testing/ChecklistStepRow.tsx:12-130`
- Test: `src/components/tech/sku-testing/checklist-display-layout.test.ts`

**Steps:**

1. Confirm the Testing centre remains unchanged as the shared `StationBandStack`/`PoItemsSection` path; this task targets the right-edge QC checklist display only.
2. Keep `ChecklistSection`’s editing/result-recording controller and `ChecklistStepRow`’s mutation behavior, but remove any embedded section title/card treatment that duplicates the parent Displays chrome.
3. Align the embedded list row’s fixed height, spacing, surface, and disclosure/interaction treatment with the shared station/item-row tokens. Do not add an Unbox-only capture body or a pack-only checklist header.
4. Keep `ChecklistSection`’s non-embedded mode available for callers that require a titled standalone checklist; use an explicit embedded mode for the Testing Displays leaf.
5. Ensure the `Checklist` Displays tab remains reachable and its label is not confused with the centre `Items` band.

**Verification:** Run the focused QC display test and verify both `embedded` and standalone modes render the expected title ownership.

---

### Task 6: Decide and, if required, align QC authoring without changing its grain

**Objective:** Prevent the Products → QC Checklist authoring page from becoming a third visual fork while preserving CRUD semantics.

**Files:**
- Modify only if the acceptance review includes the authoring page: `src/components/products/QcChecklistWorkspace.tsx:68-129`
- Modify only if needed: `src/components/manuals/sections/QcChecklistSection.tsx:214-426`
- Optional test: `src/components/products/qc-checklist-display-layout.test.ts`

**Steps:**

1. Treat the authoring page as a product/SKU-grain editor, not as a station line-row. Do not route it through `OrderPackChecklist`, `PackChecklistLineRow`, or `PoItemsSection`.
2. Remove only redundant ad-hoc outer chrome if the product requirement includes this page; preserve product header, add/edit/delete, draft/published status, structured value fields, and refresh behavior.
3. Reuse existing design-system `Panel`/button/input tokens and match the canonical row density; do not introduce a station disclosure band merely to make an authoring form look like a floor station.
4. If the authoring page is intentionally out of scope, document that boundary in the final implementation notes and add no code change.

**Verification:** Existing QC authoring interactions remain available, and no operational station route imports the authoring component.

---

### Task 7: Remove dead fork code and update structural guard coverage

**Objective:** Ensure the old packing/QC layout cannot quietly return through a second import or legacy header.

**Files:**
- Modify: `src/components/station/collapse/station-collapse-chrome.test.ts`
- Modify or delete only after caller search: `src/components/packing/PackChecklistLineRow.tsx` (remove obsolete helpers/imports)
- Modify: `src/components/packing/OrderPackChecklist.tsx` (remove obsolete header-only constants/props)
- Modify: `src/components/tech/sku-testing/ChecklistSection.tsx` and `ChecklistStepRow.tsx` (remove unused embedded chrome)

**Steps:**

1. Search all callers of `OrderPackChecklist`, `PackChecklistLineRow`, `ChecklistSection`, and `ChecklistStepRow` before deleting or renaming anything.
2. Remove unused imports, comments describing the retired fork, custom chevron/header helpers, and obsolete CSS constants only after the new path is live.
3. Extend structural tests to assert that packing and Testing do not hand-roll `StationCollapsibleBlock` stacks, local station well classes, or duplicate `Collapse all` controls.
4. Leave mobile checklist behavior explicitly covered; mobile is a separate shell and must not be changed accidentally by a desktop station refactor.

**Verification:** `pnpm exec eslint` on changed files reports no unused imports or new warnings, and the structural tests pass.

---

### Task 8: Run the complete verification and browser review

**Objective:** Prove visual parity, behavior preservation, and no regression in the dirty warehouse worktree.

**Files:** No new files; verification only.

**Steps:**

1. Run focused tests for station collapse, ItemRecord disclosure, packing checklist/readiness, and Testing QC result behavior.
2. Run the repository type/build/lint/eval gates without touching `.env` or credential files.
3. Verify the actual authenticated Pack and Testing routes in the real browser, not an unauthenticated redirect or raw HTTP response. Check light and dark themes.
4. Inspect these cases: one line, multiple lines, all bands closed/open, an expanded line, empty/loading checklist, unknown order, required kit part missing, document-bearing kit part, QC checklist with zero/one/many steps, and a recorded numeric/pass-fail result.
5. Confirm the packing screenshot-equivalent geometry: `Items` row and item face use the same vertical height as Unbox; no `Pack checklist` header; no second chevron; `Label`/QC display remains separately named where applicable.
6. Re-check `git status` and report unrelated pre-existing modifications separately. Do not commit, push, reset, or stage unrelated changes unless explicitly requested.

**Commands:**

```bash
pnpm exec tsx --test src/components/station/collapse/station-collapse-chrome.test.ts
pnpm exec tsx --test src/design-system/components/item-record/item-record-disclosure.test.ts
pnpm exec tsx --test src/components/packing/packing-display-layout.test.ts
pnpm run lint
pnpm run build
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

If a shared UI primitive is changed, also run the design-system contract/tokens/critique flow required by `AGENTS.md` before the write and `node tools/design-mcp/smoke.mjs` afterward. For this plan, the existing `StationBandStack` and `ItemRecordRow` should be reused rather than replaced, so avoid adding a new primitive unless the implementation proves the existing contracts cannot express the required packing body.

## Definition of done

- Pack uses the Unbox station disclosure grammar and exact `Items` label.
- Pack rows use the shared item-row face and equal height; custom pack details remain functional under the row disclosure.
- QC Testing centre remains on the shared `StationBandStack`/`PoItemsSection` path, and its checklist display has no duplicate embedded header/card.
- Products QC authoring is either aligned through existing primitives or explicitly documented as a separate SKU-grain editor.
- No old packing/QC layout path remains reachable from the relevant CTA.
- Focused tests, lint, build, and eval output are green, with browser verification completed in both themes.
- No unrelated dirty files are modified, staged, committed, or reset.
