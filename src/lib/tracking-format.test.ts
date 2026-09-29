import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCarrier,
  extractCanonicalTracking,
  stripFedexConcatPrefix,
  normalizeTrackingNumber,
  normalizeTrackingKey18,
  last8FromStoredTracking,
  orderTrackingMatchKeys,
  getTrackingUrl,
  getTrackingUrlByCarrier,
  resolveTrackingOpenUrl,
  searchableTrackingNumber,
  uspsSearchableTrackingNumber,
} from './tracking-format';

// ─── The reconciliation invariant ─────────────────────────────────────────────
// A scanned GS1/"96" FedEx barcode and the pasted human number it represents
// must canonicalize to the SAME value — that is the whole point of the module.

test('FedEx GS1/"96" barcode collapses to the embedded 12-digit human number', () => {
  const scanned = '9632001960200651497200382141152045'; // 34-digit gun read
  const pasted = '382141152045'; // what lands in Zoho reference#
  assert.equal(extractCanonicalTracking(scanned), pasted);
  assert.equal(extractCanonicalTracking(pasted), pasted);
  // The reconciliation invariant: both sides converge.
  assert.equal(extractCanonicalTracking(scanned), extractCanonicalTracking(pasted));
});

test('incident 30130 exposes both full FedEx scan and shortened searchable number', () => {
  const full = '9621091390008524261900383825682187';
  const shortened = '383825682187';
  assert.equal(searchableTrackingNumber(full), shortened);
  assert.equal(searchableTrackingNumber(shortened), null);
  assert.match(resolveTrackingOpenUrl(shortened, 'FEDEX') ?? '', /383825682187/);
});

test('incident STN 382780447243: GS1 gun read exact-equals sheet short after unwrap', () => {
  // Packer scanned full GS1; sheet/transfer stored the short FedEx Express STN.
  const short = '382780447243';
  const scanned = `9632001960200651497200${short}`; // valid ^96\d{31,32}$ envelope
  assert.equal(scanned.length, 34);
  assert.equal(extractCanonicalTracking(scanned), short);
  assert.equal(extractCanonicalTracking(short), short);
  assert.equal(extractCanonicalTracking(scanned), extractCanonicalTracking(short));
  // last8 remains a safety net (human is the GS1 tail) — exact is stronger.
  assert.equal(last8FromStoredTracking(scanned), last8FromStoredTracking(short));
  assert.equal(last8FromStoredTracking(short), '80447243');
});

test('orderTrackingMatchKeys: GS1 and short FedEx share exact · key18 · last8', () => {
  const short = '382780447243';
  const gs1 = `9632001960200651497200${short}`;
  const fromGs1 = orderTrackingMatchKeys(gs1);
  const fromShort = orderTrackingMatchKeys(short);
  assert.deepEqual(fromGs1, fromShort);
  assert.equal(fromGs1.exact, short);
  assert.equal(fromGs1.last8, '80447243');
  assert.equal(fromGs1.key18, short); // 12-digit human < 18 → whole string
  // Raw GS1 key18 must NOT be used for the ladder (would miss the short STN).
  assert.notEqual(normalizeTrackingKey18(gs1), fromGs1.key18);
});

test('the scanned-vs-pasted last-8 happens to agree here, but full equality is stronger', () => {
  const scanned = '9632001960200651497200382141152045';
  const pasted = '382141152045';
  // last-8 matched by luck (human number is the tail) — canonical makes it exact.
  assert.equal(last8FromStoredTracking(scanned), last8FromStoredTracking(pasted));
  assert.equal(extractCanonicalTracking(scanned).length, 12);
});

// ─── Conservative: never corrupt an already-human-readable value ──────────────

test('plain 12-digit FedEx Express number is returned unchanged', () => {
  assert.equal(extractCanonicalTracking('382141152045'), '382141152045');
});

test('UPS 1Z label is left intact (not a long pure-digit barcode)', () => {
  assert.equal(extractCanonicalTracking('1Z999AA10123456784'), '1Z999AA10123456784');
});

