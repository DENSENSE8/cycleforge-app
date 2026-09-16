# CycleForge Next Coding Run: Mobile Picking List

## Decision Lock

Use **Option B**:

> One semantic table/data contract with multiple presenters.

Do not create:

- a second picking-list data source
- a second pick mutation
- a mobile-only selection model
- a mobile-only filter/sort state model
- a page-specific replacement for the shared table engine
- a universal component controlled by increasingly complex CSS
- invented table IDs, APIs, saved-view surfaces, or domain fields

The desktop and mobile presenters must consume the same resolved row model, row key, state resolver, field catalog, verb catalog, permissions, and query contract.

## Important Corrections to Verify

Treat these as hypotheses until verified locally:

- Do not assume the repository has a symbol named `TableDefinitionRegistry`; locate the actual registry and binding symbols.
- Do not assume the current picking list already uses `useSlotTableLayout`; trace the actual route and component.
- Do not assume the current business identifier is called “Ship ID.” Confirm whether operators use order number, shipment ID, fulfillment ID, or another identifier.
- WCAG 2.2 SC 2.5.8 defines a 24×24 CSS-pixel minimum target size with exceptions. A 44×44 target is the safer product requirement for touch-heavy picking, but should not be described as the WCAG minimum.
- WCAG 1.4.10 Reflow is relevant to the 320 CSS-pixel viewport requirement, but it does not require a particular card or table layout.

---

# Scope

Replace the current picking-list presentation with a mobile-first picking-card/list presenter.

The first card should communicate:

```text
┌─────────────────────────────────────────┐
│ [image]  Item title              Ship ID │
│          Qty · Price · Condition         │
│          Listing link              [Pick]│
└─────────────────────────────────────────┘
```

Required information hierarchy:

1. Product/item image on the left.
2. Item title at the top.
3. Ship/order identifier at the top right.
4. Second row:
   - quantity
   - price
   - condition
   - listing link
5. Primary `Pick` CTA at the bottom right.
6. Clear loading, success, disabled, and failure states.

The desktop dense presenter remains supported unless verification proves that the mobile card is better for a particular desktop workflow.

---

# Phase 0 — Repository Discovery and Contract Freeze

## Objective

Identify the real current picking-list implementation before editing anything.

## Tasks

- [ ] Locate the picking-list route.
- [ ] Locate the page/workspace component that mounts it.
- [ ] Trace the data flow:

  ```text
  route
  → page/workspace
  → table mount
  → query hook/API
  → row type
  → adapter/field catalog
  → presenter
  → pick mutation
  → cache/state update
  → navigation/selection
  ```

- [ ] Locate the actual table registration/binding symbol.
- [ ] Locate the actual `PRODUCT_TABLES` entry, if this picking list is registered there.
- [ ] Locate the current desktop presenter.
- [ ] Locate any existing mobile list/card presenter used by a nearby workflow.
- [ ] Locate the existing image URL and fallback logic.
- [ ] Locate the exact title field.
- [ ] Locate the exact business identifier shown to pickers.
- [ ] Locate quantity, price, and condition fields.
- [ ] Locate the listing/external-link field and URL helper.
- [ ] Locate the existing pick action, verb, mutation, or state transition.
- [ ] Locate optimistic update and rollback behavior.
- [ ] Locate existing permissions and tenant scoping.
- [ ] Locate row selection and row-open behavior.
- [ ] Locate relevant saved-view, filter, sort, and URL-state code.
- [ ] Locate relevant tests and eval commands.
- [ ] Locate any stale or duplicate picking-list implementation that should be removed rather than extended.

## Evidence Required

Produce a short contract table before implementation:

