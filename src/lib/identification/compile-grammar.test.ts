import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { performance } from 'node:perf_hooks';

import {
  classifyIdentificationScan,
  compileIdentificationGrammar,
  IdentificationGrammarError,
} from './compile-grammar';
import {
  getIdentificationJob,
  identificationFromPublishedClaim,
  fillIdentificationPath,
  publishTenantIdentificationJob,
  resetTenantIdentificationJobsForTests,
} from './jobs';

const rmaGrammar = {
  jobId: 'acme_rma',
  entityKind: 'order' as const,
  mutate: null,
  claimPath: '/m/id/acme_rma/{entityId}',
  sessionPath: '/m/id/acme_rma/{entityId}',
  patterns: [{ kind: 'prefix' as const, prefix: 'RMA-' }],
};

describe('compileIdentificationGrammar', () => {
  it('rejects house job ids', () => {
    assert.throws(
      () =>
        compileIdentificationGrammar({
          ...rmaGrammar,
          jobId: 'scan_out',
        }),
      IdentificationGrammarError,
    );
  });

  it('classifies a prefix and validates the hit with Zod', () => {
    const compiled = compileIdentificationGrammar(rmaGrammar);
    assert.deepEqual(compiled.classify('RMA-42'), { jobId: 'acme_rma', entityId: '42' });
    assert.equal(compiled.classify('RMA-'), null);
    assert.equal(compiled.classify('SO-42'), null);
    assert.equal(compiled.record.claimPath('42'), '/m/id/acme_rma/42');
  });

  it('classifies a capturing regex', () => {
    const compiled = compileIdentificationGrammar({
      ...rmaGrammar,
      jobId: 'vendor_po',
      patterns: [{ kind: 'regex', source: '^VP-(\\d+)$', entityGroup: 1 }],
    });
    assert.deepEqual(compiled.classify('VP-99'), { jobId: 'vendor_po', entityId: '99' });
    assert.equal(compiled.classify('VP-XX'), null);
  });
});

describe('classifyIdentificationScan', () => {
  it('returns the first matching published method; unknown raw is null', () => {
    const methods = [compileIdentificationGrammar(rmaGrammar)];
    assert.deepEqual(classifyIdentificationScan('RMA-7', methods), {
      jobId: 'acme_rma',
      entityId: '7',
    });
    assert.equal(classifyIdentificationScan('U-1', methods), null);
  });

  it('p95 classify stays under 150ms locally (no LLM)', () => {
    const methods = [compileIdentificationGrammar(rmaGrammar)];
    const samples: number[] = [];
    for (let i = 0; i < 400; i++) {
      const t0 = performance.now();
      classifyIdentificationScan(i % 2 === 0 ? 'RMA-1001' : 'NOPE-1', methods);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
    assert.ok(p95 < 150, `p95 ${p95}ms`);
  });
});

describe('getIdentificationJob tenant publish', () => {
  beforeEach(() => {
    resetTenantIdentificationJobsForTests();
  });

  it('unknown id is null; published tenant id resolves', () => {
    assert.equal(getIdentificationJob('no_such_job'), null);
    const compiled = compileIdentificationGrammar(rmaGrammar);
    publishTenantIdentificationJob(compiled.record);
    assert.equal(getIdentificationJob('acme_rma')?.origin, 'tenant');
    assert.equal(getIdentificationJob('scan_out')?.origin, 'house');
  });

  it('cannot overlay a house id', () => {
    assert.throws(() =>
      publishTenantIdentificationJob({
        id: 'pick',
        origin: 'tenant',
        entityKind: 'order',
        mutate: null,
        claimPath: () => '/x',
        sessionPath: () => '/x',
      }),
    );
  });

  it('published claim mapper is ready; empty entity is miss', () => {
    const compiled = compileIdentificationGrammar(rmaGrammar);
    const ready = identificationFromPublishedClaim({
      organizationId: 'org-1',
      clientEventId: 'e1',
      record: compiled.record,
      entityId: '42',
    });
    assert.equal(ready.face.state, 'ready');
    assert.equal(ready.job, 'acme_rma');
    assert.equal(ready.source, 'claim');
    const miss = identificationFromPublishedClaim({
      organizationId: 'org-1',
      clientEventId: 'e2',
      record: compiled.record,
      entityId: '',
    });
    assert.equal(miss.face.state, 'miss');
    assert.equal(fillIdentificationPath('/m/id/acme_rma/{entityId}', '42'), '/m/id/acme_rma/42');
  });
});
