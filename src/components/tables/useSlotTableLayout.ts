'use client';

/**
 * The slot-layout resolver + Fields-picker glue — the ONE client seam between
 * the slot kernel and a mounted table, for EVERY opted-in family. Orders
 * proved the shape; pickup is the second consumer (kill-list 07 §4 — same
 * engine, different config), which is why the family specifics arrive as a
 * {@link SlotTableLayoutConfig} instead of living in a per-family copy of the
 * read-modify-write law.
 *
 * Resolves the effective layout through the locked cascade
 * (`staff ?? org ?? product` — saved-view layouts are a later ship) and hands
 * back both halves the mount needs: the layout (→ the family's
 * `materializeTracks` wrapper) and the Fields-picker DATA (`DataTable`'s
 * `fields` prop — options, toggle, reorder, org capture). All rules live in
 * pure lib code; this hook only fetches, caches, and dispatches.
 *
 * Write semantics (the part worth reading twice):
 * - A staffer's bind/unbind writes their PERSONAL override
 *   (`staff_preferences.prefs.tableLayouts[tableId]`, whole-map read-modify-
 *   write — the JSONB merge is shallow at the key).
 * - An admin's "Save as organization default" PUTs the currently-painted
 *   layout to `/api/tables/layouts` AND clears the admin's own personal
 *   override — otherwise their personal copy would shadow the org default
 *   they just saved, and every later org edit would look like a no-op to them.
 * - "Reset to default" deletes the personal override; the org layout (or the
 *   product default) shows on the next paint.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import {
  moveFieldBinding,
  reorderFieldBinding,
  slotFieldOptions,
  toggleFieldBinding,
  type SlotFieldOption,
} from '@/lib/tables/layout-edit';
import { resolveEffectiveLayout } from '@/lib/tables/resolve-effective-layout';
import { readStoredSlotLayout, type SlotLayout } from '@/lib/tables/slot-layout-core';
import { toast } from '@/lib/toast';

/** One opted-in family's identity — everything the shared logic cannot know. */
export interface SlotTableLayoutConfig {
  /** The `PRODUCT_TABLES` / `tableLayouts` key ('orders', 'pickup', …). */
  tableId: string;
  catalog: FieldCatalog;
  productLayout: SlotLayout;
  /**
   * The ONE morph this mount can paint. A stored document with any other
   * morph — hand-written prefs, an older build — must not open tracks nothing
   * renders (or drop tracks a sheet needs); coerce, don't crash. The org
   * write gate refuses foreign morphs outright (`slotMorphsFor`); staff prefs
   * have no server-side morph gate, so this client coercion is the guard.
   */
  paintMorph: SlotLayout['morph'];
  /** Fallback identity-row copy when the identity field is missing. */
  identityFallbackLabel: string;
  /**
   * Band headings for the Fields popover. The compound default ("Status
   * columns" / "Under the title") reads wrong on a sheet, where subtitle
   * bindings open real columns.
   */
  bandLabels?: { status?: string; subtitle?: string };
}

interface OrgLayoutResponse {
  layout: SlotLayout | null;
  canManage: boolean;
}

/** The Fields-picker data bag `DataTable` renders. Data + callbacks, no JSX. */
export interface SlotTableFieldsMenu {
  options: readonly SlotFieldOption[];
  onToggle: (fieldId: string) => void;
  /** ↑/↓ on a bound row — rewrites the band's binding (= display) order. */
  onMove: (fieldId: string, direction: 'up' | 'down') => void;
  /** Locked identity row copy ("Order — locked"). */
  identityLabel: string;
  bandLabels?: { status?: string; subtitle?: string };
  onSaveAsOrgDefault?: () => void;
  onResetToDefault?: () => void;
}

export interface SlotTableLayout {
  effectiveLayout: SlotLayout;
  subtitleFieldIds: readonly string[];
  /**
   * Land a bound field at an absolute position in its own band — the write
   * behind an inline drag of the under-title facts. Organization-wide, like
   * every other layout edit (ruling 2026-08-31).
   */
  onReorder: (fieldId: string, toIndex: number) => void;
  /** Whether this staffer may change the organization's layout at all. */
  canManage: boolean;
  /** Undefined until the cascade base settles — DataTable hides the + until then. */
  fields: SlotTableFieldsMenu | undefined;
}