| Requirement | Exact source file/symbol | Existing behavior | Reuse/change |
|---|---|---|---|
| Row key | ... | ... | reuse |
| Image | ... | ... | reuse/adapt |
| Title | ... | ... | reuse/adapt |
| Ship/order ID | ... | ... | confirm |
| Quantity | ... | ... | reuse/adapt |
| Price | ... | ... | reuse/adapt |
| Condition | ... | ... | reuse/adapt |
| Listing link | ... | ... | reuse/adapt |
| Pick action | ... | ... | reuse |
| Selection | ... | ... | reuse |
| Search/filter | ... | ... | reuse |
| Saved views | ... | ... | reuse |
| Error/retry | ... | ... | reuse/add |

## Exit Criteria

Do not proceed until:

- the current picking-list route is known
- the current pick mutation is known
- the business identifier is confirmed
- all required fields have exact source symbols
- the current row key is known
- the current query/state path is understood

If any of these cannot be verified, stop and report the missing evidence instead of inventing an implementation.

---

# Phase 1 — Shared Presenter Contract

## Objective

Define the presenter-neutral row model without changing desktop behavior.

## Tasks

- [ ] Confirm whether the existing table binding already exposes all required fields.
- [ ] If a required field is missing, add it through the existing field catalog/adapter path.
- [ ] Do not add a mobile-only API response.
- [ ] Do not add a second database query.
- [ ] Do not duplicate business-state derivation in the mobile component.
- [ ] Define a presenter-neutral model containing only resolved display data and existing callbacks/state:

  ```ts
  type PickingRowPresenterModel = {
    rowKey: string;
    image: {
      src: string | null;
      alt: string;
    };
    title: string;
    identifier: string;
    quantity: string;
    price: string;
    condition: string;
    listingUrl: string | null;
    pick: {
      state: 'ready' | 'pending' | 'picked' | 'error';
      label: string;
      disabled: boolean;
      onPick: () => void;
      onRetry?: () => void;
    };
  };
  ```

  Do not copy this type blindly. Adapt it to existing repository types and conventions.

- [ ] Ensure the model derives from the same row adapter and state resolver used by the desktop presenter.
- [ ] Ensure the same row key drives:
  - selection
  - row open
  - scroll-to-row
  - optimistic cache updates
  - mutation reconciliation

## Acceptance Criteria

- Desktop output is behaviorally unchanged.
- Mobile and desktop receive the same row identity.
- No duplicate field derivation exists.
- No duplicate pick mutation exists.
- No new page-specific state machine exists.
- Existing URL state and saved-view behavior remain unchanged.

## Verification

Run the smallest relevant existing tests discovered in Phase 0.

Also verify that the shared table/cohort contract still passes:

```bash
pnpm run eval:cohort slot-table
```

---

# Phase 2 — Design-System and Accessibility Contract

## Objective

Choose existing primitives and tokens before implementing the mobile card.

## Tasks

- [ ] Consult the design-system contract for:
  - responsive table/list presentation
  - image/fallback image
  - metadata/chips
  - external listing links
  - primary CTA
  - loading and error states
  - accessible menus
- [ ] Consult design-system tokens for:
  - spacing
  - typography
  - touch target sizing
  - borders and surfaces
  - responsive behavior
- [ ] Do not guess Tailwind classes, colors, radii, or pixel values.
- [ ] Confirm how long titles wrap.
- [ ] Confirm how long identifiers wrap or truncate.
- [ ] Confirm whether condition is a label, enum, or free text.
- [ ] Confirm image alt behavior:
  - informative image: meaningful alt text
  - decorative image: empty alt
  - unavailable image: stable fallback and no broken-image announcement
- [ ] Confirm external listing-link behavior:
  - same tab or new tab
  - safe relationship attributes if a new tab is used
  - preserving the worker’s list state

## Accessibility Acceptance Criteria

- Works at 320 CSS pixels without horizontal scrolling.
- No content is lost solely because the viewport is narrow.
- Interactive targets use the repository’s touch-safe target token; target 44×44 CSS pixels where practical.
- Keyboard focus order is logical.
- Screen readers receive a useful row name containing the title and confirmed business identifier.
- The Pick control has an explicit accessible name.
- Loading and success states are announced without excessive live-region noise.
- Error state exposes a clear retry action.
- Color is not the only signal for picked, pending, or failed states.
- Text remains readable when title, identifier, or condition wraps.

