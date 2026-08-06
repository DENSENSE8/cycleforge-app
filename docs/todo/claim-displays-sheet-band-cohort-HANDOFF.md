# Claim Displays sheet-band SoT cohort — HANDOFF

**Created 2026-08-05.** Paste-ready prompt for the next agent to grow the
**sheet-band / flush create-form** SoT beyond Subject · Body · Claim type, and
migrate the remaining Claim Displays (and shared) components that still wrap
content in nested padded cards — especially **Link · Find** ticket search
(`TicketPicker`), which still shows rounded search + boxed recent-ticket list.

**Lane:** current checkout — attach to `:3050`; never start/restart/kill the
dev server. User owns commits.

**Verify:** `npm run verify` was green after the Subject/Body + Claim-type
slice. Do not raise DS ratchet / knip baselines.

---

## What shipped (done — do not re-open)

### 1. Sheet-band Subject / Body (claim compose golden)

| Lock | Where |
|---|---|
| Faces | [`DenseComposeFields.tsx`](../../src/design-system/components/DenseComposeFields.tsx) — underline Subject + full-bleed sunken Body (`inset-field` only) |
| Mount | [`ClaimTemplateEditor.tsx`](../../src/components/receiving/workspace/claim/components/ClaimTemplateEditor.tsx) |
| SoT | [`.claude/rules/display/right-rail-inspector.md`](../../.claude/rules/display/right-rail-inspector.md) → Segments · [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) → Ticket/Claim |
| Guard | [`claim-display-fill.guard.test.ts`](../../src/components/receiving/workspace/claim-display-fill.guard.test.ts) — no `rounded-lg border … bg-surface-card` on Subject/Body |

### 2. Flush claim-type combobox

| Lock | Where |
|---|---|
| House combobox | [`SearchableSelectField.tsx`](../../src/design-system/components/SearchableSelectField.tsx) — `appearance="flush"` (`rounded-none`, no trigger pad, square panel, Enter → first match) |
| Mount | [`ClaimComposeStep.tsx`](../../src/components/receiving/workspace/claim/components/ClaimComposeStep.tsx) — replaced `HorizontalButtonSlider` |
| Law | Do **not** add a second shadcn `Command`/`Popover` twin — compose `SearchableSelectField` + DS `Popover` |

Claim types remain a **fixed enum** (`CLAIM_TYPE_LABEL` in
[`receiving-claim-type.ts`](../../src/lib/receiving-claim-type.ts)) — category
labels only. **No** `+ Create "…"` until a tenant dictionary + API exist.
Creatable combobox is out of scope for this cohort.

### 3. Flush claim scroll shell + no duplicate titles

| Lock | Where |
|---|---|
| Scroll body | [`ReceivingClaimPanel.tsx`](../../src/components/receiving/workspace/ReceivingClaimPanel.tsx) — `px-0 py-0`; section hairlines; **no** visible `1. PHOTOS` / `2. TICKET` h2 (scroll-spy owns labels; sections keep `aria-label`) |
| Meta removed | No `Support ticket (editable)` restatement — Reset sits on Subject row |
| Chrome | [`ClaimWizardNav.tsx`](../../src/components/receiving/workspace/claim/components/ClaimWizardNav.tsx) already `gap-0` Cybertruck stack |

### Grammar to inherit (locked)

```text
Column = the card. No nested padded islands.

• Outer push / claim scroll: px-0 (rows own gutters)
• Labels: text-role-eyebrow (or micro) uppercase — not a second card header
• Short identity / single-line select: underline or flush SearchableSelectField
• Long prose: full-bleed bg-surface-sunken + borderless inset-field face
• Lists: full-bleed divide-y / border-b hairlines — NOT rounded-xl bordered boxes
• Search fields in rails: flush face (rounded-none, px-0 or underline) — NOT rounded-lg inset-field cards
• Depth = surface step (canvas → sunken), never margin gutters between nested boxes
```

**Anti-models:** `TextField`, `WORKSPACE_NESTED_FIELD`, `rounded-lg border … bg-surface-card` inputs, `rounded-xl border` list shells, step titles that duplicate scroll-spy.

---

## Priority next (screenshot — do this first)

### `TicketPicker` — shared SoT (Link · Find + Send photos + shipment link)

**File:** [`src/components/support/link/TicketPicker.tsx`](../../src/components/support/link/TicketPicker.tsx)  
**Adapter (do not fork):** [`ClaimTicketPicker.tsx`](../../src/components/receiving/workspace/claim/components/ClaimTicketPicker.tsx)  
**Call sites:** Claim Link Find · [`SendPhotoNotePanel`](../../src/components/receiving/workspace/SendPhotoNotePanel.tsx) · any shipment-link host.

**Current anti-pattern (nested box syndrome):**

- Search: `rounded-lg border … inset-field` + outer `px-3` from Find step
- Results: `rounded-xl border … bg-surface-card` list shell with inset rows
- Eyebrows + list sit inside padded wrappers → jagged alignment vs Subject/Body

**Target (same grammar as Subject/Body):**

```text
|← claim column edge                                      →|
| PICK THE EXISTING TICKET (eyebrow)                         |
| Search by subject…_______________________________        |  ← flush / underline search
|──────────────────────────────────────────────────────────|
| RECENT TICKETS                                           |
| #9696  NEW   subject…                         Aug 5      |  ← full-bleed rows, border-b
| #9695  SOLVED …                                          |
```

- Grow SoT if needed: e.g. `DenseComposeSubjectInput`-class search face, or
  `appearance="flush"` list shell helper — **compose, don't fork a Claim-only picker**.
