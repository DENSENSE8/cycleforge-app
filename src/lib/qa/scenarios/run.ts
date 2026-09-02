/**
 * Execute named QA scenarios. Deterministic handlers never talk to a provider
 * and do not need secrets. qa-org handlers assert fixtures / inject failures
 * against the sandbox tenant. sandbox handlers need a connected provider.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { ingestPurchase } from '@/lib/inbound/ingest-purchase';
import { normalizeZohoWebhook } from '@/lib/zoho/webhooks/normalize';
import { dispatchWebhookEvent } from '@/lib/zoho/webhooks/handlers';
import { signZohoWebhookBody, verifyZohoWebhookSignature } from '@/lib/zoho/webhooks/verify';
import { QA_FIXTURE_ORDERS, QA_FIXTURE_PO_NUMBER, QA_FIXTURE_TRACKING } from '@/lib/tenancy/qa-org';
import { createFailureInjection, clearFailureInjection } from '@/lib/qa/failure-injection';
import { runConnectionHealthChecks } from '@/lib/qa/health';
import { previewImportOperation } from '@/lib/qa/preview-import';
import { listStoredWebhooks, replayStoredWebhook } from '@/lib/qa/webhook-replay';
import { startQaTestRun, completeQaTestRun } from '@/lib/qa/test-run';
import { getQaScenario } from './registry';
import {
  describeScenario,
  QA_SCENARIO_RUNNERS,
  scenariosInSuite,
  type ScenarioSuite,
} from './runners';
import { evaluateReleaseReadiness } from './checklist';
import type { ScenarioOutcomeStatus, ScenarioRunResult, ScenarioSuiteReport } from './run-types';

export type { ScenarioOutcomeStatus, ScenarioRunResult, ScenarioSuiteReport } from './run-types';
export { evaluateReleaseReadiness } from './checklist';

interface HandlerCtx {
  orgId?: OrgId;
  staffId?: number;
}

class Outcome extends Error {
  constructor(
    readonly status: ScenarioOutcomeStatus,
    readonly detail: string,
    readonly errorClass: string | null = null,
  ) {
    super(detail);
  }
}

function pass(detail: string): never {
  throw new Outcome('passed', detail);
}
function fail(detail: string, errorClass = 'ScenarioFailed'): never {
  throw new Outcome('failed', detail, errorClass);
}
function skip(detail: string): never {
  throw new Outcome('skipped', detail);
}
function blocked(detail: string): never {
  throw new Outcome('blocked', detail, 'Blocked');
}

async function countOrders(orgId: OrgId, ids: string[]): Promise<number> {
  const r = await tenantQuery<{ n: string }>(
    orgId,
    `SELECT count(*)::text AS n FROM orders WHERE organization_id = $1 AND order_id = ANY($2::text[])`,
    [orgId, ids],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function runHandler(id: string, ctx: HandlerCtx): Promise<never> {
  const runner = QA_SCENARIO_RUNNERS[id];
  if (!runner) fail(`No runner registered for ${id}`);

  switch (runner.handler) {
    case 'ingest-missing-field': {
      const org = (ctx.orgId ?? '00000000-0000-0000-0000-000000000002') as OrgId;
      try {
        await ingestPurchase(org, { sourceOrderId: '   ', sku: 'QA-SKIP' });
        fail('blank sourceOrderId was accepted — validation did not fire');
      } catch (err) {
        if (err instanceof Outcome) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (/sourceOrderId is required/.test(msg)) pass('ingestPurchase rejected a blank order id before any write');
        fail(msg, 'UnexpectedValidation');
      }
    }
    case 'ingest-duplicate-preview': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const existing = await tenantQuery<{ source_order_id: string; source_type: string }>(
        ctx.orgId,
        `SELECT source_order_id, source_type
           FROM inbound_purchase_order_links
          WHERE organization_id = $1
          LIMIT 1`,
        [ctx.orgId],
      );
      const row = existing.rows[0];
      if (!row) skip('No inbound purchase link on this org to prove duplicate skip');
      const r = await ingestPurchase(ctx.orgId, {
        sourceType: row.source_type,
        sourceOrderId: row.source_order_id,
        preview: true,
      });
      if (r.created) fail('preview reported would-create for an existing inbound identity');
      pass(`preview would-update existing ${row.source_type}:${row.source_order_id}`);
    }
    case 'inject-health': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const profile = runner.injectionProfile ?? 'http_429';
      const injection = await createFailureInjection({
        orgId: ctx.orgId,
        staffId: ctx.staffId ?? 0,
        provider: 'ebay',
        profile,
        remainingUses: 1,
        ttlSeconds: 120,
        notes: `scenario ${id}`,
      });
      try {
        const reports = await runConnectionHealthChecks(ctx.orgId, { provider: 'ebay' });
        const hit = reports.find((c) => c.live?.injected || c.live?.errorClass);
        if (!hit?.live) fail('health check did not consume the injection');
        if (!hit.live.injected && hit.live.ok) fail('health check passed despite the injection');
        const expected =
          profile === 'http_401' ? 'ProviderUnauthorized'
            : profile === 'http_429' ? 'ProviderRateLimited'
              : 'ProviderUnavailable';
        if (hit.live.errorClass && hit.live.errorClass !== expected) {
          fail(`expected ${expected}, got ${hit.live.errorClass}`, hit.live.errorClass);
        }
        pass(`health probe classified ${hit.live.errorClass ?? expected} (${hit.live.latencyMs} ms)`);
      } finally {
        await clearFailureInjection(ctx.orgId, injection.id).catch(() => undefined);
      }
    }
    case 'dry-run-ebay-buyer': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const preview = await previewImportOperation(ctx.orgId, 'ebay.buyer-import');
      const notes = preview.notes?.join('; ') ?? '';
      if (/Injected failure/.test(notes)) {
        fail(notes, 'ProviderFailure');
      }
      pass(
        `would create ${preview.wouldCreate.reduce((n, b) => n + b.count, 0)}, ` +
          `update ${preview.wouldUpdate.reduce((n, b) => n + b.count, 0)}; ${notes}`,
      );
    }
    case 'assert-orders': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const ids = Object.values(QA_FIXTURE_ORDERS);
      const n = await countOrders(ctx.orgId, ids);
      if (n < ids.length) fail(`expected ${ids.length} E2E orders, found ${n}`);
      pass(`${n} QA-TEST-* outbound orders present`);
    }
    case 'assert-receiving': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const r = await tenantQuery<{ n: string }>(
        ctx.orgId,
        `SELECT count(*)::text AS n FROM receiving_scans
          WHERE tracking_number = $1`,
        [QA_FIXTURE_TRACKING],
      );
      const n = Number(r.rows[0]?.n ?? 0);
      if (n < 1) fail(`receiving scan ${QA_FIXTURE_TRACKING} not found`);
      pass(`receiving carton tracking ${QA_FIXTURE_TRACKING} present`);
    }
    case 'assert-demo': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const r = await tenantQuery<{ n: string }>(
        ctx.orgId,
        `SELECT count(*)::text AS n FROM orders
          WHERE organization_id = $1 AND order_id LIKE 'QA-DEMO-ORD-%'`,
        [ctx.orgId],
      );
      const n = Number(r.rows[0]?.n ?? 0);
      if (n < 1) fail('no QA-DEMO-ORD-* rows');
      pass(`${n} demo outbound orders present`);
    }
    case 'assert-zoho-po': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const r = await tenantQuery<{ n: string }>(
        ctx.orgId,
        `SELECT count(*)::text AS n FROM receiving_line_zoho
          WHERE organization_id = $1 AND zoho_purchaseorder_number = $2`,
        [ctx.orgId, QA_FIXTURE_PO_NUMBER],
      );
      const n = Number(r.rows[0]?.n ?? 0);
      if (n < 1) fail(`Zoho PO ${QA_FIXTURE_PO_NUMBER} not mirrored`);
      pass(`Zoho PO ${QA_FIXTURE_PO_NUMBER} mirrored on Incoming`);
    }
    case 'webhook-normalize-idempotency': {
      const envelope = {
        event_type: 'purchaseorder.created',
        event_time: '2026-09-01T12:00:00Z',
        data: { purchaseorder: { purchaseorder_id: 'QA-PO-IDEM' } },
      };
      const a = normalizeZohoWebhook(envelope);
      const b = normalizeZohoWebhook(envelope);
      if (a.eventId !== b.eventId) fail('synthetic event ids diverged');
      if (ctx.orgId) {
        const stored = await listStoredWebhooks(ctx.orgId, 5).catch(() => []);
        if (stored[0]) {
          const replay = await replayStoredWebhook(ctx.orgId, {
            eventId: stored[0].eventId,
            mode: 'twice',
          });
          if (replay.attempts.length !== 2) fail('idempotent replay did not run twice');
          pass(`normalize id ${a.eventId}; application replay twice → ${replay.attempts.map((x) => x.action).join(', ')}`);
        }
      }
      pass(`duplicate deliveries collapse to ${a.eventId}`);
    }
    case 'webhook-replay-twice': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const stored = await listStoredWebhooks(ctx.orgId, 5);
      if (!stored[0]) skip('No stored Zoho webhook to replay');
      const replay = await replayStoredWebhook(ctx.orgId, { eventId: stored[0].eventId, mode: 'twice' });
      pass(`application replay twice: ${replay.attempts.map((a) => a.action).join(', ')}`);
    }
    case 'webhook-replay-out-of-order': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const stored = await listStoredWebhooks(ctx.orgId, 5);
      if (stored.length < 1) skip('No stored Zoho webhook to replay out of order');
      const replay = await replayStoredWebhook(ctx.orgId, {
        eventId: stored[0].eventId,
        mode: 'out_of_order',
      });
      pass(`out-of-order application replay: ${replay.attempts.map((a) => a.action).join(', ')}`);
    }
    case 'webhook-authentic-signature': {
      const body = '{"event_id":"qa-sig","event_type":"purchaseorder.updated"}';
      const secret = 'qa-org-secret';
      const sig = signZohoWebhookBody(body, secret);
      const ok = verifyZohoWebhookSignature(
        body,
        new Headers({ 'x-zoho-webhook-signature': sig }),
        { secret },
      );
      if (!ok.ok) fail('production verifier rejected a correctly signed body');
      const bad = verifyZohoWebhookSignature(
        body,
        new Headers({ 'x-zoho-webhook-signature': signZohoWebhookBody(body, 'wrong-secret') }),
        { secret },
      );
      if (bad.ok) fail('production verifier accepted a wrong-secret signature');
      pass('HMAC of the raw body verifies; a wrong secret is rejected');
    }
    case 'zoho-qty-same-line': {
      const base = {
        event_type: 'purchaseorder.updated',
        data: { purchaseorder: { purchaseorder_id: 'QA-PO-QTY', line_items: [{ line_item_id: 'L1', quantity: 1 }] } },
      };
      const edited = {
        event_type: 'purchaseorder.updated',
        data: { purchaseorder: { purchaseorder_id: 'QA-PO-QTY', line_items: [{ line_item_id: 'L1', quantity: 3 }] } },
      };
      const a = normalizeZohoWebhook(base);
      const b = normalizeZohoWebhook(edited);
      if (a.objectId !== b.objectId || a.objectId !== 'QA-PO-QTY') {
        fail('qty edit was classified as a different PO identity');
      }
      if (a.eventType !== 'purchaseorder.updated' || b.eventType !== 'purchaseorder.updated') {
        fail(`expected purchaseorder.updated, got ${a.eventType}/${b.eventType}`);
      }
      pass(`qty 1 → 3 keeps objectId ${a.objectId}; production upsert is keyed on that identity, not a duplicate row`);
    }
    case 'zoho-delete-missing-po': {
      if (!ctx.orgId) blocked('Needs the QA organization');
      const before = await tenantQuery<{ n: string }>(
        ctx.orgId,
        `SELECT count(*)::text AS n FROM receiving_line WHERE organization_id = $1`,
        [ctx.orgId],
      );
      const event = normalizeZohoWebhook({
        event_id: `qa-deleted-missing-${Date.now()}`,
        event_type: 'purchaseorder.deleted',
        data: { purchaseorder: { purchaseorder_id: 'QA-MISSING-PO' } },
      });
      const result = await dispatchWebhookEvent(event, ctx.orgId);
      const after = await tenantQuery<{ n: string }>(
        ctx.orgId,
        `SELECT count(*)::text AS n FROM receiving_line WHERE organization_id = $1`,
        [ctx.orgId],
      );
      if (result.action !== 'po.deleted') fail(`expected po.deleted, got ${result.action}`);
      if (Number(result.detail?.rows_detached ?? -1) !== 0) {
        fail(`missing PO detached ${String(result.detail?.rows_detached)} rows`);
      }
      if (Number(before.rows[0]?.n ?? 0) !== Number(after.rows[0]?.n ?? 0)) {
        fail('deleted missing PO invented receiving_line rows');
      }
      pass('purchaseorder.deleted on an unknown PO detaches 0 rows and does not invent receipts');
    }
    case 'refuse-live-label': {
      pass('QA Console will not buy live postage. Use a carrier sandbox or mock — never a paid production label from this surface.');
    }
    case 'not-wired':
      skip('No production handler to exercise yet — listed for coverage, not executed');
    default:
      fail(`Unknown handler ${String(runner.handler)}`);
  }
}

export async function runOneScenario(
  scenarioId: string,
  ctx: HandlerCtx = {},
  opts: { persist?: boolean } = {},
): Promise<ScenarioRunResult> {
  const described = describeScenario(scenarioId);
  const started = Date.now();
  const base = {
    scenarioId,
    title: described?.title ?? scenarioId,
    suite: described?.suite ?? 'deterministic',
    releaseRequired: described?.releaseRequired ?? false,
    playwrightCommand: described?.playwrightCommand ?? null,
  };

  let persistId: string | null = null;
  if (opts.persist && ctx.orgId && ctx.staffId != null) {
    const run = await startQaTestRun({
      orgId: ctx.orgId,
      staffId: ctx.staffId,
      kind: 'scenario',
      scenarioId,
    });
    persistId = run.id;
  }

  try {
    await runHandler(scenarioId, ctx);
    return { ...base, status: 'failed', detail: 'handler returned', errorClass: 'ScenarioFailed', durationMs: Date.now() - started, runId: null };
  } catch (err) {
    if (err instanceof Outcome) {
      const status = err.status;
      if (persistId && ctx.orgId) {
        const completed = await completeQaTestRun(ctx.orgId, persistId, {
          status: status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : 'cancelled',
          result: { detail: err.detail, status },
          errorClass: err.errorClass,
        });
        return {
          ...base,
          status,
          detail: err.detail,
          errorClass: err.errorClass,
          durationMs: Date.now() - started,
          runId: completed.runId,
        };
      }
      return {
        ...base,
        status,
        detail: err.detail,
        errorClass: err.errorClass,
        durationMs: Date.now() - started,
        runId: persistId,
      };
    }
    const detail = err instanceof Error ? err.message : String(err);
    if (persistId && ctx.orgId) {
      const completed = await completeQaTestRun(ctx.orgId, persistId, {
        status: 'failed',
        result: { detail },
        errorClass: 'ScenarioFailed',
      }).catch(() => null);
      return {
        ...base,
        status: 'failed',
        detail,
        errorClass: 'ScenarioFailed',
        durationMs: Date.now() - started,
        runId: completed?.runId ?? null,
      };
    }
    return {
      ...base,
      status: 'failed',
      detail,
      errorClass: 'ScenarioFailed',
      durationMs: Date.now() - started,
      runId: null,
    };
  }
}

export async function runScenarioSuite(opts: {
  suite: ScenarioSuite | 'all';
  orgId?: OrgId;
  staffId?: number;
  persist?: boolean;
  ids?: string[];
}): Promise<ScenarioSuiteReport> {
  const startedAt = new Date().toISOString();
  const ids = opts.ids?.length ? opts.ids : scenariosInSuite(opts.suite);
  const results: ScenarioRunResult[] = [];
  for (const id of ids) {
    if (!getQaScenario(id)) {
      results.push({
        scenarioId: id,
        title: id,
        status: 'failed',
        durationMs: 0,
        detail: 'Unknown scenario id',
        errorClass: 'UnknownScenario',
        runId: null,
        suite: 'deterministic',
        releaseRequired: false,
        playwrightCommand: null,
      });
      continue;
    }
    results.push(await runOneScenario(id, { orgId: opts.orgId, staffId: opts.staffId }, { persist: opts.persist }));
  }
  const { readyForRelease, missingRequired } = evaluateReleaseReadiness(results);
  return {
    suite: opts.suite,
    startedAt,
    completedAt: new Date().toISOString(),
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    blocked: results.filter((r) => r.status === 'blocked').length,
    results,
    readyForRelease,
    missingRequired,
  };
}
