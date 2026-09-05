/**
 *   npx tsx --test src/lib/composer/desk-field.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deskFieldPlacement,
  type DeskFieldInput,
} from './desk-field';

function input(partial: Partial<DeskFieldInput> = {}): DeskFieldInput {
  return {
    pathname: '/dashboard',
    stationMouths: 0,
    importDraftOpen: false,
    armedSessionTitle: null,
    ...partial,
  };
}

test('a station mouth on screen stands the desk field down', () => {
  // One screen gets one mouth. A desk field under StationComposerHost is a
  // second place to type with a different destination.
  assert.equal(deskFieldPlacement(input({ stationMouths: 1 })).mount, false);
  assert.equal(deskFieldPlacement(input({ stationMouths: 3 })).mount, false);
  assert.match(
    deskFieldPlacement(input({ stationMouths: 1 })).reason,
    /mouth/i,
  );
  // …and it wins over every other input, including a desk route that would
  // otherwise mount.
  assert.equal(
    deskFieldPlacement(
      input({
        pathname: '/shipping/orders',
        stationMouths: 1,
        importDraftOpen: true,
        armedSessionTitle: 'Unbox · PO 4471',
      }),
    ).mount,
    false,
  );
  // No mouth → the desk field is the one place input lands.
  assert.equal(deskFieldPlacement(input({ stationMouths: 0 })).mount, true);
});

test('/m/ routes suppress the desk field — the phone shell has its own', () => {
  assert.equal(deskFieldPlacement(input({ pathname: '/m' })).mount, false);
  assert.equal(deskFieldPlacement(input({ pathname: '/m/' })).mount, false);
  assert.equal(deskFieldPlacement(input({ pathname: '/m/scan' })).mount, false);
  assert.equal(
    deskFieldPlacement(input({ pathname: '/m/stack/arrival?x=1' })).mount,
    false,
  );
  // A desk route that merely starts with the letter m is not the phone shell.
  assert.equal(deskFieldPlacement(input({ pathname: '/manifests' })).mount, true);
});

test('the public GS1 resolver routes suppress the desk field', () => {
  for (const pathname of [
    '/01',
    '/01/09506000134352',
    '/414/0614141000012',
    '/l/AISLE-3',
    '/p/SKU-1188',
    '/s/SER-9',
    '/q/QR-7',
  ]) {
    assert.equal(
      deskFieldPlacement(input({ pathname })).mount,
      false,
      `${pathname} is a public resolver page with no desk behind it`,
    );
  }
  // Neighbouring desk routes keep their field.
  assert.equal(deskFieldPlacement(input({ pathname: '/pack' })).mount, true);
  assert.equal(deskFieldPlacement(input({ pathname: '/locations' })).mount, true);
});

test('placeholder: an open import draft names the staging table', () => {
  assert.equal(
    deskFieldPlacement(input({ importDraftOpen: true })).placeholder,
    'Paste orders to stage',
  );
  // The draft outranks the armed session and the orders desk.
  assert.equal(
    deskFieldPlacement(
      input({
        pathname: '/shipping/orders',
        importDraftOpen: true,
        armedSessionTitle: 'Unbox · PO 4471',
      }),
    ).placeholder,
    'Paste orders to stage',
  );
});

test('placeholder: an armed session is named, so the scan has a destination', () => {
  assert.equal(
    deskFieldPlacement(input({ armedSessionTitle: 'Arrival · UPS 4471' })).placeholder,
    'Scan a carton or type to ask · lands in Arrival · UPS 4471',
  );
  // A blank title is not a session — it would promise an unnamed destination.
  assert.equal(
    deskFieldPlacement(input({ armedSessionTitle: '   ' })).placeholder,
    'Scan, type or say — ask about this desk',
  );
});

test('placeholder: the orders desk with no draft and no session stages a paste', () => {
  assert.equal(
    deskFieldPlacement(input({ pathname: '/shipping/orders' })).placeholder,
    'Paste a CSV or a screenshot of orders to stage them',
  );
  // The armed session outranks it — that session owns what is typed.
  assert.equal(
    deskFieldPlacement(
      input({ pathname: '/shipping/orders', armedSessionTitle: 'Pack · SO-118' }),
    ).placeholder,
    'Scan a carton or type to ask · lands in Pack · SO-118',
  );
});

test('placeholder: otherwise the desk itself answers', () => {
  assert.equal(
    deskFieldPlacement(input({ pathname: '/dashboard' })).placeholder,
    'Scan, type or say — ask about this desk',
  );
  assert.equal(
    deskFieldPlacement(input({ pathname: '/inventory' })).placeholder,
    'Scan, type or say — ask about this desk',
  );
});

test('reason is a non-empty sentence in every case', () => {
  const cases: DeskFieldInput[] = [
    input(),
    input({ stationMouths: 1 }),
    input({ pathname: '/m/scan' }),
    input({ pathname: '/01/09506000134352' }),
    input({ pathname: '/shipping/orders' }),
    input({ importDraftOpen: true }),
    input({ armedSessionTitle: 'Arrival · UPS 4471' }),
    input({
      pathname: '/shipping/orders',
      stationMouths: 2,
      importDraftOpen: true,
      armedSessionTitle: 'Pack · SO-118',
    }),
  ];
  for (const c of cases) {
    const { reason, placeholder } = deskFieldPlacement(c);
    assert.ok(reason.trim().length > 0, `${c.pathname}: reason must not be empty`);
    assert.match(
      reason,
      /^[A-Z].*\.$/,
      `${c.pathname}: reason should read as one sentence`,
    );
    // The field never sits there wordless either — I4 in both branches.
    assert.ok(placeholder.trim().length > 0, `${c.pathname}: placeholder must name a destination`);
  }
});
