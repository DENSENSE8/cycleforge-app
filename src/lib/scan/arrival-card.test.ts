/**
 * The Arrival Card is the first Card the phone opens, so this file asserts the
 * whole screen as data: the header, the object, the 1–3 facts, the two photo
 * slots, the ONE preselected verb with its reason, and the single ops event a
 * press writes.
 *
 * Two invariants matter more than the rest and are asserted against the
 * dispatch table itself rather than against a copied string:
 *
 *   - the session title here IS `dispatchScan`'s title (G1). Two spellings of
 *     one title puts one carton on the Stack twice.
 *   - the recommendation is a pure function of two numbers. If it ever needs a
 *     fetch, these tests stop being able to call it like this.
 */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';

import {
  arrivalRecommendation,
  arrivalTitle,
  arrivalFieldPlaceholder,
  arrivalCardModel,
  arrivalOpsEvent,
  ARRIVAL_PHOTO_SLOTS,
  ARRIVAL_MAX_FACTS,
  type ArrivalCardModel,
} from './arrival-card';
import { dispatchScan } from './dispatch-table';

/** UPS — printed in human groups; the wedge forwards the spaces. */
const UPS = '1Z 999 AA1 01 2345 4471';
/** FedEx Express — bare 12 digits. */
const FEDEX = '123456789012';
/** A bin: never an arrival, whatever this module is asked. */
const BIN = 'A12';

function card(input: Partial<Parameters<typeof arrivalCardModel>[0]> = {}): ArrivalCardModel {
  const model = arrivalCardModel({ scan: UPS, ...input });
  ok(model, 'a never-seen tracking number must build a Card');
  return model!;
}

// ─── The recommendation · someone is waiting ────────────────────────────────

test('one or more pending orders preselects UNBOX NOW and counts them in the label', () => {
  const r = arrivalRecommendation({ pendingOrdersForCarton: 3 });
  strictEqual(r.verb, 'unbox');
  strictEqual(r.reason, '3 orders waiting on this carton');
  strictEqual(r.actions[0].label, 'Unbox now · 3 orders waiting');
  strictEqual(r.actions[0].primary, true, 'the recommendation is preselected');
});

test('exactly one waiting order still says UNBOX — and says it in the singular', () => {
  const r = arrivalRecommendation({ pendingOrdersForCarton: 1 });
  strictEqual(r.verb, 'unbox');
  strictEqual(r.actions[0].label, 'Unbox now · 1 order waiting');
  strictEqual(r.reason, '1 order waiting on this carton');
});

test('a waiting order outranks an empty rack — the orders decide, not the shelf', () => {
  strictEqual(
    arrivalRecommendation({ pendingOrdersForCarton: 2, rackCapacity: 40 }).verb,
    'unbox',
  );
});

// ─── The recommendation · nothing is waiting ────────────────────────────────

test('no pending orders preselects RACK IT FOR LATER, with the reason', () => {
  const r = arrivalRecommendation({ pendingOrdersForCarton: 0, rackCapacity: 12 });
  strictEqual(r.verb, 'rack');
  strictEqual(r.reason, 'no orders are waiting on this carton');
  strictEqual(r.actions[0].label, 'Rack it for later');
  strictEqual(r.actions[0].primary, true);
});

test('knowing nothing is the cautious answer, not an invented one', () => {
  const r = arrivalRecommendation();
  strictEqual(r.verb, 'rack', 'an uncounted carton is not an urgent one');
  ok(r.reason.length > 0, 'and it still says why');
});

test('a FULL rack flips it back to unbox — a rack with no slot is not a destination', () => {
  const r = arrivalRecommendation({ pendingOrdersForCarton: 0, rackCapacity: 0 });
  strictEqual(r.verb, 'unbox');
  strictEqual(r.reason, 'the rack is full — there is nowhere to put it');
  strictEqual(r.actions[0].label, 'Unbox now', 'no count to name, so no count is named');
});

// ─── The recommendation · shape invariants ──────────────────────────────────

test('every recommendation offers BOTH verbs and preselects exactly one', () => {
  const cases = [
    {},
    { pendingOrdersForCarton: 0 },
    { pendingOrdersForCarton: 5 },
    { pendingOrdersForCarton: 0, rackCapacity: 0 },
    { pendingOrdersForCarton: 9, rackCapacity: 0 },
    { pendingOrdersForCarton: -4, rackCapacity: -1 },
    { pendingOrdersForCarton: null, rackCapacity: null },
  ];
  for (const input of cases) {
    const r = arrivalRecommendation(input);
    strictEqual(r.actions.length, 2, 'one primary, one secondary — never a menu');
    deepStrictEqual(
      [...r.actions].map((a) => a.verb).sort(),
      ['rack', 'unbox'],
      'both verbs are always on the Card',
    );
    strictEqual(r.actions.filter((a) => a.primary).length, 1);
    strictEqual(r.actions[0].primary, true, 'the recommended verb comes first');
    strictEqual(r.actions[0].verb, r.verb);
    for (const action of r.actions) ok(action.reason.length > 0, `${action.verb} → reason`);
  }
});

test('a negative or nonsense count is floored, never printed', () => {
  const r = arrivalRecommendation({ pendingOrdersForCarton: -4, rackCapacity: -1 });
  strictEqual(r.verb, 'unbox', 'a negative rack reads as no free slot');
  strictEqual(r.actions[0].label, 'Unbox now');
});

