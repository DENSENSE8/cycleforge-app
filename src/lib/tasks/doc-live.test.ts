import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  definitionOfDone,
  docRefKey,
  docRefsIn,
  parseTasksQuery,
  scanDocRefs,
  tasksBlockSources,
  tasksChartMermaid,
} from './doc-live';

const refs = (text: string) => scanDocRefs(text).map((m) => `${m.ref.kind}:${m.ref.value}|${m.raw}`);

// ── reference scanner ───────────────────────────────────────────────────────

test('scans every reference kind with its raw span', () => {
  assert.deepEqual(
    refs('See #T16034, task:16011 and @Thuc on RS-77 for #9431 (order:12-34567-89012) sku:AB-12.'),
    [
      'task:16034|#T16034',
      'task:16011|task:16011',
      'staff:Thuc|@Thuc',
      'repair:77|RS-77',
      'ticket:9431|#9431',
      'order:12-34567-89012|order:12-34567-89012',
      'sku:AB-12|sku:AB-12',
    ],
  );
});

test('offsets point at the token in the source', () => {
  const text = 'Ask @Michael about RS-0077.';
  for (const m of scanDocRefs(text)) assert.equal(text.slice(m.start, m.end), m.raw);
  assert.deepEqual(refs(text), ['staff:Michael|@Michael', 'repair:77|RS-0077']);
});

test('bare marketplace order numbers read as orders', () => {
  assert.deepEqual(refs('Amazon 113-1234567-1234567 and eBay 12-34567-89012'), [
    'order:113-1234567-1234567|113-1234567-1234567',
    'order:12-34567-89012|12-34567-89012',
  ]);
});

test('tokens inside words, emails, URLs and paths are not references', () => {
  assert.deepEqual(refs('mail me@host.com, see https://x.io/#9431, a#9431, xRS-77, RS-77abc, docs/#T12'), []);
});

test('short #numbers are not tickets (step #12), but #T12 is a task', () => {
  assert.deepEqual(refs('step #12 then #T12'), ['task:12|#T12']);
});

test('trailing sentence punctuation is shed from free-text tokens', () => {
  assert.deepEqual(refs('Ping @Thuc. Ship sku:ZX-9/. Done.'), ['staff:Thuc|@Thuc', 'sku:ZX-9|sku:ZX-9']);
});

test('docRefKey folds case so @thuc and @Thuc resolve once', () => {
  assert.equal(docRefKey({ kind: 'staff', value: 'Thuc' }), docRefKey({ kind: 'staff', value: 'thuc' }));
});

test('docRefsIn dedupes and skips fenced and inline code', () => {
  const md = ['Owner @Thuc on #T16011.', '', '```', '#T99999 @Ghost', '```', 'Again #T16011 and `RS-5`.'].join('\n');
  assert.deepEqual(
    docRefsIn(md).map(docRefKey),
    ['staff:thuc', 'task:16011'],
  );
});

// ── ```tasks``` block parser ────────────────────────────────────────────────

test('parses owner / project / status / limit', () => {
  assert.deepEqual(parseTasksQuery('owner: Thuc, @Michael\nproject: Listing refresh\nstatus: done\nlimit: 80'), {
    ok: true,
    query: { owners: ['Thuc', 'Michael'], project: 'Listing refresh', status: 'done', ids: [], limit: 50, chart: 'list' },
  });
});

test('ids accept #T / T / task: prefixes and default to every status', () => {
  assert.deepEqual(parseTasksQuery('id: #T16034, T16011 task:15\n# a comment'), {
    ok: true,
    query: { owners: [], project: null, status: 'all', ids: [16034, 16011, 15], limit: 25, chart: 'list' },
  });
});

test('owner-only defaults to the open working list', () => {
  const parsed = parseTasksQuery('owner: Thuc');
  assert.ok(parsed.ok);
  assert.equal(parsed.query.status, 'open');
});

test('refuses unknown keys, bad values and an empty block', () => {
  assert.match(errorOf('colour: red'), /Unknown filter “colour”/);
  assert.match(errorOf('status: maybe'), /use open, done or all/);
  assert.match(errorOf('id: abc'), /not a task id/);
  assert.match(errorOf('owner Thuc'), /key: value/);
  assert.match(errorOf('status: open'), /at least one filter/);
  assert.match(errorOf(''), /at least one filter/);
});

function errorOf(source: string): string {
  const parsed = parseTasksQuery(source);
  assert.equal(parsed.ok, false);
  return parsed.ok ? '' : parsed.error;
}

test('tasksBlockSources finds each fenced tasks block body', () => {
  const md = '# Plan\n```tasks\nowner: Thuc\n```\ntext\n```js\nx\n```\n```tasks\nid: 1\n```\n';
  assert.deepEqual(tasksBlockSources(md), ['owner: Thuc', 'id: 1']);
});

// ── Definition of Done ──────────────────────────────────────────────────────

test('reads the checklist under the Definition of done heading only', () => {
  const note = [
    '# Listing refresh',
    '- [ ] stray item above',
    '## Definition of done',
    '- [x] Photos retaken',
    '- [ ] Titles rewritten',
    '### Notes',
    '- [ ] nested heading still inside',
    '## Steps',
    '- [ ] not part of the DoD',
  ].join('\n');
  assert.deepEqual(definitionOfDone(note), {
    fromHeading: true,
    items: [
      { text: 'Photos retaken', done: true },
      { text: 'Titles rewritten', done: false },
      { text: 'nested heading still inside', done: false },
    ],
  });
});

test('falls back to every checklist item, ignoring fenced code', () => {
  const note = '1. Pull the unit\n- [ ] Reply on the ticket\n```\n- [ ] code, not a task\n```\n* [X] Photograph the serial';
  assert.deepEqual(definitionOfDone(note), {
    fromHeading: false,
    items: [
      { text: 'Reply on the ticket', done: false },
      { text: 'Photograph the serial', done: true },
    ],
  });
});

test('DoD heading matches DoD / bold spelling; empty note is empty', () => {
  assert.equal(definitionOfDone('### **DoD**\n- [ ] Ship it').fromHeading, true);
  assert.deepEqual(definitionOfDone(null), { items: [], fromHeading: false });
});

// ── derived charts ──────────────────────────────────────────────────────────

test('chart: pie / bar parse, and refuse other charts', () => {
  const pie = parseTasksQuery('owner: Thuc\nchart: Pie');
  assert.ok(pie.ok && pie.query.chart === 'pie');
  assert.match(errorOf('owner: Thuc\nchart: gantt'), /use list, pie or bar/);
});

test('tasksChartMermaid derives a status pie and a DoD bar from the rows', () => {
  const rows = [
    { title: 'Retake "hero" photos', statusLabel: 'Done', dod: { fromHeading: true, items: [{ text: 'a', done: true }] } },
    { title: 'Rewrite titles', statusLabel: 'To do', dod: { fromHeading: true, items: [{ text: 'a', done: true }, { text: 'b', done: false }] } },
    { title: 'Price check', statusLabel: 'To do', dod: { fromHeading: false, items: [] } },
  ];
  assert.equal(
    tasksChartMermaid('pie', rows),
    'pie showData title Tasks by status\n  "Done" : 1\n  "To do" : 2',
  );
  assert.equal(
    tasksChartMermaid('bar', rows),
    [
      'xychart-beta',
      '  title "Definition of done — % complete"',
      '  x-axis ["Retake hero photos", "Rewrite titles", "Price check"]',
      '  y-axis "% done" 0 --> 100',
      '  bar [100, 50, 0]',
    ].join('\n'),
  );
});