test('USPS IMpb routing prefix still stripped (existing behavior preserved)', () => {
  const impb = '420902109405511899223197428265'; // 420 + ZIP + 9-prefixed tracking
  // Whatever normalizeTrackingNumber yields, extractCanonicalTracking must not
  // further mangle a USPS number into a FedEx tail.
  const viaNormalize = normalizeTrackingNumber(impb);
  assert.equal(extractCanonicalTracking(impb), viaNormalize);
  assert.ok(!viaNormalize.startsWith('420'));
  assert.equal(uspsSearchableTrackingNumber(impb), viaNormalize);
});

test('USPS searchable copy exists only for a valid 420 + ZIP routing envelope', () => {
  assert.equal(searchableTrackingNumber('420902109405511899223197428265'), '9405511899223197428265');
  assert.equal(uspsSearchableTrackingNumber('9405511899223197428265'), null);
  assert.equal(uspsSearchableTrackingNumber('42090210NOT-A-USPS-BARCODE'), null);
});

test('a short non-FedEx digit string is untouched (no false FedEx tail)', () => {
  assert.equal(stripFedexConcatPrefix('12345'), '12345');
});

test('a long barcode with no FedEx-valid tail falls back to the cleaned full string', () => {
  // 20 digits that do not end in a valid FedEx Express/Ground number.
  const odd = '11111111111111111111';
  assert.equal(stripFedexConcatPrefix(odd), odd);
});

test('punctuation/spacing in a pasted number is normalized away before matching', () => {
  assert.equal(extractCanonicalTracking('3821 4115 2045'), '382141152045');
  assert.equal(extractCanonicalTracking('382-141-152-045'), '382141152045');
});

// ─── FedEx Express 12-digit detect (any leading digit) ───────────────────────
// Pattern was historically /^[39]\d{11}$/; real Express STNs also start 4/7/8/…

test('detectCarrier: FedEx Express 12-digit accepts leading digits beyond 3/9', () => {
  assert.equal(detectCarrier('382141152045'), 'FedEx'); // classic 3…
  assert.equal(detectCarrier('986578788855'), 'FedEx'); // classic 9…
  assert.equal(detectCarrier('477179081230'), 'FedEx'); // jkeen sample 4…
  assert.equal(detectCarrier('799531274483'), 'FedEx'); // jkeen sample 7…
  assert.equal(detectCarrier('875230873543'), 'FedEx'); // ops incident 8…
});

test('detectCarrier: neighboring lengths stay on their carriers', () => {
  assert.equal(detectCarrier('9400111899223344556677'), 'USPS'); // 22
  assert.equal(detectCarrier('1234567890'), 'DHL'); // 10 → DHL Express
  assert.equal(detectCarrier('1Z999AA10123456784'), 'UPS');
});

// ─── §3.1 cross-carrier hardening — never truncate a USPS number ────────────── The earlier (unsafe) strip guessed by trailing pattern:

test('USPS 22-digit number whose tail looks like FedEx Express is left WHOLE (plan example)', () => {
  // Trailing 12 = 314810260579 — FedEx-shaped under /^\d{12}$/, but USPS must stay whole.
  const usps = '9235990407314810260579';
  assert.equal(stripFedexConcatPrefix(usps), usps);
  assert.equal(extractCanonicalTracking(usps), usps);
});

test('USPS number ending in a FedEx-Express-looking 9-prefixed run is left WHOLE', () => {
  const usps = '9405998877912345678901'; // trailing 12 = 912345678901
  assert.equal(stripFedexConcatPrefix(usps), usps);
  assert.equal(extractCanonicalTracking(usps), usps);
});

test('USPS number ending in a FedEx-Ground-looking 96-prefixed run is left WHOLE', () => {
  const usps = '94001961234567890123'; // trailing 15 = 961234567890123 → 96\d{13}
  assert.equal(stripFedexConcatPrefix(usps), usps);
  assert.equal(extractCanonicalTracking(usps), usps);
});

// ─── §3.1 cross-carrier hardening — leave already-human numbers untouched ─────

test('a real 15-digit FedEx Ground number is NOT truncated to its trailing 12', () => {
  const ground = '961234567890123'; // valid 96-prefixed Ground, already human-readable
  assert.equal(stripFedexConcatPrefix(ground), ground);
  assert.equal(extractCanonicalTracking(ground), ground);
});

