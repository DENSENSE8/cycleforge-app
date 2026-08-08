/**
 * Unified repair-service identify (Arrival · Unbox · Walk-in).
 * One host module; carton Order # display contract after link.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  isRepairServiceLinked,
  repairServiceIdentityShowsOrder,
  repairServiceLinkedOrderId,
} from '@/lib/receiving/repair-service-identify';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

const ROOT = process.cwd();
const HOST = join(
  ROOT,
  'src/components/receiving/workspace/line-edit/RepairServiceIdentify.tsx',
);
const HUB = join(
  ROOT,
  'src/components/receiving/workspace/line-edit/CartonMatchHub.tsx',
);
const CLASSIFY = join(
  ROOT,
  'src/components/receiving/triage/TriageClassifySection.tsx',
);

function stubRow(partial: Partial<ReceivingLineRow>): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 10,
    sku: null,
    item_name: 'Repair item',
    image_url: null,
    source_platform: null,
    created_at: null,
    ...partial,
  } as ReceivingLineRow;
}

describe('RepairServiceIdentify host (shared module)', () => {
  it('exports RepairServiceIdentify and composes EcwidProductSearchInline repair_service', () => {
    const src = readFileSync(HOST, 'utf8');
    assert.match(src, /export function RepairServiceIdentify/);
    assert.match(src, /EcwidProductSearchInline/);
    assert.match(src, /popoverMode="repair_service"/);
    assert.match(src, /data-testid="repair-service-identify"/);
  });

  it('CartonMatchHub Store avenue mounts RepairServiceIdentify (no inline Ecwid twin)', () => {
    const hub = readFileSync(HUB, 'utf8');
    assert.match(hub, /RepairServiceIdentify/);
    assert.match(hub, /from ['"]@\/components\/receiving\/workspace\/line-edit\/RepairServiceIdentify['"]/);
    // Store body must not mount EcwidProductSearchInline directly.
    assert.doesNotMatch(hub, /tab === 'ecwid'[\s\S]{0,200}?EcwidProductSearchInline/);
  });

  it('TriageClassifySection mounts the same RepairServiceIdentify module', () => {
    const classify = readFileSync(CLASSIFY, 'utf8');
    assert.match(classify, /RepairServiceIdentify/);
    assert.match(
      classify,
      /from ['"]@\/components\/receiving\/workspace\/line-edit\/RepairServiceIdentify['"]/,
    );
  });

  it('TriageClassifySection does not mount useUnmatchedItems (identify-only API)', () => {
    const classify = readFileSync(CLASSIFY, 'utf8');
    assert.doesNotMatch(
      classify,
      /useUnmatchedItems\s*\(/,
      'Classify must not dual-mount the unmatched controller (GET + setLines flash)',
    );
    assert.match(
      classify,
      /addUnmatchedLine/,
      'Classify identify must call the shared addUnmatchedLine client',
    );
  });
});

describe('repair-service identify display contract', () => {
  it('detects Ecwid-derived linked cartons', () => {
    assert.equal(
      isRepairServiceLinked(
        stubRow({
          source_platform: 'ecwid',
          zoho_purchaseorder_number: '12345',
          zoho_purchaseorder_id: null,
        }),
      ),
      true,
    );
    assert.equal(
      repairServiceLinkedOrderId(
        stubRow({
          source_platform: 'ecwid',
          zoho_purchaseorder_number: '12345',
        }),
      ),
      '12345',
    );
    assert.equal(
      isRepairServiceLinked(
        stubRow({
          source_platform: 'ecwid',
          zoho_purchaseorder_number: '12345',
          zoho_purchaseorder_id: 'zoho-1',
        }),
      ),
      false,
    );
  });

  it('identity shows Order + # after repair link (not PO / empty)', () => {
    const linked = stubRow({
      source_platform: 'ecwid',
      zoho_purchaseorder_number: '98765',
      zoho_purchaseorder_id: null,
      inbound_source_type: null,
      receiving_source: 'zoho_po',
    });
    assert.equal(repairServiceIdentityShowsOrder(linked, () => 'ECWID-RS'), true);

    const unmatched = stubRow({
      source_platform: null,
      zoho_purchaseorder_number: null,
      receiving_source: 'unmatched',
    });
    assert.equal(repairServiceIdentityShowsOrder(unmatched), false);
  });
});
