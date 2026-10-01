/** Staff-directory field catalog — the bindable facts of ONE `staff` row. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const STAFF_DIRECTORY_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact. `displayType: 'id'` is required for an identity and
   * makes the fulfillment cell paint an ID face.
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
  /** Whether the account is live. */
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

/** The PRODUCT default — the four retired DISPLAY columns that the shared row chrome does not already paint. */
export const STAFF_DIRECTORY_PRODUCT_LAYOUT: DataTableColumnLayout = {
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
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Team entry. */
export const STAFF_DIRECTORY_TABLE_LAYOUT_ID = 'staff-directory';
