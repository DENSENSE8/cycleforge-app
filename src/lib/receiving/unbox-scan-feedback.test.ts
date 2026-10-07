import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNBOX_FEEDBACK_LOG_CAP,
  cartonScanVerdict,
  decideUnfoundPairing,
  findCheckingFeedback,
  findFeedbackForCarton,
  pushFeedback,
  unboxFeedbackFace,
  unboxFeedbackLine,
  type UnboxScanFeedback,
  type UnboxTicketCandidate,
  type UnboxTicketPairing,
} from './unbox-scan-feedback';

const ticket = (id: number, over: Partial<UnboxTicketCandidate> = {}): UnboxTicketCandidate => ({
  id,
  subject: `Ticket ${id}`,
  status: 'open',
  url: null,
  linkedToThis: false,
  ...over,
});

const entry = (over: Partial<UnboxScanFeedback> = {}): UnboxScanFeedback => ({
  id: 1,
  tracking: '9400111206260370400001',
  receivingId: null,
  phase: 'unfound',
  lineCount: 0,
  ticket: null,
  at: 0,
  ...over,
});

test('a ticket already linked to this carton is paired without a re-post, even beside others', () => {
  const decision = decideUnfoundPairing([ticket(1), ticket(2, { linkedToThis: true }), ticket(3)]);
  assert.equal(decision.kind, 'already');
  assert.equal(decision.kind === 'already' && decision.ticket.id, 2);
});

test('exactly one free ticket is linked automatically', () => {
  const decision = decideUnfoundPairing([ticket(7)]);
  assert.equal(decision.kind, 'link');
  assert.equal(decision.kind === 'link' && decision.ticket.id, 7);
});

test('several free tickets go to the operator to pick', () => {
  const decision = decideUnfoundPairing([ticket(1), ticket(2)]);
  assert.equal(decision.kind, 'choose');
  assert.equal(decision.kind === 'choose' && decision.candidates.length, 2);
});

test('no tickets says none', () => {
  assert.equal(decideUnfoundPairing([]).kind, 'none');
});

const TICKET_STATES: UnboxTicketPairing[] = [
  { state: 'searching' },
  { state: 'paired', ticketId: 999_999_999_999, subject: null, status: null, url: null },
  { state: 'choose', candidates: Array.from({ length: 99 }, (_, i) => ticket(i)) },
  { state: 'none' },
  { state: 'not_connected' },
  { state: 'error' },
];

test('every line carries the WHOLE tracking right after its verb, so an ellipsis never cuts the number', () => {
  const tracking = '1Z999AA1 0123456784';
  const whole = '1Z999AA10123456784';
  const lines = [
    ...(['checking', 'found', 'unfound', 'error'] as const).map((phase) =>
      unboxFeedbackLine(entry({ tracking, phase })),
    ),
    ...TICKET_STATES.map((t) => unboxFeedbackLine(entry({ tracking, ticket: t }))),
  ];
  for (const line of lines) {
    const at = line.indexOf(whole);
    assert.ok(at >= 0 && at <= 'Couldn’t check '.length, line);
  }
});

test('every ticket state wears a ticket face; an unfound scan without one does not', () => {
  for (const t of TICKET_STATES) assert.match(unboxFeedbackFace(entry({ ticket: t })), /^ticket-/);
  assert.equal(unboxFeedbackFace(entry()), 'unfound');
});

test('an unfound scan names the linked ticket', () => {
  const line = unboxFeedbackLine(
    entry({ ticket: { state: 'paired', ticketId: 48213, subject: 'x', status: 'open', url: null } }),
  );
  assert.equal(line, 'Unfound 9400111206260370400001 — linked to #48213');
});

test('history is newest-first and capped', () => {
  let log: readonly UnboxScanFeedback[] = [];
  for (let id = 1; id <= UNBOX_FEEDBACK_LOG_CAP + 5; id += 1) log = pushFeedback(log, entry({ id }));
  assert.equal(log.length, UNBOX_FEEDBACK_LOG_CAP);
  assert.equal(log[0].id, UNBOX_FEEDBACK_LOG_CAP + 5);
  assert.equal(log.at(-1)?.id, 6);
});

test('a carton finds its own scan: stamped first, else the newest unstamped same tracking', () => {
  const log = [
    entry({ id: 3, tracking: '9400 1112 0626 0370 4000 01' }),
    entry({ id: 2, tracking: '9400111206260370400001', receivingId: 50 }),
    entry({ id: 1, tracking: 'OTHER' }),
  ];
  assert.equal(findFeedbackForCarton(log, 50, '9400111206260370400001')?.id, 2);
  assert.equal(findFeedbackForCarton(log, 51, '9400111206260370400001')?.id, 3);
  assert.equal(findFeedbackForCarton(log, 52, 'NOPE'), null);
});

test('verdict from rows a rung already holds: a PO or real lines are found; a lineless unfound carton is not', () => {
  assert.deepEqual(
    cartonScanVerdict([{ id: -42, receiving_id: 42, receiving_source: 'unmatched' }]),
    { phase: 'unfound', receivingId: 42, lineCount: 0 },
  );
  assert.equal(
    cartonScanVerdict([{ id: 7, receiving_id: 42, receiving_source: null, zoho_purchaseorder_number: 'PO-1' }]).phase,
    'found',
  );
  assert.equal(cartonScanVerdict([{ id: 7, receiving_id: 42, receiving_source: null }]).phase, 'found');
});

test('a verdict settles the newest scan of that tracking still checking', () => {
  const base = { receivingId: null, lineCount: 0, ticket: null, at: 0 } as const;
  const log: UnboxScanFeedback[] = [
    { ...base, id: 3, tracking: '1Z 999', phase: 'checking' },
    { ...base, id: 2, tracking: '1Z999', phase: 'found' },
  ];
  assert.equal(findCheckingFeedback(log, '1z999')?.id, 3);
  assert.equal(findCheckingFeedback(log, '1Z000'), null);
});
