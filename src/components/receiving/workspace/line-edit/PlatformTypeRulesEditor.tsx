'use client';

/** Which receiving types a platform allows — the editor for `platform_type_rules`, rendered inline under a PLATFORM row in {@link… */

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { requestConfirm } from '@/design-system/components/confirm';
import { toast } from '@/lib/toast';
import type { PlatformRow, TypeRow } from '@/lib/neon/catalog-queries';
import { usePlatformTypeRules } from '@/hooks/useCatalog';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const SELECT = cn(
  'w-full rounded-lg border border-border-soft bg-surface-card inset-cozy text-role-caption text-text-default transition-colors',
  focusRing('field', 'accent'),
);

const API = '/api/catalog/platform-type-rules';

export function PlatformTypeRulesEditor({
  platform,
  types,
  onChanged,
}: {
  platform: PlatformRow;
  /** The org's active receiving types — the pool a rule can point at. */
  types: TypeRow[];
  onChanged: () => void;
}) {
  const rules = usePlatformTypeRules();
  const [busy, setBusy] = useState<number | 'add' | null>(null);
  const [adding, setAdding] = useState('');

  // `Number()` on both sides, always.
  const platformId = Number(platform.id);
  const mine = rules.filter((r) => Number(r.platformId) === platformId);
  const takenTypeIds = new Set(mine.map((r) => Number(r.typeId)));
  const addable = types.filter((t) => !takenTypeIds.has(Number(t.id)));

  async function call(
    url: string,
    init: RequestInit,
    key: number | 'add',
  ): Promise<boolean> {
    setBusy(key);
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(data?.error || `Update failed (${res.status})`);
        return false;
      }
      onChanged();
      return true;
    } catch {
      toast.error('Network error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const typeId = Number(adding);
    if (!typeId) return;
    const first = mine.length === 0;
    const ok = await call(
      API,
      { method: 'POST', body: JSON.stringify({ platformId, typeId, isDefault: first }) },
      'add',
    );
    if (ok) {
      setAdding('');
      if (first) {
        toast.success(`${platform.label} now only accepts the types listed here`);
      }
    }
  }

  async function remove(ruleId: number, label: string) {
    // The last rule is a MODE change, not a row delete: the platform goes from
    // "only these" back to "anything". Nothing else in this manager flips a
    // meaning on delete, so it is worth one confirm.
    if (mine.length === 1) {
      const go = await requestConfirm({
        title: `Remove the last rule on ${platform.label}?`,
        description:
          `${platform.label} will go back to accepting every receiving type — not none. ` +
          `Removing "${label}" reopens the platform rather than closing it.`,
        confirmLabel: 'Reopen platform',
        tone: 'danger',
      });
      if (!go) return;
    }
    await call(`${API}/${ruleId}`, { method: 'DELETE' }, ruleId);
  }

  async function makeDefault(ruleId: number) {
    // Promotion demotes the current default server-side, in one transaction —
    // the partial unique index forbids two, so this must not be two requests.
    await call(`${API}/${ruleId}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }, ruleId);
  }

  return (
    <div className="rounded-lg border border-border-soft bg-surface-sunken p-3">
      <p className="text-role-caption font-semibold text-text-default">Allowed receiving types</p>

      {mine.length === 0 ? (
        <p className="mt-1 text-role-caption text-text-soft">
          No rules — <span className="font-semibold">every type is allowed</span> on{' '}
          {platform.label}. Add one to restrict it to a set.
        </p>
      ) : (
        <p className="mt-1 text-role-caption text-text-soft">
          {platform.label} accepts only these. The default is applied automatically when a
          carton lands here without a type.
        </p>
      )}

      {mine.length > 0 ? (
        <ul className="mt-2 space-y-1" data-testid="platform-type-rule-rows">
          {mine.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-card px-2 py-1.5"
              data-rule-type={r.type}
            >
              <span className="min-w-0 flex-1 truncate text-role-caption font-medium text-text-default">
                {r.typeLabel ?? r.type}
              </span>
              {r.isDefault ? (
                <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-role-micro font-semibold text-blue-700">
                  Default
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void makeDefault(r.id!)}
                  disabled={busy != null}
                  className={cn(
                    'ds-raw-button shrink-0 rounded px-1.5 py-0.5 text-role-micro font-semibold text-text-faint hover:bg-surface-hover hover:text-text-muted disabled:opacity-50',
                    focusRing('control', 'accent'),
                  )}
                >
                  Make default
                </button>
              )}
              <HoverTooltip label={`Stop allowing ${r.typeLabel ?? r.type}`} asChild>
                <IconButton
                  type="button"
                  onClick={() => void remove(r.id!, r.typeLabel ?? r.type)}
                  disabled={busy != null}
                  ariaLabel={`Remove ${r.typeLabel ?? r.type} from ${platform.label}`}
                  icon={
                    busy === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )
                  }
                  className="rounded p-1 text-text-faint hover:bg-surface-danger hover:text-text-danger"
                />
              </HoverTooltip>
            </li>
          ))}
        </ul>
      ) : null}

      {addable.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <select
            className={SELECT}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            disabled={busy != null}
            aria-label={`Allow a receiving type on ${platform.label}`}
            data-testid="platform-type-rule-add-select"
          >
            <option value="">Allow a type…</option>
            {addable.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void add()}
            disabled={busy != null || !adding}
            icon={
              busy === 'add' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )
            }
            data-testid="platform-type-rule-add"
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
