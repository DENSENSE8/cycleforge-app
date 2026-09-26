'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { QueryObserver, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  catalogKeys,
  platformsQuery,
  platformAccountsQuery,
  platformTypeRulesQuery,
  prioritiesQuery,
  typesQuery,
  storeLinksQuery,
  workflowNodesQuery,
} from '@/lib/queries/catalog-queries';
import type {
  PlatformAccountRow,
  PlatformRow,
  PriorityTierRow,
  TypeRow,
} from '@/lib/neon/catalog-queries';
import { SOURCE_PLATFORMS, sourcePlatformMeta, type SourcePlatformMeta } from '@/lib/source-platform';
import {
  buildOrderChannelResolver,
  buildPlatformShortLabelLookup,
  catalogPlatformMeta,
  type OrderChannelResolver,
} from '@/lib/platform-display';
import { RECEIVING_TYPE_OPTS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { PRIORITY_OVERRIDE_TIERS } from '@/lib/receiving/priority-override';
import type { PlatformTypeRule } from '@/lib/receiving/platform-type-rules';
import { receivingLabelTypeDisplay } from '@/lib/receiving/receiving-type-display';

/** A picker option resolved from the catalog (or the built-in fallback). */
export interface CatalogOption {
  value: string;
  label: string;
  /** Present only for DB-backed (custom-editable) rows. */
  id?: number;
  sortOrder?: number;
  /** Seeded built-in (hide-only) vs the org's own custom row. */
  isSystem?: boolean;
  /** Optional org accent `#RRGGBB` from `platforms.color_hex` / `types.color_hex`. */
  colorHex?: string | null;
  /**
   * Dense collapsed label (carton bookmark). Priority rungs carry one because
   * the bar shows `Med` where the menu shows `Medium`; platform / type derive
   * theirs from the registry mark instead.
   */
  shortLabel?: string;
}

// Built-in fallback so every picker still works before the migration is applied
// / while the catalog query is loading. Mirrors the legacy constants 1:1.
const BUILTIN_PLATFORMS: CatalogOption[] = SOURCE_PLATFORMS.map((p) => ({ value: p.value, label: p.label }));
const BUILTIN_TYPES: CatalogOption[] = RECEIVING_TYPE_OPTS.map((t) => ({ value: t.value, label: t.label }));

/**
 * Org platform catalog. `options` are `{ value: slug, label }` for pills; falls
 * back to the built-in SOURCE_PLATFORMS list until the catalog has rows.
 */
export function usePlatformCatalog() {
  const q = useQuery(platformsQuery());
  const rows: PlatformRow[] = q.data ?? [];
  const options: CatalogOption[] = rows.length
    ? rows.map((r) => ({
        value: r.slug,
        label: r.label,
        id: r.id,
        sortOrder: r.sort_order,
        isSystem: r.is_system,
        colorHex: r.color_hex,
      }))
    : BUILTIN_PLATFORMS;
  return { ...q, rows, options };
}

/** The org's platform → receiving-type dependency matrix (dependent picklist). */
export function usePlatformTypeRules(): PlatformTypeRule[] {
  const q = useQuery(platformTypeRulesQuery());
  return q.data ?? [];
}

/** Org priority-ladder catalog — the rungs an operator picks from the urgency pill, with any org rename / repaint applied. */
export function usePriorityCatalog() {
  const q = useQuery(prioritiesQuery());
  const rows: PriorityTierRow[] = q.data ?? [];
  const byTier = useMemo(() => new Map(rows.map((r) => [r.tier, r])), [rows]);
  const options: CatalogOption[] = useMemo(
    () =>
      PRIORITY_OVERRIDE_TIERS.map((t) => {
        const row = byTier.get(t.value);
        return {
          value: String(t.value),
          label: row?.label ?? t.label,
          shortLabel: row?.short ?? t.short,
          id: row?.id,
          sortOrder: t.value,
          // Every rung is seeded by the ladder, so none is an org-created row —
          // the manager renders rename + repaint only, never add or delete.
          isSystem: true,
          colorHex: row?.color_hex ?? null,
        };
      }),
    [byTier],
  );
  return { ...q, rows, options };
}

/**
 * Org receiving-type catalog. `options` are `{ value: SLUG_UPPER, label }` to
 * match the uppercase `receiving_type` / `intake_type` the rest of the app
 * stores; falls back to RECEIVING_TYPE_OPTS until the catalog has rows.
 */
export function useReceivingTypeCatalog() {
  const q = useQuery(typesQuery());
  const rows: TypeRow[] = q.data ?? [];
  const options: CatalogOption[] = rows.length
    ? rows.map((r) => ({
        value: r.slug.toUpperCase(),
        label: r.label,
        id: r.id,
        sortOrder: r.sort_order,
        isSystem: r.is_system,
        colorHex: r.color_hex,
      }))
    : BUILTIN_TYPES;
  return { ...q, rows, options };
}

/** Catalog-aware platform tone/label resolver. */
export function usePlatformMeta(): (value: string | null | undefined) => SourcePlatformMeta {
  const { rows } = usePlatformCatalog();
  return useMemo(() => {
    const byValue = new Map(rows.map((r) => [r.slug, r]));
    return (value: string | null | undefined): SourcePlatformMeta => {
      const key = String(value ?? '').trim().toLowerCase();
      const row = byValue.get(key);
      return row ? catalogPlatformMeta(row) : sourcePlatformMeta(key);
    };
  }, [rows]);
}

/**
 * `lookup(platformText)` → the org's `short_label` for a platform named by
 * slug or display label, else null. The carton label printer reads it so the
 * 2x1 face prints the org's dense name (`AMZRN`) instead of the full label.
 */
export function usePlatformShortLabelLookup(): (value: string | null | undefined) => string | null {
  const { rows } = usePlatformCatalog();
  return useMemo(() => buildPlatformShortLabelLookup(rows), [rows]);
}

/** Catalog-aware receiving-type label resolver. */
export function useReceivingTypeLabel(): (code: string | null | undefined) => string {
  const { rows } = useReceivingTypeCatalog();
  return useMemo(() => {
    const byCode = new Map(rows.map((r) => [r.slug.toUpperCase(), r.label]));
    return (code: string | null | undefined): string => {
      const key = String(code ?? '').trim().toUpperCase();
      if (!key) return '';
      return byCode.get(key) ?? receivingLabelTypeDisplay(key);
    };
  }, [rows]);
}

/** Org storefront accounts (platform_accounts). */
export function usePlatformAccountCatalog(opts: { includeInactive?: boolean; platformId?: number } = {}) {
  const q = useQuery(platformAccountsQuery(opts));
  const rows: PlatformAccountRow[] = q.data ?? [];
  const byPlatform = useMemo(() => {
    const m = new Map<number, PlatformAccountRow[]>();
    for (const r of rows) {
      const list = m.get(r.platform_id) ?? [];
      list.push(r);
      m.set(r.platform_id, list);
    }
    return m;
  }, [rows]);
  return { ...q, rows, byPlatform };
}

/** Where each ShipStation store sells (`integration_store_links`). */
export function useStoreLinks() {
  const q = useQuery(storeLinksQuery());
  return { ...q, rows: q.data ?? [] };
}

/** Bindable workflow-graph nodes for the type editor's custom-flow picker. */
export function useWorkflowNodeOptions() {
  const q = useQuery(workflowNodesQuery());
  return { ...q, nodes: q.data ?? [] };
}

/** Stable empties so "no rows yet" never churns the resolver's identity. */
const NO_PLATFORM_ROWS: readonly PlatformRow[] = [];
const NO_ACCOUNT_ROWS: readonly PlatformAccountRow[] = [];

/** ONE catalog subscription for every consumer of {@link useOrderChannel}. */
function createOrderChannelCell(client: QueryClient) {
  const platformObserver = new QueryObserver(client, platformsQuery());
  const accountObserver = new QueryObserver(client, platformAccountsQuery());
  const listeners = new Set<() => void>();
  let platforms: readonly PlatformRow[] = NO_PLATFORM_ROWS;
  let accounts: readonly PlatformAccountRow[] = NO_ACCOUNT_ROWS;
  let resolver = buildOrderChannelResolver(platforms, accounts);
  let detach: (() => void) | null = null;

  const read = (notify: boolean) => {
    const nextPlatforms = platformObserver.getCurrentResult().data ?? NO_PLATFORM_ROWS;
    const nextAccounts = accountObserver.getCurrentResult().data ?? NO_ACCOUNT_ROWS;
    // Reference equality is the whole test — react-query already structurally
    // shares its data, so an unchanged ref means an unchanged resolver.
    if (nextPlatforms === platforms && nextAccounts === accounts) return;
    platforms = nextPlatforms;
    accounts = nextAccounts;
    resolver = buildOrderChannelResolver(platforms, accounts);
    if (notify) for (const listener of [...listeners]) listener();
  };

  // Seed from whatever the cache already holds, so the FIRST render resolves
  // against real rows exactly as `useQuery` (which reads the cache during
  // render) used to — never a frame of fallback labels.
  read(false);

  return {
    getResolver: (): OrderChannelResolver => resolver,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (!detach) {
        const unsubscribePlatforms = platformObserver.subscribe(() => read(true));
        const unsubscribeAccounts = accountObserver.subscribe(() => read(true));
        detach = () => {
          unsubscribePlatforms();
          unsubscribeAccounts();
        };
        read(false);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detach?.();
          detach = null;
        }
      };
    },
  };
}

type OrderChannelCell = ReturnType<typeof createOrderChannelCell>;

/** Keyed by client so a test / second provider gets its own cell, and so the
 *  cell dies with the client rather than pinning rows in a module forever. */
const orderChannelCells = new WeakMap<QueryClient, OrderChannelCell>();

function orderChannelCell(client: QueryClient): OrderChannelCell {
  let cell = orderChannelCells.get(client);
  if (!cell) {
    cell = createOrderChannelCell(client);
    orderChannelCells.set(client, cell);
  }
  return cell;
}

/** Catalog-aware order-channel resolver. */
export function useOrderChannel(): OrderChannelResolver {
  const cell = orderChannelCell(useQueryClient());
  return useSyncExternalStore(cell.subscribe, cell.getResolver, cell.getResolver);
}

/** Invalidate every catalog list — call after a CRUD mutation. */
export function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: catalogKeys.all });
  };
}
