/**
 * Auth-sessions catalog guards + resolver behaviour — Wave D's port of
 * `/settings/sessions` off `AdminTable`.
 *
 * The guards that matter here are the two the old desk could not have had:
 * that the product layout is a LEGAL document against this family's own
 * vocabulary, and that the mounted column model is the SHARED skeleton in the
 * engine's order rather than five hand-written cells in whatever order somebody
 * typed them.
 *
 * Fixtures are the WIRE row: `/api/admin/sessions` returns the SQL row
 * verbatim (snake_case), so a camelCase fixture here would test a shape that
 * never reaches the desk.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';
import {
  AUTHSESSIONS_COMPOUND_COLUMNS,
  authSessionsCompoundColumnsFor,
  authSessionsSortFactFor,
  isAuthSessionsColumnSortable,
} from '@/components/settings/sessions/auth-sessions-grid-layout';
import { authSessionsCompoundView, sessionActivityFace } from '@/components/settings/sessions/auth-sessions-row-view';
import { resolveAuthSessionRowActions } from '@/components/settings/sessions/auth-sessions-verbs';
import { KIOSKDEVICES_FIELD_CATALOG } from './kiosk-devices';
import {
  AUTHSESSIONS_FIELD_CATALOG,
  AUTHSESSIONS_PRODUCT_LAYOUT,
  AUTHSESSIONS_TABLE_LAYOUT_ID,
} from './auth-sessions';
import { resolveAuthSessionsSlotValue } from './auth-sessions-resolve';
import { parseSlotLayout } from '../slot-layout';

const NOW = Date.parse('2026-09-11T18:00:00.000Z');

function row(overrides: Partial<AuthSessionTableRow> = {}): AuthSessionTableRow {
  return {
    sid: 'f3a91c40de77b2681aa4',
    staff_id: 7,
    staff_name: 'Dana Reyes',
    device_kind: 'web',
    device_label: 'Front counter iMac',
    ip: '10.0.4.19',
    created_at: '2026-09-11T09:12:00.000Z',
    last_seen_at: '2026-09-11T17:55:00.000Z',
    expires_at: '2026-09-18T09:12:00.000Z',
    ...overrides,
  };
}

describe('auth-sessions catalog', () => {
  it('has unique ids, all auth-sessions-family, each bindable somewhere', () => {
    const ids = AUTHSESSIONS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of AUTHSESSIONS_FIELD_CATALOG) {
      assert.equal(field.family, 'auth-sessions', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('auth-sessions.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares NO field id with kiosk-devices, though both are settings device lists', () => {
    const other = new Set(KIOSKDEVICES_FIELD_CATALOG.map((f) => f.id));
    for (const field of AUTHSESSIONS_FIELD_CATALOG) {
      assert.ok(!other.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('names NEITHER never-painted fact — created_at / expires_at stay non-goals', () => {
    const paths = AUTHSESSIONS_FIELD_CATALOG.flatMap((f) => Object.values(f.paths ?? {}));
    assert.ok(!paths.includes('created_at'), 'created_at was never painted — do not restore it');
    assert.ok(!paths.includes('expires_at'), 'expires_at was never painted — do not restore it');
  });

  it('every catalog path names a real key on the wire row', () => {
    const wire = new Set(Object.keys(row()));
    for (const field of AUTHSESSIONS_FIELD_CATALOG) {
      for (const path of Object.values(field.paths ?? {})) {
        assert.ok(wire.has(path), `${field.id} reads '${path}', which /api/admin/sessions never sends`);
      }
    }
  });

  it('product default parses against the catalog — IP on a track, device name under the title', () => {
    const parsed = parseSlotLayout(AUTHSESSIONS_PRODUCT_LAYOUT, AUTHSESSIONS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'auth-sessions.session');
    assert.deepEqual(parsed.statusBindings, [{ fieldId: 'auth-sessions.ip' }]);
    assert.deepEqual(parsed.subtitleBindings, [{ fieldId: 'auth-sessions.device_label' }]);
  });

  it('the identity fact is the SESSION, and only it may hold the identity slot', () => {
    const identity = AUTHSESSIONS_FIELD_CATALOG.filter((f) => f.slotKinds.includes('identity'));
    assert.deepEqual(identity.map((f) => f.id), ['auth-sessions.session']);
    // The write gate refuses a non-`id` identity; pin that this one is `id`.
    assert.equal(identity[0].displayType, 'id');
  });

  it('last activity stays a DATE fact — the relative face is display, not data', () => {
    const field = AUTHSESSIONS_FIELD_CATALOG.find((f) => f.id === 'auth-sessions.last_activity');
    assert.equal(field?.displayType, 'date');
  });

  it('serves the `auth-sessions` tableId', () => {
    assert.equal(AUTHSESSIONS_TABLE_LAYOUT_ID, 'auth-sessions');
  });
});

describe('the mounted auth-sessions compound model', () => {
  it('mounts the shared skeleton WHOLE — no chrome cut, one status track', () => {
    // Skeleton order is derived from the engine, never hand-listed: a track
    // added to (or removed from) COMPOUND_COLUMN_KEYS must not need an edit here.
    const keys = AUTHSESSIONS_COMPOUND_COLUMNS.map((c) => c.key);
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:') && !k.startsWith('subtitle:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 2), ['state', 'status:1']);
  });

  it('renames the chrome headers to this desk’s vocabulary', () => {
    const label = (key: string) => AUTHSESSIONS_COMPOUND_COLUMNS.find((c) => c.key === key)?.gridLabel;
    // The identity header is the ENGINE's `Id` on every peer since
    // 2026-09-15 (`slot-table-family.ts`); this desk used to print
    // "Session", which is now the Fields-picker word and the cell's hover word.
    assert.equal(label('fulfillment'), 'Id');
    assert.equal(label('item'), 'Staff');
    assert.equal(label('state'), 'Device');
    assert.equal(label('dates'), 'Activity');
  });

  it('every painted fact is click-to-sort; only chrome is not', () => {
    for (const key of ['fulfillment', 'item', 'state', 'dates', 'status:1']) {
      assert.ok(
        isAuthSessionsColumnSortable(AUTHSESSIONS_COMPOUND_COLUMNS, key),
        `${key} paints a fact and must sort`,
      );
    }
    for (const key of ['select', 'thumb', '_fill']) {
      assert.ok(
        !isAuthSessionsColumnSortable(AUTHSESSIONS_COMPOUND_COLUMNS, key),
        `${key} is chrome and must not sort`,
      );
    }
    assert.equal(authSessionsSortFactFor({ key: 'state' }), 'auth-sessions.device_kind');
    assert.equal(authSessionsSortFactFor({ key: 'dates' }), 'auth-sessions.last_activity');
  });

  it('a rebound layout opens the staff person track without touching the skeleton', () => {
    const columns = authSessionsCompoundColumnsFor({
      ...AUTHSESSIONS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'auth-sessions.staff' }, { fieldId: 'auth-sessions.ip' }],
    });
    const staff = columns.find((c) => c.fieldId === 'auth-sessions.staff');
    assert.equal(staff?.key, 'status:1');
    assert.equal(staff?.slotDisplayType, 'person');
  });
});

describe('resolveAuthSessionsSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveAuthSessionsSlotValue(r, 'auth-sessions.session'), {
      kind: 'value',
      text: 'f3a91c40de77b2681aa4',
    });
    assert.deepEqual(resolveAuthSessionsSlotValue(r, 'auth-sessions.device_kind'), {
      kind: 'value',
      text: 'web',
    });
    assert.deepEqual(resolveAuthSessionsSlotValue(r, 'auth-sessions.device_label'), {
      kind: 'value',
      text: 'Front counter iMac',
    });
    assert.deepEqual(resolveAuthSessionsSlotValue(r, 'auth-sessions.ip'), {
      kind: 'value',
      text: '10.0.4.19',
    });
  });

  it('last activity resolves to the ABSOLUTE instant — the engine owns the age face', () => {
    assert.deepEqual(resolveAuthSessionsSlotValue(row(), 'auth-sessions.last_activity'), {
      kind: 'value',
      text: '2026-09-11T17:55:00.000Z',
    });
  });

  it('staff resolves as a PERSON — avatar + name, never `Staff #id`', () => {
    assert.deepEqual(resolveAuthSessionsSlotValue(row(), 'auth-sessions.staff'), {
      kind: 'person',
      staffId: 7,
      name: 'Dana Reyes',
    });
  });

  it('honest absence: a browser with no nickname and no IP reads blank', () => {
    const r = row({ device_label: null, ip: null });
    assert.deepEqual(resolveAuthSessionsSlotValue(r, 'auth-sessions.device_label'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolveAuthSessionsSlotValue(r, 'auth-sessions.ip'), {
      kind: 'value',
      text: null,
    });
  });

  it('an unknown field id resolves to nothing — bindings never cross families', () => {
    assert.equal(resolveAuthSessionsSlotValue(row(), 'kiosk-devices.label'), null);
    assert.equal(resolveAuthSessionsSlotValue(row(), 'auth-sessions.nope'), null);
  });
});

describe('authSessionsCompoundView', () => {
  it('puts the staffer on the title and the session handle on identity', () => {
    const view = authSessionsCompoundView(row());
    assert.equal(view.title, 'Dana Reyes');
    assert.equal(view.id, 'f3a91c40de77b2681aa4');
    assert.equal(view.identityFace?.value, 'f3a91c40de77');
  });

  it('paints the device KIND as the state pill, in operator words', () => {
    assert.equal(authSessionsCompoundView(row()).stateLabel, 'Browser');
    assert.equal(authSessionsCompoundView(row({ device_kind: 'kiosk' })).stateLabel, 'Kiosk');
    // An enum nobody mapped paints itself rather than dashing the pill.
    assert.equal(authSessionsCompoundView(row({ device_kind: 'ipad' })).stateLabel, 'ipad');
  });

  it('uses BOTH date lines — civil day on the Hash, relative age on the Calendar', () => {
    const view = authSessionsCompoundView(row());
    assert.ok(view.orderedAt?.label, 'Hash line must carry the civil face');
    assert.equal(view.orderedAt?.dateKey, '2026-09-11');
    assert.ok(view.delay?.faceLabel, 'Calendar line must carry the relative face, never `--`');
    assert.equal(view.startedHover, view.orderedAt?.tip);
  });

  it('never paints a photo gutter image or an amount — a session has neither', () => {
    const view = authSessionsCompoundView(row());
    assert.equal(view.thumbUrl, null);
    assert.equal(view.amount, null);
  });
});

describe('sessionActivityFace', () => {
  it('reads the same faces the AdminTable cell did', () => {
    assert.equal(sessionActivityFace('2026-09-11T17:59:30.000Z', NOW), '30s ago');
    assert.equal(sessionActivityFace('2026-09-11T17:05:00.000Z', NOW), '55m ago');
    assert.equal(sessionActivityFace('2026-09-11T09:00:00.000Z', NOW), '9h ago');
    assert.equal(sessionActivityFace('2026-09-08T18:00:00.000Z', NOW), '3d ago');
  });

  it('says nothing rather than lying when there is no stamp', () => {
    assert.equal(sessionActivityFace(null, NOW), null);
    assert.equal(sessionActivityFace('not a date', NOW), null);
  });
});

describe('auth-sessions row verbs', () => {
  it('Revoke is a trailing-face danger verb, not an actions column', () => {
    const calls: string[] = [];
    const actions = resolveAuthSessionRowActions(row(), { onRevoke: (r) => calls.push(r.sid) });
    assert.deepEqual(actions.map((a) => a.key), ['revoke']);
    assert.equal(actions[0].tone, 'danger');
    assert.equal(actions[0].face, 'trailing');
    actions[0].onSelect();
    assert.deepEqual(calls, ['f3a91c40de77b2681aa4']);
  });
});
