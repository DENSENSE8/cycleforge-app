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
  workflowNodesQuery,
} from '@/lib/queries/catalog-queries';
import type {
  PlatformAccountRow,
  PlatformRow,
  PriorityTierRow,
  TypeRow,
} from '@/lib/neon/catalog-queries';
import { SOURCE_PLATFORMS, sourcePlatformMeta, type SourcePlatformMeta } from '@/lib/source-platform';
import { RECEIVING_TYPE_OPTS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { PRIORITY_OVERRIDE_TIERS } from '@/lib/receiving/priority-override';
import type { PlatformTypeRule } from '@/lib/receiving/platform-type-rules';
import { receivingLabelTypeDisplay } from '@/lib/receiving/receiving-type-display';
import { getOrderPlatformLabel } from '@/utils/order-platform';

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

/**
 * The org's platform → receiving-type dependency matrix (dependent picklist).
 *
 * Returns `[]` while loading, which reads as "no platform is constrained" — the
 * safe direction: the picker shows every type for a beat rather than briefly
 * hiding the operator's real answer. The PATCH route re-checks server-side, so
 * a stale client can never write an illegal pair.
 */
export function usePlatformTypeRules(): PlatformTypeRule[] {
  const q = useQuery(platformTypeRulesQuery());
  return q.data ?? [];
}

/**
 * Org priority-ladder catalog — the rungs an operator picks from the urgency
 * pill, with any org rename / repaint applied.
 *
 * Shaped DELIBERATELY unlike its siblings. `usePlatformCatalog` / `useReceivingTypeCatalog`
 * swap the built-ins OUT the moment the DB has rows (`rows.length ? … : BUILTIN`)
 * because there a row is the thing itself. Here the ladder is a code constant
 * and a row is only a skin, so rows are MERGED OVER the built-ins by tier: the
 * four rungs and their order always come from `PRIORITY_OVERRIDE_TIERS`, and an
 * org that has customised nothing gets exactly the built-in ladder.
 *
 * That is also why a missing row is not a gap to fill — it is the default, and
 * why resetting a rung is a DELETE rather than writing the built-in values back.
 */
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

/**
 * Catalog-aware platform tone/label resolver. Returns `resolve(value)` →
 * {@link SourcePlatformMeta}: the org catalog's **label** wins (so a renamed or
 * custom platform reads correctly), `color_hex` (when set) drives accent paint
 * via the color-contrast SoT, else catalog `tone` overrides the text tone, and
 * everything else falls back to the built-in `sourcePlatformMeta` (which also
 * supplies the border tone when no hex is set). A custom slug with no built-in
 * match resolves to its catalog label + neutral border instead of "Unknown".
 */
export function usePlatformMeta(): (value: string | null | undefined) => SourcePlatformMeta {
  const { rows } = usePlatformCatalog();
  return useMemo(() => {
    const byValue = new Map(rows.map((r) => [r.slug, r]));
    return (value: string | null | undefined): SourcePlatformMeta => {
      const key = String(value ?? '').trim().toLowerCase();
      const builtin = sourcePlatformMeta(key);
      const row = byValue.get(key);
      if (!row) return builtin;
      const accentHex = row.color_hex?.trim() || null;
      return {
        value: key,
        label: row.label,
        mark: builtin.mark || row.label.slice(0, 2),
        text: accentHex ? '' : (row.tone ?? builtin.text),
        border: accentHex ? '' : builtin.border,
        dot: builtin.dot || 'bg-border-emphasis',
        accentHex,
        icon: builtin.icon,
        tileSrc: builtin.tileSrc,
      };
    };
  }, [rows]);
}

/**
 * Catalog-aware receiving-type label resolver. Returns `resolve(code)` → the
 * org catalog's label for that type slug (so a renamed or custom type reads
 * correctly), falling back to the built-in `receivingLabelTypeDisplay`. Empty
 * code → '' (no type shown). Mirror of {@link usePlatformMeta} for types.
 */
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

/**
 * Org storefront accounts (platform_accounts). `byPlatform` groups active rows
 * under their platform id for the accounts manager. No built-in fallback —
 * accounts are entirely org-defined (seeded from ebay_accounts + one default
 * per platform).
 */
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

/** Bindable workflow-graph nodes for the type editor's custom-flow picker. */
export function useWorkflowNodeOptions() {
  const q = useQuery(workflowNodesQuery());
  return { ...q, nodes: q.data ?? [] };
}

/** `resolve(orderId, accountSource)` → the channel label for one order row. */
export type OrderChannelLabelResolver = (
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
) => string;

/** Stable empties so "no rows yet" never churns the resolver's identity. */
const NO_PLATFORM_ROWS: readonly PlatformRow[] = [];
const NO_ACCOUNT_ROWS: readonly PlatformAccountRow[] = [];

/**
 * The lookup itself — three Maps + the built-in fallback. Pure, so the shared
 * cell below can build it exactly once per (platforms, accounts) pair instead
 * of once per consumer.
 */
function buildOrderChannelLabelResolver(
  platforms: readonly PlatformRow[],
  accounts: readonly PlatformAccountRow[],
): OrderChannelLabelResolver {
  const platformById = new Map(platforms.map((p) => [p.id, p]));
  const accountBySlug = new Map(accounts.map((a) => [a.slug.toLowerCase(), a]));
  const platformBySlug = new Map(platforms.map((p) => [p.slug.toLowerCase(), p]));
  return (orderId: string | null | undefined, accountSource: string | null | undefined): string => {
    // Exact Amazon 3-7-7 / eBay 2-5-5 shapes identify the channel from the
    // number itself — catalog account_source (often a Zoho slug) must not
    // paint a marketplace order as a different platform.
    const fromId = getOrderPlatformLabel(orderId, accountSource);
    if (fromId === 'eBay' || fromId === 'Amazon') return fromId;
    const key = String(accountSource ?? '').trim().toLowerCase();
    if (key) {
      const acct = accountBySlug.get(key);
      const platform = acct ? platformById.get(acct.platform_id) : platformBySlug.get(key);
      if (platform) return platform.label;
    }
    return fromId;
  };
}

/**
 * ONE catalog subscription for every consumer of {@link useOrderChannelLabel}.
 *
 * ## Why this is not just `useQuery` twice
 *
 * The resolver is a PER-ROW hook: `OrdersQueueTableRow` calls it, and a To-ship
 * window holds ~30 rows. Written as two `useQuery` calls it minted two
 * `QueryObserver`s per row — ~60 live observers that react-query has to build,
 * register on the query, run `select` for, structurally compare and tear down
 * again on every virtualizer scroll — plus ~90 `Map` builds, for one lookup
 * table that is identical on every row. React Query dedupes the FETCH, never
 * the observer.
 *
 * So the observers are hoisted out of the component tree entirely: one pair per
 * `QueryClient`, and components attach to it through `useSyncExternalStore`
 * (a listener in a `Set` — no observer, no `select`, no structural sharing).
 * `select` runs once, the Maps are built once, and every row is handed the SAME
 * resolver function, which is also what makes the row's `memo` comparator work.
 *
 * These are REAL `QueryObserver`s rather than a `getQueryData` peek, because a
 * peek is only as fresh as whoever else happens to be mounted: `useInvalidateCatalog`
 * refetches ACTIVE queries, and on the To-ship desk this resolver is often the
 * only consumer of the platform catalog on the page. Attaching on the first
 * listener and detaching on the last reproduces `useQuery`'s mount semantics
 * (fetch-on-mount, refetch-on-invalidate, staleTime) — once instead of 60 times.
 */
function createOrderChannelLabelCell(client: QueryClient) {
  const platformObserver = new QueryObserver(client, platformsQuery());
  const accountObserver = new QueryObserver(client, platformAccountsQuery());
  const listeners = new Set<() => void>();
  let platforms: readonly PlatformRow[] = NO_PLATFORM_ROWS;
  let accounts: readonly PlatformAccountRow[] = NO_ACCOUNT_ROWS;
  let resolver = buildOrderChannelLabelResolver(platforms, accounts);
  let detach: (() => void) | null = null;

  const read = (notify: boolean) => {
    const nextPlatforms = platformObserver.getCurrentResult().data ?? NO_PLATFORM_ROWS;
    const nextAccounts = accountObserver.getCurrentResult().data ?? NO_ACCOUNT_ROWS;
    // Reference equality is the whole test — react-query already structurally
    // shares its data, so an unchanged ref means an unchanged resolver.
    if (nextPlatforms === platforms && nextAccounts === accounts) return;
    platforms = nextPlatforms;
    accounts = nextAccounts;
    resolver = buildOrderChannelLabelResolver(platforms, accounts);
    if (notify) for (const listener of [...listeners]) listener();
  };

  // Seed from whatever the cache already holds, so the FIRST render resolves
  // against real rows exactly as `useQuery` (which reads the cache during
  // render) used to — never a frame of fallback labels.
  read(false);

  return {
    getResolver: (): OrderChannelLabelResolver => resolver,
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

type OrderChannelLabelCell = ReturnType<typeof createOrderChannelLabelCell>;

/** Keyed by client so a test / second provider gets its own cell, and so the
 *  cell dies with the client rather than pinning rows in a module forever. */
const orderChannelLabelCells = new WeakMap<QueryClient, OrderChannelLabelCell>();

function orderChannelLabelCell(client: QueryClient): OrderChannelLabelCell {
  let cell = orderChannelLabelCells.get(client);
  if (!cell) {
    cell = createOrderChannelLabelCell(client);
    orderChannelLabelCells.set(client, cell);
  }
  return cell;
}

/**
 * Catalog-aware order-channel label resolver. Returns `resolve(orderId,
 * accountSource)` → the channel label, preferring the org catalog (so a renamed
 * or custom platform / storefront reads correctly) and falling back to the
 * built-in {@link getOrderPlatformLabel} pattern matcher. `account_source` is
 * hybrid-grain — an eBay account slug ('ebay-mk') or a platform slug
 * ('ecwid','fba') — so we match accounts first, then platforms. This is the
 * read-side unlock the plan defers to Phase 2 (orders.account_source → catalog
 * label across the order tables). The text column stays the cache.
 *
 * Safe to call per row: every caller shares ONE catalog subscription and ONE
 * resolver instance (see {@link createOrderChannelLabelCell}).
 */
export function useOrderChannelLabel(): OrderChannelLabelResolver {
  const cell = orderChannelLabelCell(useQueryClient());
  return useSyncExternalStore(cell.subscribe, cell.getResolver, cell.getResolver);
}

/** Invalidate every catalog list — call after a CRUD mutation. */
export function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: catalogKeys.all });
  };
}
