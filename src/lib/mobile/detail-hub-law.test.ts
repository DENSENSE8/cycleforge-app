import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditDetailDockSource,
  auditDetailHubPage,
  auditDetailInfoPage,
  auditMobileSheets,
  balancedSpan,
  importMap,
  stripComments,
  type DetailHubRule,
  type ModuleReader,
} from './detail-hub-law';

const HUB = 'src/app/m/(shell)/x/[id]/page.tsx';
const INFO = 'src/app/m/(shell)/x/[id]/info/page.tsx';

const MODULES: Record<string, string> = {
  '@/components/mobile/x/XCard': 'export function XCard() { return <DetailSummaryCard href="/m/x/1/info" />; }',
  '@/components/mobile/x/XDock': 'export function XDock() { return <DetailDock label="X" verbs={[]} onVerb={f} />; }',
  '@/components/mobile/x/FakeCard': 'export function FakeCard() { return <div className="card" />; }',
};
const read: ModuleReader = (_from, spec) => MODULES[spec] ?? null;

/** A hub that obeys every rule — each test plants ONE violation into it. */
const CLEAN_HUB = `
'use client';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { XCard } from '@/components/mobile/x/XCard';
import { XDock } from '@/components/mobile/x/XDock';

// A comment naming router.back() or <h2> or MobileTriagePage is prose, not code.
export default function Hub() {
  const { item, state } = useX();
  return (
    <DetailHubScreen
      record={item}
      state={state}
      bar={{ title: 'X-1', mono: true }}
      card={(r) => <XCard item={r} />}
      rowsLabel="X screens"
      rows={() => rows}
      dock={(r) => <XDock item={r} />}
    />
  );
}
`;

const rules = (violations: { rule: DetailHubRule }[]) => violations.map((v) => v.rule);

test('a hub on the kit, with card and dock mappers, is clean', () => {
  assert.deepEqual(auditDetailHubPage(HUB, CLEAN_HUB, read), []);
});

test('a hub that does not mount DetailHubScreen is unported', () => {
  const legacy = `export default function Hub() { return <ModeRegion><MobileDetailTopBar title="X" /></ModeRegion>; }`;
  assert.deepEqual(rules(auditDetailHubPage(HUB, legacy, read)), ['hub-missing-screen']);
});

test('the card slot must render DetailSummaryCard, directly or through a mapper', () => {
  const fake = CLEAN_HUB.replace(
    "import { XCard } from '@/components/mobile/x/XCard';",
    "import { FakeCard as XCard } from '@/components/mobile/x/FakeCard';",
  );
  assert.deepEqual(rules(auditDetailHubPage(HUB, fake, read)), ['hub-missing-card']);
  const direct = CLEAN_HUB.replace('<XCard item={r} />', '<DetailSummaryCard href="/i" />');
  assert.deepEqual(auditDetailHubPage(HUB, direct, read), []);
});

test('the dock slot must be DetailDock or a mapper over it', () => {
  const noDock = CLEAN_HUB.replace('dock={(r) => <XDock item={r} />}', 'dock={() => <nav />}');
  assert.deepEqual(rules(auditDetailHubPage(HUB, noDock, read)), ['hub-missing-dock']);
});

const PLANTS: [DetailHubRule, string][] = [
  ['hub-edit-affordance', '<Button>Edit</Button>'],
  ['hub-edit-affordance', '<IconButton ariaLabel="Edit details" icon={<Pencil />} />'],
  ['hub-heading', '<h2>Information</h2>'],
  ['hub-heading', '<DetailSectionHeading>Info</DetailSectionHeading>'],
  ['hub-router-back', '<button onClick={() => router.back()}>Back</button>'],
  ['hub-nested-main', '<main className="p-4" />'],
  ['hub-triage-page', '<MobileTriagePage rows={rows} />'],
  ['hub-raw-dock', '<nav className="sticky bottom-0 grid grid-cols-3"><Button>Go</Button></nav>'],
];

for (const [rule, jsx] of PLANTS) {
  test(`planted: ${rule} — ${jsx}`, () => {
    const planted = CLEAN_HUB.replace('rowsLabel="X screens"', `rowsLabel="X screens"\n      ack={${jsx}}`);
    assert.ok(rules(auditDetailHubPage(HUB, planted, read)).includes(rule), `expected ${rule}`);
  });
}

