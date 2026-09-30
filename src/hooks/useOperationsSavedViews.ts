'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  useOperationsTimelineUrlState,
  type JourneyUrlFilters,
} from '@/components/sidebar/operations/useOperationsTimelineUrlState';
import { SYSTEM_SAVED_VIEWS, systemViewParam } from '@/lib/operations/saved-view-presets';

/**
 * Server-backed saved views for the Master Operations Journey. Persistence only —
 * the active view is the URL (applying a view writes its filters to the params via
 * the URL-state hook), so the Monitor "filters live in the URL" invariant holds.
 */

interface OperationsSavedView {
  id: number;
  name: string;
  filters: Partial<JourneyUrlFilters>;
  is_shared: boolean;
  sort_order: number;
  staff_id: number;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['operations-saved-views'] as const;

async function postJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

export function useOperationsSavedViews() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const enabled = !!user?.staffId;

  const list = useQuery({
    queryKey: QUERY_KEY,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OperationsSavedView[]> => {
      const res = await fetch('/api/operations/saved-views');
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.views) ? json.views : [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const create = useMutation({
    mutationFn: (body: { name: string; filters: Partial<JourneyUrlFilters>; isShared?: boolean }) =>
      postJson('/api/operations/saved-views', 'POST', body),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: number } & Partial<Pick<OperationsSavedView, 'name' | 'is_shared'>> & { filters?: Partial<JourneyUrlFilters>; isShared?: boolean }) =>
      postJson(`/api/operations/saved-views/${id}`, 'PATCH', patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => postJson(`/api/operations/saved-views/${id}`, 'DELETE'),
    onSuccess: invalidate,
  });

  return {
    views: list.data ?? [],
    isLoading: list.isLoading,
    create: create.mutate,
    creating: create.isPending,
    createError: create.error instanceof Error ? create.error.message : null,
    update: update.mutate,
    remove: remove.mutate,
    removing: remove.isPending,
  };
}

/** One preset the contextual sidebar paints (`NavFilters` saved views). */
export interface OperationsSavedViewPreset {
  /** `sys:<id>` for a system preset, else the saved row id — the `?view=` marker. */
  id: string;
  name: string;
  isMine: boolean;
  filters: Partial<JourneyUrlFilters>;
}

/** Narrowing filters in a stable form; the dimension is a switch, not a filter. */
function presetKey(filters: Partial<JourneyUrlFilters>): string {
  const out = new URLSearchParams();
  for (const key of ['order', 'serial', 'tracking', 'unit', 'from', 'until', 'status', 'staffId', 'q'] as const) {
    const value = filters[key];
    if (value) out.set(key, value);
  }
  for (const key of ['stations', 'types', 'sources'] as const) {
    const values = filters[key];
    if (values?.length) out.set(key, [...values].sort().join(','));
  }
  return out.toString();
}

/**
 * Operations ▸ History saved views as contextual presets: the system presets,
 * then the caller's own + org-shared views (`/api/operations/saved-views`).
 * Applying one writes its snapshot through the journey URL state (stamping
 * `?view=`); a preset is lit while the URL's filters equal its snapshot.
 */
export function useOperationsSavedViewPresets() {
  const { user } = useAuth();
  const url = useOperationsTimelineUrlState();
  const { views: rows, create, remove } = useOperationsSavedViews();
  const staffId = user?.staffId ?? null;

  const views: OperationsSavedViewPreset[] = [
    ...SYSTEM_SAVED_VIEWS.map((view) => ({ id: systemViewParam(view.id), name: view.name, isMine: false, filters: view.filters })),
    ...rows.map((view) => ({
      id: String(view.id),
      name: view.name,
      isMine: staffId != null && view.staff_id === staffId,
      filters: view.filters,
    })),
  ];
  const current = presetKey(url.filters);
  const activeView = current ? (views.find((view) => presetKey(view.filters) === current) ?? null) : null;

  return {
    views,
    activeView,
    hasActiveFilters: url.activeFilterCount > 0,
    applyView: (view: OperationsSavedViewPreset) => url.applyView(view.filters, view.id),
    clearView: () => url.clearFilters(),
    saveView: (name: string) => {
      const trimmed = name.trim();
      if (trimmed) create({ name: trimmed, filters: url.filters });
    },
    removeView: (id: string) => {
      const target = views.find((view) => view.id === id);
      if (target?.isMine) remove(Number(id));
    },
  };
}
