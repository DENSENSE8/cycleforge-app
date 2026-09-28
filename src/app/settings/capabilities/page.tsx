/**
 * /settings/capabilities — what this org has switched on, and its build
 * history (SIMPLE-FIRST, docs/product/SIMPLE-FIRST.md). The chat is the main
 * door ("I need to record purchase orders"); this page is the ledger and the
 * manual switch.
 */

import { requirePermission } from '@/lib/auth/page-guard';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { listCapabilityEvents, loadCapabilityViews, type CapabilityEventRow } from '@/lib/capabilities/store';
import type { CapabilityState } from '@/lib/capabilities/catalog';
import type { OrgId } from '@/lib/tenancy/constants';
import { cn } from '@/utils/_cn';
import { CapabilitySwitch } from './CapabilitySwitch';

export const metadata = { title: 'Capabilities & history' };

const STATE_FACE: Record<CapabilityState, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-surface-success text-text-success' },
  setting_up: { label: 'Setting up', tone: 'bg-surface-warning text-text-warning' },
  suggested: { label: 'Suggested', tone: 'bg-surface-sunken text-text-soft' },
  locked: { label: 'Off', tone: 'bg-surface-sunken text-text-muted' },
};

const EVENT_VERB: Record<CapabilityEventRow['event'], string> = {
  suggested: 'suggested',
  setup_started: 'started setting up',
  activated: 'turned on',
  deactivated: 'turned off',
  backfilled: 'carried over (already in use)',
  imported: 'imported',
};

const SOURCE_FACE: Record<CapabilityEventRow['source'], string> = {
  chat: 'from chat',
  settings: 'in Settings',
  backfill: 'at rollout',
  system: 'automatically',
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function eventDetail(e: CapabilityEventRow): string | null {
  if (e.event !== 'imported') return null;
  const d = e.detail as { listings?: number; created?: number };
  return `${d.listings ?? 0} listings · ${d.created ?? 0} new products`;
}

export default async function CapabilitiesPage() {
  const user = await requirePermission('admin.view');
  const orgId = user.organizationId as OrgId;
  const [views, events] = await Promise.all([loadCapabilityViews(orgId), listCapabilityEvents(orgId, { limit: 200 })]);
  const canSwitch = user.permissions.has('admin.manage_features');

  return (
    <div className={cn('min-h-screen antialiased', SETTINGS_FLOOR_CLASS)}>
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        <SettingsSectionHeader title="Capabilities & history" />
        <p className="text-sm text-text-soft">
          Your workspace starts with the AI chat. Tell the chat what you need and it turns the matching capability on; its
          pages then appear in the sidebar. Every change is recorded below.
        </p>

        <section aria-label="Capabilities" className="rounded-mode border border-border-soft bg-surface-card shadow-sm" data-capabilities-list>
          <ul className="divide-y divide-border-soft">
            {views.map((v) => {
              const face = STATE_FACE[v.state];
              const missing = v.prerequisites.filter((p) => !p.met);
              return (
                <li key={v.def.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" data-capability={v.def.id} data-capability-state={v.state}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-role-body font-semibold text-text-default">{v.def.label}</span>
                      <span className={cn('rounded px-1.5 py-px text-role-micro font-medium', face.tone)}>{face.label}</span>
                    </div>
                    <p className="text-role-caption text-text-soft">{v.def.blurb}</p>
                    {missing.length > 0 && v.state !== 'locked' ? (
                      <p className="text-role-caption text-text-warning">Still needed: {missing.map((m) => m.label).join(', ')}</p>
                    ) : null}
                    {v.row?.enabledAt ? (
                      <p className="text-role-micro text-text-muted">
                        On since {when(v.row.enabledAt)}
                        {v.row.enabledByName ? ` · ${v.row.enabledByName}` : ''} · {SOURCE_FACE[v.row.source]}
                      </p>
                    ) : null}
                  </div>
                  {canSwitch ? <CapabilitySwitch capabilityId={v.def.id} on={v.state === 'active' || v.state === 'setting_up'} /> : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Org history" className="space-y-2" data-org-history>
          <h2 className="text-role-body font-semibold text-text-default">Org history</h2>
          {events.length === 0 ? (
            <p className="text-role-caption text-text-soft">Nothing yet — ask the chat what your business needs.</p>
          ) : (
            <ol className="divide-y divide-border-soft rounded-mode border border-border-soft bg-surface-card shadow-sm">
              {events.map((e) => {
                const detail = eventDetail(e);
                return (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-role-caption" data-history-event={e.event}>
                    <time className="w-40 shrink-0 tabular-nums text-text-muted" dateTime={e.createdAt}>{when(e.createdAt)}</time>
                    <span className="min-w-0 flex-1 text-text-default">
                      <span className="font-medium">{e.staffName ?? 'System'}</span> {EVENT_VERB[e.event]}{' '}
                      <span className="font-medium">{e.capabilityLabel}</span> {SOURCE_FACE[e.source]}
                      {e.agentMutationId ? <span className="text-text-muted"> · change #{e.agentMutationId}</span> : null}
                      {detail ? <span className="text-text-muted"> · {detail}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
