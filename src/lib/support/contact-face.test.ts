import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubRelayAddresses, supportContactFace, supportContactLine, type SupportContactFace } from './contact-face';

const RELAY = 'a1b2c3d4e5f6@members.ebay.com';

function rendered(face: SupportContactFace): string {
  return [face.label, face.detail, face.email].filter(Boolean).join(' ');
}

test('a relay address never reaches a rendered string, whichever field holds it', () => {
  const inputs = [
    { email: RELAY },
    { name: 'Jane Doe', email: RELAY },
    { name: RELAY, email: RELAY },
    { handle: RELAY, email: RELAY },
    { name: `Jane <${RELAY}>`, email: RELAY },
    { name: null, email: 'x@marketplace.amazon.com', handle: 'buyer_99' },
    { email: 'y@privaterelay.appleid.com' },
  ];
  for (const input of inputs) {
    const face = supportContactFace(input);
    const line = supportContactLine(input) ?? '';
    for (const text of [rendered(face), line]) {
      assert.ok(!/members\.ebay\.com|marketplace\.amazon\.com|privaterelay\.appleid\.com/i.test(text), `${JSON.stringify(input)} → ${text}`);
    }
  }
});

test('relay-only contact shows the relay label; a buyer name leads with the label second', () => {
  assert.equal(supportContactLine({ email: RELAY }), 'eBay relay email');
  assert.equal(supportContactLine({ name: 'Jane Doe', email: RELAY }), 'Jane Doe · eBay relay email');
  assert.equal(supportContactLine({ handle: 'buyer_99', email: RELAY }), 'buyer_99 · eBay relay email');
});

test('a real email stays readable and copyable', () => {
  const face = supportContactFace({ name: 'Jane Doe', email: 'jane@example.com' });
  assert.equal(face.email, 'jane@example.com');
  assert.equal(face.relay, null);
  assert.equal(supportContactLine({ email: 'jane@example.com' }), 'jane@example.com');
});

test('nobody known → null, never an empty string', () => {
  assert.equal(supportContactFace({}).label, null);
  assert.equal(supportContactLine({ name: '  ', email: '' }), null);
});

test('scrubRelayAddresses rewrites relays inside free text and leaves real addresses', () => {
  assert.equal(scrubRelayAddresses(`Reply to ${RELAY} or jane@example.com`), 'Reply to eBay relay email or jane@example.com');
});
