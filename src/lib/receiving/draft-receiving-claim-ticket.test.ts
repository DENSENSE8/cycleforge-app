import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftReceivingClaimTicket,
  type DraftReceivingClaimTicketDeps,
} from './draft-receiving-claim-ticket';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org_test' as OrgId;

function fakes(opts?: {
  template?: { subject: string; description: string; poNumber: string | null; tracking: string | null };
  draft?: { subject: string; description: string };
}) {
  const cap: {
    templates: unknown[];
    drafts: unknown[];
  } = { templates: [], drafts: [] };

  const deps: DraftReceivingClaimTicketDeps = {
    buildTemplate: async (input, orgId) => {
      cap.templates.push({ input, orgId });
      return (
        opts?.template ?? {
          subject: 'eBay // Damage // PO 99',
          description: 'PO: 99\nTracking: 1Z',
          poNumber: '99',
          tracking: '1Z',
        }
      );
    },
    draftWithLlm: async (orgId, input) => {
      cap.drafts.push({ orgId, input });
      return {
        subject: opts?.draft?.subject ?? 'Clearer subject',
        description: opts?.draft?.description ?? 'Clearer body with PO 99 and 1Z',
        model: 'hermes-agent',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
      };
    },
  };

  return { deps, cap };
}

test('live subject+body skip the template rebuild and go to Hermes', async () => {
  const { deps, cap } = fakes({
    draft: { subject: 'Rewritten', description: 'Body still has SN-1' },
  });
  const out = await draftReceivingClaimTicket(
    ORG,
    {
      receivingId: 7,
      claimType: 'damage',
      subject: 'Raw subject',
      description: 'Serial: SN-1',
    },
    deps,
  );

  assert.equal(cap.templates.length, 0);
  assert.equal(cap.drafts.length, 1);
  assert.equal(cap.drafts[0].orgId, ORG);
  assert.equal(cap.drafts[0].input.context, 'Receiving claim — Damage');
  assert.deepEqual(cap.drafts[0].input.template, {
    subject: 'Raw subject',
    description: 'Serial: SN-1',
  });
  assert.equal(out.degraded, false);
  assert.equal(out.subject, 'Rewritten');
  assert.equal(out.model, 'hermes-agent');
});

test('empty live fields rebuild the server template then draft', async () => {
  const { deps, cap } = fakes();
  const out = await draftReceivingClaimTicket(
    ORG,
    { receivingId: 7, lineId: 3, claimType: 'return', poReceivingLink: 'https://x/carton/7' },
    deps,
  );

  assert.equal(cap.templates.length, 1);
  assert.equal(cap.templates[0].orgId, ORG);
  assert.equal(cap.templates[0].input.receivingId, 7);
  assert.equal(cap.templates[0].input.lineId, 3);
  assert.equal(cap.templates[0].input.claimType, 'return');
  assert.equal(cap.drafts.length, 1);
  assert.equal(out.degraded, false);
  assert.match(out.description, /PO 99/);
});

test('dropped PO/tracking facts fall back to the template and flag degraded', async () => {
  const { deps } = fakes({
    draft: { subject: 'Oops', description: 'No identifiers survived' },
  });
  const out = await draftReceivingClaimTicket(
    ORG,
    { receivingId: 7, claimType: 'damage' },
    deps,
  );

  assert.equal(out.degraded, true);
  assert.equal(out.subject, 'eBay // Damage // PO 99');
  assert.equal(out.description, 'PO: 99\nTracking: 1Z');
});
