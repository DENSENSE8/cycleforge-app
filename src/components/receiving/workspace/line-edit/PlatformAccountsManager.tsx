'use client';

/** CRUD manager for the org's storefront accounts (platform_accounts), grouped under their platform. */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { Check, Loader2, Pencil, Plus, Trash2, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { requestConfirm } from '@/design-system/components/confirm';
import type { PlatformAccountRow } from '@/lib/neon/catalog-queries';
import { usePlatformAccountCatalog, usePlatformCatalog, useInvalidateCatalog } from '@/hooks/useCatalog';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { isPlatformDefaultAccount, normalizeShortLabelInput, PLATFORM_SHORT_LABEL_MAX } from '@/lib/platform-display';
import { cn } from '@/utils/_cn';



const TEXT_INPUT =
  cn('w-full rounded-lg border border-border-soft bg-surface-card inset-cozy text-role-caption text-text-default transition-colors', focusRing('field', 'accent'));

const BASE = '/api/catalog/platform-accounts';

export function PlatformAccountsManager() {
  const invalidate = useInvalidateCatalog();
  const { rows: platforms, isLoading: platformsLoading } = usePlatformCatalog();
  const { rows: accounts, isLoading: accountsLoading } = usePlatformAccountCatalog({ includeInactive: true });

  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editShort, setEditShort] = useState('');
  const [busyId, setBusyId] = useState<number | 'new' | null>(null);

  async function call(method: string, path: string, body?: unknown): Promise<boolean> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      toast.error(data?.error || `${method} failed (${res.status})`);
      return false;
    }
    invalidate();
    return true;
  }

  async function add(platformId: number) {
    const label = addLabel.trim();
    if (!label || busyId != null) return;
    setBusyId('new');
    if (await call('POST', '', { platformId, label })) {
      setAddLabel('');
      setAddingFor(null);
    }
    setBusyId(null);
  }

  async function saveRename(id: number) {
    const label = editLabel.trim();
    if (!label) return;
    setBusyId(id);
    if (await call('PATCH', `/${id}`, { label, shortLabel: normalizeShortLabelInput(editShort) })) {
      setEditingId(null);
    }
    setBusyId(null);
  }

  async function setActive(a: PlatformAccountRow, next: boolean) {
    if (busyId != null) return;
    if (!next) {
      const ok = await requestConfirm({
        description: `Remove "${a.label}"? It will stop appearing as a channel.`,
        tone: 'danger',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
    }
    setBusyId(a.id);
    await call(next ? 'PATCH' : 'DELETE', `/${a.id}`, next ? { isActive: true } : undefined);
    setBusyId(null);
  }

  if (platformsLoading || accountsLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-role-caption text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
      </div>
    );
  }

  const platformById = new Map(platforms.map((p) => [String(p.id), p]));
  const listed = accounts.filter((a) => {
    const platform = platformById.get(String(a.platform_id));
    return platform != null && !isPlatformDefaultAccount(platform, a);
  });
  const hiddenList = listed.filter((a) => !a.is_active);

  return (
    <div className="space-y-4">
      {platforms.map((p) => {
        const activeList = listed.filter((a) => a.is_active && String(a.platform_id) === String(p.id));
        const isAdding = addingFor === p.id;
        return (
          <div key={p.id}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-role-eyebrow text-text-faint">{p.label}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAddingFor(isAdding ? null : p.id);
                  setAddLabel('');
                }}
                className="text-blue-600 hover:bg-blue-50"
                icon={<Plus />}
              >
                Account
              </Button>
            </div>

            <ul className="space-y-1.5">
              {activeList.map((a) => {
                const rowBusy = busyId === a.id;
                const isEditing = editingId === a.id;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface-card inset-cozy"
                  >
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          value={editLabel}
                          aria-label="Connection name"
                          onChange={(ev) => setEditLabel(ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') void saveRename(a.id);
                            if (ev.key === 'Escape') setEditingId(null);
                          }}
                          className={`${TEXT_INPUT} flex-1`}
                        />
                        <input
                          value={editShort}
                          maxLength={PLATFORM_SHORT_LABEL_MAX}
                          aria-label="Connection short label"
                          placeholder="SHORT"
                          onChange={(ev) => setEditShort(ev.target.value.toUpperCase())}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') void saveRename(a.id);
                            if (ev.key === 'Escape') setEditingId(null);
                          }}
                          className={`${TEXT_INPUT} w-24 shrink-0 font-mono `}
                        />
                      </>
                    ) : (
                      <span className="flex flex-1 items-center gap-2 truncate text-role-caption font-semibold text-text-default">
                        {a.label}
                        {a.short_label ? (
                          <span className="shrink-0 rounded bg-surface-sunken inset-chip font-mono text-role-eyebrow text-text-default">
                            {a.short_label}
                          </span>
                        ) : null}
                      </span>
                    )}

                    {rowBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
                    ) : isEditing ? (
                      <>
                        <IconButton
                          onClick={() => void saveRename(a.id)}
                          ariaLabel="Save"
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                          icon={<Check className="h-4 w-4" />}
                        />
                        <IconButton
                          onClick={() => setEditingId(null)}
                          ariaLabel="Cancel"
                          className="rounded p-1 text-text-faint hover:bg-surface-sunken"
                          icon={<X className="h-4 w-4" />}
                        />
                      </>
                    ) : (
                      <>
                        <IconButton
                          onClick={() => {
                            setEditingId(a.id);
                            setEditLabel(a.label);
                            setEditShort(a.short_label ?? '');
                          }}
                          ariaLabel={`Rename ${a.label}`}
                          className="rounded p-1 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                          icon={<Pencil className="h-3.5 w-3.5" />}
                        />
                        <IconButton
                          onClick={() => void setActive(a, false)}
                          ariaLabel={`Remove ${a.label}`}
                          className="rounded p-1 text-text-faint hover:bg-rose-50 hover:text-rose-600"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                        />
                      </>
                    )}
                  </li>
                );
              })}

              {isAdding ? (
                <li className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void add(p.id);
                      if (e.key === 'Escape') setAddingFor(null);
                    }}
                    placeholder={`New ${p.label} account…`}
                    className={`${TEXT_INPUT} flex-1`}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void add(p.id)}
                    disabled={!addLabel.trim() || busyId != null}
                    loading={busyId === 'new'}
                    icon={<Plus />}
                  >
                    Add
                  </Button>
                </li>
              ) : null}
            </ul>
          </div>
        );
      })}

      {hiddenList.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-role-eyebrow text-text-faint">
            Hidden ({hiddenList.length})
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {hiddenList.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border-soft bg-surface-canvas inset-cozy"
              >
                <span className="flex-1 truncate text-role-caption font-semibold text-text-faint line-through">
                  {platformById.get(String(a.platform_id))?.label} · {a.label}
                </span>
                {busyId === a.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void setActive(a, true)}
                    className="text-blue-600 hover:bg-blue-50"
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