---

# Phase 3 — Mobile Picking Presenter

## Objective

Implement the mobile presenter using the shared presenter model.

## Layout Requirements

Use the existing design-system primitives and tokens.

The intended hierarchy is:

```text
Card
├── left image/fallback
├── top content row
│   ├── title
│   └── confirmed ship/order identifier
├── metadata row
│   ├── quantity
│   ├── price
│   ├── condition
│   └── listing link
└── action row
    └── Pick CTA aligned to the bottom/right
```

## Tasks

- [ ] Implement the mobile presenter at the correct shared engine boundary.
- [ ] Keep row identity and callbacks supplied by the shared table model.
- [ ] Use the existing image/fallback component if one exists.
- [ ] Use the existing listing-link helper.
- [ ] Use the existing Button/CTA primitive.
- [ ] Ensure title wrapping never collides with the identifier.
- [ ] Ensure metadata wraps or uses a deliberate overflow strategy.
- [ ] Ensure the listing link remains usable on touch devices.
- [ ] Ensure the card itself does not create conflicting nested interactive elements.
- [ ] Decide whether row-open applies to:
  - the identity region
  - the entire non-interactive card surface
  - an explicit secondary action
- [ ] Preserve the existing row-open behavior.
- [ ] Make duplicate Pick submissions impossible during the pending state.
- [ ] Render a clear post-pick state.
- [ ] Preserve retry behavior after failure.
- [ ] Preserve optimistic updates and rollback behavior.

## Missing-Data Behavior

Define and implement explicit behavior for:

- [ ] missing image
- [ ] broken image URL
- [ ] missing title
- [ ] long title
- [ ] long identifier
- [ ] missing quantity
- [ ] missing price
- [ ] missing condition
- [ ] missing listing URL
- [ ] already-picked row
- [ ] pending mutation
- [ ] failed mutation
- [ ] stale row after another worker changes it

Do not use empty visual gaps without an intentional layout reason.

---

# Phase 4 — Desktop and Responsive Integration

## Objective

Add the mobile presenter without degrading desktop operations.

## Tasks

- [ ] Keep the existing dense desktop presenter as the desktop baseline.
- [ ] Select the mobile presenter using the existing responsive/presenter pattern.
- [ ] Do not use CSS-only hiding to maintain two incompatible table structures.
- [ ] Do not create a second data fetch based on viewport width.
- [ ] Do not create separate desktop/mobile filter or sort state.
- [ ] Ensure both presenters use:
  - the same row key
  - the same state resolver
  - the same pick verb
  - the same selection contract
  - the same row-open behavior
  - the same URL state
- [ ] Confirm desktop still supports:
  - dense row comparison
  - sortable data headers
  - bulk selection
  - existing row actions
  - existing saved views
- [ ] Confirm mobile exposes all required actions without silently removing capabilities.

## Acceptance Criteria

- Desktop layout remains dense and usable.
- Mobile layout works at 320 CSS pixels.
- No horizontal scrolling is required for the mobile picking workflow.
- Filters and sorting produce the same records in both presenters.
- Selecting a row produces the same selection state.
- Opening a row reaches the same destination.
- Picking from either presenter updates the same cache/state source.

---

# Phase 5 — Tests and Verification

## Behavioral Tests

Add or update tests only where they defend a real behavior.

### Presenter behavior

- [ ] Required fields render in the intended hierarchy.
- [ ] Missing image uses the correct fallback.
- [ ] Missing listing URL does not render a broken link.
- [ ] Long title and identifier do not overlap.
- [ ] Missing price/condition/quantity have explicit fallback behavior.
- [ ] The row accessible name contains title and business identifier.

### Pick interaction

- [ ] First click invokes the existing pick action.
- [ ] Pending state prevents duplicate submissions.
- [ ] Success state is visible without a full page refresh.
- [ ] Failed pick exposes retry/recovery.
- [ ] Optimistic update rollback leaves the row actionable.
- [ ] A stale or already-picked row cannot be picked twice accidentally.

