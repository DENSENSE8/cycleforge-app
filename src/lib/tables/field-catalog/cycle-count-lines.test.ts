/**
 * Cycle-count-LINES catalog guards, materialization, verbs and adapter
 * behaviour — the family that replaced `lineColumns`, the seven hand-written
 * `AdminTableColumn` objects on `/inventory/cycle-counts/[id]`.
 *
 * Four assertions here are load-bearing beyond the usual shape checks, because
 * each pins a decision a future agent will be tempted to undo:
 *
 * - **`notes` stays unpainted.** `loadLines` selects it and nothing ever drew
 *   it. A reader who notices "the row already has the note" will want to bind
 *   it; the catalog must not name that column until a plane paints it.
 * - **The verbs live in the VERB MODULE, not at the mount.** All three were
 *   cells (`<form>`s inside the grid, one of them a raw green `<button>`).
 *   `VERBS_BIND_TO_FIELDS` forbids a page minting them, so the catalog is
 *   asserted from the module and the closed-campaign precondition is asserted
 *   as ABSENCE, not as a disabled control.
 * - **`variance_tol` reaches the adapter through the ROW.** The retired Δ cell
 *   coloured itself from `campaign.variance_tol` — a fact outside the row, read
 *   through a closure the `row → CompoundRowView` contract does not have. The
 *   test pins that the tolerance travels on the line and that the adapter says
 *   out-of-tolerance in the PILL's word rather than in a colour.
 * - **≤ FOUR status bindings.** The skeleton mounts whole, so a fifth binding
 *   exceeds `MAX_DEFAULT_VISIBLE_TRACKS` and throws in `parseTableDefinition`
 *   at module load. The check states the ceiling where it can be read.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '@/lib/tables/table-definition';
import {
  CYCLECOUNTLINES_COMPOUND_COLUMNS,
  cycleCountLinesCompoundColumnsFor,
  cycleCountLinesSortFactFor,
} from '@/components/inventory/cycle-count-lines/cycle-count-lines-grid-layout';
import { cycleCountLinesCompoundView } from '@/components/inventory/cycle-count-lines/cycle-count-lines-row-view';
import {
  CYCLECOUNTLINES_VERB_KEYS,
  resolveCycleCountLineRowActions,
  type CycleCountLineVerbHandlers,
} from '@/components/inventory/cycle-count-lines/cycle-count-lines-verbs';
import {
  isCycleCountLineOverTolerance,
  type CycleCountLineRow,
} from '@/lib/inventory/cycle-count-line-row';
import {
  CYCLECOUNTLINES_FIELD_CATALOG,
  CYCLECOUNTLINES_PRODUCT_LAYOUT,
} from './cycle-count-lines';
import { resolveCycleCountLinesSlotValue } from './cycle-count-lines-resolve';
import { parseSlotLayout } from '../slot-layout';

/** Selected by `loadLines`, painted by nothing, and not a fact until one paints it. */
const UNPAINTED_LINE_COLUMNS = ['notes'] as const;

function row(overrides: Partial<CycleCountLineRow> = {}): CycleCountLineRow {
  return {
    id: 4412,
    campaignId: 88,
    binId: 301,
    binName: 'A-12-3',
    sku: 'QC35-EARCUP-BLK',
    expectedQty: 60,
    countedQty: 57,
    variance: -3,
    status: 'pending_review',
    countedByStaffId: 17,
    countedByName: 'David',
    countedAt: '2026-09-11T18:22:04.000Z',
    approvedByStaffId: null,
    approvedByName: null,
    approvedAt: null,
    varianceTol: '0.050',
    overTolerance: true,
    campaignOpen: true,
    ...overrides,
  };
}

function handlerSpy() {
  const seen: string[] = [];
  const handlers: CycleCountLineVerbHandlers = {
    onCount: () => seen.push('count'),
    onApprove: () => seen.push('approve'),
    onReject: () => seen.push('reject'),
  };
  return { seen, handlers };
}

