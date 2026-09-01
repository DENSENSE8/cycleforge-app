import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterActionsForCsvOverride,
  matchListingRule,
  normalizeItemNumber,
  parseAssignActions,
  ruleMatchesFacts,
  selectActionsForTrigger,
  shouldPassAllocate,
  type AutomationRuleRow,
} from '@/lib/automations/listing-match';

describe('normalizeItemNumber', () => {
  it('uppercases and strips non-alphanumerics', () => {
    assert.equal(normalizeItemNumber(' 9m52-b2c4 '), '9M52B2C4');
  });
});

describe('ruleMatchesFacts', () => {
  it('matches on normalized item_number', () => {
    assert.equal(
      ruleMatchesFacts({ item_number: '9m52-b2c4' }, { item_number: '9M52B2C4' }),
      true,
    );
  });

  it('requires every present when key', () => {
    assert.equal(
      ruleMatchesFacts(
        { item_number: 'ABC', account_source: 'amazon' },
        { item_number: 'ABC', account_source: 'ebay' },
      ),
      false,
    );
  });

  it('rejects empty when (no catch-all without keys)', () => {
    assert.equal(ruleMatchesFacts({}, { item_number: 'ABC' }), false);
  });
});

describe('parseAssignActions', () => {
  it('keeps only valid assign_work rows', () => {
    const actions = parseAssignActions([
      { type: 'assign_work', work_type: 'TEST', staff_id: 7 },
      { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
      { type: 'notify', staff_id: 1 },
      { type: 'assign_work', work_type: 'TEST', staff_id: -1 },
    ]);
    assert.deepEqual(actions, [
      { type: 'assign_work', work_type: 'TEST', staff_id: 7 },
      { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
    ]);
  });
});

describe('matchListingRule', () => {
  const rules: AutomationRuleRow[] = [
    {
      id: 2,
      name: 'later',
      priority: 200,
      triggerKeys: ['order.imported'],
      whenJson: { item_number: 'ZZZ' },
      thenJson: [{ type: 'assign_work', work_type: 'TEST', staff_id: 99 }],
    },
    {
      id: 1,
      name: 'bose',
      priority: 100,
      triggerKeys: ['order.imported', 'order.item_number_set'],
      whenJson: { item_number: '9M52B2C4' },
      thenJson: [
        { type: 'assign_work', work_type: 'TEST', staff_id: 7 },
        { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
      ],
    },
  ];

  it('first-match-wins by priority order of the array', () => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
    const hit = matchListingRule(sorted, 'order.imported', { item_number: '9M52B2C4' });
    assert.ok(hit);
    assert.equal(hit!.rule.id, 1);
    assert.equal(hit!.actions.length, 2);
  });

  it('respects trigger key', () => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
    const hit = matchListingRule(sorted, 'unit.test_passed', { item_number: '9M52B2C4' });
    assert.equal(hit, null);
  });
});

describe('filterActionsForCsvOverride', () => {
  const actions = parseAssignActions([
    { type: 'assign_work', work_type: 'TEST', staff_id: 7 },
    { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
  ]);

  it('drops TEST when csv_assignee_tech is set', () => {
    const filtered = filterActionsForCsvOverride(actions, { csv_assignee_tech: true });
    assert.deepEqual(filtered.map((a) => a.work_type), ['PACK']);
  });

  it('drops PACK when csv_assignee_packer is set', () => {
    const filtered = filterActionsForCsvOverride(actions, { csv_assignee_packer: true });
    assert.deepEqual(filtered.map((a) => a.work_type), ['TEST']);
  });
});

describe('selectActionsForTrigger', () => {
  const actions = parseAssignActions([
    { type: 'assign_work', work_type: 'TEST', staff_id: 7 },
    { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
  ]);

  it('keeps TEST on order.imported', () => {
    assert.deepEqual(
      selectActionsForTrigger(actions, 'order.imported').map((a) => a.work_type),
      ['TEST'],
    );
  });

  it('keeps TEST on order.item_number_set', () => {
    assert.deepEqual(
      selectActionsForTrigger(actions, 'order.item_number_set').map((a) => a.work_type),
      ['TEST'],
    );
  });

  it('keeps PACK on unit.test_passed', () => {
    assert.deepEqual(
      selectActionsForTrigger(actions, 'unit.test_passed').map((a) => a.work_type),
      ['PACK'],
    );
  });
});

describe('shouldPassAllocate', () => {
  it('only PASS attempts allocate', () => {
    assert.equal(shouldPassAllocate('PASS'), true);
    assert.equal(shouldPassAllocate('TEST_AGAIN'), false);
    assert.equal(shouldPassAllocate('TESTING_FAILED'), false);
  });
});