### Shared contract

- [ ] Mobile and desktop use the same row key.
- [ ] Mobile and desktop use the same filters.
- [ ] Mobile and desktop use the same sorting.
- [ ] Mobile and desktop use the same selection behavior.
- [ ] Mobile and desktop use the same verb/action source.
- [ ] Saved-view parameters are unchanged.

### Responsive and accessibility verification

- [ ] Test at 320 CSS pixels.
- [ ] Test at a normal mobile viewport.
- [ ] Test at desktop width.
- [ ] Test keyboard navigation.
- [ ] Test screen-reader row naming and CTA naming.
- [ ] Test failed-image and failed-mutation states.
- [ ] Test reduced-motion behavior if the presenter adds animation.

## Repository Verification

Use the actual commands discovered from `package.json`.

At minimum, run the relevant:

```bash
node --import tsx --test <relevant-existing-tests>
pnpm run eval:cohort slot-table
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

Do not start a development server as an agent. Browser verification requires the operator-owned active lane.

---

# Phase 6 — Cleanup

## Tasks

- [ ] Remove obsolete picking-list presenter code only after the replacement is verified.
- [ ] Remove duplicate field derivation.
- [ ] Remove duplicate pick-action wiring.
- [ ] Remove unused imports and dead props.
- [ ] Do not leave feature flags, placeholders, no-op callbacks, or abandoned fallback paths.
- [ ] Preserve existing URLs and saved-view compatibility.
- [ ] Re-run the focused tests and slot-table cohort after cleanup.
- [ ] Run design-system critique on every changed UI file.
- [ ] Run the final fast evaluator.

---

# Definition of Done

The coding run is complete only when all statements below are true:

## Architecture

- [ ] One data/query source remains authoritative.
- [ ] One row adapter remains authoritative.
- [ ] One field catalog remains authoritative.
- [ ] One pick mutation/verb remains authoritative.
- [ ] One selection model remains authoritative.
- [ ] One filter/sort URL contract remains authoritative.
- [ ] Mobile and desktop are presenters, not separate table systems.
- [ ] No unsupported table IDs, APIs, or saved-view surfaces were invented.

## Mobile Picking

- [ ] Image is on the left.
- [ ] Title is at the top.
- [ ] Confirmed ship/order identifier is at the top right.
- [ ] Quantity, price, condition, and listing link are represented in the metadata row.
- [ ] Pick CTA is at the bottom right or the closest accessible equivalent permitted by the design system.
- [ ] The card works at 320 CSS pixels.
- [ ] Long and missing values behave intentionally.
- [ ] Loading, success, and failure states are recoverable.
- [ ] Duplicate Pick submissions are prevented.
- [ ] The card is keyboard and screen-reader accessible.

## Regression Safety

- [ ] Desktop density and bulk workflow remain intact.
- [ ] Existing row-open behavior remains intact.
- [ ] Existing saved views remain intact.
- [ ] Existing selection and sort behavior remain intact.
- [ ] Relevant tests pass.
- [ ] Slot-table cohort passes.
- [ ] Fast evaluator passes.
- [ ] Operator-owned browser verification is completed before claiming visual QA.

---

# Stop Conditions

Stop implementation and report instead of guessing if:

- the current picking route cannot be identified
- the pick mutation cannot be identified
- the business identifier is ambiguous
- a required field is unavailable in the current binding
- the existing row state cannot represent pending/success/failure safely
- the design system lacks a required primitive
- mobile requires a second API or second database query
- the mobile presenter would need to bypass the table engine
- saved-view or URL ownership would change unexpectedly
- the desktop presenter regresses in density or bulk operation

# Final Deliverable for the Coding Run

Return:

1. Exact files changed.
2. The verified current picking-list architecture map.
3. The presenter boundary used.
4. The shared fields and actions reused.
5. Tests and eval commands run.
6. Desktop/mobile verification results.
7. Any unresolved issue or intentionally deferred capability.
