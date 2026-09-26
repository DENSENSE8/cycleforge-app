/**
 * Staff-directory catalog guards, materialization, adapter and verb behaviour — the family that replaced `/settings/staff`'s seven…
 * re-authenticate, and turning it into a generic error string is a security
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  STAFF_DIRECTORY_COMPOUND_COLUMNS,
  staffDirectoryCompoundColumnsFor,
  staffDirectorySortFactFor,
} from '@/components/settings/staff-directory/staff-directory-grid-layout';
import {
  staffDirectoryCompoundView,
  staffLoginClockFace,
} from '@/components/settings/staff-directory/staff-directory-row-view';
import { resolveStaffDirectoryRowActions } from '@/components/settings/staff-directory/staff-directory-verbs';
import {
  apiErrorCode,
  staffAuthPolicyFailure,
  STEP_UP_REQUIRED,
} from '@/components/settings/staff-directory/staff-auth-policy-outcome';
import { STAFF_DIRECTORY_GRID_CAPABILITIES } from '@/components/settings/staff-directory/staff-directory-table-definition';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import { STAFF_DIRECTORY_FIELD_CATALOG, STAFF_DIRECTORY_PRODUCT_LAYOUT } from './staff-directory';
import { resolveStaffDirectorySlotValue } from './staff-directory-resolve';
import { parseSlotLayout } from '../slot-layout';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '../table-definition';

/** Fetched by the desk's query, painted by nothing, and not facts until one paints them. */
const UNPAINTED_COLUMNS = ['default_home_path', 'color_hex'] as const;

function row(overrides: Partial<StaffDirectoryRow> = {}): StaffDirectoryRow {
  return {
    id: 42,
    name: 'Sam Rivera',
    role: 'packer',
    status: 'active',
    active: true,
    has_pin: true,
    auth_method: 'pin',
    requires_sensitive_stepup: false,
    last_login_at: '2026-09-10T16:04:12.000Z',
    ...overrides,
  };
}