- Drop outer `rounded-xl` list box; use `divide-y` / `border-b` on rows only.
- Find step: remove redundant prose / nested `px-3` that fights full-bleed lists
  ([`ClaimLinkFindStep.tsx`](../../src/components/receiving/workspace/claim/components/ClaimLinkFindStep.tsx)).
- Guard: extend `claim-display-fill.guard.test.ts` **and/or** a small
  `ticket-picker-flush.guard.test.ts` so TicketPicker cannot regress to
  `rounded-xl border` shells.

---

## Remaining claim cohort (same pass or immediate follow-ups)

Migrate **in place** to sheet-band / flush; do not invent page-local twins.

| Surface | File | Drift |
|---|---|---|
| Recipients | [`ClaimRecipientsField.tsx`](../../src/components/receiving/workspace/claim/components/ClaimRecipientsField.tsx) | `rounded-lg border … p-3` card |
| CC chips | [`CcEmailField.tsx`](../../src/components/receiving/workspace/claim/components/CcEmailField.tsx) | `rounded-lg border` well |
| Backup callout | [`ClaimBackupStep.tsx`](../../src/components/receiving/workspace/claim/components/ClaimBackupStep.tsx) | `rounded-lg border` + `mx-3` island |
| Seller message | [`ClaimSellerMessagePanel.tsx`](../../src/components/receiving/workspace/claim/components/ClaimSellerMessagePanel.tsx) | bordered `rounded-lg` textarea — prefer `DenseComposeBody*` |
| Ticket reply | [`ClaimTicketReply.tsx`](../../src/components/receiving/workspace/claim/components/ClaimTicketReply.tsx) | `rounded-lg border` composer |
| Seller skeleton | [`SellerMessageSkeleton.tsx`](../../src/components/receiving/workspace/claim/components/SellerMessageSkeleton.tsx) | bordered card |
| Photos empty / tiles | [`ClaimPhotoPicker.tsx`](../../src/components/receiving/workspace/claim/components/ClaimPhotoPicker.tsx) | `rounded-2xl` / `rounded-lg` cards — flush grid bands OK; keep thumb radius if product requires |
| Filed / Seller steps | [`ClaimFiledStep.tsx`](../../src/components/receiving/workspace/claim/components/ClaimFiledStep.tsx) · [`ClaimSellerStep.tsx`](../../src/components/receiving/workspace/claim/components/ClaimSellerStep.tsx) | already `divide-y`; drop leftover nested boxes inside banners if any |

**Compose step gutters:** Claim type / Subject keep content `px-3` on **rows**; Body band stays full-bleed. Lists/search that should edge-align like Body must cancel or avoid parent `px-3` (prefer row-owned pad only on label lines).

---

## Explicit non-goals

1. Creatable claim types / tenant dictionaries / workflow-rule drawers.
2. Merging Chat · Claim or collapsing New ticket · Link existing into a combobox
   (chrome flatten is a separate Displays slice — see
   [`spacex-displays-topic-plate-flush-HANDOFF.md`](./spacex-displays-topic-plate-flush-HANDOFF.md)).
3. Desk `RightRailHost` intake / Support `ClaimComposer` migration (follow after
   Unbox Claim + shared `TicketPicker` golden).
4. Importing a second shadcn Combobox/Popover under `design-system/primitives`.

---

## Paste this into a new Claude Code / Cursor session

```
Read docs/todo/claim-displays-sheet-band-cohort-HANDOFF.md end-to-end before editing.

GOAL
Continue the Claim Displays sheet-band SoT: every create/link control in the
Unbox Ticket → Claim column inherits the same flush grammar as Subject / Body /
Claim-type combobox — no nested padded cards, no rounded-xl list shells.

START HERE (screenshot drift)
1. Migrate shared TicketPicker (src/components/support/link/TicketPicker.tsx) to
   flush search + full-bleed recent/results rows (divide-y / border-b only).
2. ClaimTicketPicker stays a thin adapter — do not fork a Claim-only picker.
3. Tighten ClaimLinkFindStep wrappers so the list can go column-edge when needed.
4. Then sweep the claim cohort table in the handoff (Recipients, CC, Backup,
   Seller message/reply, skeletons) using DenseComposeFields +
   SearchableSelectField appearance="flush" where applicable.

LOCKED GRAMMAR
- Column = the card; depth via canvas→sunken, not margin islands
- Short fields: underline / flush combobox; long prose: sunken band + inset-field
- Lists: hairline rows, not rounded-xl bordered boxes
- No duplicate section titles (scroll-spy owns 1.PHOTOS / 2.TICKET)
- Compose SearchableSelectField + DenseComposeFields — never a second shadcn Popover/Command twin
- Claim types stay fixed enum — no Create-new until dictionary API exists

HARD LAWS
- AGENTS.md + source-of-truth.md · display/station-workbench.md · right-rail-inspector.md
- Pattern evolution: grow SoT, don't fork TicketPicker per surface
- Motion only @/design-system/motion; attach to :3050; user owns commits
- npm run verify before done; never raise knip / DS ratchets
- Extend claim-display-fill.guard.test.ts (and/or ticket-picker-flush guard)

DONE WHEN
- TicketPicker search + list match Subject/Body flush axis in Displays Claim Link
- Cohort table items migrated or explicitly deferred with reason in a short note
- Guards prevent rounded-xl list shell / Support ticket meta / HorizontalButtonSlider claim types
- npm run verify green
```

---

## Coordinates with (do not conflate)

| Doc | Use |
|---|---|
| [`spacex-displays-topic-plate-flush-HANDOFF.md`](./spacex-displays-topic-plate-flush-HANDOFF.md) | Topic plate + tab stack chrome — not form fields |
| [`displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md`](./displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md) | Noun law Displays ≠ inspector |
| Dense claim plan (Cursor) | Subject/Body decision lock — already executed on this tree |