// ─── The title comes from the dispatch table, not from beside it ────────────

test('the title IS the dispatch table title', () => {
  strictEqual(arrivalTitle(UPS), 'Intake · UPS 4471');
  strictEqual(
    arrivalTitle(UPS),
    dispatchScan({ scan: UPS, state: { trackingSeen: false } }).title,
    'one session title, one source',
  );
  strictEqual(arrivalTitle(FEDEX), 'Intake · FedEx 9012');
});

test('a scan that does not open this Card gets no Arrival title', () => {
  strictEqual(arrivalTitle(BIN), null);
  strictEqual(arrivalTitle(''), null);
  strictEqual(arrivalCardModel({ scan: BIN }), null);
});

test('the Field placeholder names the destination the dispatch table named', () => {
  strictEqual(arrivalFieldPlaceholder(UPS), 'scan · type · say → the door');
  strictEqual(card().fieldPlaceholder, 'scan · type · say → the door');
});

// ─── The Card ───────────────────────────────────────────────────────────────

test('the header is ◀ Stack · the title, and the object is the tracking string', () => {
  const model = card();
  strictEqual(model.header.back, 'Stack', 'the Stack is the only thing behind top-left');
  strictEqual(model.header.title, 'Intake · UPS 4471');
  strictEqual(model.title, model.header.title);
  strictEqual(model.tracking, '1Z999AA10123454471', 'the normalised key, printed to match by eye');
  strictEqual(model.carrier, 'UPS');
  strictEqual(model.surfaceKey, 'arrival');
});

test('the Card carries ONE to THREE facts — never zero, never a scroll', () => {
  const bare = card();
  strictEqual(bare.facts.length, 1, 'nothing announced, so the absence is the fact');
  strictEqual(bare.facts[0].value, 'none — first scan of this number');

  const known = card({
    supplier: 'Goodwill Ohio',
    cartonsExpected: 2,
    poRef: 'R-4102',
    pendingOrdersForCarton: 3,
  });
  strictEqual(known.facts.length, ARRIVAL_MAX_FACTS, 'four knowns, three lines');
  deepStrictEqual(
    [...known.facts].map((f) => `${f.label} ${f.value}`),
    ['From Goodwill Ohio', 'Expected 2 cartons', 'PO R-4102'],
  );

  const partial = card({ supplier: 'Goodwill Ohio', cartonsExpected: 1 });
  strictEqual(partial.facts.length, 2);
  strictEqual(partial.facts[1].value, '1 carton', 'singular carton');
});

test('there are exactly two photo inputs: the label and the box', () => {
  deepStrictEqual(
    [...card().photos].map((p) => p.kind),
    ['label', 'box'],
  );
  strictEqual(ARRIVAL_PHOTO_SLOTS.length, 2, 'two inputs, not a gallery');
  for (const slot of ARRIVAL_PHOTO_SLOTS) ok(slot.hint.length > 0, `${slot.kind} → hint`);
});

test('the Card carries the recommendation for the counts it was given', () => {
  strictEqual(card({ pendingOrdersForCarton: 4 }).recommendation.verb, 'unbox');
  strictEqual(card({ pendingOrdersForCarton: 4 }).recommendation.actions[0].label,
    'Unbox now · 4 orders waiting');
  strictEqual(card({ rackCapacity: 9 }).recommendation.verb, 'rack');
});

// ─── One press, one event ───────────────────────────────────────────────────

test('taking the recommendation writes ONE event, titled from the dispatch table', () => {
  const model = card({ pendingOrdersForCarton: 3 });
  const event = arrivalOpsEvent(model, { verb: 'unbox', photos: ['label', 'box'] });

  strictEqual(event.type, 'arrival.unboxed');
  strictEqual(event.surfaceKey, 'arrival');
  strictEqual(event.title, dispatchScan({ scan: UPS, state: { trackingSeen: false } }).title);
  strictEqual(event.tracking, model.tracking);
  strictEqual(event.carrier, 'UPS');
  strictEqual(event.followedRecommendation, true);
  strictEqual(event.reason, '3 orders waiting on this carton');
  deepStrictEqual([...event.photos], ['label', 'box']);
});

test('overriding the recommendation is allowed, and the event says so', () => {
  const model = card({ pendingOrdersForCarton: 3 });
  const event = arrivalOpsEvent(model, { verb: 'rack' });

  strictEqual(event.type, 'arrival.racked');
  strictEqual(event.verb, 'rack');
  strictEqual(event.followedRecommendation, false, 'the pick is preselected, not enforced');
  strictEqual(event.reason, 'the orders keep waiting', "the pressed button's own reason");
  deepStrictEqual([...event.photos], [], 'no photos taken is a fact, not an error');
});

test('either verb writes exactly one event, and both name the same session', () => {
  const model = card({ pendingOrdersForCarton: 0, rackCapacity: 6 });
  const events = [
    arrivalOpsEvent(model, { verb: 'rack' }),
    arrivalOpsEvent(model, { verb: 'unbox' }),
  ];
  deepStrictEqual(events.map((e) => e.type), ['arrival.racked', 'arrival.unboxed']);
  for (const event of events) {
    strictEqual(event.title, 'Intake · UPS 4471');
    strictEqual(event.surfaceKey, 'arrival');
    ok(event.reason.length > 0, `${event.verb} → reason`);
  }
});
