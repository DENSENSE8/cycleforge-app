/**
 * DB-free tests for receiving-claim NAS archive.
 * Run: `node --test --require ./scripts/register-server-only-shim.cjs --import tsx src/lib/receiving-claim-archive.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveReceivingClaimPhotos,
  claimArchiveResponseFields,
  type ArchiveReceivingClaimPhotosDeps,
} from './receiving-claim-archive';
import { parseOrgSettings, type OrgSettings } from '@/lib/tenancy/settings';
import { claimAttachmentFileLabel } from '@/lib/zendesk-claim-template';

const ORG = 'org-1';
const SETTINGS = parseOrgSettings({});

type AgentCall = Parameters<ArchiveReceivingClaimPhotosDeps['archiveViaAgent']>[0];
type FolderCall = Parameters<ArchiveReceivingClaimPhotosDeps['archiveToFolder']>[0];

interface Captured {
  listed: Array<{ orgId: string; receivingId: number }>;
  resolved: Array<{ photoId: number; organizationId: string }>;
  orgs: string[];
  nasTargets: Array<{ key: string }>;
  agent: AgentCall[];
  folder: FolderCall[];
}

function fakes(opts: {
  photoIds?: number[];
  urls?: Record<number, string | null>;
  agentResult?: { folder: string; copied: number; total: number } | null;
  agentThrow?: Error;
  folderResult?: { folder: string; copied: number; total: number } | null;
  agentEnv?: { hasUrl: boolean; hasToken: boolean };
  orgThrow?: Error;
}): { deps: ArchiveReceivingClaimPhotosDeps; cap: Captured } {
  const photoIds = opts.photoIds ?? [11, 12, 13];
  const cap: Captured = {
    listed: [],
    resolved: [],
    orgs: [],
    nasTargets: [],
    agent: [],
    folder: [],
  };
  const deps: ArchiveReceivingClaimPhotosDeps = {
    listPhotoIds: async (orgId, receivingId) => {
      cap.listed.push({ orgId, receivingId });
      return photoIds;
    },
    resolvePhotoUrl: async (photoId, organizationId) => {
      cap.resolved.push({ photoId, organizationId });
      if (opts.urls && Object.prototype.hasOwnProperty.call(opts.urls, photoId)) {
        return opts.urls[photoId] ?? null;
      }
      return `https://photos.test/${photoId}.jpg`;
    },
    getOrganization: async (orgId) => {
      if (opts.orgThrow) throw opts.orgThrow;
      cap.orgs.push(orgId);
      return { settings: SETTINGS };
    },
    getNasStorageTarget: (settings: OrgSettings, key) => {
      cap.nasTargets.push({ key });
      assert.equal(settings, SETTINGS);
      return { root: '/Volumes/NAS', folder: '2 Zendesk 2026' };
    },
    archiveViaAgent: async (input) => {
      cap.agent.push(input);
      if (opts.agentThrow) throw opts.agentThrow;
      return opts.agentResult === undefined
        ? { folder: `/nas/${input.ticketId}`, copied: input.photos.length, total: input.photos.length }
        : opts.agentResult;
    },
    archiveToFolder: async (input) => {
      cap.folder.push(input);
      return opts.folderResult === undefined
        ? { folder: `/local/${input.ticketId}`, copied: input.photos.length, total: input.photos.length }
        : opts.folderResult;
    },
    agentEnv: () => opts.agentEnv ?? { hasUrl: true, hasToken: true },
  };
  return { deps, cap };
}

const baseArgs = {
  orgId: ORG,
  receivingId: 88,
  ticketId: 4821,
  info: 'ticket info',
  logTag: 'archive-test',
};

test('archiveReceivingClaimPhotos: happy path archives ALL photos under the ticket id', async () => {
  const { deps, cap } = fakes({});
  const out = await archiveReceivingClaimPhotos(baseArgs, deps);

  assert.equal(out.archiveOk, true);
  assert.equal(out.archiveWarning, null);
  assert.equal(out.folder, '/nas/4821');
  assert.equal(out.copied, 3);
  assert.equal(out.total, 3);
  assert.equal(out.photoIdCount, 3);
  assert.equal(out.resolvedCount, 3);
  assert.equal(out.usedAgent, true);

  assert.deepEqual(cap.listed, [{ orgId: ORG, receivingId: 88 }]);
  assert.equal(cap.resolved.length, 3);
  assert.ok(cap.resolved.every((r) => r.organizationId === ORG));
  assert.deepEqual(cap.orgs, [ORG]);
  assert.deepEqual(cap.nasTargets, [{ key: 'claims' }]);

  assert.equal(cap.agent.length, 1);
  assert.equal(cap.folder.length, 0, 'agent path must not also write the local mount');
  const call = cap.agent[0];
  assert.equal(call.ticketId, 4821);
  assert.equal(call.organizationId, ORG);
  assert.equal(call.archiveRoot, '/Volumes/NAS');
  assert.equal(call.archiveFolder, '2 Zendesk 2026');
  assert.deepEqual(
    call.photos.map((p) => p.url),
    ['https://photos.test/11.jpg', 'https://photos.test/12.jpg', 'https://photos.test/13.jpg'],
  );
  assert.equal(call.info, 'ticket info');

  assert.deepEqual(claimArchiveResponseFields(out), {
    archiveWarning: null,
    archiveOk: true,
    archiveCopied: 3,
    archiveTotal: 3,
    archiveFolder: '/nas/4821',
  });
});

test('archiveReceivingClaimPhotos: info builder sees photo counts; unresolved urls warn', async () => {
  let infoCtx: { photoIdCount: number; resolvedCount: number } | null = null;
  const { deps, cap } = fakes({
    urls: { 11: 'https://photos.test/11.jpg', 12: null, 13: 'https://photos.test/13.jpg' },
  });
  const out = await archiveReceivingClaimPhotos(
    {
      ...baseArgs,
      info: (ctx) => {
        infoCtx = ctx;
        return `ids=${ctx.photoIdCount} resolved=${ctx.resolvedCount}`;
      },
    },
    deps,
  );

  assert.deepEqual(infoCtx, { photoIdCount: 3, resolvedCount: 2 });
  assert.equal(out.archiveOk, false);
  assert.match(out.archiveWarning ?? '', /Only 2 of 3 photos archived/);
  assert.equal(cap.agent[0]?.info, 'ids=3 resolved=2');
  assert.equal(cap.agent[0]?.photos.length, 2);
});

test('archiveReceivingClaimPhotos: agent throw maps to warning and does not throw', async () => {
  const { deps, cap } = fakes({ agentThrow: new Error('tunnel down') });
  const out = await archiveReceivingClaimPhotos(baseArgs, deps);

  assert.equal(out.archiveOk, false);
  assert.equal(out.folder, null);
  assert.equal(out.failReason, 'tunnel down');
  assert.equal(out.archiveWarning, 'NAS archive failed: tunnel down');
  assert.equal(cap.folder.length, 0);
  assert.deepEqual(claimArchiveResponseFields(out), {
    archiveWarning: 'NAS archive failed: tunnel down',
    archiveOk: false,
    archiveCopied: 0,
    archiveTotal: 0,
    archiveFolder: null,
  });
});

test('archiveReceivingClaimPhotos: unconfigured agent uses local folder keyed by ticket id', async () => {
  const { deps, cap } = fakes({ agentEnv: { hasUrl: false, hasToken: false } });
  const out = await archiveReceivingClaimPhotos(baseArgs, deps);

  assert.equal(out.usedAgent, false);
  assert.equal(cap.agent.length, 0);
  assert.equal(cap.orgs.length, 0, 'org lookup is agent-only');
  assert.equal(cap.folder.length, 1);
  assert.equal(cap.folder[0]?.ticketId, 4821);
  assert.equal(out.folder, '/local/4821');
  assert.equal(out.archiveOk, true);
});

test('archiveReceivingClaimPhotos: local mount returning null surfaces unavailable warning', async () => {
  const { deps } = fakes({
    agentEnv: { hasUrl: false, hasToken: false },
    folderResult: null,
  });
  const out = await archiveReceivingClaimPhotos(baseArgs, deps);
  assert.equal(out.archiveOk, false);
  assert.equal(out.folder, null);
  assert.equal(
    out.archiveWarning,
    'Photos were NOT archived to the NAS (archive agent/mount unavailable).',
  );
  assert.match(out.failReason ?? '', /NAS agent not configured/);
});

test('claimAttachmentFileLabel: PO wins, then tracking, then receiving id', () => {
  assert.equal(claimAttachmentFileLabel({ poNumber: '06-14788', tracking: '1Z' }, 9), 'PO-06-14788');
  assert.equal(claimAttachmentFileLabel({ poNumber: null, tracking: '1Z999' }, 9), 'TRK-1Z999');
  assert.equal(claimAttachmentFileLabel({ poNumber: null, tracking: null }, 42), 'RCV-42');
  assert.equal(
    claimAttachmentFileLabel({ poNumber: 'PO 99/A', tracking: null }, 1),
    'PO-PO-99-A',
  );
});
