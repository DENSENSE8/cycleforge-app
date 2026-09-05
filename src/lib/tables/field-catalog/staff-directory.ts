/**
 * Staff-directory field catalog — the bindable facts of one teammate.
 *
 * Off `AdminTable` 2026-09-05. Role changes, deactivation and invite resends
 * were a trailing ACTIONS cell; they are row verbs now.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const STAFFDIRECTORY_FIELD_CATALOG: FieldCatalog = [
  { id: 'staff-directory.id', family: 'staff-directory', label: 'Staff id', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'staff-directory.name', family: 'staff-directory', label: 'Name', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { value: 'name' } },
  { id: 'staff-directory.role', family: 'staff-directory', label: 'Role', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'role' } },
  { id: 'staff-directory.status', family: 'staff-directory', label: 'Status', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'status' } },
  { id: 'staff-directory.auth_method', family: 'staff-directory', label: 'Sign-in', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'auth_method' } },
  { id: 'staff-directory.last_login', family: 'staff-directory', label: 'Last sign-in', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'last_login_at' } },
  { id: 'staff-directory.home', family: 'staff-directory', label: 'Home', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'default_home_path' } },
];

/** `name` is the row TITLE and `status` the state pill — neither is a track. */
export const STAFFDIRECTORY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'staff-directory.id',
  statusBindings: [
    { fieldId: 'staff-directory.role' },
    { fieldId: 'staff-directory.auth_method' },
    { fieldId: 'staff-directory.last_login' },
    { fieldId: 'staff-directory.home' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

export const STAFFDIRECTORY_TABLE_LAYOUT_ID = 'staff-directory';
