'use client';

/**
 * The exception editor — right pane of the workbench, and the whole point of
 * the surface: everything needed to stop one order being an exception, in one
 * place, at full width.
 *
 * Every write composes an endpoint that already exists. This component owns no
 * persistence of its own:
 *
 * | Action              | Endpoint                                            |
 * |---------------------|-----------------------------------------------------|
 * | Order fields        | `PATCH /api/orders/[id]`   (OrderUpdateBody)        |
 * | Tracking            | `POST  /api/orders/[id]/tracking`                   |
 * | Link existing SKU   | `POST  /api/sku-catalog/pair`  (backfills siblings) |
 * | Create catalog SKU  | `POST  /api/sku-catalog` then pair                  |
 * | Docs exempt         | `POST  /api/orders/[id]/cage-release`               |
 * | Release             | `POST  /api/orders/[id]/cage-release`               |
 *
 * Pairing deliberately reports the FAN-OUT ("also cleared N orders"): the
 * operator chose pair-once semantics, and a silent side effect on rows they
 * cannot see would be indistinguishable from a bug.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2 } from '@/components/Icons';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/lib/toast';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';
import { cn } from '@/utils/_cn';

interface CatalogHit {
  id: number;
  sku: string;
  product_title?: string | null;
  productTitle?: string | null;
}

async function postJson(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.success === false || data.ok === false) {
    throw new Error(String(data.error || `Request failed (${res.status})`));
  }
  return data;
}

export function ExceptionEditor({
  row,
  onChanged,
}: {
  row: OrderExceptionRow;
  /** Re-read the queue + this row after any write. */
  onChanged: (opts?: { resolved?: boolean }) => void;
}) {
  const fieldId = useId();

  /* ── Order fields (local draft, explicit save) ─────────────────────── */
  const [itemNumber, setItemNumber] = useState(row.itemNumber ?? '');
  const [sku, setSku] = useState(row.sku ?? '');
  const [title, setTitle] = useState(row.productTitle ?? '');
  const [quantity, setQuantity] = useState(row.quantity ?? '1');
  const [condition, setCondition] = useState(row.condition ?? '');
  const [tracking, setTracking] = useState(row.trackingNumber ?? '');
  const [saving, setSaving] = useState(false);

  // Re-seed when the operator selects a different order.
  useEffect(() => {
    setItemNumber(row.itemNumber ?? '');
    setSku(row.sku ?? '');
    setTitle(row.productTitle ?? '');
    setQuantity(row.quantity ?? '1');
    setCondition(row.condition ?? '');
    setTracking(row.trackingNumber ?? '');
    setQuery('');
    setHits([]);
  }, [row.id, row.itemNumber, row.sku, row.productTitle, row.quantity, row.condition, row.trackingNumber]);

  const dirty =
    itemNumber !== (row.itemNumber ?? '')
    || sku !== (row.sku ?? '')
    || title !== (row.productTitle ?? '')
    || quantity !== (row.quantity ?? '1')
    || condition !== (row.condition ?? '')
    || tracking !== (row.trackingNumber ?? '');

  const saveFields = useCallback(async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (itemNumber !== (row.itemNumber ?? '')) patch.itemNumber = itemNumber.trim() || null;
      if (sku !== (row.sku ?? '')) patch.sku = sku.trim() || null;
      if (title !== (row.productTitle ?? '')) patch.productTitle = title.trim();
      if (quantity !== (row.quantity ?? '1')) patch.quantity = quantity.trim() || null;
      if (condition !== (row.condition ?? '')) patch.condition = condition.trim();
      if (Object.keys(patch).length > 0) {
        await postJson(`/api/orders/${row.id}`, patch, 'PATCH');
      }
      if (tracking !== (row.trackingNumber ?? '')) {
        await postJson(`/api/orders/${row.id}/tracking`, {
          trackingNumber: tracking.trim() || null,
        });
      }
      toast.success('Order updated.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [condition, itemNumber, onChanged, quantity, row, sku, title, tracking]);

  /* ── Catalog pairing ───────────────────────────────────────────────── */
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pairing, setPairing] = useState(false);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      // `/api/sku-catalog` (the catalog LIST), never `/api/sku-catalog/search`.
      // The latter's default mode is `searchFromPlatform`, which selects
      // `sp.id` — a `sku_platform_ids` row id, NOT `sku_catalog.id`. Feeding
      // that to `/pair` as `skuCatalogId` binds the order to whatever catalog
      // row happens to share that integer, which is silent data corruption:
      // for SKU 01029 it returned 15967/2983 while the real catalog row is 2425.
      const res = await fetch(
        `/api/sku-catalog?q=${encodeURIComponent(term.trim())}&limit=15`,
        { credentials: 'same-origin' },
      );
      const data = (await res.json().catch(() => ({}))) as { items?: CatalogHit[] };
      setHits(data.items ?? []);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced typeahead — the catalog is 1,400+ rows and this fires per keystroke.
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => void search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  const pairTo = useCallback(
    async (skuCatalogId: number) => {
      const itemKey = (itemNumber || row.itemNumber || sku || row.sku || '').trim();
      if (!itemKey) {
        toast.error('This order needs an item number or SKU before it can be paired.');
        return;
      }
      setPairing(true);
      try {
        const data = await postJson('/api/sku-catalog/pair', {
          skuCatalogId,
          itemNumber: itemKey,
          platform: (row.accountSource || 'manual').toLowerCase(),
        });
        // The domain backfills every order sharing this item number — say so.
        const backfilled = Number(
          (data as { ordersBackfilled?: number; result?: { ordersBackfilled?: number } })
            .ordersBackfilled
            ?? (data as { result?: { ordersBackfilled?: number } }).result?.ordersBackfilled
            ?? 0,
        );
        toast.success(
          backfilled > 1
            ? `Paired — also cleared ${backfilled - 1} other order${backfilled - 1 === 1 ? '' : 's'}.`
            : 'Paired to catalog.',
        );
        onChanged({ resolved: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not pair.');
      } finally {
        setPairing(false);
      }
    },
    [itemNumber, onChanged, row.accountSource, row.itemNumber, row.sku, sku],
  );

  /* ── Create a catalog entry from this order ────────────────────────── */
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // Categories already in use, for the create-form typeahead. Loaded once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/sku-catalog?limit=500', { credentials: 'same-origin' });
        const data = (await res.json().catch(() => ({}))) as {
          items?: Array<{ category?: string | null }>;
        };
        if (cancelled) return;
        const seen = new Set<string>();
        for (const item of data.items ?? []) {
          const c = (item.category ?? '').trim();
          if (c) seen.add(c);
        }
        setCategories([...seen].sort());
      } catch {
        /* the field stays free-text — an absent typeahead is not an error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createAndPair = useCallback(async () => {
    const newSku = (sku || row.sku || '').trim();
    const newTitle = (title || row.productTitle || '').trim();
    if (!newSku || !newTitle) {
      toast.error('A new catalog entry needs both a SKU and a title.');
      return;
    }
    setCreating(true);
    try {
      const created = await postJson('/api/sku-catalog', {
        sku: newSku,
        productTitle: newTitle,
        ...(newCategory.trim() ? { category: newCategory.trim() } : {}),
      });
      const newId = Number(
        (created as { id?: number; entry?: { id?: number } }).id
          ?? (created as { entry?: { id?: number } }).entry?.id,
      );
      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error('Catalog entry created but no id came back.');
      }
      await pairTo(newId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the catalog entry.');
    } finally {
      setCreating(false);
    }
  }, [newCategory, pairTo, row.productTitle, row.sku, sku, title]);

  /* ── Gate actions ──────────────────────────────────────────────────── */
  const [gateBusy, setGateBusy] = useState(false);

  const runGateAction = useCallback(
    async (body: Record<string, unknown>, successMessage: string, resolved = false) => {
      setGateBusy(true);
      try {
        await postJson(`/api/orders/${row.id}/cage-release`, body);
        toast.success(successMessage);
        onChanged({ resolved });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setGateBusy(false);
      }
    },
    [onChanged, row.id],
  );

  const canRelease = row.gates.canRelease && row.releaseState === 'caged';
  const blockedBy = useMemo(
    () => row.gates.failing.map((g) => g.id).join(', '),
    [row.gates.failing],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="exception-editor">
      {/* Identity header — what this order IS, always visible. */}
      <header className="shrink-0 border-b border-border-hairline px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-mono text-role-body font-semibold text-text-default">
            {row.orderNumber ?? `#${row.id}`}
          </h2>
          <span className="text-role-caption text-text-soft">{row.accountSource || '—'}</span>
          {row.releaseState === 'caged' ? <Badge variant="outline">Caged</Badge> : null}
          {row.blockers.length === 0 ? (
            <Badge variant="success">
              <Check aria-hidden /> No blockers
            </Badge>
          ) : (
            row.blockers.map((b) => (
              <Badge key={b} variant="warning">
                {ORDER_EXCEPTION_BLOCKER_LABEL[b]}
              </Badge>
            ))
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {/* ── Pairing: the reason this page exists ─────────────────────── */}
        <section aria-labelledby={`${fieldId}-pair`}>
          <h3
            id={`${fieldId}-pair`}
            className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft"
          >
            Catalog pairing
          </h3>

          {row.skuCatalogId ? (
            <Alert variant="success" className="mt-2">
              <Check aria-hidden />
              <AlertTitle>
                Paired to <span className="font-mono">{row.catalogSku}</span>
              </AlertTitle>
              {row.catalogTitle ? (
                <AlertDescription>{row.catalogTitle}</AlertDescription>
              ) : null}
            </Alert>
          ) : (
            <div className="mt-2 space-y-3">
              <Alert variant="warning">
                <AlertCircle aria-hidden />
                <AlertTitle>This item number resolves to nothing in the catalog</AlertTitle>
                <AlertDescription>
                  So the order has no item display.
                  {row.siblingUnpairedCount > 0
                    ? ` Pairing it also clears ${row.siblingUnpairedCount} other order${row.siblingUnpairedCount === 1 ? '' : 's'} carrying this item number.`
                    : ''}
                </AlertDescription>
              </Alert>

              {/*
                The canonical shadcn combobox: Command (cmdk) owns the filter
                list, keyboard nav and the empty state, so this is not a
                hand-rolled <ul> of buttons pretending to be a listbox. The
                query is REMOTE (`shouldFilter={false}`) because the catalog is
                1,400+ rows and the server already ranks the match.
              */}
              <div className="space-y-1.5">
                <Label htmlFor={`${fieldId}-search`}>Link an existing catalog item</Label>
                <Command shouldFilter={false} className="border border-border-soft">
                  <CommandInput
                    id={`${fieldId}-search`}
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search catalog by SKU or title…"
                    data-testid="exception-catalog-search"
                  />
                  <CommandList>
                    {searching ? (
                      <div className="px-3 py-2 text-role-micro text-text-faint">Searching…</div>
                    ) : (
                      <CommandEmpty>
                        {query.trim() ? 'No catalog item matches.' : 'Type to search the catalog.'}
                      </CommandEmpty>
                    )}
                    {hits.length > 0 ? (
                      <CommandGroup heading="Catalog">
                        {hits.map((hit) => (
                          <CommandItem
                            key={hit.id}
                            value={String(hit.id)}
                            disabled={pairing}
                            onSelect={() => void pairTo(hit.id)}
                            data-testid={`exception-catalog-hit-${hit.id}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block font-mono text-role-caption font-semibold text-text-default">
                                {hit.sku}
                              </span>
                              <span className="block truncate text-role-micro text-text-soft">
                                {hit.productTitle ?? hit.product_title ?? ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-role-micro font-semibold text-blue-600">
                              Link
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ) : null}
                  </CommandList>
                </Command>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label>Or create a new catalog item from this order</Label>
                <p className="text-role-micro text-text-faint">
                  SKU <span className="font-mono">{sku || row.sku || '—'}</span> · title{' '}
                  {title || row.productTitle || '—'}
                </p>
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Category (optional)"
                  list={`${fieldId}-categories`}
                  data-testid="exception-new-category"
                />
                {/*
                  The datalist this input names must actually EXIST — a `list=`
                  pointing at nothing is a silently dead typeahead. Options come
                  from categories already in use, so a vocabulary accretes
                  instead of being invented per row (today the catalog has none,
                  which is why the field is optional).
                */}
                <datalist id={`${fieldId}-categories`}>
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <Button
                  variant="default"
                  size="md"
                  disabled={creating || pairing}
                  onClick={() => void createAndPair()}
                  data-testid="exception-create-sku"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…
                    </>
                  ) : (
                    'Create catalog item and pair'
                  )}
                </Button>
              </div>
            </div>
          )}
        </section>

        <Separator />

        {/* ── Order fields ─────────────────────────────────────────────── */}
        <section aria-labelledby={`${fieldId}-fields`}>
          <h3
            id={`${fieldId}-fields`}
            className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft"
          >
            Order details
          </h3>
          <div className="mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-item`}>Item number</Label>
              <Input
                id={`${fieldId}-item`}
                value={itemNumber}
                onChange={(e) => setItemNumber(e.target.value)}
                className="font-mono"
                data-testid="exception-item-number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-sku`}>SKU</Label>
              <Input
                id={`${fieldId}-sku`}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="font-mono"
                data-testid="exception-sku"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${fieldId}-title`}>Title</Label>
              <Input
                id={`${fieldId}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="exception-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-qty`}>Quantity</Label>
              <Input
                id={`${fieldId}-qty`}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-28"
                data-testid="exception-qty"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-tracking`}>Tracking number</Label>
              <Input
                id={`${fieldId}-tracking`}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                className="font-mono"
                data-testid="exception-tracking"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-role-micro font-semibold uppercase tracking-wide text-text-soft">
                Condition
              </p>
              <ConditionPills value={condition} onChange={setCondition} />
            </div>
          </div>
          <div className="mt-3">
            <Button
              variant="default"
              size="md"
              disabled={!dirty || saving}
              onClick={() => void saveFields()}
              data-testid="exception-save"
            >
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>
        </section>

        <Separator />

        {/* ── Release ──────────────────────────────────────────────────── */}
        <section aria-labelledby={`${fieldId}-release`}>
          <h3
            id={`${fieldId}-release`}
            className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft"
          >
            Release
          </h3>
          <ul className="mt-2 divide-y divide-border-hairline border-y border-border-hairline">
            {row.gates.gates.map((gate) => (
              <li key={gate.id} className="flex items-start gap-2 px-1 py-2">
                <Badge variant={gate.passed ? 'success' : 'destructive'}>
                  {gate.passed ? <Check aria-hidden /> : <AlertCircle aria-hidden />}
                  {gate.id}
                </Badge>
                <span className="min-w-0">
                  <span className="block text-role-caption text-text-default">{gate.label}</span>
                  {gate.reason ? (
                    <span className="block text-role-micro text-text-soft">{gate.reason}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={gateBusy || row.gates.gates.find((g) => g.id === 'G2')?.passed}
              onClick={() =>
                void runGateAction(
                  { action: 'docs-not-required', value: true },
                  'Marked as needing no documents.',
                )
              }
              data-testid="exception-docs-exempt"
            >
              No documents required
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!canRelease || gateBusy}
              onClick={() => void runGateAction({ action: 'release' }, 'Released into To-ship.', true)}
              data-testid="exception-release"
            >
              Release
            </Button>
            {row.releaseState !== 'caged' ? (
              <span className="text-role-caption text-text-soft">
                Not caged — this order is already in the live queue.
              </span>
            ) : !row.gates.canRelease ? (
              <span className={cn('text-role-caption text-rose-700')} role="status">
                Blocked by {blockedBy}.
              </span>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
