'use client';

/**
 * Reusable CRUD list for one org catalog kind (platform | type): active rows
 * with inline rename, reorder (up/down), hide, and delete; a "Hidden" section
 * with Restore; and an add row. Backed by /api/catalog/{platforms,types} and
 * the catalog query factory.
 *
 * Built-in (`is_system`) rows are protected — badged "Default", slug immutable
 * (rename edits the label only), hide-only — while custom rows are removable.
 * All deletes are soft, so anything hidden/removed is restorable below.
 *
 * Platforms additionally expose an accent color picker (`color_hex`) with a
 * live contrast preview — ink is derived via {@link platformPaintFromHex}.
 *
 * Layout-agnostic (no overlay/card chrome): the {@link CatalogManagerPopover}
 * wraps it in a RightPaneOverlay; the /settings catalog section drops it into a
 * card. When the catalog has no DB rows yet (migration unapplied) it shows the
 * built-in defaults read-only with a one-line notice.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Check, ChevronDown, ChevronUp, Loader2, Pencil, Plus, Settings, Trash2, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  ColorSwatchPicker,
  type ColorSwatch,
} from '@/components/ui/ColorSwatchPicker';
import { Button, IconButton } from '@/design-system/primitives';
import { requestConfirm } from '@/design-system/components/confirm';
import { platformsQuery, typesQuery } from '@/lib/queries/catalog-queries';
import type { PlatformRow, TypeRow } from '@/lib/neon/catalog-queries';
import { useInvalidateCatalog } from '@/hooks/useCatalog';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { SOURCE_PLATFORM_OPTS, RECEIVING_TYPE_OPTS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TypeBindingsEditor } from './TypeBindingsEditor';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



export type CatalogKind = 'platform' | 'type';

const API_BASE: Record<CatalogKind, string> = {
  platform: '/api/catalog/platforms',
  type: '/api/catalog/types',
};

const TEXT_INPUT =
  cn('w-full rounded-lg border border-border-soft bg-surface-card inset-cozy text-role-caption text-text-default transition-colors', focusRing('field', 'accent'));

/** Accessible mid-saturation presets for platform origin tags. */
const PLATFORM_COLOR_PRESETS: ReadonlyArray<ColorSwatch> = [
  { hex: '#2563eb', label: 'Blue' },
  { hex: '#0ea5e9', label: 'Sky' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#84cc16', label: 'Lime' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#64748b', label: 'Slate' },
  { hex: '#0f172a', label: 'Ink' },
];

interface Entry {
  id: number;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  colorHex: string | null;
}

function PlatformColorPreview({ hex, label }: { hex: string; label: string }) {
  const paint = platformPaintFromHex(hex);
  if (!paint) return null;
  // ds-allow-hex: live preview of platforms.color_hex + luminance ink.
  return (
    <HoverTooltip label={`${label} — ${paint.accent}`} asChild>
      <span
        className="inline-flex max-w-[7rem] truncate rounded-md border px-1.5 py-0.5 text-role-eyebrow font-semibold"
        style={{
          backgroundColor: paint.accent,
          color: paint.ink,
          borderColor: paint.border,
        }}
      >
        {label}
      </span>
    </HoverTooltip>
  );
}

export function CatalogManagerList({
  kind,
  enabled = true,
  enableTypeBindings = false,
  autoFocusAdd = false,
}: {
  kind: CatalogKind;
  enabled?: boolean;
  /** Show the per-type account + workflow-node binding editor (settings page). */
  enableTypeBindings?: boolean;
  /** Focus the "New platform/type" field — hover-menu Add platform / Add type. */
  autoFocusAdd?: boolean;
}) {
  const invalidate = useInvalidateCatalog();
  const base = API_BASE[kind];
  const isPlatform = kind === 'platform';

  // Manager shows EVERYTHING (active + hidden) so a hidden default can be
  // restored — unlike the pickers, which read active-only via useCatalog.
  const platformQ = useQuery({ ...platformsQuery({ includeInactive: true }), enabled: enabled && kind === 'platform' });
  const typeQ = useQuery({ ...typesQuery({ includeInactive: true }), enabled: enabled && kind === 'type' });
  const rawRows: Array<PlatformRow | TypeRow> = kind === 'platform' ? platformQ.data ?? [] : typeQ.data ?? [];
  // Full type rows (with platform_account_id / workflow_node_id) for the binding
  // editor — `entries` below intentionally narrows to the shared shape.
  const typeRowById = new Map<number, TypeRow>(
    kind === 'type' ? (rawRows as TypeRow[]).map((r) => [r.id, r]) : [],
  );
  const bindingsOn = enableTypeBindings && kind === 'type';

  const entries: Entry[] = rawRows.map((r) => ({
    id: r.id,
    label: r.label,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    isSystem: r.is_system,
    colorHex: isPlatform ? ((r as PlatformRow).color_hex ?? null) : null,
  }));
  const editable = entries.length > 0;
  const active = entries.filter((e) => e.isActive);
  const hidden = entries.filter((e) => !e.isActive);
  const fallbackLabels =
    kind === 'platform' ? SOURCE_PLATFORM_OPTS.map((o) => o.label) : RECEIVING_TYPE_OPTS.map((o) => o.label);

  const [adding, setAdding] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busyId, setBusyId] = useState<number | 'new' | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [colorEditingId, setColorEditingId] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!enabled || !autoFocusAdd) return;
    const id = window.setTimeout(() => addInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [enabled, autoFocusAdd, kind]);

  async function call(method: string, path: string, body?: unknown): Promise<boolean> {
    const res = await fetch(`${base}${path}`, {
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

  async function add() {
    const label = adding.trim();
    if (!label || busyId != null) return;
    setBusyId('new');
    if (await call('POST', '', { label })) setAdding('');
    setBusyId(null);
  }

  async function saveRename(id: number) {
    const label = editLabel.trim();
    if (!label) return;
    setBusyId(id);
    if (await call('PATCH', `/${id}`, { label })) setEditingId(null);
    setBusyId(null);
  }

  async function saveColor(id: number, colorHex: string | null) {
    if (busyId != null) return;
    setBusyId(id);
    await call('PATCH', `/${id}`, { colorHex });
    setBusyId(null);
  }

  async function setActive(e: Entry, next: boolean) {
    if (busyId != null) return;
    if (!next) {
      const ok = await requestConfirm({
        description: `${e.isSystem ? 'Hide' : 'Remove'} "${e.label}"? It will stop appearing in pickers.`,
        tone: 'danger',
        confirmLabel: e.isSystem ? 'Hide' : 'Remove',
      });
      if (!ok) return;
    }
    setBusyId(e.id);
    await call(next ? 'PATCH' : 'DELETE', `/${e.id}`, next ? { isActive: true } : undefined);
    setBusyId(null);
  }

  async function move(index: number, dir: -1 | 1) {
    const a = active[index];
    const b = active[index + dir];
    if (!a || !b || busyId != null) return;
    setBusyId(a.id);
    const ok = await call('PATCH', `/${a.id}`, { sortOrder: b.sortOrder });
    if (ok) await call('PATCH', `/${b.id}`, { sortOrder: a.sortOrder });
    setBusyId(null);
  }

  return (
    <div>
      {!editable ? (
        <>
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 inset-field text-role-micro font-semibold text-amber-800">
            Showing built-in defaults. Apply migration <code>2026-06-13g</code> to add or edit your own.
          </div>
          <ul className="space-y-1.5">
            {fallbackLabels.map((label) => (
              <li
                key={label}
                className="rounded-lg border border-border-soft bg-surface-card inset-cozy text-role-caption font-semibold text-text-faint"
              >
                {label}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="space-y-1.5">
          {active.map((e, i) => {
            const rowBusy = busyId === e.id;
            const isEditing = editingId === e.id;
            const expanded = bindingsOn && expandedId === e.id;
            const colorOpen = isPlatform && colorEditingId === e.id;
            return (
              <li key={e.id} className="rounded-lg border border-border-soft bg-surface-card">
              <div className="flex items-center gap-2 inset-cozy">
                <div className="flex flex-col">
                  <IconButton
                    type="button"
                    disabled={i === 0 || busyId != null}
                    onClick={() => void move(i, -1)}
                    ariaLabel="Move up"
                    icon={<ChevronUp className="h-3.5 w-3.5" />}
                    className="text-text-faint hover:text-text-muted disabled:opacity-30"
                  />
                  <IconButton
                    type="button"
                    disabled={i === active.length - 1 || busyId != null}
                    onClick={() => void move(i, 1)}
                    ariaLabel="Move down"
                    icon={<ChevronDown className="h-3.5 w-3.5" />}
                    className="text-text-faint hover:text-text-muted disabled:opacity-30"
                  />
                </div>

                {isEditing ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(ev) => setEditLabel(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') void saveRename(e.id);
                      if (ev.key === 'Escape') setEditingId(null);
                    }}
                    className={`${TEXT_INPUT} flex-1`}
                  />
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-role-caption font-semibold text-text-default">
                    {e.label}
                    {e.isSystem ? (
                      <span className="shrink-0 rounded-full bg-surface-sunken inset-chip text-role-eyebrow uppercase tracking-wider text-text-soft">
                        Default
                      </span>
                    ) : null}
                    {isPlatform && e.colorHex ? (
                      <PlatformColorPreview hex={e.colorHex} label={e.label} />
                    ) : null}
                  </span>
                )}

                {rowBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
                ) : isEditing ? (
                  <>
                    <IconButton
                      type="button"
                      onClick={() => void saveRename(e.id)}
                      ariaLabel="Save"
                      icon={<Check className="h-4 w-4" />}
                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                    />
                    <IconButton
                      type="button"
                      onClick={() => setEditingId(null)}
                      ariaLabel="Cancel"
                      icon={<X className="h-4 w-4" />}
                      className="rounded p-1 text-text-faint hover:bg-surface-sunken"
                    />
                  </>
                ) : (
                  <>
                    {isPlatform ? (
                      <HoverTooltip label="Accent color" asChild>
                        <IconButton
                          type="button"
                          onClick={() => setColorEditingId(colorOpen ? null : e.id)}
                          ariaLabel={`${colorOpen ? 'Hide' : 'Edit'} color for ${e.label}`}
                          aria-expanded={colorOpen}
                          icon={
                            <span
                              className="block h-3.5 w-3.5 rounded-full border border-border-soft"
                              style={{
                                // ds-allow-hex: swatch button face for platforms.color_hex
                                backgroundColor: e.colorHex ?? undefined,
                                backgroundImage: e.colorHex
                                  ? undefined
                                  : 'conic-gradient(from 90deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)',
                              }}
                            />
                          }
                          className={`rounded p-1 hover:bg-surface-sunken ${colorOpen ? 'ring-2 ring-border-strong' : ''}`}
                        />
                      </HoverTooltip>
                    ) : null}
                    {bindingsOn ? (
                      <HoverTooltip label="Account & workflow bindings" asChild>
                        <IconButton
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : e.id)}
                          ariaLabel={`${expanded ? 'Hide' : 'Edit'} bindings for ${e.label}`}
                          aria-expanded={expanded}
                          icon={<Settings className="h-3.5 w-3.5" />}
                          className={`rounded p-1 hover:bg-surface-sunken ${expanded ? 'text-blue-600' : 'text-text-faint hover:text-text-muted'}`}
                        />
                      </HoverTooltip>
                    ) : null}
                    <IconButton
                      type="button"
                      onClick={() => {
                        setEditingId(e.id);
                        setEditLabel(e.label);
                      }}
                      ariaLabel={`Rename ${e.label}`}
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      className="rounded p-1 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                    />
                    <HoverTooltip label={e.isSystem ? 'Hide (restorable below)' : 'Remove'} asChild>
                      <IconButton
                        type="button"
                        onClick={() => void setActive(e, false)}
                        ariaLabel={`${e.isSystem ? 'Hide' : 'Remove'} ${e.label}`}
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        className="rounded p-1 text-text-faint hover:bg-rose-50 hover:text-rose-600"
                      />
                    </HoverTooltip>
                  </>
                )}
              </div>
              {colorOpen ? (
                <div className="space-y-2 border-t border-border-soft px-2.5 py-2.5">
                  <div className="flex items-center gap-2">
                    {e.colorHex ? (
                      <PlatformColorPreview hex={e.colorHex} label={e.label} />
                    ) : (
                      <span className="text-role-micro text-text-faint">
                        Default tone — pick a custom accent
                      </span>
                    )}
                  </div>
                  <ColorSwatchPicker
                    value={e.colorHex}
                    onChange={(hex) => void saveColor(e.id, hex)}
                    presets={PLATFORM_COLOR_PRESETS}
                    allowNone
                    showHex
                    shape="square"
                    disabled={busyId != null}
                  />
                </div>
              ) : null}
              {expanded && typeRowById.get(e.id) ? (
                <div className="px-2.5 pb-2.5">
                  <TypeBindingsEditor type={typeRowById.get(e.id)!} onChanged={invalidate} />
                </div>
              ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hidden.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">Hidden</p>
          <ul className="space-y-1.5">
            {hidden.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border-soft bg-surface-canvas inset-cozy"
              >
                <span className="flex-1 truncate text-role-caption font-semibold text-text-faint line-through">{e.label}</span>
                {busyId === e.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void setActive(e, true)}
                    className="h-auto rounded px-2 py-0.5 text-role-micro uppercase tracking-wider text-blue-600 hover:bg-blue-50"
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Add */}
      <div className="mt-3 flex items-center gap-2">
        <input
          ref={addInputRef}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          disabled={!editable}
          placeholder={editable ? `New ${kind}…` : 'Apply the migration to add'}
          className={`${TEXT_INPUT} flex-1 disabled:cursor-not-allowed disabled:opacity-60`}
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void add()}
          disabled={!editable || !adding.trim() || busyId != null}
          loading={busyId === 'new'}
          icon={<Plus className="h-3.5 w-3.5" />}
          className="text-role-micro uppercase tracking-wider"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
