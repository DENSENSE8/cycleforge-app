import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileIdentificationGrammar, IdentificationGrammarError } from './compile-grammar';
import {
  authorIdentificationGrammar,
  authorIdentificationGrammarDeterministic,
} from './author';

describe('authorIdentificationGrammarDeterministic', () => {
  it('authors the same Zod body a human would, then compiles', () => {
    const grammar = authorIdentificationGrammarDeterministic(
      'Barcodes start with RMA- then the order id. job id acme_rma',
    );
    assert.equal(grammar.jobId, 'acme_rma');
    assert.deepEqual(grammar.patterns[0], { kind: 'prefix', prefix: 'RMA-' });
    const compiled = compileIdentificationGrammar(grammar);
    assert.deepEqual(compiled.classify('RMA-42'), { jobId: 'acme_rma', entityId: '42' });
  });

  it('rejects house job ids in the brief', () => {
    assert.throws(
      () =>
        authorIdentificationGrammarDeterministic(
          'Barcodes start with SO- then the order. job id scan_out',
        ),
      IdentificationGrammarError,
    );
  });
});

describe('authorIdentificationGrammar', () => {
  it('uses AI JSON when generateJson returns valid grammar', async () => {
    const out = await authorIdentificationGrammar('ignored because generate wins xx', async () => ({
      jobId: 'vendor_rma',
      entityKind: 'order',
      mutate: null,
      claimPath: '/m/id/vendor_rma/{entityId}',
      sessionPath: '/m/id/vendor_rma/{entityId}',
      patterns: [{ kind: 'prefix', prefix: 'VR-' }],
    }));
    assert.equal(out.source, 'ai');
    assert.equal(out.grammar.jobId, 'vendor_rma');
    compileIdentificationGrammar(out.grammar);
  });

  it('falls back to deterministic when generateJson fails', async () => {
    const out = await authorIdentificationGrammar(
      'prefix RMA- then the order id job acme_rma',
      async () => {
        throw new Error('model down');
      },
    );
    assert.equal(out.source, 'deterministic');
    assert.equal(out.grammar.jobId, 'acme_rma');
  });
});