describe('cycle-count-lines catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = CYCLECOUNTLINES_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of CYCLECOUNTLINES_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'cycle-count-lines', `${field.id} is not a line fact`);
      assert.ok(field.id.startsWith('cycle-count-lines.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the ELEVEN facts the seven retired cells painted, and no others', () => {
    assert.deepEqual(
      CYCLECOUNTLINES_FIELD_CATALOG.map((f) => f.id),
      [
        'cycle-count-lines.bin',
        'cycle-count-lines.sku',
        'cycle-count-lines.expected',
        'cycle-count-lines.counted',
        'cycle-count-lines.variance',
        'cycle-count-lines.status',
        'cycle-count-lines.tolerance',
        'cycle-count-lines.counted_by',
        'cycle-count-lines.counted_at',
        'cycle-count-lines.approved_by',
        'cycle-count-lines.approved_at',
      ],
    );
  });

  it('does NOT name `notes` — nothing has ever painted it', () => {
    for (const field of CYCLECOUNTLINES_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_LINE_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no cell paints`,
        );
        assert.ok(
          !field.id.endsWith(`.${unpainted}`),
          `${field.id} names an unpainted column`,
        );
      }
    }
    // And the resolver has nothing to say about it either.
    for (const unpainted of UNPAINTED_LINE_COLUMNS) {
      assert.equal(resolveCycleCountLinesSlotValue(row(), `cycle-count-lines.${unpainted}`), null);
    }
    // Nor does it cross the RSC boundary: the wire row has no such key.
    assert.ok(!(('notes' as string) in row()), 'notes crossed the RSC boundary');
  });

  it('product default parses, and the BIN is the identity', () => {
    const parsed = parseSlotLayout(CYCLECOUNTLINES_PRODUCT_LAYOUT, CYCLECOUNTLINES_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'cycle-count-lines.bin');
    // The count arithmetic plus who produced it — the four data columns the
    // compound chrome does not already own.
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      [
        'cycle-count-lines.expected',
        'cycle-count-lines.counted',
        'cycle-count-lines.variance',
        'cycle-count-lines.counted_by',
      ],
    );
    // The tolerance is the SKU's second line, never a second track.
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['cycle-count-lines.tolerance'],
    );
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('binds at most FOUR status tracks — the whole skeleton leaves no fifth', () => {
    assert.ok(
      CYCLECOUNTLINES_PRODUCT_LAYOUT.statusBindings.length <= 4,
      'a fifth status binding exceeds MAX_DEFAULT_VISIBLE_TRACKS',
    );
    // Stated as the ceiling rather than as the literal 4, so the reason
    // travels: the shared chrome mounts WHOLE and the dense ceiling is what is
    // left. The `select` gutter is structural and never counted.
    const visible = CYCLECOUNTLINES_COMPOUND_COLUMNS.filter((c) => c.key !== 'select');
    assert.equal(
      visible.length,
      MAX_DEFAULT_VISIBLE_TRACKS,
      'the product mount must sit exactly on the dense ceiling',
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      CYCLECOUNTLINES_PRODUCT_LAYOUT.identityFieldId,
      ...CYCLECOUNTLINES_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...CYCLECOUNTLINES_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = CYCLECOUNTLINES_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // Title, state pill and the two DATES lines paint three of these; the
    // fourth (`approved_by`) is the house form of the retired `tier: 'optional'`.
    assert.deepEqual(unbound, [
      'cycle-count-lines.sku',
      'cycle-count-lines.status',
      'cycle-count-lines.counted_at',
      'cycle-count-lines.approved_by',
      'cycle-count-lines.approved_at',
    ]);
    for (const id of unbound) {
      const field = CYCLECOUNTLINES_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('cycle-count-lines materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = CYCLECOUNTLINES_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      CYCLECOUNTLINES_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      CYCLECOUNTLINES_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      CYCLECOUNTLINES_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) =>
      CYCLECOUNTLINES_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'SKU');
    assert.equal(label('dates'), 'Counted at');
    // The skeleton's own word is already the retired header's.
    assert.equal(label('state'), 'Status');
    const identity = CYCLECOUNTLINES_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'cycle-count-lines.bin');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`slot-table-family.ts`). "Bin" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = cycleCountLinesCompoundColumnsFor({
      ...CYCLECOUNTLINES_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'cycle-count-lines.approved_by' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'cycle-count-lines.approved_by');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of CYCLECOUNTLINES_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key) || col.key === '_fill') {
        assert.equal(cycleCountLinesSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        cycleCountLinesSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(cycleCountLinesSortFactFor({ key: 'fulfillment' }), 'cycle-count-lines.bin');
    assert.equal(cycleCountLinesSortFactFor({ key: 'item' }), 'cycle-count-lines.sku');
    assert.equal(cycleCountLinesSortFactFor({ key: 'dates' }), 'cycle-count-lines.counted_at');
    assert.equal(cycleCountLinesSortFactFor({ key: 'state' }), 'cycle-count-lines.status');
  });
});

describe('cycle-count-lines resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of CYCLECOUNTLINES_FIELD_CATALOG) {
      assert.notEqual(
        resolveCycleCountLinesSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves the bin as `bin_name ?? #bin_id`, the retired identity face', () => {
    assert.deepEqual(resolveCycleCountLinesSlotValue(row(), 'cycle-count-lines.bin'), {
      kind: 'value',
      text: 'A-12-3',
    });
    assert.deepEqual(
      resolveCycleCountLinesSlotValue(row({ binName: null }), 'cycle-count-lines.bin'),
      { kind: 'value', text: '#301' },
    );
  });

  it('resolves both provenance facts as PERSONS, never as "by <name>" strings', () => {
    assert.deepEqual(resolveCycleCountLinesSlotValue(row(), 'cycle-count-lines.counted_by'), {
      kind: 'person',
      staffId: 17,
      name: 'David',
    });
    // A line nobody has decided yet still resolves — the person face draws the
    // absence rather than printing `#null`.
    assert.deepEqual(resolveCycleCountLinesSlotValue(row(), 'cycle-count-lines.approved_by'), {
      kind: 'person',
      staffId: null,
      name: null,
    });
  });

  it('keeps an UNCOUNTED line distinct from a zero variance', () => {
    const uncounted = row({ countedQty: null, variance: null, status: 'pending' });
    assert.deepEqual(
      resolveCycleCountLinesSlotValue(uncounted, 'cycle-count-lines.counted'),
      { kind: 'value', text: null },
    );
    assert.deepEqual(
      resolveCycleCountLinesSlotValue(uncounted, 'cycle-count-lines.variance'),
      { kind: 'value', text: null },
    );
    // Counted and correct is a different fact, and it says so.
    assert.deepEqual(
      resolveCycleCountLinesSlotValue(row({ countedQty: 60, variance: 0 }), 'cycle-count-lines.variance'),
      { kind: 'value', text: '0' },
    );
    // A surplus keeps its sign, which is the whole point of the column.
    assert.deepEqual(
      resolveCycleCountLinesSlotValue(row({ variance: 3 }), 'cycle-count-lines.variance'),
      { kind: 'value', text: '+3' },
    );
  });

  it('resolves stamps to the absolute instant, not a face', () => {
    assert.deepEqual(resolveCycleCountLinesSlotValue(row(), 'cycle-count-lines.counted_at'), {
      kind: 'value',
      text: '2026-09-11T18:22:04.000Z',
    });
  });

  it('resolves the status to the pill WORD, so sort and search match the face', () => {
    assert.deepEqual(resolveCycleCountLinesSlotValue(row(), 'cycle-count-lines.status'), {
      kind: 'value',
      text: 'Pending review',
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveCycleCountLinesSlotValue(row(), 'cycle-counts.name'), null);
  });
});

describe('cycle-count-lines verbs', () => {
  it('declares all THREE retired cell controls, and only those', () => {
    assert.deepEqual([...CYCLECOUNTLINES_VERB_KEYS], ['count', 'approve', 'reject']);
    const declared = new Set<string>();
    for (const status of ['pending', 'counted', 'pending_review', 'approved', 'rejected']) {
      for (const action of resolveCycleCountLineRowActions(row({ status }), handlerSpy().handlers)) {
        declared.add(action.key);
      }
    }
    assert.deepEqual([...declared].sort(), ['approve', 'count', 'reject']);
  });

  it('offers Count… only on a pending line, and it OPENS a plane', () => {
    const spy = handlerSpy();
    const actions = resolveCycleCountLineRowActions(row({ status: 'pending' }), spy.handlers);
    assert.deepEqual(
      actions.map((a) => a.key),
      ['count'],
    );
    // The label's ellipsis is the promise that a plane follows — a fixed-payload
    // verb would say "Count".
    assert.equal(actions[0]?.label, 'Count…');
    actions[0]?.onSelect();
    assert.deepEqual(spy.seen, ['count']);
  });

  it('offers the decision pair on counted and pending_review, Reject as danger', () => {
    for (const status of ['counted', 'pending_review']) {
      const actions = resolveCycleCountLineRowActions(row({ status }), handlerSpy().handlers);
      assert.deepEqual(
        actions.map((a) => a.key),
        ['approve', 'reject'],
        `${status} lost the admin decision`,
      );
      assert.equal(actions.find((a) => a.key === 'reject')?.tone, 'danger');
      // The retired Approve was a raw solid-green <button>; both verbs now
      // paint on the engine's trailing face.
      assert.ok(actions.every((a) => a.face === 'trailing'));
    }
  });

  it('offers NOTHING once the line is decided', () => {
    for (const status of ['approved', 'rejected']) {
      assert.deepEqual(resolveCycleCountLineRowActions(row({ status }), handlerSpy().handlers), []);
    }
  });

  it('verbs are ABSENT on a closed campaign, never disabled', () => {
    for (const status of ['pending', 'counted', 'pending_review']) {
      const actions = resolveCycleCountLineRowActions(
        row({ status, campaignOpen: false }),
        handlerSpy().handlers,
      );
      assert.deepEqual(actions, [], `${status} kept a verb after the campaign closed`);
    }
  });

  it('disables the decision pair only while that line is in flight', () => {
    const actions = resolveCycleCountLineRowActions(row(), {
      ...handlerSpy().handlers,
      isPending: (line) => line.id === 4412,
    });
    assert.ok(actions.every((a) => a.disabled === true));
    // …and not otherwise: in-flight is the only lawful `disabled` here.
    assert.ok(
      resolveCycleCountLineRowActions(row(), handlerSpy().handlers).every(
        (a) => a.disabled !== true,
      ),
    );
  });
});

describe('cycle-count-lines row view', () => {
  it('paints the SKU as the title and the bin as the identity handle', () => {
    const view = cycleCountLinesCompoundView(row());
    assert.equal(view.id, '4412');
    assert.equal(view.title, 'QC35-EARCUP-BLK');
    assert.equal(view.identityFace?.value, 'A-12-3');
    // The retired SKU cell was a <Link>; a compound row takes a title href.
    assert.equal(view.titleHref, '/inventory/health/sku/QC35-EARCUP-BLK');
    // No photo, no carrier, no marketplace, no money on a count line.
    assert.equal(view.thumbUrl, null);
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    // `tolerance` is the bound subtitle, so a note fallback must not fight it.
    assert.equal(view.note, null);
  });

  it('takes the TOLERANCE from the ROW and says it in the pill WORD', () => {
    // The fact travels on the line (the page threads it), so the adapter never
    // reaches for campaign state — this is the whole point of the two extra
    // row fields.
    const over = cycleCountLinesCompoundView(row({ overTolerance: true }));
    assert.equal(over.stateLabel, 'Pending review · over tol');
    assert.equal(over.stateTone, 'alert');
    assert.equal(over.stateTip, 'Δ -3 on 60 expected exceeds tol 0.050');

    const within = cycleCountLinesCompoundView(
      row({ status: 'counted', variance: -1, overTolerance: false }),
    );
    assert.equal(within.stateLabel, 'Counted');
    assert.equal(within.stateTip, undefined);
    // Tone is never the carrier of the tolerance fact — the word is.
    assert.equal(within.stateTone, 'neutral');
  });

  it('derives out-of-tolerance from the retired cell’s own arithmetic', () => {
    // |variance| > expected × tol, and a zero variance is never out of it.
    assert.equal(isCycleCountLineOverTolerance(-3, 60, '0.050'), false);
    assert.equal(isCycleCountLineOverTolerance(-4, 60, '0.050'), true);
    assert.equal(isCycleCountLineOverTolerance(0, 60, '0.000'), false);
    assert.equal(isCycleCountLineOverTolerance(null, 60, '0.050'), false);
    // A tolerance that does not parse gates nothing rather than flagging all.
    assert.equal(isCycleCountLineOverTolerance(9, 60, 'n/a'), false);
  });

  it('uses BOTH dates lines — counted on the Hash, decided on the Calendar', () => {
    const decided = cycleCountLinesCompoundView(
      row({ status: 'approved', approvedAt: '2026-09-12T09:02:00.000Z', overTolerance: false }),
    );
    assert.ok(decided.orderedAt?.label && !decided.orderedAt.label.includes(':'));
    assert.equal(decided.orderedAt?.dateKey?.length, 10);
    assert.ok(decided.orderedAt?.tip?.startsWith('Counted '));
    // This desk has no deadline, so the lateness vocabulary never applies and
    // the Calendar line carries the decision stamp through `faceLabel`.
    assert.equal(decided.delay?.overdue, false);
    assert.ok(decided.delay?.faceLabel);
    assert.ok(decided.delayTip?.startsWith('Approved '));
    assert.equal(decided.stateTone, 'done');
  });

  it('never invents a title, a stamp or a state for a malformed row', () => {
    const view = cycleCountLinesCompoundView(
      row({ sku: '  ', status: '', countedAt: '', approvedAt: 'not-a-date', overTolerance: false }),
    );
    assert.equal(view.title, 'Line #4412');
    assert.equal(view.titleHref, undefined);
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
    assert.equal(view.stateLabel, '');
  });
});
