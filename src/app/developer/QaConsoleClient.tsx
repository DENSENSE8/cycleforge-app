'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/pane-header';
import { Button, Panel } from '@/design-system/primitives';
import { Activity } from '@/components/Icons';
import { summarizeDryRun } from '@/lib/qa/dry-run';
import type { QaPermissionFlags } from '@/lib/qa/capabilities';
import type { ConnectionHealthReport } from '@/lib/qa/health';
import type { QaScenario } from '@/lib/qa/scenarios/registry';

type ScenarioRow = QaScenario & {
  suite?: string;
  releaseRequired?: boolean;
  playwrightCommand?: string | null;
};
import type { FailureInjection } from '@/lib/qa/failure-injection';
import { type FailureProfile } from '@/lib/qa/failure-profiles';
import type { QaTestRun, QaTestRunEvent } from '@/lib/qa/test-run';
import type { DryRunPreview } from '@/lib/qa/dry-run';

interface Props {
  initialPermissions: QaPermissionFlags;
}

const PROFILES: { id: FailureProfile; label: string }[] = [
  { id: 'timeout', label: 'Network timeout' },
  { id: 'http_400', label: 'HTTP 400' },
  { id: 'http_401', label: 'HTTP 401 / expired token' },
  { id: 'http_403', label: 'HTTP 403 / insufficient scope' },
  { id: 'http_409', label: 'HTTP 409 / duplicate' },
  { id: 'http_429', label: 'HTTP 429 / rate limit' },
  { id: 'http_500', label: 'HTTP 500' },
  { id: 'malformed', label: 'Malformed provider payload' },
  { id: 'partial', label: 'Partial response' },
  { id: 'delayed', label: 'Delayed response' },
  { id: 'duplicate_callback', label: 'Duplicate callback' },
];

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export function QaConsoleClient({ initialPermissions }: Props) {
  const perms = initialPermissions;
  const [connections, setConnections] = useState<ConnectionHealthReport[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [smokeReport, setSmokeReport] = useState<{
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    readyForRelease: boolean;
    missingRequired: string[];
    results: Array<{
      scenarioId: string;
      status: string;
      detail: string;
      runId: string | null;
      playwrightCommand: string | null;
      durationMs: number;
    }>;
  } | null>(null);
  const [injections, setInjections] = useState<FailureInjection[]>([]);
  const [runs, setRuns] = useState<QaTestRun[]>([]);
  const [fixturePreview, setFixturePreview] = useState<DryRunPreview | null>(null);
  const [importPreview, setImportPreview] = useState<DryRunPreview | null>(null);
  const [sellerPreview, setSellerPreview] = useState<DryRunPreview | null>(null);
  const [executeResult, setExecuteResult] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<QaTestRunEvent[]>([]);
  const [authenticNote, setAuthenticNote] = useState<string | null>(null);
  const [reseedCommand, setReseedCommand] = useState<string>('pnpm provision:qa-org -- --fixtures-only');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [injectProvider, setInjectProvider] = useState('ebay');
  const [injectProfile, setInjectProfile] = useState<FailureProfile>('http_429');
  const [webhooks, setWebhooks] = useState<Array<{
    eventId: string;
    eventType: string;
    objectId: string | null;
    receivedAt: string;
    processedAt: string | null;
  }>>([]);
  const [webhookId, setWebhookId] = useState('');
  const [jobs, setJobs] = useState<Array<{
    job: string;
    label: string;
    health: string;
    triggerable: boolean;
    lastRun: { status: string; startedAt: string; error: string | null } | null;
  }>>([]);
  const [jobAttempts, setJobAttempts] = useState<Array<{
    id: number;
    status: string;
    trigger: string | null;
    startedAt: string;
    error: string | null;
  }>>([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [previewRoles, setPreviewRoles] = useState<Array<{ key: string; label: string }>>([]);
  const [roleKey, setRoleKey] = useState('receiver');
  const [rolePreview, setRolePreview] = useState<{
    role: { key: string; label: string };
    permissionCount: number;
    stepUp: string[];
    nav: Array<{ id: string; label: string }>;
    notes: string[];
  } | null>(null);

  const load = useCallback(async () => {
    const [h, s, i, r, f, w, j, rp] = await Promise.all([
      fetch('/api/developer/qa/health', { cache: 'no-store' }),
      fetch('/api/developer/qa/scenarios', { cache: 'no-store' }),
      fetch('/api/developer/qa/injections', { cache: 'no-store' }),
      fetch('/api/developer/qa/runs', { cache: 'no-store' }),
      fetch('/api/developer/qa/fixtures?scope=demo', { cache: 'no-store' }),
      fetch('/api/developer/qa/webhooks', { cache: 'no-store' }),
      fetch('/api/developer/qa/jobs', { cache: 'no-store' }),
      fetch('/api/developer/qa/role-preview', { cache: 'no-store' }),
    ]);
    if (h.ok) {
      const data = await readJson<{ connections?: ConnectionHealthReport[] }>(h);
      setConnections(data.connections ?? []);
    }
    if (s.ok) {
      const data = await readJson<{ scenarios?: ScenarioRow[] }>(s);
      setScenarios(data.scenarios ?? []);
    }
    if (i.ok) {
      const data = await readJson<{ injections?: FailureInjection[] }>(i);
      setInjections(data.injections ?? []);
    }
    if (r.ok) {
      const data = await readJson<{ runs?: QaTestRun[] }>(r);
      setRuns(data.runs ?? []);
    }
    if (f.ok) {
      const data = await readJson<{ preview?: DryRunPreview & { reseedCommand?: string } }>(f);
      setFixturePreview(data.preview ?? null);
      if (data.preview?.reseedCommand) setReseedCommand(data.preview.reseedCommand);
    }
    if (w.ok) {
      const data = await readJson<{ events?: typeof webhooks }>(w);
      setWebhooks(data.events ?? []);
      if (data.events?.[0]) setWebhookId((prev) => prev || data.events![0]!.eventId);
    }
    if (j.ok) {
      const data = await readJson<{ jobs?: typeof jobs }>(j);
      setJobs(data.jobs ?? []);
    }
    if (rp.ok) {
      const data = await readJson<{ roles?: Array<{ key: string; label: string }> }>(rp);
      setPreviewRoles(data.roles ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setStatus(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [load]);

  const scenarioFamilies = useMemo(() => {
    const map = new Map<string, ScenarioRow[]>();
    for (const s of scenarios) {
      const arr = map.get(s.family) ?? [];
      arr.push(s);
      map.set(s.family, arr);
    }
    return [...map.entries()];
  }, [scenarios]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="QA Console"
        icon={Activity}
        iconBg="bg-amber-50"
        iconTint="text-amber-700"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 max-w-3xl text-sm text-text-muted">
          Permanent sandbox tooling for this organization. Live production
          actions (paid labels, live listing writes, cancellations) are not
          available here. Every action writes a redacted test-run trace.
        </p>
        {status ? (
          <p className="mb-4 text-sm text-rose-700" role="alert">{status}</p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Connection health</h2>
            <p className="text-role-micro text-text-muted">
              Credentials, token expiry, expected scopes, a harmless provider
              request, account identity, and configured environment.
            </p>
            {connections.length === 0 ? (
              <p className="text-sm text-text-muted">No connections on this organization yet.</p>
            ) : (
              <ul className="divide-y divide-border-soft">
                {connections.map((c) => (
                  <li key={`${c.provider}:${c.scope}`} className="py-2 font-mono text-role-micro">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-sans text-sm font-medium text-text-default">
                        {c.label}
                        {c.environment ? ` · ${c.environment}` : ''}
                      </span>
                      <span className={c.lastOk ? 'text-emerald-700' : 'text-text-muted'}>
                        {c.live
                          ? c.live.ok
                            ? `passed, ${c.live.latencyMs} ms`
                            : c.live.errorClass ?? 'failed'
                          : c.lastOk == null
                            ? 'not checked'
                            : c.lastOk
                              ? `last passed, ${c.lastLatencyMs ?? '—'} ms`
                              : 'last failed'}
                      </span>
                    </div>
                    <div className="mt-1 text-text-muted">
                      Connected: {c.connected ? 'yes' : 'no'}
                      {c.identity ? ` · Seller/account: ${c.identity}` : ''}
                      {c.scopesExpected != null
                        ? ` · Scopes: ${c.scopesFound ?? 0}/${c.scopesExpected}`
                        : ''}
                      {c.tokenExpiresAt ? ` · Token expires: ${fmtTime(c.tokenExpiresAt)}` : ''}
                    </div>
                    {c.lastError ? <div className="mt-1 text-rose-700">{c.lastError}</div> : null}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Button
                size="sm"
                disabled={!perms.connectionDebug || busy !== null}
                loading={busy === 'health'}
                onClick={() => void run('health', async () => {
                  const res = await fetch('/api/developer/qa/health', { method: 'POST', body: '{}' });
                  const data = await readJson<{ success?: boolean; error?: string }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Health check failed');
                })}
              >
                Check connection health
              </Button>
            </div>
          </Panel>

          <Panel padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Dry-run / preview</h2>
            <p className="text-role-micro text-text-muted">
              Buyer preview uses <code>ingestPurchase(preview: true)</code> —
              the same validation and existing-row lookup as production.
              Sequence: preview → confirm → execute. Execute writes Incoming
              rows and advances the cursor, and is refused unless the eBay app
              is SANDBOX. Seller sync is preview-only (it deletes exceptions).
            </p>
            {importPreview ? (
              <pre className="overflow-x-auto bg-surface-muted p-3 text-role-micro text-text-default">
                {['Buyer import', ...summarizeDryRun(importPreview), ...(importPreview.notes ?? [])].join('\n')}
              </pre>
            ) : (
              <p className="text-sm text-text-muted">No buyer preview yet.</p>
            )}
            {sellerPreview ? (
              <pre className="overflow-x-auto bg-surface-muted p-3 text-role-micro text-text-default">
                {['Seller sync', ...summarizeDryRun(sellerPreview), ...(sellerPreview.notes ?? [])].join('\n')}
              </pre>
            ) : null}
            {executeResult ? (
              <p className="text-sm text-text-default">{executeResult}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!perms.execute || busy !== null}
                loading={busy === 'dry-run'}
                onClick={() => void run('dry-run', async () => {
                  const res = await fetch('/api/developer/qa/dry-run', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ operation: 'ebay.buyer-import', mode: 'preview' }),
                  });
                  const data = await readJson<{ success?: boolean; error?: string; preview?: DryRunPreview }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Preview failed');
                  setImportPreview(data.preview ?? null);
                  setExecuteResult(null);
                })}
              >
                Preview eBay buyer import
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!perms.execute || busy !== null}
                loading={busy === 'seller-preview'}
                onClick={() => void run('seller-preview', async () => {
                  const res = await fetch('/api/developer/qa/dry-run', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ operation: 'ebay.seller-sync', mode: 'preview' }),
                  });
                  const data = await readJson<{ success?: boolean; error?: string; preview?: DryRunPreview }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Seller preview failed');
                  setSellerPreview(data.preview ?? null);
                })}
              >
                Preview eBay seller sync
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={!perms.execute || busy !== null || !importPreview}
                loading={busy === 'execute'}
                onClick={() => void run('execute', async () => {
                  const res = await fetch('/api/developer/qa/dry-run', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      operation: 'ebay.buyer-import',
                      mode: 'execute',
                      confirmExecute: true,
                    }),
                  });
                  const data = await readJson<{
                    success?: boolean;
                    error?: string;
                    executed?: { ingested: number; created: number; accounts: number; errors: string[] };
                  }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Execute refused');
                  const ex = data.executed;
                  setExecuteResult(
                    ex
                      ? `Executed buyer import: ${ex.created} created, ${ex.ingested} ingested, ${ex.accounts} accounts.`
                      : 'Executed.',
                  );
                })}
              >
                Execute buyer import (writes, advances cursor)
              </Button>
            </div>
          </Panel>

          <Panel padding="md" className="flex flex-col gap-3 xl:col-span-2">
            <h2 className="text-sm font-semibold text-text-default">Integration smoke / release evidence</h2>
            <p className="text-role-micro text-text-muted">
              Named scenarios with a pass/fail report and trace ids. Deterministic
              cases need no secrets (<code>pnpm test:qa-scenarios</code>). Playwright
              links are the browser counterpart on <code>qa-desktop</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!perms.execute || busy !== null}
                loading={busy === 'smoke-all'}
                onClick={() => void run('smoke-all', async () => {
                  const res = await fetch('/api/developer/qa/scenarios', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ suite: 'all' }),
                  });
                  const data = await readJson<{ success?: boolean; error?: string; report?: NonNullable<typeof smokeReport> }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Smoke suite failed');
                  setSmokeReport(data.report ?? null);
                })}
              >
                Run all integration smoke tests
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!perms.execute || busy !== null}
                loading={busy === 'smoke-det'}
                onClick={() => void run('smoke-det', async () => {
                  const res = await fetch('/api/developer/qa/scenarios', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ suite: 'deterministic' }),
                  });
                  const data = await readJson<{ success?: boolean; error?: string; report?: NonNullable<typeof smokeReport> }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Deterministic suite failed');
                  setSmokeReport(data.report ?? null);
                })}
              >
                Run deterministic scenarios
              </Button>
            </div>
            {smokeReport ? (
              <div className="text-sm">
                <p className={smokeReport.readyForRelease ? 'text-emerald-700' : 'text-amber-800'}>
                  {smokeReport.readyForRelease
                    ? 'Release checklist: required scenarios passed.'
                    : `Release checklist blocked: ${smokeReport.missingRequired.join(', ') || 'see failures'}`}
                  {' '}
                  (passed {smokeReport.passed} · failed {smokeReport.failed} · skipped {smokeReport.skipped} · blocked {smokeReport.blocked})
                </p>
                <table className="mt-2 w-full text-left text-role-micro">
                  <thead>
                    <tr className="text-text-soft">
                      <th className="py-1 font-medium">Scenario</th>
                      <th className="py-1 font-medium">Result</th>
                      <th className="py-1 font-medium">Trace</th>
                      <th className="py-1 font-medium">Playwright</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smokeReport.results.map((row) => (
                      <tr key={row.scenarioId} className="border-t border-border-soft">
                        <td className="py-1.5 font-mono">{row.scenarioId}</td>
                        <td className="py-1.5">{row.status} · {row.detail}</td>
                        <td className="py-1.5 font-mono">
                          {row.runId ? (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => {
                                setSelectedRunId(row.runId);
                                void (async () => {
                                  const res = await fetch(`/api/developer/qa/runs?id=${encodeURIComponent(row.runId!)}`);
                                  const data = await readJson<{ events?: QaTestRunEvent[] }>(res);
                                  setRunEvents(data.events ?? []);
                                })();
                              }}
                            >
                              {row.runId}
                            </button>
                          ) : '—'}
                        </td>
                        <td className="py-1.5 font-mono">{row.playwrightCommand ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {scenarioFamilies.map(([family, list]) => (
                <div key={family}>
                  <h3 className="text-role-micro font-semibold uppercase tracking-wide text-text-soft">{family}</h3>
                  <ul className="mt-1 space-y-1">
                    {list.map((s) => (
                      <li key={s.id} className="text-sm">
                        <span className="font-mono text-role-micro text-text-muted">{s.id}</span>
                        <span className="text-text-default"> — {s.title}</span>
                        {'playwrightCommand' in s && s.playwrightCommand ? (
                          <span className="ml-2 font-mono text-role-micro text-text-soft">{s.playwrightCommand}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>

          <Panel padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Webhook simulator</h2>
            <p className="text-role-micro text-text-muted">
              Two separate workflows. A simulator that bypasses signature
              validation is useful, but it is not proof that the real provider
              webhook integration works.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-default">
              <li>
                <strong>Provider-authentic</strong> — this console HMAC-signs a
                stored payload with this org&apos;s secret and posts it to
                <code> processZohoWebhook</code> (token URL → HMAC → normalize →
                dedupe → dispatch). Same path Zoho uses.
              </li>
              <li>
                <strong>Application replay — not provider-authentic</strong> —
                replay a stored payload against <code>dispatchWebhookEvent</code>.
                Signature is not checked.
              </li>
            </ul>
            {authenticNote ? (
              <p className="text-sm text-text-default">{authenticNote}</p>
            ) : null}
            {webhooks.length === 0 ? (
              <p className="text-sm text-text-muted">No stored Zoho deliveries for this org.</p>
            ) : (
              <label className="text-role-micro text-text-muted">
                Stored event
                <select
                  className="mt-1 block w-full border border-border-soft bg-surface-card px-2 py-1 font-mono text-sm"
                  value={webhookId}
                  onChange={(e) => setWebhookId(e.target.value)}
                >
                  {webhooks.map((ev) => (
                    <option key={ev.eventId} value={ev.eventId}>
                      {ev.eventType} · {ev.objectId ?? ev.eventId}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!perms.webhookReplay || busy !== null || !webhookId}
                loading={busy === 'wh-auth'}
                onClick={() => void run('wh-auth', async () => {
                  const res = await fetch('/api/developer/qa/webhooks', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      eventId: webhookId,
                      kind: 'provider_authentic',
                      acknowledgeProviderAuthentic: true,
                    }),
                  });
                  const data = await readJson<{
                    success?: boolean;
                    error?: string;
                    delivery?: { httpStatus: number; verified: boolean; notes?: string[] };
                  }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Authentic delivery failed');
                  const d = data.delivery;
                  setAuthenticNote(
                    d
                      ? `Provider-authentic: HTTP ${d.httpStatus}, signature ${d.verified ? 'verified' : 'not verified'}. ${(d.notes ?? []).join(' ')}`
                      : 'Provider-authentic delivery completed.',
                  );
                })}
              >
                Send provider-authentic signed webhook
              </Button>
              <Button
                size="sm"
                disabled={!perms.webhookReplay || busy !== null}
                loading={busy === 'wh-dispatch'}
                onClick={() => void run('wh-dispatch', async () => {
                  const res = await fetch('/api/developer/qa/webhooks', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      kind: 'provider_authentic',
                      fixture: 'deleted_missing_po',
                      mintFreshEventId: true,
                      acknowledgeProviderAuthentic: true,
                    }),
                  });
                  const data = await readJson<{
                    success?: boolean;
                    error?: string;
                    delivery?: { httpStatus: number; verified: boolean; body?: { deduped?: boolean; action?: string } };
                  }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Authentic dispatch failed');
                  const d = data.delivery;
                  setAuthenticNote(
                    d
                      ? `Provider-authentic dispatch: HTTP ${d.httpStatus}, action ${d.body?.action ?? '—'}, deduped ${d.body?.deduped === true ? 'yes' : 'no'}.`
                      : 'Provider-authentic dispatch completed.',
                  );
                })}
              >
                Send signed dispatch (fresh event id, missing PO delete)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!perms.webhookReplay || busy !== null || !webhookId}
                loading={busy === 'wh-mismatch'}
                onClick={() => void run('wh-mismatch', async () => {
                  const res = await fetch('/api/developer/qa/webhooks', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      eventId: webhookId,
                      kind: 'signature_mismatch',
                    }),
                  });
                  const data = await readJson<{
                    success?: boolean;
                    error?: string;
                    delivery?: { httpStatus: number };
                  }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Mismatch delivery failed');
                  setAuthenticNote(
                    `Wrong-secret delivery: HTTP ${data.delivery?.httpStatus ?? '—'}. Production must return 401.`,
                  );
                })}
              >
                Send with wrong secret (expect 401)
              </Button>
              {(['once', 'twice', 'out_of_order'] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant="secondary"
                  disabled={!perms.webhookReplay || busy !== null || !webhookId}
                  loading={busy === `wh-${mode}`}
                  onClick={() => void run(`wh-${mode}`, async () => {
                    const res = await fetch('/api/developer/qa/webhooks', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        eventId: webhookId,
                        kind: 'application',
                        mode,
                        acknowledgeApplicationReplay: true,
                      }),
                    });
                    const data = await readJson<{ success?: boolean; error?: string }>(res);
                    if (!res.ok) throw new Error(data.error ?? 'Application replay failed');
                    setAuthenticNote('Application replay — not provider-authentic.');
                  })}
                >
                  {mode === 'once'
                    ? 'Replay once (application)'
                    : mode === 'twice'
                      ? 'Replay twice (idempotency)'
                      : 'Replay out of order'}
                </Button>
              ))}
            </div>
          </Panel>

          <Panel padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Provider failure profile</h2>
            <p className="text-role-micro text-text-muted">
              Temporary, org-scoped, auto-expiring. Applied at the adapter /
              health-check boundary — not by corrupting database rows.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-role-micro text-text-muted">
                Provider
                <input
                  className="mt-1 block w-40 border border-border-soft bg-surface-card px-2 py-1 text-sm"
                  value={injectProvider}
                  onChange={(e) => setInjectProvider(e.target.value)}
                />
              </label>
              <label className="text-role-micro text-text-muted">
                Next request
                <select
                  className="mt-1 block border border-border-soft bg-surface-card px-2 py-1 text-sm"
                  value={injectProfile}
                  onChange={(e) => setInjectProfile(e.target.value as FailureProfile)}
                >
                  {PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                disabled={!perms.execute || busy !== null}
                loading={busy === 'inject'}
                onClick={() => void run('inject', async () => {
                  const res = await fetch('/api/developer/qa/injections', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      provider: injectProvider,
                      profile: injectProfile,
                      remainingUses: 1,
                      retryAfterSeconds: injectProfile === 'http_429' ? 30 : undefined,
                    }),
                  });
                  const data = await readJson<{ success?: boolean; error?: string }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Could not set failure profile');
                })}
              >
                Set next-request failure
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!perms.execute || busy !== null || injections.length === 0}
                onClick={() => void run('inject', async () => {
                  await fetch('/api/developer/qa/injections', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ clear: true }),
                  });
                })}
              >
                Clear all profiles
              </Button>
            </div>
            {injections.length === 0 ? (
              <p className="text-sm text-text-muted">No active failure profiles.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {injections.map((inj) => (
                  <li key={inj.id} className="font-mono text-role-micro">
                    {inj.provider} · {inj.profile} · {inj.remainingUses} use(s) · expires {fmtTime(inj.expiresAt)}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Fixture reset</h2>
            <p className="text-role-micro text-text-muted">
              Preview first. Execute deletes catalogued sandbox rows only, then
              you restore them with the same provisioner E2E uses. Step-up is
              required for execute.
            </p>
            {fixturePreview ? (
              <pre className="overflow-x-auto bg-surface-muted p-3 text-role-micro text-text-default">
                {summarizeDryRun(fixturePreview).join('\n') || 'Nothing to reset.'}
              </pre>
            ) : null}
            <p className="text-role-micro text-text-muted">
              Restore command: <code>{reseedCommand}</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void run('preview', async () => {
                  const res = await fetch('/api/developer/qa/fixtures?scope=demo');
                  const data = await readJson<{ preview?: DryRunPreview & { reseedCommand?: string } }>(res);
                  setFixturePreview(data.preview ?? null);
                })}
              >
                Preview demo reset
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={!perms.fixtureReset || busy !== null}
                loading={busy === 'reset'}
                onClick={() => void run('reset', async () => {
                  const res = await fetch('/api/developer/qa/fixtures', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ scope: 'demo', mode: 'execute' }),
                  });
                  const data = await readJson<{ success?: boolean; error?: string; reseedCommand?: string }>(res);
                  if (!res.ok) throw new Error(data.error ?? 'Reset failed');
                  if (data.reseedCommand) setReseedCommand(data.reseedCommand);
                })}
              >
                Reset demo fixtures
              </Button>
            </div>
          </Panel>

          <Panel padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Jobs and events</h2>
            <p className="text-role-micro text-text-muted">
              Triggers the same cron route production uses (CRON_SECRET). There
              is no separate pending queue to cancel. Correlation is the
              <code> cron_runs.id </code> on each attempt.
            </p>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left text-role-micro">
                <thead>
                  <tr className="text-text-soft">
                    <th className="py-1 font-medium">Job</th>
                    <th className="py-1 font-medium">Health</th>
                    <th className="py-1 font-medium">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr
                      key={job.job}
                      className="cursor-pointer border-t border-border-soft"
                      onClick={() => {
                        setSelectedJob(job.job);
                        void (async () => {
                          const res = await fetch(`/api/developer/qa/jobs?job=${encodeURIComponent(job.job)}`);
                          const data = await readJson<{ attempts?: typeof jobAttempts }>(res);
                          setJobAttempts(data.attempts ?? []);
                        })();
                      }}
                    >
                      <td className="py-1.5">{job.label}</td>
                      <td className="py-1.5 font-mono">{job.health}</td>
                      <td className="py-1.5">{job.lastRun?.status ?? 'never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedJob ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!perms.execute || busy !== null}
                  loading={busy === 'job'}
                  onClick={() => void run('job', async () => {
                    const intent = jobs.find((j) => j.job === selectedJob)?.lastRun?.status === 'failed'
                      ? 'retry_failed'
                      : 'trigger_now';
                    const res = await fetch('/api/developer/qa/jobs', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ job: selectedJob, intent }),
                    });
                    const data = await readJson<{ success?: boolean; error?: string }>(res);
                    if (!res.ok) throw new Error(data.error ?? 'Job trigger failed');
                  })}
                >
                  {jobs.find((j) => j.job === selectedJob)?.lastRun?.status === 'failed'
                    ? 'Retry this failed job (production path)'
                    : 'Trigger this job now (production path)'}
                </Button>
              </div>
            ) : null}
            {jobAttempts.length > 0 ? (
              <ul className="font-mono text-role-micro text-text-muted">
                {jobAttempts.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    #{a.id} · {a.status} · {a.trigger ?? '—'} · {fmtTime(a.startedAt)}
                    {a.error ? ` · ${a.error}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Preview as role</h2>
            <p className="text-role-micro text-text-muted">
              Evaluates the roles table the same way production does. Does not
              change your session and does not accept a staff_id. Step-up still
              applies to high-risk actions.
            </p>
            <label className="text-role-micro text-text-muted">
              View as
              <select
                className="mt-1 block border border-border-soft bg-surface-card px-2 py-1 text-sm"
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
              >
                {(previewRoles.length ? previewRoles : [
                  { key: 'admin', label: 'QA Admin' },
                  { key: 'receiver', label: 'QA Receiver' },
                  { key: 'technician', label: 'QA Technician' },
                  { key: 'packer', label: 'QA Packer' },
                  { key: 'shipper', label: 'QA Shipper' },
                ]).map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              disabled={busy !== null}
              loading={busy === 'role'}
              onClick={() => void run('role', async () => {
                const res = await fetch(`/api/developer/qa/role-preview?role=${encodeURIComponent(roleKey)}`);
                const data = await readJson<{ success?: boolean; error?: string; preview?: NonNullable<typeof rolePreview> }>(res);
                if (!res.ok) throw new Error(data.error ?? 'Role preview failed');
                setRolePreview(data.preview ?? null);
              })}
            >
              Evaluate this role
            </Button>
            {rolePreview ? (
              <div className="text-sm text-text-default">
                <p className="font-medium">{rolePreview.role.label} · {rolePreview.permissionCount} permissions</p>
                <p className="text-role-micro text-text-muted">
                  Nav: {rolePreview.nav.map((n) => n.label).join(', ') || 'none'}
                </p>
                {rolePreview.stepUp.length > 0 ? (
                  <p className="text-role-micro text-amber-800">
                    Step-up still required: {rolePreview.stepUp.join(', ')}
                  </p>
                ) : null}
                <ul className="mt-1 list-disc pl-5 text-role-micro text-text-muted">
                  {rolePreview.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel padding="md" className="xl:col-span-2 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-default">Test-run traces</h2>
            <p className="text-role-micro text-text-muted">
              Redacted request/response only. Tokens, Authorization headers, and
              credential payloads are never stored.
            </p>
            {runs.length === 0 ? (
              <p className="text-sm text-text-muted">No runs yet.</p>
            ) : (
              <table className="w-full text-left text-role-micro">
                <thead>
                  <tr className="text-text-soft">
                    <th className="py-1 font-medium">Run ID</th>
                    <th className="py-1 font-medium">Kind</th>
                    <th className="py-1 font-medium">Scenario</th>
                    <th className="py-1 font-medium">Result</th>
                    <th className="py-1 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((runRow) => (
                    <tr
                      key={runRow.id}
                      className="cursor-pointer border-t border-border-soft font-mono"
                      onClick={() => {
                        setSelectedRunId(runRow.runId);
                        void (async () => {
                          const res = await fetch(`/api/developer/qa/runs?id=${encodeURIComponent(runRow.runId)}`);
                          const data = await readJson<{ events?: QaTestRunEvent[] }>(res);
                          setRunEvents(data.events ?? []);
                        })();
                      }}
                    >
                      <td className="py-1.5">{runRow.runId}</td>
                      <td className="py-1.5">{runRow.kind}</td>
                      <td className="py-1.5">{runRow.scenarioId ?? '—'}</td>
                      <td className="py-1.5">{runRow.status}</td>
                      <td className="py-1.5">{fmtTime(runRow.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {selectedRunId ? (
              <div>
                <h3 className="text-role-micro font-semibold uppercase tracking-wide text-text-soft">
                  Events for {selectedRunId}
                </h3>
                {runEvents.length === 0 ? (
                  <p className="text-sm text-text-muted">No event rows on this run (result is still on the run record).</p>
                ) : (
                  <ul className="mt-1 space-y-1 font-mono text-role-micro">
                    {runEvents.map((ev) => (
                      <li key={ev.seq}>
                        #{ev.seq} · {ev.provider ?? '—'} · {ev.operation ?? '—'}
                        {ev.httpStatus != null ? ` · HTTP ${ev.httpStatus}` : ''}
                        {ev.durationMs != null ? ` · ${ev.durationMs} ms` : ''}
                        {ev.errorClass ? ` · ${ev.errorClass}` : ''}
                        {ev.requestHash ? ` · hash ${ev.requestHash}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