test('a plain 12-digit FedEx Express number passes through unchanged', () => {
  assert.equal(stripFedexConcatPrefix('382141152045'), '382141152045');
});

test('a UPS 1Z label is never mistaken for a FedEx GS1 envelope', () => {
  assert.equal(stripFedexConcatPrefix('1Z999AA10123456784'), '1Z999AA10123456784');
  assert.equal(extractCanonicalTracking('1Z999AA10123456784'), '1Z999AA10123456784');
});

test('only the 96-prefixed GS1-34 FedEx envelope collapses to its human number', () => {
  const scanned = '9632001960200651497200382141152045'; // 34-digit, 96-prefixed
  assert.equal(stripFedexConcatPrefix(scanned), '382141152045');
});

// ─── Open URL resolution (stored carrier → detect → official deep link) ──────

test('resolveTrackingOpenUrl: UPS 1Z detects to UPS track URL', () => {
  const ups = '1Z999AA10123456784';
  const url = resolveTrackingOpenUrl(ups);
  assert.ok(url);
  assert.match(url!, /ups\.com/i);
  assert.ok(url!.includes(ups));
});

test('resolveTrackingOpenUrl: FedEx 12-digit detects to FedEx track URL', () => {
  const fedex = '382141152045';
  const url = resolveTrackingOpenUrl(fedex);
  assert.ok(url);
  assert.match(url!, /fedex\.com/i);
  assert.ok(url!.includes(fedex));
});

test('resolveTrackingOpenUrl: 8-prefixed FedEx Express detects without carrierHint', () => {
  const fedex = '875230873543';
  const url = resolveTrackingOpenUrl(fedex);
  assert.ok(url);
  assert.match(url!, /fedex\.com/i);
  assert.ok(url!.includes(fedex));
});

test('resolveTrackingOpenUrl: USPS 22-digit detects to USPS track URL', () => {
  const usps = '9400111899223344556677';
  const url = resolveTrackingOpenUrl(usps);
  assert.ok(url);
  assert.match(url!, /usps\.com/i);
  assert.ok(url!.includes(usps));
});

test('resolveTrackingOpenUrl: knownCarrier wins over a conflicting pattern', () => {
  // A UPS-shaped number forced to FedEx via stored label carrier.
  const upsShaped = '1Z999AA10123456784';
  const url = resolveTrackingOpenUrl(upsShaped, 'FedEx');
  assert.ok(url);
  assert.match(url!, /fedex\.com/i);
  assert.doesNotMatch(url!, /ups\.com/i);
});

test('resolveTrackingOpenUrl: unrecognized / empty → null (never Google)', () => {
  assert.equal(resolveTrackingOpenUrl(''), null);
  assert.equal(resolveTrackingOpenUrl('N/A'), null);
  assert.equal(resolveTrackingOpenUrl('NOTATRACKING'), null);
  assert.equal(resolveTrackingOpenUrl('NOTATRACKING', 'MysteryCarrier'), null);
  assert.equal(resolveTrackingOpenUrl('NOTATRACKING', ''), null);
});

test('getTrackingUrlByCarrier: empty carrier string returns null (no Google)', () => {
  assert.equal(getTrackingUrlByCarrier('1Z999AA10123456784', ''), null);
  assert.equal(getTrackingUrlByCarrier('1Z999AA10123456784', 'Unknown'), null);
});

test('getTrackingUrl / byCarrier: OnTrac · LaserShip · GSO map to official hosts', () => {
  const ontrac = 'C12345678901234';
  assert.match(getTrackingUrl(ontrac)!, /ontrac\.com/i);
  assert.match(getTrackingUrlByCarrier(ontrac, 'OnTrac')!, /ontrac\.com/i);

  const lasership = '1LS123456789012';
  assert.match(getTrackingUrl(lasership)!, /lasership\.com/i);
  assert.match(getTrackingUrlByCarrier(lasership, 'LaserShip')!, /lasership\.com/i);

  const gso = 'AB12345678901234';
  assert.match(getTrackingUrl(gso)!, /gls-us\.com/i);
  assert.match(getTrackingUrlByCarrier(gso, 'GSO')!, /gls-us\.com/i);
});
