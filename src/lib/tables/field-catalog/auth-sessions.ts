/** Auth-sessions field catalog — the bindable facts of one live staff session. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const AUTHSESSIONS_FIELD_CATALOG: FieldCatalog = [
  { id: 'auth-sessions.session', family: 'auth-sessions', label: 'Session', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'sid' } },
  { id: 'auth-sessions.staff', family: 'auth-sessions', label: 'Staff', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'staff_name', name: 'staff_name', value: 'staff_id' } },
  { id: 'auth-sessions.device_kind', family: 'auth-sessions', label: 'Device', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'device_kind' } },
  { id: 'auth-sessions.device_label', family: 'auth-sessions', label: 'Device name', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'device_label' } },
  { id: 'auth-sessions.ip', family: 'auth-sessions', label: 'IP', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'ip' } },
  { id: 'auth-sessions.last_activity', family: 'auth-sessions', label: 'Last activity', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'last_seen_at' } },
];

/** `staff` paints as the row TITLE and `device_kind` as the state pill — neither is a track, so neither is bound. */
export const AUTHSESSIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'auth-sessions.session',
  statusBindings: [{ fieldId: 'auth-sessions.ip' }],
  subtitleBindings: [{ fieldId: 'auth-sessions.device_label' }],
  amountFieldId: null,
};

export const AUTHSESSIONS_TABLE_LAYOUT_ID = 'auth-sessions';

/** How much of an opaque session id the identity cell shows. */
export const AUTHSESSIONS_HANDLE_CHARS = 12;
