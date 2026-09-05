/**
 * Active-sessions field catalog — the bindable facts of one sign-in session.
 *
 * Off `AdminTable` 2026-09-05. The retired display carried five hand-written
 * columns plus a trailing ACTIONS cell of buttons; the verb (revoke) is a row
 * verb now (`CompoundRowAction`), which is what let the section mount the shared
 * row instead of its own.
 *
 * COMPOUND morph: sheet morph still has no shared row.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const AUTHSESSIONS_FIELD_CATALOG: FieldCatalog = [
  { id: 'auth-sessions.sid', family: 'auth-sessions', label: 'Session', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'sid' } },
  { id: 'auth-sessions.staff', family: 'auth-sessions', label: 'Staff', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { value: 'staff_name', id: 'staff_id' } },
  { id: 'auth-sessions.device_kind', family: 'auth-sessions', label: 'Device', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'device_kind' } },
  { id: 'auth-sessions.device_label', family: 'auth-sessions', label: 'Device name', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'device_label' } },
  { id: 'auth-sessions.ip', family: 'auth-sessions', label: 'IP', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'ip' } },
  { id: 'auth-sessions.last_seen', family: 'auth-sessions', label: 'Last activity', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'last_seen_at' } },
  { id: 'auth-sessions.created', family: 'auth-sessions', label: 'Signed in', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'created_at' } },
  { id: 'auth-sessions.expires', family: 'auth-sessions', label: 'Expires', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'expires_at' } },
];

/**
 * The PRODUCT default. `staff` is not bound as a track — the compound row's
 * TITLE is the staffer, and a fact printed twice on one row is the repetition
 * the column contract refuses. It stays bindable.
 */
export const AUTHSESSIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'auth-sessions.sid',
  statusBindings: [
    { fieldId: 'auth-sessions.last_seen' },
    { fieldId: 'auth-sessions.device_label' },
    { fieldId: 'auth-sessions.ip' },
    { fieldId: 'auth-sessions.expires' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

export const AUTHSESSIONS_TABLE_LAYOUT_ID = 'auth-sessions';