export function useSlotTableLayout(config: SlotTableLayoutConfig): SlotTableLayout {
  const { tableId, catalog, productLayout, paintMorph, identityFallbackLabel, bandLabels } = config;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { prefs, update } = useStaffPreferences();

  const orgQueryKey = useMemo(() => ['table-layouts', tableId] as const, [tableId]);

  const orgQuery = useQuery({
    queryKey: orgQueryKey,
    enabled: !!user?.staffId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<OrgLayoutResponse> => {
      const res = await fetch(`/api/tables/layouts?tableId=${tableId}`);
      if (!res.ok) throw new Error(`table-layouts ${res.status}`);
      const data = (await res.json()) as { layout?: unknown; canManage?: boolean };
      return {
        layout: readStoredSlotLayout(data.layout),
        canManage: Boolean(data.canManage),
      };
    },
  });

  const orgLayout = orgQuery.data?.layout ?? null;
  const canManage = Boolean(orgQuery.data?.canManage);
  const staffLayoutsRaw = (prefs?.tableLayouts ?? null) as Record<string, unknown> | null;
  // Memoized: `readStoredSlotLayout` rebuilds a fresh document, and a fresh
  // identity per render would cascade through effectiveLayout → columns →
  // every mounted row's memo on a 200-row grid.
  const staffLayout = useMemo(
    () => readStoredSlotLayout(staffLayoutsRaw?.[tableId]),
    [staffLayoutsRaw, tableId],
  );

  const effectiveLayout = useMemo(() => {
    const resolved = resolveEffectiveLayout({
      productDefault: productLayout,
      orgLayout,
      staffLayout,
      catalog,
    });
    return resolved.morph === paintMorph ? resolved : { ...resolved, morph: paintMorph };
  }, [orgLayout, staffLayout, productLayout, catalog, paintMorph]);

  /**
   * Write the whole personal map (shallow JSONB merge law): carry every
   * READABLE sibling tableId, replace/delete only ours. Siblings re-read
   * through `readStoredSlotLayout` rather than passed raw — the PUT schema is
   * strict, so one legacy/hostile sibling blob must not 400 every layout save
   * (an unreadable sibling was already invisible to its own table).
   * Optimistically paints via the shared prefs cache — the same pattern the
   * other prefs writers use.
   */
  const writeStaffLayout = useCallback(
    (layout: SlotLayout | null) => {
      const nextMap: Record<string, SlotLayout> = {};
      for (const [key, value] of Object.entries(staffLayoutsRaw ?? {})) {
        if (key === tableId) continue;
        const sibling = readStoredSlotLayout(value);
        if (sibling) nextMap[key] = sibling;
      }
      if (layout) nextMap[tableId] = layout;
      queryClient.setQueryData<StaffPreferences>(['staff-preferences'], (current) => ({
        ...(current ?? {}),
        tableLayouts: nextMap,
      }));
      update({ tableLayouts: nextMap });
    },
    [staffLayoutsRaw, tableId, queryClient, update],
  );

  /**
   * Persist a layout edit ORGANIZATION-WIDE (operator ruling 2026-08-31).
   *
   * Binding, unbinding and reordering used to write a PERSONAL override, with a
   * separate "Save as org default" button to promote it. The operator's ruling
   * is that a table's shape is a property of the table, not of whoever last
   * touched it: "any add-in to the data table should function as an
   * organization-wide edit". So the edit goes straight to the org document, and
   * every staffer sees it.
   *
   * Two consequences worth stating. A personal override, if one already exists,
   * is cleared on the same edit — otherwise the staffer who just changed the org
   * default would be the one person who could not see it, shadowed by their own
   * older copy. And a staffer without `canManage` cannot write the org layout,
   * so the edit is refused with a reason rather than silently landing somewhere
   * private and diverging from what their colleagues see.
   */
  const writeOrgLayout = useCallback(
    (layout: SlotLayout) => {
      if (!canManage) {
        toast.info('Only a manager can change the columns for the organization');
        return;
      }
      const previous = orgQuery.data?.layout ?? null;
      queryClient.setQueryData<OrgLayoutResponse>(orgQueryKey, {
        layout,
        canManage: true,
      });
      if (staffLayout) writeStaffLayout(null);
      void (async () => {
        try {
          const res = await fetch('/api/tables/layouts', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableId, layout }),
          });
          if (!res.ok) throw new Error(`layout ${res.status}`);
        } catch {
          // Put the org document back — a failed write must not leave every
          // other staffer's next read disagreeing with the server.
          queryClient.setQueryData<OrgLayoutResponse>(orgQueryKey, {
            layout: previous ?? layout,
            canManage: true,
          });
          toast.error('Could not save the columns for the organization');
        }
      })();
    },
    [
      canManage,
      orgQuery.data,
      orgQueryKey,
      queryClient,
      staffLayout,
      writeStaffLayout,
      tableId,
    ],
  );

  const onToggle = useCallback(
    (fieldId: string) => {
      const field = catalog.find((f) => f.id === fieldId);
      if (!field) return;
      const result = toggleFieldBinding(effectiveLayout, field);
      if (!result.ok) {
        toast.info(result.reason);
        return;
      }
      writeOrgLayout(result.layout);
    },
    [catalog, effectiveLayout, writeOrgLayout],
  );

  const onMove = useCallback(
    (fieldId: string, direction: 'up' | 'down') => {
      const field = catalog.find((f) => f.id === fieldId);
      if (!field) return;
      const result = moveFieldBinding(effectiveLayout, field, direction);
      // Edge moves come back ok-with-same-layout; skip the no-op write.
      if (!result.ok || result.layout === effectiveLayout) return;
      writeOrgLayout(result.layout);
    },
    [catalog, effectiveLayout, writeOrgLayout],
  );

  /** Drag-and-drop reorder — lands a bound field at an absolute band position. */
  const onReorder = useCallback(
    (fieldId: string, toIndex: number) => {
      const field = catalog.find((f) => f.id === fieldId);
      if (!field) return;
      const result = reorderFieldBinding(effectiveLayout, field, toIndex);
      if (!result.ok || result.layout === effectiveLayout) return;
      writeOrgLayout(result.layout);
    },
    [catalog, effectiveLayout, writeOrgLayout],
  );

  const onSaveAsOrgDefault = useCallback(() => {
    const layout = effectiveLayout;
    void (async () => {
      try {
        const res = await fetch('/api/tables/layouts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId, layout }),
        });
        if (!res.ok) {
          toast.error('Could not save the organization default');
          return;
        }
        queryClient.setQueryData<OrgLayoutResponse>(orgQueryKey, {
          layout,
          canManage: true,
        });
        // Clear the personal override so the admin now tracks the org default
        // they just captured (see the docblock).
        if (staffLayout) writeStaffLayout(null);
        toast.success('Saved as the organization default');
      } catch {
        toast.error('Could not save the organization default');
      }
    })();
  }, [effectiveLayout, tableId, orgQueryKey, queryClient, staffLayout, writeStaffLayout]);

  const onResetToDefault = useCallback(() => {
    writeStaffLayout(null);
  }, [writeStaffLayout]);

  const options = useMemo(
    () => slotFieldOptions(effectiveLayout, catalog),
    [effectiveLayout, catalog],
  );

  const identityLabel =
    catalog.find((f) => f.id === effectiveLayout.identityFieldId)?.label ?? identityFallbackLabel;

  const subtitleFieldIds = useMemo(
    () => effectiveLayout.subtitleBindings.map((b) => b.fieldId),
    [effectiveLayout],
  );

  /**
   * The picker only opens once its cascade BASE is settled: a toggle snapshots
   * the whole effective document into a durable personal override, so binding
   * while the org GET is still in flight would fork from the product default
   * and silently shed the org's own bindings. A staffer who already has a
   * personal layout is exempt — their own document masks the org layer, so
   * the org fetch cannot change what a toggle is based on.
   */
  const fieldsReady = staffLayout != null || orgQuery.isSuccess;

  const fields = useMemo<SlotTableFieldsMenu | undefined>(
    () =>
      fieldsReady
        ? {
            options,
            onToggle,
            onMove,
            identityLabel,
            ...(bandLabels ? { bandLabels } : null),
            // No "Save as org default" button any more: every edit above IS an
            // org edit (ruling 2026-08-31), so a button to promote one would be
            // a no-op wearing a confirm step. Reset survives only to clear a
            // PERSONAL override left over from before that ruling.
            ...(staffLayout ? { onResetToDefault } : null),
          }
        : undefined,
    [fieldsReady, options, onToggle, onMove, identityLabel, bandLabels, staffLayout, onResetToDefault],
  );

  return { effectiveLayout, subtitleFieldIds, fields, onReorder, canManage };
}
