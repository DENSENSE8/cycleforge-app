'use client';

/**
 * A line's catalog SKU, for the operator to confirm (operator 2026-10-06 —
 * always suggest, never link on its own, never a typed SKU field).
 *
 *   no SKU     the catalog's best guess — "SKU 00822 · Wave Music System
 *              III/IV CD Assembly · part no. 360148-0010 [↗] [Confirm]" — the
 *              other candidates one click away;
 *   wrong SKU  (`onDone` set, the line already linked) the same, minus the SKU
 *              it holds.
 *
 * Every candidate carries its listing on the order's platform (↗, resolved
 * server-side), so the operator checks it before confirming. "Search the
 * catalog" (SKU or title) reuses `GET /api/sku-catalog/search?searchField=catalog`.
 * Every Confirm goes through ONE path (`POST /api/orders/[id]/sku-suggestions`):
 * the line gets the SKU and, with an item number, `batchPair` learns the
 * listing → SKU mapping, so paperwork pairs to the SKU from then on.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { useDebounce } from '@/hooks/_lifecycle';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import type { OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import {
  confirmLineSkuHttp,
  fetchLineSkuSuggestions,
  lineSkuSuggestionsKey,
  type LineSkuSuggestion,
} from '@/lib/orders/line-sku-suggest-contracts';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { resolveListingLink, type ListingLink } from '@/utils/external-item-url';
import { ListingLinkButton } from './ListingLinkButton';
import { usePacketRefresh } from './use-packet-refresh';

const SEARCH_LIMIT = 8;

const why = (s: LineSkuSuggestion) => (s.reason.kind === 'part_number' ? `part no. ${s.reason.value}` : `title ${s.reason.value} alike`);

/** One catalog SKU the operator may pick: SKU · title · why, its listing, and "This one". */
function SkuChoice({
  sku,
  title,
  detail,
  listing,
  loading,
  disabled,
  onPick,
}: {
  sku: string;
  title: string;
  detail?: string;
  listing: ListingLink;
  loading: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 py-0.5">
      <span className="min-w-0 flex-1 truncate text-role-caption" title={title}>
        <span className="font-mono font-semibold">{sku}</span>{' '}
        <span className="text-text-muted">
          · {title}
          {detail ? ` · ${detail}` : ''}
        </span>
      </span>
      <ListingLinkButton listing={listing} subject={`SKU ${sku}`} />
      <Button type="button" variant="ghost" size="sm" loading={loading} disabled={disabled} onClick={onPick}>
        This one
      </Button>
    </li>
  );
}

