/** The kiosk command vocabulary and the org's opening-command choice. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIOSK_COMMAND_IDS,
  KIOSK_FALLBACK_COMMAND,
  isKioskCommandId,
  parseKioskCommandId,
} from './commands';
import { KIOSK_SERVICES, kioskCommandOptions, serviceIdToCommand } from './services';
import { getKioskDefaultCommand, parseOrgSettings } from '@/lib/tenancy/settings';

test('the fallback is REPAIR — the counter’s most common job', () => {
  assert.equal(KIOSK_FALLBACK_COMMAND, 'repair');
  assert.ok(isKioskCommandId(KIOSK_FALLBACK_COMMAND));
});

/** Every command must be a value `counter_sessions.active_command`'s CHECK admits (migrations/2026-08-20a_counter_sessions.sql:135). */
test('every command is one the session column admits', () => {
  const admitted = ['retail', 'repair', 'buyback', 'pickup'];
  for (const command of KIOSK_COMMAND_IDS) {
    assert.ok(admitted.includes(command), `${command} would be rejected by the CHECK`);
  }
});

test('unrecognised input coerces instead of throwing', () => {
  // A hand-edited settings bag must not be able to stop a counter opening.
  for (const bad of [undefined, null, '', 'sales', 'Repair', 42, {}, ['repair']]) {
    assert.equal(parseKioskCommandId(bad), KIOSK_FALLBACK_COMMAND);
  }
  assert.equal(parseKioskCommandId('nonsense', 'retail'), 'retail');
  // A RETIRED command the column still admits opens the fallback, never a
  // pane that no longer exists.
  assert.equal(parseKioskCommandId('buyback'), KIOSK_FALLBACK_COMMAND);
  assert.equal(parseKioskCommandId('pickup'), KIOSK_FALLBACK_COMMAND);
});

/** `sales` is the TILE id and `retail` is the COMMAND id — the rename that made the operator's report read oddly ("defaults to sales" is… */
test('every command in the vocabulary is a LIVE, choosable command', () => {
  const options = kioskCommandOptions();
  for (const option of options) {
    assert.ok(isKioskCommandId(option.command), `${option.command} is not a command id`);
    assert.ok(option.label.length > 0);
  }
  assert.deepEqual(
    options.map((o) => o.command).sort(),
    [...KIOSK_COMMAND_IDS].sort(),
    'a command that is not live can still be a stored default — see the docblock',
  );
  assert.equal(serviceIdToCommand('sales'), 'retail');
  assert.equal(options[0]?.command, 'repair', 'repair leads the picker');
});

test('local pickup intake is a staff workflow, not a persisted cart command', () => {
  const pickup = KIOSK_SERVICES.find((service) => service.id === 'local-pickup');
  assert.equal(pickup?.kind, 'staff');
  assert.equal(pickup?.status, 'live');
  assert.equal(isKioskCommandId('local-pickup'), false);
  assert.equal(kioskCommandOptions().some((option) => String(option.command) === 'local-pickup'), false);
});

test('an org with no preference opens on repair', () => {
  assert.equal(getKioskDefaultCommand(parseOrgSettings({})), 'repair');
  assert.equal(getKioskDefaultCommand(parseOrgSettings({ kiosk: {} })), 'repair');
  assert.equal(getKioskDefaultCommand(null), 'repair');
  assert.equal(getKioskDefaultCommand(undefined), 'repair');
});

test('an org that chooses gets its choice, and garbage never wins', () => {
  assert.equal(
    getKioskDefaultCommand(parseOrgSettings({ kiosk: { defaultCommand: 'retail' } })),
    'retail',
  );
  // A retired command stored as a default is dropped, not carried into a
  // counter that has no pane for it.
  assert.equal(
    getKioskDefaultCommand(parseOrgSettings({ kiosk: { defaultCommand: 'pickup' } })),
    'repair',
  );
  // An invalid value is DROPPED by the schema, not carried into the counter.
  assert.equal(
    getKioskDefaultCommand(parseOrgSettings({ kiosk: { defaultCommand: 'sales' } })),
    'repair',
  );
});

/**
 * The bag is `.passthrough()` tenant JSON that already carries a retired
 * `idleTimeoutSeconds`. Adding a sibling field must not make old bags unparsable.
 */
test('an existing bag with the retired idle field still parses', () => {
  const settings = parseOrgSettings({ kiosk: { idleTimeoutSeconds: 90 } });
  assert.equal(settings.kiosk.idleTimeoutSeconds, 90);
  assert.equal(getKioskDefaultCommand(settings), 'repair');
});
