import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditDeskSurfaces, type DeskSurfaceAudit, type DeskSurfaceLedger } from './desk-surface-law';

const RAIL = `export function X() { return <DetailStackRailRegistrar id="detail:x" onClose={f} />; }`;
const DETAIL_HOOK = `useRegisterRightPanel({ id: RAIL_ID, priority: RIGHT_RAIL_PRIORITY.detail, node });`;
const ASSISTANT_HOOK = `useRegisterRightPanel({ id: 'assistant', priority: RIGHT_RAIL_PRIORITY.assistant, node });`;
const SEARCH_TABLE = `import { DataTable } from '@/components/tables/DataTable';`;
const INSPECTOR_BINDING = `export const B = { recordPlane: { kind: 'inspector', occupantId: 'detail:x' } };`;

const rules = (v: DeskSurfaceAudit) => v.violations.map((x) => x.rule);

describe('desk surface law — rail', () => {
  it('fails an unclassified record rail, at the registrar line', () => {
    const out = auditDeskSurfaces([{ file: 'src/components/a/New.tsx', source: `\n\n${RAIL}` }], {}, {});
    assert.deepEqual(rules(out), ['rail-unclassified']);
    assert.equal(out.violations[0].line, 3);
  });

  it('reads detail-priority panels and evidence asides, not the assistant rail or the record ledger', () => {
    const out = auditDeskSurfaces(
      [
        { file: 'src/features/a/Hook.tsx', source: DETAIL_HOOK },
        { file: 'src/features/a/Aside.tsx', source: `<aside className={LEDGER_EVIDENCE_CLASS} />` },
        { file: 'src/components/assistant/A.tsx', source: ASSISTANT_HOOK },
        // RecordLedger places its record through DeskRecordPlane — no rail.
        { file: 'src/features/a/Ledger.tsx', source: `<RecordLedger record={r} summary={s} />` },
      ],
      {},
      {},
    );
    assert.deepEqual(out.violations.map((v) => v.file).sort(), [
      'src/features/a/Aside.tsx',
      'src/features/a/Hook.tsx',
    ]);
  });

  it('ignores comments and phone files', () => {
    const out = auditDeskSurfaces(
      [
        { file: 'src/components/a/Doc.tsx', source: `// mounts <DetailStackRailRegistrar id="x" />` },
        { file: 'src/components/mobile/M.tsx', source: RAIL },
        { file: 'src/app/m/page.tsx', source: RAIL },
      ],
      {},
      {},
    );
    assert.deepEqual(out.violations, []);
  });

  it('passes a classified rail and counts record debt against the baseline', () => {
    const ledger: DeskSurfaceLedger = { rail: { 'src/components/a/Old.tsx': { role: 'record' } } };
    const files = [{ file: 'src/components/a/Old.tsx', source: RAIL }];
    assert.deepEqual(auditDeskSurfaces(files, ledger, { rail: 1 }).problems, []);
    assert.match(auditDeskSurfaces(files, ledger, { rail: 2 }).problems.join(), /drop the rail baseline to 1/);
    assert.match(auditDeskSurfaces(files, ledger, { rail: 0 }).problems.join(), /rose to 1 \(baseline 0\)/);
  });

  it('reports a converted rail still in the ledger as stale', () => {
    const ledger: DeskSurfaceLedger = { rail: { 'src/components/a/Done.tsx': { role: 'record' } } };
    const out = auditDeskSurfaces([{ file: 'src/components/a/Done.tsx', source: '<DeskStageOverlay />' }], ledger, { rail: 1 });
    assert.match(out.problems.join(), /Done\.tsx no longer matches — drop it/);
  });

  it('requires a note on allowed roles and refuses unknown roles', () => {
    const files = [
      { file: 'src/components/a/Tool.tsx', source: RAIL },
      { file: 'src/components/a/Odd.tsx', source: RAIL },
    ];
    const ledger: DeskSurfaceLedger = {
      rail: {
        'src/components/a/Tool.tsx': { role: 'supporting' },
        'src/components/a/Odd.tsx': { role: 'drawer' },
      },
    };
    const problems = auditDeskSurfaces(files, ledger, { rail: 0 }).problems.join('\n');
    assert.match(problems, /Tool\.tsx is 'supporting' without a note/);
    assert.match(problems, /Odd\.tsx has unknown role 'drawer'/);
  });
});

describe('desk surface law — search and bindings', () => {
  it('fails a search surface that imports a desk table, and only under search', () => {
    const out = auditDeskSurfaces(
      [
        { file: 'src/components/search/NewResults.tsx', source: SEARCH_TABLE },
        { file: 'src/app/search/page.tsx', source: `import { OutboundOrdersLedger } from '@/components/outbound/orders/OutboundOrdersLedger';` },
        { file: 'src/components/outbound/Desk.tsx', source: SEARCH_TABLE },
      ],
      {},
      {},
    );
    assert.deepEqual(rules(out), ['search-desk-copy-unclassified', 'search-desk-copy-unclassified']);
  });

  it('fails a new inspector binding but not a stage-overlay one', () => {
    const out = auditDeskSurfaces(
      [
        { file: 'src/features/x/grid/x-table-definition.ts', source: INSPECTOR_BINDING },
        { file: 'src/features/y/grid/y-table-definition.ts', source: `recordPlane: { kind: 'stage-overlay' }` },
      ],
      {},
      {},
    );
    assert.deepEqual(out.violations.map((v) => `${v.rule} ${v.file}`), [
      'binding-inspector-unclassified src/features/x/grid/x-table-definition.ts',
    ]);
  });
});

describe('desk surface law — record plane', () => {
  const STAGE_BY_HAND = `export const R = () => (
    <DeskStageOverlay open={o} onClose={() => { close({ strip: true }); }} title="Order" fill="stage">
      <Body />
    </DeskStageOverlay>
  );`;

  it('fails a record placed by hand on the stage, but not an inset form or the plane itself', () => {
    const out = auditDeskSurfaces(
      [
        { file: 'src/components/a/Record.tsx', source: STAGE_BY_HAND },
        { file: 'src/components/a/Braced.tsx', source: `<DeskStageOverlay open={o} fill={'stage'} />` },
        { file: 'src/components/a/Form.tsx', source: `<DeskStageOverlay open={o} onClose={() => f()} title="Edit" fill="inset" />` },
        { file: 'src/components/a/Plane.tsx', source: `<DeskRecordPlane open={o} list={<L />}><R /></DeskRecordPlane>` },
        { file: 'src/design-system/components/DeskRecordPlane.tsx', source: STAGE_BY_HAND },
      ],
      {},
      {},
    );
    assert.deepEqual(out.violations.map((v) => `${v.rule} ${v.file}:${v.line}`), [
      'record-plane-unclassified src/components/a/Record.tsx:2',
      'record-plane-unclassified src/components/a/Braced.tsx:1',
    ]);
  });
});
