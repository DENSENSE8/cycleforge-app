'use client';

/** Settings → AI & Search → **Provider order**. */

import { useCallback, useEffect, useState } from 'react';
import { Button, Panel } from '@/design-system/primitives';
import type { AiProviderOrder } from '@/lib/ai/provider-order';

interface AiSettingsResponse {
  ai?: { providerOrder: AiProviderOrder | null };
}

type DraftOrder = AiProviderOrder | 'inherit';

const OPTIONS: ReadonlyArray<{
  key: DraftOrder;
  label: string;
  hint: string;
  chip: 'on-prem' | 'cloud' | 'inherit';
}> = [
  {
    key: 'inherit',
    label: 'Inherit deployment default',
    hint: 'Use the deployment default when set, otherwise try your own hardware first.',
    chip: 'inherit',
  },
  {
    key: 'local-first',
    label: 'Self-hosted first',
    hint: 'Try your own endpoint before any cloud provider. Falls forward to cloud automatically when it is down, cold, or unreachable.',
    chip: 'on-prem',
  },
  {
    key: 'cloud-first',
    label: 'Cloud first',
    hint: 'Try your connected cloud providers before your own endpoint. Choose this when your local model is slower than the answer is worth.',
    chip: 'cloud',
  },
];

const CHIP_CLASS: Record<string, string> = {
  'on-prem': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cloud: 'bg-amber-50 text-amber-700 ring-amber-200',
  inherit: 'bg-surface-canvas text-text-muted ring-border-soft',
};

const CHIP_LABEL: Record<string, string> = {
  'on-prem': 'On-prem',
  cloud: 'Cloud',
  inherit: 'Inherit',
};

export function AiProviderOrderCard() {
  const [draft, setDraft] = useState<DraftOrder>('inherit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/organization/settings', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) {
        setErr("Couldn't load AI provider settings.");
        return;
      }
      const data = (await r.json()) as AiSettingsResponse;
      setDraft(data.ai?.providerOrder ?? 'inherit');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const r = await fetch('/api/admin/organization/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ai: { providerOrder: draft === 'inherit' ? null : draft },
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErr(String((data as { error?: string }).error || "Couldn't save."));
        return;
      }
      setOk('Saved.');
      await load();
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  if (loading) return <div className="text-sm text-text-soft">Loading…</div>;

  return (
    <Panel id="ai-provider-order" className="space-y-5 scroll-mt-6">
      <div>
        <h3 className="text-sm font-semibold text-text-default">Provider order</h3>
        <p className="mt-1 text-xs text-text-soft">
          Which connected provider an AI call tries first. This is a preference, not a promise —
          a provider that is unreachable is skipped, and the one that actually answered each call
          is recorded in the usage table below.
        </p>
      </div>

      {err && <div className="rounded-none bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-none bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</div>}

      <ul className="space-y-2">
        {OPTIONS.map((opt) => {
          const selected = draft === opt.key;
          return (
            <li key={opt.key}>
              {/* ds-raw-button: full-width selectable option card (chip + hint) */}
              <button
                type="button"
                onClick={() => setDraft(opt.key)}
                aria-pressed={selected}
                className={
                  'flex w-full items-start gap-3 rounded-none border px-3 py-2.5 text-left transition-colors ' +
                  (selected
                    ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/20'
                    : 'border-border-soft bg-surface-card hover:border-border-default')
                }
              >
                <span
                  className={
                    'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset ' +
                    CHIP_CLASS[opt.chip]
                  }
                >
                  {CHIP_LABEL[opt.chip]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-default">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-text-soft">{opt.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-3 border-t border-border-hairline pt-4">
        <Button variant="brand" size="md" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save provider order'}
        </Button>
      </div>
    </Panel>
  );
}
