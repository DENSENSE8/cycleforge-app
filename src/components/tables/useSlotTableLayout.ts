'use client';

/** The slot-layout resolver + Fields-picker glue — the ONE client seam between the slot kernel and a mounted table, for EVERY opted-in family. */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import {
  moveFieldBinding,
  reorderFieldBinding,
  reorderFieldBindingByDrop,
  slotFieldOptions,
  toggleFieldBinding,
  type SlotFieldOption,
} from '@/lib/tables/layout-edit';
import { resolveEffectiveLayout } from '@/lib/tables/resolve-effective-layout';
import {
  getSavedViewLayout,
  getServerSavedViewLayout,
  subscribeSavedViewLayout,
} from '@/lib/tables/saved-view-layout-store';
import { readStoredSlotLayout, type SlotLayout } from '@/lib/tables/slot-layout-core';
import { toast } from '@/lib/toast';

/** One opted-in family's identity — everything the shared logic cannot know. */
interface SlotTableLayoutConfig {
  /** The `PRODUCT_TABLES` / `tableLayouts` key ('orders', 'pickup', …). */
  tableId: string;
  catalog: FieldCatalog;
  productLayout: SlotLayout;
  /** The ONE morph this mount can paint. */
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
  /**
   * Drop one bound field onto another in the same band — the write behind
   * header click-and-hold AND the under-title fact drag. See
   * `docs/todo/subtitle-band-reorder-PLAN.md`.
   */
  onReorderByDrop: (dragFieldId: string, dropFieldId: string) => void;
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

  /** The applied saved view's columns, if any — the head of the cascade. */
  const savedViewLayout = useSyncExternalStore(
    subscribeSavedViewLayout,
    useCallback(() => getSavedViewLayout(tableId), [tableId]),
    getServerSavedViewLayout,
  );

  const effectiveLayout = useMemo(() => {
    const resolved = resolveEffectiveLayout({
      productDefault: productLayout,
      orgLayout,
      staffLayout,
      savedViewLayout,
      catalog,
    });
    return resolved.morph === paintMorph ? resolved : { ...resolved, morph: paintMorph };
  }, [orgLayout, staffLayout, savedViewLayout, productLayout, catalog, paintMorph]);

  /** Write the whole personal map (shallow JSONB merge law): */
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

  /** Persist a layout edit ORGANIZATION-WIDE (operator ruling 2026-08-31). */
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

  /** Header and under-title drags — same write, named destination. */
  const onReorderByDrop = useCallback(
    (dragFieldId: string, dropFieldId: string) => {
      const dragField = catalog.find((f) => f.id === dragFieldId);
      const dropField = catalog.find((f) => f.id === dropFieldId);
      if (!dragField || !dropField) return;
      const result = reorderFieldBindingByDrop(effectiveLayout, dragField, dropField);
      if (!result.ok || result.layout === effectiveLayout) return;
      writeOrgLayout(result.layout);
    },
    [catalog, effectiveLayout, writeOrgLayout],
  );

  const _onSaveAsOrgDefault = useCallback(() => {
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

  /** The picker only opens once its cascade BASE is settled: */
  const fieldsReady = staffLayout != null || orgQuery.isSuccess;

  const fields = useMemo<SlotTableFieldsMenu | undefined>(
    () =>
      fieldsReady
        ? {
            options,
            onToggle,
            onMove,
            onReorderByDrop,
            identityLabel,
            ...(bandLabels ? { bandLabels } : null),
            // No "Save as org default" button any more:
            ...(staffLayout ? { onResetToDefault } : null),
          }
        : undefined,
    [fieldsReady, options, onToggle, onMove, onReorderByDrop, identityLabel, bandLabels, staffLayout, onResetToDefault],
  );

  return { effectiveLayout, subtitleFieldIds, fields, onReorder, canManage };
}
