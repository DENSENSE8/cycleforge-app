/** node --require ./scripts/register-server-only-shim.cjs --import tsx \ --test src/lib/counter/terminal-checkout.test.ts */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTerminalCheckoutBody, paymentStateForTerminalStatus } from './terminal-checkout';

describe('buildTerminalCheckoutBody', () => {
  const body = buildTerminalCheckoutBody({
    deviceId: 'dev-A',
    orderId: 'sq-order-1',
    idempotencyKey: 'idem-1',
  });
  const checkout = (body as { checkout: Record<string, unknown> }).checkout;

  it('collects CARD_PRESENT against the staged order on the named device', () => {
    assert.equal(body.idempotency_key, 'idem-1');
    assert.equal(checkout.order_id, 'sq-order-1');
    assert.equal(checkout.payment_type, 'CARD_PRESENT');
    assert.deepEqual(checkout.device_options, {
      device_id: 'dev-A',
      skip_receipt_screen: false,
      collect_signature: true,
    });
  });

  it('never sends a loose amount beside an order — that is how you charge twice', () => {
    assert.equal('amount_money' in checkout, false);
  });
});

describe('paymentStateForTerminalStatus', () => {
  it('maps Square’s vocabulary', () => {
    assert.equal(paymentStateForTerminalStatus('COMPLETED'), 'approved');
    assert.equal(paymentStateForTerminalStatus('CANCELED'), 'canceled');
    assert.equal(paymentStateForTerminalStatus('CANCEL_REQUESTED'), 'canceled');
    assert.equal(paymentStateForTerminalStatus('PENDING'), 'awaiting_card');
    assert.equal(paymentStateForTerminalStatus('IN_PROGRESS'), 'awaiting_card');
  });

  it('is case- and whitespace-insensitive', () => {
    assert.equal(paymentStateForTerminalStatus(' completed '), 'approved');
  });

  it('holds an UNKNOWN status at awaiting_card rather than guessing declined', () => {
    // Guessing "declined" would put the cart back in front of a customer whose
    // card may well have gone through.
    assert.equal(paymentStateForTerminalStatus('SOMETHING_NEW'), 'awaiting_card');
    assert.equal(paymentStateForTerminalStatus(''), 'awaiting_card');
  });
});
