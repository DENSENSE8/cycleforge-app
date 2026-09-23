import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assistantArtifactCsv,
  assistantArtifactFilename,
  assistantArtifacts,
  extractAssistantTables,
} from './chat-artifacts';

describe('assistant chat artifacts', () => {
  it('promotes a settled local-model markdown table into a bounded artifact', () => {
    const [artifact] = extractAssistantTables(
      'Orders ready to pack\n\n| Order | SKU | Qty |\n| --- | --- | ---: |\n| 42 | AV35, black | 2 |',
      'm-1',
    );

    assert.equal(artifact?.id, 'm-1:table:0');
    assert.equal(artifact?.title, 'Orders ready to pack');
    assert.deepEqual(artifact?.columns, ['Order', 'SKU', 'Qty']);
    assert.deepEqual(artifact?.rows[0], { Order: '42', SKU: 'AV35, black', Qty: '2' });
  });

  it('does not render a partial streaming table', () => {
    const artifacts = assistantArtifacts([
      {
        id: 'm-stream',
        role: 'assistant',
        content: '| A | B |\n| --- | --- |\n| 1 | 2 |',
        streaming: true,
      },
    ]);
    assert.deepEqual(artifacts, []);
  });

  it('adapts structured database answers without a workflow-specific renderer', () => {
    const artifacts = assistantArtifacts([
      {
        id: 'm-2',
        role: 'assistant',
        content: 'Tuan packed seven.',
        analysis: {
          kind: 'shipping_summary',
          title: 'Packing pace',
          summary: 'Current packing pace.',
          confidence: 'high',
          modeLabel: 'Local Ops Query',
          breakdownTitle: 'Packer breakdown',
          breakdown: [{ id: 'staff-1', label: 'Tuan', value: 7, detail: 'orders' }],
          sources: [{ id: 'packing', label: 'packer_logs' }],
        },
      },
    ]);

    assert.equal(artifacts[0]?.title, 'Packer breakdown');
    assert.deepEqual(artifacts[0]?.rows[0], { Name: 'Tuan', Value: 7, Details: 'orders' });
  });

  it('uses the shared RFC-4180 serializer and a safe file name', () => {
    const artifact = extractAssistantTables(
      '| Product | Note |\n| --- | --- |\n| AV35 | 6" driver, red |',
      'm-3',
    )[0]!;
    assert.equal(assistantArtifactCsv(artifact), 'Product,Note\r\nAV35,"6"" driver, red"');
    assert.equal(assistantArtifactFilename('Orders / Ready: Today'), 'orders-ready-today.csv');
  });

  it('strips invisible direction controls before display or export', () => {
    const artifact = extractAssistantTables(
      '| SKU | Price |\n| --- | --- |\n| AV35\u202E | $500 |',
      'm-4',
    )[0]!;
    assert.equal(artifact.rows[0]?.SKU, 'AV35');
  });
});