describe('staff-directory catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = STAFF_DIRECTORY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of STAFF_DIRECTORY_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'staff-directory', `${field.id} is not a staff fact`);
      assert.ok(field.id.startsWith('staff-directory.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the NINE facts the seven retired cells carried, and no others', () => {
    assert.deepEqual(
      STAFF_DIRECTORY_FIELD_CATALOG.map((f) => f.id),
      [
        'staff-directory.staff_id',
        'staff-directory.staff',
        'staff-directory.role',
        'staff-directory.status',
        'staff-directory.active',
        'staff-directory.has_pin',
        'staff-directory.auth_method',
        'staff-directory.requires_sensitive_stepup',
        'staff-directory.last_login',
      ],
    );
  });

  it('does NOT name the fetched-but-unpainted columns', () => {
    for (const field of STAFF_DIRECTORY_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no track paints`,
        );
      }
      assert.ok(
        !UNPAINTED_COLUMNS.some((c) => field.id.endsWith(`.${c}`)),
        `${field.id} names an unpainted column`,
      );
    }
    for (const unpainted of UNPAINTED_COLUMNS) {
      assert.equal(resolveStaffDirectorySlotValue(row(), `staff-directory.${unpainted}`), null);
    }
  });

  it('keeps `status` and `active` as two independent facts', () => {
    // The retired pill printed one word derived from both. Merged, neither
    // half could be sorted or searched on its own.
    const ids = STAFF_DIRECTORY_FIELD_CATALOG.map((f) => f.id);
    assert.ok(ids.includes('staff-directory.status'));
    assert.ok(ids.includes('staff-directory.active'));
    assert.deepEqual(resolveStaffDirectorySlotValue(row({ status: 'invited', active: false }), 'staff-directory.status'), {
      kind: 'value',
      text: 'invited',
    });
    assert.deepEqual(resolveStaffDirectorySlotValue(row({ active: false }), 'staff-directory.active'), {
      kind: 'value',
      text: 'Inactive',
    });
  });

  it('product default parses, and the STAFF ID is the identity', () => {
    const parsed = parseSlotLayout(STAFF_DIRECTORY_PRODUCT_LAYOUT, STAFF_DIRECTORY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'staff-directory.staff_id');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      [
        'staff-directory.role',
        'staff-directory.has_pin',
        'staff-directory.auth_method',
        'staff-directory.requires_sensitive_stepup',
      ],
    );
    // The retired Name cell was one line; nothing was ever written under it.
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('binds FOUR status slots — exactly the whole-skeleton ceiling', () => {
    // `select` is the house gutter and never counts.
    assert.equal(STAFF_DIRECTORY_PRODUCT_LAYOUT.statusBindings.length, 4);
    assert.equal(
      STAFF_DIRECTORY_COMPOUND_COLUMNS.filter((c) => c.key !== 'select').length,
      MAX_DEFAULT_VISIBLE_TRACKS,
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      STAFF_DIRECTORY_PRODUCT_LAYOUT.identityFieldId,
      ...STAFF_DIRECTORY_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...STAFF_DIRECTORY_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = STAFF_DIRECTORY_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // Title, state pill (twice over) and Dates chrome paint these four.
    assert.deepEqual(unbound, [
      'staff-directory.staff',
      'staff-directory.status',
      'staff-directory.active',
      'staff-directory.last_login',
    ]);
    for (const id of unbound) {
      const field = STAFF_DIRECTORY_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });

  it('declares the teammate as a PERSON, which is what carries the retired colour dot', () => {
    const staff = STAFF_DIRECTORY_FIELD_CATALOG.find((f) => f.id === 'staff-directory.staff');
    assert.equal(staff?.displayType, 'person');
    assert.deepEqual(resolveStaffDirectorySlotValue(row(), 'staff-directory.staff'), {
      kind: 'person',
      staffId: 42,
      name: 'Sam Rivera',
    });
  });
});

describe('staff-directory materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = STAFF_DIRECTORY_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    assert.equal(
      STAFF_DIRECTORY_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      STAFF_DIRECTORY_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      STAFF_DIRECTORY_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) =>
      STAFF_DIRECTORY_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'Name');
    assert.equal(label('dates'), 'Last login');
    assert.equal(label('state'), 'Status');
    const identity = STAFF_DIRECTORY_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'staff-directory.staff_id');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`slot-table-family.ts`). "Staff #" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = staffDirectoryCompoundColumnsFor({
      ...STAFF_DIRECTORY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'staff-directory.active' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'staff-directory.active');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of STAFF_DIRECTORY_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key) || col.key === '_fill') {
        assert.equal(staffDirectorySortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        staffDirectorySortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(staffDirectorySortFactFor({ key: 'fulfillment' }), 'staff-directory.staff_id');
    assert.equal(staffDirectorySortFactFor({ key: 'item' }), 'staff-directory.staff');
    assert.equal(staffDirectorySortFactFor({ key: 'state' }), 'staff-directory.status');
    assert.equal(staffDirectorySortFactFor({ key: 'dates' }), 'staff-directory.last_login');
  });
});

describe('staff-directory resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of STAFF_DIRECTORY_FIELD_CATALOG) {
      assert.notEqual(
        resolveStaffDirectorySlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it("states a boolean's negative as a claim, never as an em-dash", () => {
    assert.deepEqual(resolveStaffDirectorySlotValue(row({ has_pin: false }), 'staff-directory.has_pin'), {
      kind: 'value',
      text: 'No PIN',
    });
    assert.deepEqual(
      resolveStaffDirectorySlotValue(row(), 'staff-directory.requires_sensitive_stepup'),
      { kind: 'value', text: 'Not required' },
    );
    assert.deepEqual(
      resolveStaffDirectorySlotValue(
        row({ requires_sensitive_stepup: true }),
        'staff-directory.requires_sensitive_stepup',
      ),
      { kind: 'value', text: 'Required' },
    );
  });

  it('speaks the operator word for the sign-in method, never the wire token', () => {
    assert.deepEqual(resolveStaffDirectorySlotValue(row(), 'staff-directory.auth_method'), {
      kind: 'value',
      text: 'PIN',
    });
    assert.deepEqual(
      resolveStaffDirectorySlotValue(row({ auth_method: 'password' }), 'staff-directory.auth_method'),
      { kind: 'value', text: 'Password' },
    );
    // An unmigrated column reads as PIN, exactly as the retired <select> did.
    assert.deepEqual(resolveStaffDirectorySlotValue(row({ auth_method: '' }), 'staff-directory.auth_method'), {
      kind: 'value',
      text: 'PIN',
    });
  });

  it('resolves the last login to the absolute instant, not a face', () => {
    assert.deepEqual(resolveStaffDirectorySlotValue(row(), 'staff-directory.last_login'), {
      kind: 'value',
      text: '2026-09-10T16:04:12.000Z',
    });
    // `Never` is a FACE. A row with no login sorts as missing, not as a word.
    assert.deepEqual(
      resolveStaffDirectorySlotValue(row({ last_login_at: null }), 'staff-directory.last_login'),
      { kind: 'value', text: null },
    );
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveStaffDirectorySlotValue(row(), 'orders.picked'), null);
  });
});

describe('staff-directory row view', () => {
  it('paints the name as the title and the staff id as the handle', () => {
    const view = staffDirectoryCompoundView(row());
    assert.equal(view.id, '42');
    assert.equal(view.title, 'Sam Rivera');
    assert.equal(view.identityFace?.value, '42');
    // The retired Name cell had one line; a bound subtitle is an org's choice.
    assert.equal(view.note, null);
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('DERIVES the pill from status + active, and keeps the hidden word on the hover', () => {
    assert.equal(staffDirectoryCompoundView(row()).stateLabel, 'active');
    assert.equal(staffDirectoryCompoundView(row()).stateTone, 'done');
    assert.equal(staffDirectoryCompoundView(row({ status: 'invited' })).stateLabel, 'invited');
    assert.equal(staffDirectoryCompoundView(row({ status: 'invited' })).stateTone, 'neutral');

    // `!active` overrides the word — the retired StatusPill's whole behaviour.
    const gone = staffDirectoryCompoundView(row({ status: 'invited', active: false }));
    assert.equal(gone.stateLabel, 'deactivated');
    assert.equal(gone.stateTone, 'neutral');
    // …and unlike that pill, the overridden lifecycle word is still readable.
    assert.equal(gone.stateTip, 'deactivated · was invited');
  });

  it('keeps both halves of the retired login stamp: the day AND the clock', () => {
    const view = staffDirectoryCompoundView(row());
    const clock = staffLoginClockFace(row().last_login_at);
    assert.ok(clock && /^\d{1,2}:\d{2}\s?[AP]M$/i.test(clock), `clock face is wrong: ${clock}`);
    assert.equal(view.delay?.faceLabel, clock);
    assert.equal(view.delay?.overdue, false);
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.orderedAt?.dateKey?.length, 10);
    assert.equal(view.startedHover, `Last login · ${view.orderedAt?.label} · ${clock}`);
  });

  it("keeps the retired cell's `Never` for a teammate who has not signed in", () => {
    const view = staffDirectoryCompoundView(row({ last_login_at: null }));
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay?.faceLabel, 'Never');
    assert.equal(view.delayTip, 'Never signed in');
  });

  it('never invents a name for a malformed row', () => {
    const view = staffDirectoryCompoundView(row({ name: '', status: '' }));
    assert.equal(view.title, 'Staff #42');
    assert.equal(view.stateLabel, 'unknown');
  });
});

describe('staff-directory verbs', () => {
  it('declares BOTH writes in the family module — the mount supplies handlers only', () => {
    const opened: string[] = [];
    const actions = resolveStaffDirectoryRowActions(row(), {
      onEditAuthPolicy: () => opened.push('policy'),
      onDeactivate: () => opened.push('deactivate'),
    });
    assert.deepEqual(
      actions.map((a) => a.key),
      ['auth-policy', 'deactivate'],
    );
    // Label + callback only. A verb carrying JSX is a bespoke cell by another name.
    for (const action of actions) {
      assert.equal(typeof action.label, 'string');
      assert.equal(typeof action.onSelect, 'function');
    }
    for (const action of actions) action.onSelect();
    assert.deepEqual(opened, ['policy', 'deactivate']);
  });

  it('takes its DIRECTION from row state: an inactive teammate is not offered deactivation', () => {
    const actions = resolveStaffDirectoryRowActions(row({ active: false }), {
      onEditAuthPolicy: () => {},
      onDeactivate: () => {},
    });
    assert.deepEqual(
      actions.map((a) => a.key),
      ['auth-policy'],
    );
  });

  it('marks the destructive verb danger, and keeps the desk out of in-cell edit', () => {
    const deactivate = resolveStaffDirectoryRowActions(row(), {
      onEditAuthPolicy: () => {},
      onDeactivate: () => {},
    }).find((a) => a.key === 'deactivate');
    assert.equal(deactivate?.tone, 'danger');
    // The retired `auth` cell WAS an in-cell editor. It must not come back.
    assert.equal(STAFF_DIRECTORY_GRID_CAPABILITIES.inCellEdit, false);
  });
});

describe('staff auth-policy failure path', () => {
  it('still surfaces STEP_UP_REQUIRED as a re-authenticate instruction', () => {
    const failure = staffAuthPolicyFailure(STEP_UP_REQUIRED, 403);
    assert.equal(failure.tone, 'warning');
    assert.match(failure.message, /step-up/i);
    assert.match(failure.message, /re-authenticate/i);
  });

  it('reports any other failure as an error naming what came back', () => {
    assert.deepEqual(staffAuthPolicyFailure('NOT_FOUND', 404), {
      tone: 'error',
      message: "Couldn't update auth policy: NOT_FOUND",
    });
    assert.deepEqual(staffAuthPolicyFailure(null, 500), {
      tone: 'error',
      message: "Couldn't update auth policy: 500",
    });
  });

  it('reads the error code off an unknown body without asserting a shape', () => {
    assert.equal(apiErrorCode({ error: STEP_UP_REQUIRED }), STEP_UP_REQUIRED);
    assert.equal(apiErrorCode(null), null);
    assert.equal(apiErrorCode('nope'), null);
    assert.equal(apiErrorCode({ error: 42 }), null);
    assert.equal(apiErrorCode({}), null);
  });
});
