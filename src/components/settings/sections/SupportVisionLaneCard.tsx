'use client';

/**
 * Settings → Organization → **Support vision lane**.
 *
 * Asks whether a customer's pasted photo may leave the tenant's hardware when
 * Assist drafts a reply. Local-first is the product default; cloud is an
 * explicit opt-in.
 *
 * ## Two things this card is careful about
 *
 * **1. It stores the REQUEST, never the resolved lane.** Precedence
 * (org → deployment env → `local-only`) and the cloud-availability downgrade
 * live only in the vision-lane resolver. A card that re-implemented
 * "org wins over env" would be a second answer to one question — and would
 * drift the moment either side changed.
 *
 * **2. "Inherit" is a real third state.** Clearing the choice deletes the org
 * key so the env / local-first default returns. A checkbox that defaulted to
 * local-only would stamp an explicit value on first Save and hide the
 * deployment override forever.
 *
 * Same route as GS1 (`/api/admin/organization/settings`) — that is where the
 * jsonb merge + validation already live.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Panel } from '@/design-system/primitives';
import type { SupportVisionLane } from '@/lib/support/vision-lane';

interface SupportSettingsResponse {
  support?: {
    visionLane: SupportVisionLane | null;
    vertical: string | null;
  };
}

type DraftLane = SupportVisionLane | 'inherit';

const OPTIONS: ReadonlyArray<{
  key: DraftLane;
  label: string;
  hint: string;
  privacy: 'on-prem' | 'cloud' | 'inherit';
}> = [
  {
    key: 'inherit',
    label: 'Inherit deployment default',
    hint: 'Use the deployment default when set, otherwise keep photos on-prem.',
    privacy: 'inherit',
  },
  {
    key: 'local-only',
    label: 'Local only',
    hint: 'OCR and catalog matching stay on your hardware. No customer image is sent to a cloud model.',
    privacy: 'on-prem',
  },
  {
    key: 'cloud-multimodal',
    label: 'Allow cloud multimodal',
    hint: 'When a chat gateway is configured, Assist may send a signed image URL to draft from the photo. Still falls back to local-only if the gateway is absent.',
    privacy: 'cloud',
  },
];

const PRIVACY_CHIP: Record<string, string> = {
  'on-prem': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cloud: 'bg-amber-50 text-amber-700 ring-amber-200',
  inherit: 'bg-surface-canvas text-text-muted ring-border-soft',
};

const PRIVACY_LABEL: Record<string, string> = {
  'on-prem': 'On-prem',
  cloud: 'Cloud',
  inherit: 'Inherit',
};

export function SupportVisionLaneCard() {
  const [draft, setDraft] = useState<DraftLane>('inherit');
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
        setErr("Couldn't load support vision settings.");
        return;
      }
      const data = (await r.json()) as SupportSettingsResponse;
      setDraft(data.support?.visionLane ?? 'inherit');
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
          support: {
            visionLane: draft === 'inherit' ? null : draft,
          },
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
    <Panel id="support-vision-lane" className="space-y-5 scroll-mt-6">
      <div>
        <h3 className="text-sm font-semibold text-text-default">Support vision lane</h3>
        <p className="mt-1 text-xs text-text-soft">
          When an agent pastes a carton label onto a ticket, Assist can draft from what the image
          shows. This switch decides whether that image may leave your building.
        </p>
      </div>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</div>}

      <ul className="space-y-2">
        {OPTIONS.map((opt) => {
          const selected = draft === opt.key;
          return (
                <li key={opt.key}>
                  {/* ds-raw-button: full-width selectable option card (privacy chip + hint) */}
                  <button
                    type="button"
                    onClick={() => setDraft(opt.key)}
                    aria-pressed={selected}
                className={
                  'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ' +
                  (selected
                    ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/20'
                    : 'border-border-soft bg-surface-card hover:border-border-default')
                }
              >
                <span
                  className={
                    'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset ' +
                    PRIVACY_CHIP[opt.privacy]
                  }
                >
                  {PRIVACY_LABEL[opt.privacy]}
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
          {saving ? 'Saving…' : 'Save vision lane'}
        </Button>
      </div>
    </Panel>
  );
}
