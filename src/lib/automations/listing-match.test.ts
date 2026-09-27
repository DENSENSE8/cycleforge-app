import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterActionsForCsvOverride,
  matchListingRule,
  normalizeItemNumber,
  normalizeSku,
  parseAssignActions,
  resolveActionAssignee,
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

describe('normalizeSku', () => {
  it('trims and uppercases, keeping punctuation', () => {
    assert.equal(normalizeSku('  abc-12/x '), 'ABC-12/X');
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

  it('compares sku normalized (trim + case)', () => {
    assert.equal(
      ruleMatchesFacts({ item_number: 'ABC', sku: ' red-1 ' }, { item_number: 'abc', sku: 'RED-1' }),
      true,
    );
  });
});

describe('parseAssignActions', () => {
  it('keeps only valid assign_work rows', () => {
    const actions = parseAssignActions([
      { type: 'assign_work', work_type: 'PICK', staff_id: 7 },
      { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
      { type: 'notify', staff_id: 1 },
      { type: 'assign_work', work_type: 'PICK', staff_id: -1 },
    ]);
    assert.deepEqual(actions, [
      { type: 'assign_work', work_type: 'PICK', staff_id: 7 },
      { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
    ]);
  });

  it('parses a backup_staff_id', () => {
    assert.deepEqual(
      parseAssignActions([{ type: 'assign_work', work_type: 'PACK', staff_id: 12, backup_staff_id: 13 }]),
      [{ type: 'assign_work', work_type: 'PACK', staff_id: 12, backup_staff_id: 13 }],
    );
  });

  it('drops a backup equal to the primary but keeps the action', () => {
    assert.deepEqual(
      parseAssignActions([{ type: 'assign_work', work_type: 'PICK', staff_id: 7, backup_staff_id: 7 }]),
      [{ type: 'assign_work', work_type: 'PICK', staff_id: 7 }],
    );
  });

  it('drops an invalid backup but keeps the action', () => {
    const actions = parseAssignActions([
      { type: 'assign_work', work_type: 'PICK', staff_id: 7, backup_staff_id: -3 },
      { type: 'assign_work', work_type: 'PICK', staff_id: 7, backup_staff_id: 'abc' },
      { type: 'assign_work', work_type: 'PICK', staff_id: 7, backup_staff_id: 2.5 },
      { type: 'assign_work', work_type: 'PICK', staff_id: 7, backup_staff_id: 0 },
    ]);
    assert.deepEqual(actions, Array(4).fill({ type: 'assign_work', work_type: 'PICK', staff_id: 7 }));
  });
});

describe('resolveActionAssignee', () => {
  const withBackup = { type: 'assign_work', work_type: 'PACK', staff_id: 12, backup_staff_id: 13 } as const;
  const noBackup = { type: 'assign_work', work_type: 'PICK', staff_id: 7 } as const;

  it('primary when the primary is in', () => {
    assert.deepEqual(resolveActionAssignee(withBackup, new Set([13])), { staffId: 12, via: 'primary' });
  });

  it('backup when the primary is out', () => {
    assert.deepEqual(resolveActionAssignee(withBackup, new Set([12])), { staffId: 13, via: 'backup' });
  });

  it('null when primary and backup are both out', () => {
    assert.equal(resolveActionAssignee(withBackup, new Set([12, 13])), null);
  });

  it('null when the primary is out and there is no backup', () => {
    assert.equal(resolveActionAssignee(noBackup, new Set([7])), null);
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
      thenJson: [{ type: 'assign_work', work_type: 'PICK', staff_id: 99 }],
    },
    {
      id: 1,
      name: 'bose',
      priority: 100,
      triggerKeys: ['order.imported', 'order.item_number_set'],
      whenJson: { item_number: '9M52B2C4' },
      thenJson: [
        { type: 'assign_work', work_type: 'PICK', staff_id: 7 },
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

describe('matchListingRule — (item #, SKU) pair precedence', () => {
  const assign = (tech: number, packer: number) => [
    { type: 'assign_work', work_type: 'PICK', staff_id: tech },
    { type: 'assign_work', work_type: 'PACK', staff_id: packer },
  ];
  const triggers = ['order.imported', 'order.item_number_set', 'unit.test_passed'];
  // Sorted priority ASC: the wildcard outranks both pair rules by number.
  const rules: AutomationRuleRow[] = [
    {
      id: 1,
      name: 'Listing 9M52B2C4',
      priority: 10,
      triggerKeys: triggers,
      whenJson: { item_number: '9M52B2C4' },
      thenJson: assign(1, 2),
    },
    {
      id: 2,
      name: 'Listing 9M52B2C4 · BLK',
      priority: 100,
      triggerKeys: triggers,
      whenJson: { item_number: '9M52B2C4', sku: 'BLK' },
      thenJson: assign(3, 4),
    },
    {
      id: 3,
      name: 'Listing 9M52B2C4 · WHT',
      priority: 100,
      triggerKeys: triggers,
      whenJson: { item_number: '9M52B2C4', sku: 'WHT' },
      thenJson: assign(5, 6),
    },
  ];

  it('pair rule beats the item-#-only wildcard despite a worse priority', () => {
    const hit = matchListingRule(rules, 'order.imported', { item_number: '9m52-b2c4', sku: 'BLK' });
    assert.equal(hit?.rule.id, 2);
    assert.deepEqual(
      hit?.actions.map((a) => a.staff_id),
      [3, 4],
    );
  });

  it('two SKUs on one item # route to their own pair rules', () => {
    const hit = matchListingRule(rules, 'order.imported', { item_number: '9M52B2C4', sku: 'WHT' });
    assert.equal(hit?.rule.id, 3);
  });

  it('wildcard still matches a SKU with no pair rule', () => {
    const hit = matchListingRule(rules, 'order.imported', { item_number: '9M52B2C4', sku: 'RED' });
    assert.equal(hit?.rule.id, 1);
  });

  it('wildcard matches an order line with no SKU', () => {
    const hit = matchListingRule(rules, 'order.imported', { item_number: '9M52B2C4', sku: null });
    assert.equal(hit?.rule.id, 1);
  });

  it('pair rule never matches a different SKU', () => {
    const pairsOnly = rules.filter((r) => r.id !== 1);
    assert.equal(
      matchListingRule(pairsOnly, 'order.imported', { item_number: '9M52B2C4', sku: 'RED' }),
      null,
    );
    assert.equal(
      matchListingRule(pairsOnly, 'order.imported', { item_number: '9M52B2C4', sku: null }),
      null,
    );
  });

  it('pair match compares SKU normalized', () => {
    const hit = matchListingRule(rules, 'order.imported', { item_number: '9M52B2C4', sku: ' blk ' });
    assert.equal(hit?.rule.id, 2);
  });

  it('a pair rule without actions does not shadow the wildcard', () => {
    const withEmptyPair = rules.map((r) => (r.id === 2 ? { ...r, thenJson: [] } : r));
    const hit = matchListingRule(withEmptyPair, 'order.imported', { item_number: '9M52B2C4', sku: 'BLK' });
    assert.equal(hit?.rule.id, 1);
  });
});

describe('filterActionsForCsvOverride', () => {
  const actions = parseAssignActions([
    { type: 'assign_work', work_type: 'PICK', staff_id: 7 },
    { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
  ]);

  it('drops PICK when csv_assignee_picker is set', () => {
    const filtered = filterActionsForCsvOverride(actions, { csv_assignee_picker: true });
    assert.deepEqual(filtered.map((a) => a.work_type), ['PACK']);
  });

  it('drops PACK when csv_assignee_packer is set', () => {
    const filtered = filterActionsForCsvOverride(actions, { csv_assignee_packer: true });
    assert.deepEqual(filtered.map((a) => a.work_type), ['PICK']);
  });
});

describe('selectActionsForTrigger', () => {
  const actions = parseAssignActions([
    { type: 'assign_work', work_type: 'PICK', staff_id: 7 },
    { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
  ]);

  it('runs PICK and PACK on order.imported', () => {
    assert.deepEqual(
      selectActionsForTrigger(actions, 'order.imported').map((a) => a.work_type),
      ['PICK', 'PACK'],
    );
  });

  it('runs PICK and PACK on order.item_number_set', () => {
    assert.deepEqual(
      selectActionsForTrigger(actions, 'order.item_number_set').map((a) => a.work_type),
      ['PICK', 'PACK'],
    );
  });

  it('keeps PACK on unit.test_passed', () => {
    assert.deepEqual(
      selectActionsForTrigger(actions, 'unit.test_passed').map((a) => a.work_type),
      ['PACK'],
    );
  });

  it('drops PICK and PACK on identification.completed', () => {
    assert.deepEqual(selectActionsForTrigger(actions, 'identification.completed'), []);
  });
});

describe('shouldPassAllocate', () => {
  it('only PASS attempts allocate', () => {
    assert.equal(shouldPassAllocate('PASS'), true);
    assert.equal(shouldPassAllocate('TEST_AGAIN'), false);
    assert.equal(shouldPassAllocate('TESTING_FAILED'), false);
  });
});
