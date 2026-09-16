/**
 * Auth-sessions field catalog — the bindable facts of one live staff session.
 *
 * Off `AdminTable` 2026-09-11 (Wave D). The desk painted five cells:
 * Staff · Device (kind pill + label) · IP · Last activity · Actions.
 *
 * Where each one landed:
 * - Staff       → the row TITLE (item cell). Also a bindable `person` fact, so
 *                 a staffer can add the StaffAvatar face as a status track.
 * - Device      → the two-line cell splits by the batch rule: `device_kind` is
 *                 the STATE pill it already was, `device_label` is the bound
 *                 SUBTITLE under the title. Never two tracks for one cell.
 * - IP          → `status:1`.
 * - Last activity → the DATES chrome. The fact stays a date; the relative face
 *                 ("5m ago") is the adapter's / the engine's age face, not a
 *                 pre-formatted string stored as a fact.
 * - Actions     → GONE. Revoke is a row VERB (`auth-sessions-verbs.ts`), the
 *                 kiosk-devices precedent.
 *
 * `created_at` / `expires_at` are fetched and were never painted — deliberate
 * non-goals, not an oversight. Add them here the day a desk asks for them.
 */

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

/**
 * `staff` paints as the row TITLE and `device_kind` as the state pill — neither
 * is a track, so neither is bound. `last_activity` rides the Dates chrome via
 * the row adapter. That leaves IP as the one status track and the device
 * nickname as the one under-title fact, which is the desk as it stood.
 */
export const AUTHSESSIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'auth-sessions.session',
  statusBindings: [{ fieldId: 'auth-sessions.ip' }],
  subtitleBindings: [{ fieldId: 'auth-sessions.device_label' }],
  amountFieldId: null,
};

export const AUTHSESSIONS_TABLE_LAYOUT_ID = 'auth-sessions';

/**
 * How much of an opaque session id the identity cell shows.
 *
 * The full `sid` is a long random handle that would clip mid-string in a
 * 6.5rem track and read as noise. A git-style prefix is enough for an admin to
 * match a row against a log line, and the cell's hover carries the whole
 * thing. Exported so the adapter and its test agree on one number.
 */
export const AUTHSESSIONS_HANDLE_CHARS = 12;
