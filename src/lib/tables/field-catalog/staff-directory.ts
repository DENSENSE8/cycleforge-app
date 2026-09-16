/**
 * Staff-directory field catalog — the bindable facts of ONE `staff` row.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk painted SEVEN
 * hand-written `AdminTableColumn` objects carrying JSX — Name · Role · Status ·
 * PIN · Auth · Last login · an actions cell — with no header sort, no Fields
 * picker and no org binding, because that engine never grew them. Two of the
 * seven were not display at all: `auth` was a live two-control EDITOR inside a
 * cell, and `actions` was a `<Button>` behind `window.confirm`.
 *
 * ## Where the nine facts landed
 *
 * | retired cell   | fact                        | home on the compound row      |
 * |----------------|-----------------------------|-------------------------------|
 * | —              | `staff_id`                  | the IDENTITY handle           |
 * | Name           | `staff`                     | the row TITLE (item cell)     |
 * | Role           | `role`                      | `status:1`                    |
 * | Status (word)  | `status`                    | the STATE pill                |
 * | Status (dim)   | `active`                    | the STATE pill's other half   |
 * | PIN            | `has_pin`                   | `status:2`                    |
 * | Auth (select)  | `auth_method`               | `status:3`                    |
 * | Auth (check)   | `requires_sensitive_stepup` | `status:4`                    |
 * | Last login     | `last_login`                | DATES chrome                  |
 * | Deactivate     | —                           | a row VERB, not a fact        |
 *
 * Four of those are decisions rather than transcription.
 *
 * **`staff_id` is new, and it is not a restored column.** The compound skeleton
 * mounts WHOLE (`COMPOUND_SKELETON_FILTER_DEBT` is shrink-only) so the identity
 * track paints on every family, `parseSlotLayout` requires the identity fact to
 * be `displayType: 'id'`, and the header-sort law forbids a painted track with
 * a dead header. `staff.id` is the row's real handle: it is what the retired
 * Role link put in its query string (`?staffId=`) and what the Deactivate
 * payload named. Declaring it is what keeps a mandatory track honest — the same
 * move `part-compatibility.linked` made for the Dates chrome.
 *
 * **The name is a `person`, not a string.** The retired cell drew a 2×2 dot
 * filled from `color_hex` before the name. The `person` face (`StaffAvatar`)
 * resolves that same colour — and the staffer's photo — from the staff
 * identity cache keyed on the staff id, so the colour survives as a DECLARED
 * view field rather than as a colour column crossing the RSC boundary. It is
 * not bound by default (the title already prints the name; a track beside it
 * would print the name twice), so the default paint does not carry the dot —
 * binding `Teammate` into a free slot from the Fields menu restores it, richer.
 *
 * **`status` and `active` are two facts, one pill.** The retired
 * `<StatusPill status active>` printed `deactivated` for any inactive staffer,
 * which meant their real lifecycle word was unreadable. Both are facts here —
 * each sorts and searches on its own — and the merge happens once, in the
 * adapter's `stateLabel` (`staffEffectiveStatusLabel`).
 *
 * **`auth_method` and `requires_sensitive_stepup` are READ facts.** They were
 * a `<select>` and a checkbox that POSTed `/api/admin/staff/update` from inside
 * a cell. No family in this repo sets `capabilities.inCellEdit`, so the write
 * became a row verb opening a `DeskStageOverlay`
 * (`staff-directory-verbs.ts` → `StaffAuthPolicyPlane`). The facts stay on the
 * row so an admin can still scan and sort a column of them, which a `<select>`
 * inside a cell could never be sorted by.
 *
 * ## Not here, and deliberately
 *
 * `default_home_path` and `color_hex` are selected by the page's query and
 * painted by no track — see `staff-directory-row.ts`. `staff-directory.test.ts`
 * fails the day either name appears in a `paths` here.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const STAFF_DIRECTORY_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact. `displayType: 'id'` is what `parseSlotLayout` requires
   * of an identity and what makes the fulfillment cell paint an ID face.
   */
  {
    id: 'staff-directory.staff_id',
    family: 'staff-directory',
    label: 'Staff #',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'id' },
  },
  /**
   * The teammate. A PERSON value, never a bare name string — that is what
   * carries the retired colour dot (see the module docblock).
   */
  {
    id: 'staff-directory.staff',
    family: 'staff-directory',
    label: 'Teammate',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { display: 'name', name: 'name', value: 'id' },
  },
  {
    id: 'staff-directory.role',
    family: 'staff-directory',
    label: 'Role',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'role' },
  },
  /** The lifecycle word. The pill's primary fact, and its sort. */
  {
    id: 'staff-directory.status',
    family: 'staff-directory',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
  /**
   * Whether the account is live. The pill's OTHER half — unbound by default,
   * because a track reading `Inactive` beside a pill reading `deactivated` is
   * the same fact twice (`compound-row-model.ts`'s lie-by-repetition rule).
   * It stays a fact so an admin can sort the deactivated to the bottom, which
   * the retired desk could only do through its fixed `ORDER BY active DESC`.
   */
  {
    id: 'staff-directory.active',
    family: 'staff-directory',
    label: 'Account',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'active' },
  },
  {
    id: 'staff-directory.has_pin',
    family: 'staff-directory',
    label: 'PIN',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'has_pin' },
  },
  /** WS6.1 sign-in method — a READ fact; the write is a row verb. */
  {
    id: 'staff-directory.auth_method',
    family: 'staff-directory',
    label: 'Sign-in',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'auth_method' },
  },
  /** WS6.1 sensitive-information wall — a READ fact; the write is a row verb. */
  {
    id: 'staff-directory.requires_sensitive_stepup',
    family: 'staff-directory',
    label: 'Step-up',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'requires_sensitive_stepup' },
  },
  /**
   * The one temporal fact on a staff row — the compound DATES chrome's.
   * Chrome-carried, so the product layout does not bind it as a track.
   */
  {
    id: 'staff-directory.last_login',
    family: 'staff-directory',
    label: 'Last login',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_login_at' },
  },
];

/**
 * The PRODUCT default — the four retired DISPLAY columns that the shared row
 * chrome does not already paint.
 *
 * FOUR is the ceiling, not a preference. The skeleton mounts whole, so
 * `select · fulfillment · thumb · item · dates · state · status:1…4 · _fill`
 * is exactly `MAX_DEFAULT_VISIBLE_TRACKS` (10); a fifth binding fails
 * `parseTableDefinition` at module load.
 *
 * Five facts therefore ship UNBOUND — `staff` (the title prints the name),
 * `status` (the state pill), `active` (the same pill's other half),
 * `last_login` (the Dates chrome) — and every one of them stays sortable,
 * searchable and bindable from the Fields menu. That is the house form of the
 * retired `tier: 'optional'` (`ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `subtitleBindings` is EMPTY, which is the faithful answer: the retired Name
 * cell was one line (dot + name) and nothing in the feed was ever written
 * under it. An org that wants a second line binds one; inventing one here
 * would be inventing a fact.
 *
 * `amountFieldId: null` — a teammate has no money fact.
 */
export const STAFF_DIRECTORY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'staff-directory.staff_id',
  statusBindings: [
    { fieldId: 'staff-directory.role' },
    { fieldId: 'staff-directory.has_pin' },
    { fieldId: 'staff-directory.auth_method' },
    { fieldId: 'staff-directory.requires_sensitive_stepup' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Team entry. */
export const STAFF_DIRECTORY_TABLE_LAYOUT_ID = 'staff-directory';