test('planted: hub-effect-fetch — fetch inside useEffect, not in a callback', () => {
  const inEffect = CLEAN_HUB.replace(
    "  const { item, state } = useX();",
    "  const { item, state } = useX();\n  useEffect(() => { void fetch('/api/x/1').then(setX); }, []);",
  );
  assert.deepEqual(rules(auditDetailHubPage(HUB, inEffect, read)), ['hub-effect-fetch']);
  const inCallback = CLEAN_HUB.replace(
    "  const { item, state } = useX();",
    "  const { item, state } = useX();\n  useEffect(() => { track(); }, []);\n  const save = () => fetch('/api/x', { method: 'PATCH' });",
  );
  assert.deepEqual(auditDetailHubPage(HUB, inCallback, read), []);
});

test('dock: at most three verbs and exactly one primary, wherever it is mounted', () => {
  const dock = (verbs: string) => `<DetailDock label="X" verbs={[${verbs}]} onVerb={f} />`;
  const v = (id: string, primary = false) => `{ id: '${id}', label: '${id}', icon: <I />${primary ? ', primary: true' : ''} },`;
  assert.deepEqual(auditDetailDockSource('a.tsx', dock(v('a') + v('b') + v('c', true))), []);
  assert.deepEqual(rules(auditDetailDockSource('a.tsx', dock(v('a') + v('b') + v('c') + v('d', true)))), [
    'dock-too-many-verbs',
  ]);
  assert.deepEqual(rules(auditDetailDockSource('a.tsx', dock(v('a', true) + v('b', true)))), ['dock-many-primary']);
});

test('/info: the bar pencil is the only write control', () => {
  const clean = `<DetailRecordFrame bar={{ right: () => <IconButton ariaLabel="Edit details" icon={<Pencil />} /> }}>
    {(r) => <Panel><DetailFactRow label="Title" value={r.title} /><EditSheet open={open} /></Panel>}
  </DetailRecordFrame>`;
  assert.deepEqual(auditDetailInfoPage(INFO, clean), []);
  const inline = clean.replace('<EditSheet open={open} />', '<input value={r.title} />');
  assert.deepEqual(rules(auditDetailInfoPage(INFO, inline)), ['info-write-control']);
  const second = clean.replace('<EditSheet open={open} />', '<IconButton ariaLabel="Delete" icon={<Trash />} />');
  assert.deepEqual(rules(auditDetailInfoPage(INFO, second)), ['info-write-control']);
});

test('sheets: every phone BottomSheet has a role, entries stay live, and record sheets only shrink', () => {
  const A = 'src/components/mobile/x/ASheet.tsx';
  const B = 'src/app/m/(shell)/x/page.tsx';
  const mounts = (file: string) => ({ file, source: `export function S() { return <BottomSheet open onClose={f} />; }` });
  const verdict = (files: { file: string; source: string }[], roles: Record<string, string>, baseline: number) => {
    const out = auditMobileSheets(files, roles, baseline);
    return { rules: rules(out.violations), problems: out.problems.length };
  };
  assert.deepEqual(verdict([mounts(A), mounts(B)], { [A]: 'picker', [B]: 'record' }, 1), { rules: [], problems: 0 });
  // An unlisted phone sheet fails; a desk sheet and a comment are not phone mounts.
  assert.deepEqual(verdict([mounts(A), mounts(B)], { [A]: 'picker' }, 0), { rules: ['sheet-unclassified'], problems: 0 });
  assert.deepEqual(verdict([mounts('src/components/desk/Sheet.tsx'), { file: A, source: '// <BottomSheet>' }], {}, 0), { rules: [], problems: 0 });
  // A listed file that stopped mounting is stale; records above or below the baseline both ask for an edit.
  assert.deepEqual(verdict([], { [A]: 'picker' }, 0), { rules: [], problems: 1 });
  assert.deepEqual(verdict([mounts(A), mounts(B)], { [A]: 'record', [B]: 'record' }, 1), { rules: [], problems: 1 });
  assert.deepEqual(verdict([mounts(A)], { [A]: 'picker' }, 1), { rules: [], problems: 1 });
});

test('helpers: comments blank out, spans balance, imports map', () => {
  const src = "a // router.back()\n/* <h2> */ b";
  const stripped = stripComments(src);
  assert.equal(stripped.split('\n').length, 2);
  assert.ok(!stripped.includes('router.back') && !stripped.includes('<h2>'));
  assert.ok(stripComments("x = '// not a comment'").includes('// not a comment'));
  assert.equal(balancedSpan('f(a, (b), [c])', 1), '(a, (b), [c])');
  assert.deepEqual(importMap("import A, { B, C as D, type E } from '@/x';"), {
    A: '@/x',
    B: '@/x',
    D: '@/x',
    E: '@/x',
  });
});
