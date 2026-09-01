import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AutomationRuleCreateBody,
  AutomationRuleUpdateBody,
} from '@/lib/schemas/automations';

describe('AutomationRuleCreateBody', () => {
  it('accepts a listing→staff rule', () => {
    const parsed = AutomationRuleCreateBody.parse({
      name: 'Bose Wave IV → Michael',
      when: { item_number: '9M52B2C4' },
      then: [
        { type: 'assign_work', work_type: 'TEST', staff_id: 7 },
        { type: 'assign_work', work_type: 'PACK', staff_id: 12 },
      ],
    });
    assert.equal(parsed.when.item_number, '9M52B2C4');
    assert.equal(parsed.then.length, 2);
  });

  it('rejects when without item_number or sku_catalog_id', () => {
    assert.throws(() =>
      AutomationRuleCreateBody.parse({
        name: 'bad',
        when: { sku: 'ONLY' },
        then: [{ type: 'assign_work', work_type: 'TEST', staff_id: 1 }],
      }),
    );
  });

  it('rejects empty then', () => {
    assert.throws(() =>
      AutomationRuleCreateBody.parse({
        name: 'bad',
        when: { item_number: 'X' },
        then: [],
      }),
    );
  });
});

describe('AutomationRuleUpdateBody', () => {
  it('rejects empty patch', () => {
    assert.throws(() => AutomationRuleUpdateBody.parse({}));
  });

  it('accepts enabled toggle', () => {
    const parsed = AutomationRuleUpdateBody.parse({ enabled: false });
    assert.equal(parsed.enabled, false);
  });
});