export function LineSkuSuggest({
  line,
  className,
  onDone,
}: {
  line: OrderPacketLine;
  className?: string;
  /** Wrong-SKU mode: the line already holds a SKU; called once the operator confirms another. */
  onDone?: () => void;
}) {
  const refresh = usePacketRefresh();
  const changing = onDone != null;
  const [others, setOthers] = useState(false);
  const [searching, setSearching] = useState(changing);
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim(), 250);
  const read = useQuery({
    queryKey: lineSkuSuggestionsKey(line.orderLineId),
    queryFn: () => fetchLineSkuSuggestions(line.orderLineId),
    staleTime: 5 * 60_000,
  });
  const search = useSkuCatalogSearch(searching ? q : '', { searchField: 'catalog', limit: SEARCH_LIMIT });
  const confirm = useMutation({
    mutationFn: (skuCatalogId: number) => confirmLineSkuHttp(line.orderLineId, skuCatalogId),
    onSuccess: (result) => {
      toast.success(
        `Linked to SKU ${result.sku}${result.learned ? ` — future orders of this listing match it${result.ordersBackfilled > 1 ? ` (${result.ordersBackfilled} orders updated)` : ''}` : ''}`,
      );
      onDone?.();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => void refresh(),
  });

  const storefront = read.data?.storefront ?? null;
  const [best, ...rest] = (read.data?.suggestions ?? []).filter((s) => s.skuCatalogId !== line.skuCatalogId);
  // `useSkuCatalogSearch` holds the last answer as placeholder data — a cleared box shows none.
  const results = (q ? (search.data ?? []) : [])
    .filter((item) => Number(item.id) !== line.skuCatalogId)
    .map((item) => ({
      skuCatalogId: Number(item.id),
      sku: item.sku,
      title: item.product_title,
      listing: resolveListingLink({
        storefront,
        stored: (item.platform_ids ?? []).map((row) => ({ platform: row.platform, itemId: row.platform_item_id, url: row.listing_url ?? null })),
      }),
    }));

  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-lg bg-surface-sunken px-2.5 py-2', className)} data-testid="line-sku-suggest">
      {read.isPending ? (
        <p className="text-role-caption text-text-muted">Looking for this item in the catalog…</p>
      ) : !best ? (
        <p className="text-role-caption text-text-muted">
          {changing ? 'Nothing else in the catalog looks like this item — search for it.' : 'No SKU on this line, and nothing in the catalog looks like it.'}
        </p>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 text-role-caption text-text-default">
              <span className="text-text-muted">{changing ? 'Should it be ' : 'Is this '}</span>
              <span className="font-mono font-semibold">SKU {best.sku}</span>
              <span className="text-text-muted"> · {best.title} · </span>
              <span className="text-text-muted">matched by {why(best)}</span>
            </p>
            <ListingLinkButton listing={best.listing} subject={`SKU ${best.sku}`} />
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Check className="size-3.5" />}
              loading={confirm.isPending && confirm.variables === best.skuCatalogId}
              disabled={confirm.isPending}
              onClick={() => confirm.mutate(best.skuCatalogId)}
              data-testid="line-sku-confirm"
            >
              Confirm
            </Button>
          </div>
          {rest.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              aria-expanded={others}
              icon={<ChevronDown className={cn('size-3 transition-transform', others && 'rotate-180')} />}
              onClick={() => setOthers((open) => !open)}
            >
              {others ? 'Hide other matches' : `${rest.length} other match${rest.length === 1 ? '' : 'es'}`}
            </Button>
          ) : null}
          {others ? (
            <ul className="flex min-w-0 flex-col">
              {rest.map((s) => (
                <SkuChoice
                  key={s.skuCatalogId}
                  sku={s.sku}
                  title={s.title}
                  detail={why(s)}
                  listing={s.listing}
                  loading={confirm.isPending && confirm.variables === s.skuCatalogId}
                  disabled={confirm.isPending}
                  onPick={() => confirm.mutate(s.skuCatalogId)}
                />
              ))}
            </ul>
          ) : null}
        </>
      )}

      {searching ? (
        <div className="flex min-w-0 flex-col gap-1 pt-1" data-testid="line-sku-search">
          <TextField label="Search the catalog — SKU or title" type="search" value={query} onChange={setQuery} autoFocus={changing} />
          {search.isError ? (
            <p className="text-role-caption text-text-warning">Could not search the catalog.</p>
          ) : q && search.isFetching && results.length === 0 ? (
            <p className="text-role-caption text-text-muted">Searching…</p>
          ) : q && !search.isFetching && results.length === 0 ? (
            <p className="text-role-caption text-text-muted">Nothing in the catalog matches “{q}”.</p>
          ) : null}
          {results.length > 0 ? (
            <ul className="flex min-w-0 flex-col">
              {results.map((r) => (
                <SkuChoice
                  key={r.skuCatalogId}
                  sku={r.sku}
                  title={r.title}
                  listing={r.listing}
                  loading={confirm.isPending && confirm.variables === r.skuCatalogId}
                  disabled={confirm.isPending}
                  onPick={() => confirm.mutate(r.skuCatalogId)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="self-start" icon={<Search className="size-3.5" />} onClick={() => setSearching(true)}>
          {best ? 'Not it? Search the catalog' : 'Search the catalog'}
        </Button>
      )}
      <p className="text-role-caption text-text-faint">Confirming links it for future use — its paperwork then pairs to the SKU.</p>
    </div>
  );
}
