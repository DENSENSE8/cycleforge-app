'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { motionDuration, motionPresence, motionTransition, motionVariants } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { Button, TextField } from '@/design-system/primitives';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import type { PrepackCatalogChoice } from '@/lib/prepack/types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { fetchRecentPrepackProducts, prepackErrorText, readJson } from './prepack-client';
import { ProductIdentity } from './prepack-ui';

type BrowserTab = 'recent' | 'all';

const TABS = [
  { id: 'recent', label: 'Recently printed', testId: 'prepack-browser-recent' },
  { id: 'all', label: 'All products', testId: 'prepack-browser-all' },
];

/**
 * The product browser: Recently printed | All products, and one combobox
 * that searches SKU, title and every identifier (ASIN, FNSKU, UPC, EAN, GTIN,
 * MPN, platform ids). Each row: square image, title, SKU underneath. The row
 * photo carries `layoutId` so the chosen row flies into the context hero.
 */
export function PrepackProductBrowser({
  selectedId,
  onChoose,
  focusSignal,
  staffId,
}: {
  selectedId: number | null;
  onChoose: (choice: PrepackCatalogChoice) => void;
  /** Changes whenever the form wants the search field focused (serial not in the system, Edit product). */
  focusSignal: number;
  staffId: number;
}) {
  const [tab, setTab] = useState<BrowserTab>('recent');
  const [direction, setDirection] = useState(1);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const rowPresence = useMotionPresence(motionPresence.findListRow);
  const rowTransition = useMotionTransition(motionTransition.findListRow);
  const glide = useMotionTransition(motionTransition.findListGlide);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  const recent = useQuery({ queryKey: ['prepack-recent'], queryFn: fetchRecentPrepackProducts, staleTime: 30_000 });
  const search = useSkuCatalogSearch(debounced, { searchField: 'catalog', limit: 30, allowEmpty: tab === 'all' });

  const items = useMemo<PrepackCatalogChoice[]>(() => {
    if (tab === 'recent') return recent.data ?? [];
    return (search.data ?? []).map((item) => ({ id: item.id, sku: item.sku, title: item.product_title, imageUrl: item.image_url }));
  }, [recent.data, search.data, tab]);

  useEffect(() => setActive(0), [items]);

  const switchTab = (next: BrowserTab) => {
    if (next === tab) return;
    setDirection(next === 'all' ? 1 : -1);
    setTab(next);
  };

  const createTitleOnly = async () => {
    const title = query.trim();
    if (!title) return;
    setCreating(true);
    setCreateError(null);
    try {
      const data = await readJson<{ item: { id: number; sku: string; productTitle: string } }>(
        await fetch('/api/sku-catalog/provisional', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productTitle: title, sourceRef: safeRandomUUID(), staffId: staffId || undefined }),
        }),
      );
      onChoose({ id: data.item.id, sku: data.item.sku, title: data.item.productTitle, imageUrl: null });
    } catch (cause) {
      setCreateError(prepackErrorText(cause, 'Could not create the title-only product'));
    } finally {
      setCreating(false);
    }
  };

  const loading = tab === 'recent' ? recent.isPending : search.isFetching && items.length === 0;
  const listId = 'prepack-browser-list';

  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="prepack-product-browser">
      <TabSwitch tabs={TABS} activeTab={tab} onTabChange={(id) => switchTab(id as BrowserTab)} size="sm" />
      <TextField
        ref={inputRef}
        label="Search SKU, title, UPC, ASIN, FNSKU, MPN"
        value={query}
        onChange={(value) => {
          setQuery(value);
          if (value.trim()) switchTab('all');
        }}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-activedescendant={items[active] ? `prepack-browser-${items[active]!.id}` : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current) => Math.min(Math.max(0, current + step), Math.max(0, items.length - 1)));
          } else if (event.key === 'Enter' && items[active]) {
            event.preventDefault();
            onChoose(items[active]!);
          }
        }}
        data-testid="prepack-browser-search"
      />
      <div className="grid min-h-0 overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="sync">
          <motion.ul
            key={tab}
            id={listId}
            role="listbox"
            aria-label={tab === 'recent' ? 'Recently printed products' : 'All products'}
            className="col-start-1 row-start-1 min-w-0 divide-y divide-mode-rule border-y border-mode-rule"
            custom={direction}
            variants={motionVariants.tabPager}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduced ? motionTransition.tabPagerReduced : motionTransition.tabPager}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item, index) => (
                <motion.li
                  key={item.id}
                  id={`prepack-browser-${item.id}`}
                  role="option"
                  aria-selected={item.id === selectedId || index === active}
                  layout="position"
                  initial={rowPresence.initial}
                  animate={rowPresence.animate}
                  exit={rowPresence.exit}
                  transition={{
                    ...rowTransition,
                    delay: Math.min(index, 10) * motionDuration.findListRowStagger,
                    layout: glide,
                  }}
                >
                  <Button
                    variant={item.id === selectedId ? 'primarySoft' : 'ghost'}
                    size="lg"
                    radius="flush"
                    className="h-auto min-h-16 w-full justify-start whitespace-normal px-3 py-2"
                    onClick={() => onChoose(item)}
                    onMouseEnter={() => setActive(index)}
                    data-testid="prepack-browser-row"
                    data-catalog-id={item.id}
                  >
                    <ProductIdentity
                      product={item}
                      photo={(thumb) => <motion.span layoutId={`prepack-product-${item.id}`} className="block shrink-0">{thumb}</motion.span>}
                    />
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
            {loading ? <li className="px-3 py-3 text-role-caption text-text-muted">Loading products…</li> : null}
            {!loading && items.length === 0 ? (
              <li className="space-y-2 px-3 py-3 text-role-caption text-text-muted">
                <p>{tab === 'recent' ? 'No labels printed yet — search All products.' : debounced ? `No product matches “${debounced}”.` : 'No products.'}</p>
                {tab === 'all' && debounced ? (
                  <Button variant="secondary" size="md" onClick={() => void createTitleOnly()} loading={creating}>
                    Use “{debounced}” as a title-only product
                  </Button>
                ) : null}
                {createError ? <p role="alert" className="font-semibold text-text-danger">{createError}</p> : null}
              </li>
            ) : null}
          </motion.ul>
        </AnimatePresence>
      </div>
      {recent.error && tab === 'recent' ? (
        <p role="alert" className="text-role-caption font-semibold text-text-danger">
          {prepackErrorText(recent.error, 'Could not load recently printed products')}
        </p>
      ) : null}
    </div>
  );
}
