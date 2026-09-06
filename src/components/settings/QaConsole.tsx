'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { SearchableSelectField } from '@/design-system/components';
import { ShieldCheck, RefreshCw } from '@/components/Icons';

interface QaRun {
  id: string;
  action: 'health_check' | 'fixture_reseed' | 'fixture_reset' | 'webhook_replay';
  scenario: string;
  status: 'requested' | 'running' | 'passed' | 'failed';
  actorStaffId: number;
  createdAt: string;
  metadata?: {
    provider?: string;
    ok?: boolean;
    connected?: boolean;
    httpStatus?: number;
    durationMs?: number;
  };
}

interface QaConsolePayload {
  organization: {
    id: string;
    name: string;
    slug: string;
    environment: 'customer' | 'sandbox';
  };
  capabilities: {
    canExecute: boolean;
    canResetFixtures: boolean;
    canDestructive: boolean;
  };
  runs: QaRun[];
}

const ACTION_LABELS: Record<QaRun['action'], string> = {
  health_check: 'Connection health check',
  fixture_reseed: 'Fixture reseed',
  fixture_reset: 'Fixture reset',
  webhook_replay: 'Webhook replay',
};

const HEALTH_PROVIDER_OPTIONS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'ebay', label: 'eBay' },
  { value: 'zoho', label: 'Zoho Inventory' },
  { value: 'google_drive', label: 'Google Drive' },
  { value: 'nextiva', label: 'Nextiva' },
] as const;
type HealthProvider = (typeof HEALTH_PROVIDER_OPTIONS)[number]['value'];

const REPLAY_EVENT_OPTIONS = [
  { value: 'purchaseorder.created', label: 'Purchase order created' },
  { value: 'purchaseorder.updated', label: 'Purchase order updated' },
  { value: 'purchaseorder.deleted', label: 'Purchase order deleted' },
  { value: 'purchasereceive.created', label: 'Purchase receive created' },
  { value: 'purchasereceive.deleted', label: 'Purchase receive deleted' },
] as const;
type ReplayEventType = (typeof REPLAY_EVENT_OPTIONS)[number]['value'];

function formatRunDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function QaConsole() {
  const [data, setData] = useState<QaConsolePayload | null>(null);
  const [scenario, setScenario] = useState('default-smoke');
  const [provider, setProvider] = useState<HealthProvider>('zoho');
  const [replayEventType, setReplayEventType] = useState<ReplayEventType>('purchaseorder.created');
  const [replayEventId, setReplayEventId] = useState('qa_replay_purchase_001');
  const [replayObjectId, setReplayObjectId] = useState('fixture-po-001');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/qa-tools', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load QA console');
      setData((await response.json()) as QaConsolePayload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load QA console');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createRun(action: 'health_check' | 'fixture_reseed' | 'webhook_replay') {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/qa-tools', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          scenario,
          ...(action === 'health_check' ? { provider } : {}),
          ...(action === 'webhook_replay' ? {
            replay: { eventId: replayEventId, eventType: replayEventType, objectId: replayObjectId },
          } : {}),
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        run?: QaRun;
        health?: { provider: string; ok: boolean; httpStatus: number; durationMs: number };
        replay?: { eventId: string; eventType: string; deduped: boolean; action?: string; skipped?: boolean };
      };
      if (!response.ok) throw new Error(body.error ?? 'QA action failed');
      setMessage(body.replay
        ? `${ACTION_LABELS[action]} ${body.replay.deduped ? 'deduped' : 'executed'} for ${body.replay.eventType} (${body.replay.eventId}).`
        : body.health
        ? `${ACTION_LABELS[action]} ${body.health.ok ? 'passed' : 'failed'} for ${body.health.provider} (${body.health.httpStatus}, ${body.health.durationMs} ms).`
        : `${ACTION_LABELS[action]} recorded as ${body.run?.status ?? 'requested'}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'QA action failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function requestFixtureReset() {
    if (!window.confirm(`Execute a fixture reset for “${scenario}”? This requires step-up authentication.`)) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/qa-tools/fixture-reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const body = (await response.json()) as { error?: string; run?: { status?: QaRun['status'] } };
      if (!response.ok) throw new Error(body.error ?? 'Fixture reset failed');
      setMessage(`Fixture reset ${body.run?.status ?? 'requested'}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Fixture reset failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) {
    return <p className="text-role-data text-text-muted">Loading QA console…</p>;
  }

  if (!data) {
    return <p className="text-role-data text-text-danger">{message ?? 'QA console unavailable.'}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="border border-border-warning bg-surface-warning px-5 py-4 text-text-warning dark:border-border-warning dark:bg-fill-warning/30 dark:text-text-warning" aria-label="QA sandbox banner">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-role-caption font-semibold uppercase tracking-widest">QA sandbox</p>
            <p className="mt-1 text-role-data font-semibold">{data.organization.name}</p>
            <p className="mt-1 text-role-caption">Sandbox-only controls. Provider writes must use sandbox credentials. Every request is recorded.</p>
          </div>
        </div>
      </section>

      <header>
        <p className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">Developer / QA</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-default">Test the exact operator path before release</h1>
        <p className="mt-2 max-w-2xl text-role-data text-text-muted">Use named scenarios and preserve the run ledger. Fixture reseed, reset, and read-only provider health checks execute in the QA sandbox; replay and failure controls follow next.</p>
      </header>

      <section className="border border-border-soft bg-surface-card p-5" aria-labelledby="qa-actions-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="qa-actions-heading" className="text-sm font-semibold text-text-default">Run a QA action</h2>
            <p className="mt-1 text-role-caption text-text-muted">Choose a stable scenario name so results can be compared across releases.</p>
          </div>
          <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={() => void load()} disabled={loading}>Refresh</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <SearchableSelectField
            label="Provider"
            value={provider}
            onChange={(value) => { if (typeof value === 'string') setProvider(value as HealthProvider); }}
            options={HEALTH_PROVIDER_OPTIONS}
            ariaLabel="Provider for connection health check"
            className="min-w-56"
            disabled={submitting}
          />
          <TextField label="Scenario" value={scenario} onChange={setScenario} maxLength={120} className="min-w-64 flex-1" />
          <Button variant="secondary" onClick={() => void createRun('health_check')} loading={submitting} disabled={!data.capabilities.canExecute}>Run health check</Button>
          <Button variant="execute" onClick={() => void createRun('fixture_reseed')} loading={submitting} disabled={!data.capabilities.canExecute}>Reseed fixtures</Button>
          <Button variant="danger" onClick={() => void requestFixtureReset()} loading={submitting} disabled={!data.capabilities.canResetFixtures}>Reset fixtures</Button>
        </div>
        <div className="mt-5 border-t border-border-soft pt-4" aria-labelledby="qa-replay-heading">
          <h3 id="qa-replay-heading" className="text-sm font-semibold text-text-default">Zoho webhook replay</h3>
          <p className="mt-1 text-role-caption text-text-muted">Replay a known sandbox event through the webhook normalize/dedupe/dispatch pipeline. Duplicate replay IDs are deduped before handler dispatch.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <SearchableSelectField
              label="Event"
              value={replayEventType}
              onChange={(value) => { if (typeof value === 'string') setReplayEventType(value as ReplayEventType); }}
              options={REPLAY_EVENT_OPTIONS}
              ariaLabel="Zoho webhook event type"
              className="min-w-64"
              disabled={submitting}
            />
            <TextField label="Replay ID" value={replayEventId} onChange={setReplayEventId} maxLength={92} className="min-w-64" />
            <TextField label="Provider object ID" value={replayObjectId} onChange={setReplayObjectId} maxLength={120} className="min-w-56" />
            <Button variant="secondary" onClick={() => void createRun('webhook_replay')} loading={submitting} disabled={!data.capabilities.canExecute || (replayEventType.endsWith('.deleted') && !data.capabilities.canDestructive)}>Replay webhook</Button>
          </div>
        </div>
        {message ? <p className="mt-3 text-role-caption font-semibold text-text-muted" role="status">{message}</p> : null}
      </section>

      <section className="border border-border-soft bg-surface-card" aria-labelledby="qa-history-heading">
        <div className="border-b border-border-soft px-5 py-4">
          <h2 id="qa-history-heading" className="text-sm font-semibold text-text-default">Recent runs</h2>
          <p className="mt-1 text-role-caption text-text-muted">Redacted ledger for {data.organization.slug}.</p>
        </div>
        {data.runs.length === 0 ? (
          <p className="px-5 py-8 text-role-data text-text-muted">No QA runs recorded yet.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {data.runs.map((run) => (
              <div key={run.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <p className="text-role-data font-semibold text-text-default">{ACTION_LABELS[run.action]}</p>
                  <p className="text-role-caption text-text-muted">{run.scenario}{run.metadata?.provider ? ` · ${run.metadata.provider}` : ''} · {run.id}</p>
                </div>
                <span className="text-role-caption font-semibold uppercase tracking-wider text-text-soft">{run.status}</span>
                <time className="text-role-caption text-text-soft" dateTime={run.createdAt}>{formatRunDate(run.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
