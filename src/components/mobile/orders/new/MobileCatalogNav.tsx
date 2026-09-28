'use client';

/**
 * The phone shelf's navigation: the breadcrumb trail (back · root scope ·
 * category crumbs) and the exact filter under it (this level's sub-category
 * chips, plus the Favorites / All products scope chips at the root). Both rows
 * scroll sideways; every target is the 44px touch floor.
 */

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import type { CatalogShelfState } from '@/hooks/orders/useCatalogShelf';
import { cn } from '@/utils/_cn';

const SIDEWAYS_ROW = 'flex items-center overflow-x-auto border-b border-mode-rule [scrollbar-width:none]';

/** Back chevron · root scope crumb · category crumbs — the current (last) crumb kept in view. */
export function MobileCatalogTrail({ catalog }: { catalog: CatalogShelfState }) {
  const { breadcrumbs, categoryId, scope, goCategory, goBack } = catalog;
  const trailRef = useRef<HTMLElement | null>(null);
  const atRoot = categoryId == null;

  useEffect(() => {
    // The current crumb is always the trail's end; scrolling the row (not
    // scrollIntoView) never moves the page under the operator's thumb.
    const trail = trailRef.current;
    trail?.scrollTo({ left: trail.scrollWidth });
  }, [breadcrumbs, categoryId]);

  return (
    <nav aria-label="Catalog" className={cn(SIDEWAYS_ROW, 'gap-1 px-1')} data-testid="m-order-catalog-trail" ref={trailRef}>
      {atRoot ? null : (
        <IconButton
          icon={<ChevronLeft className="size-5" aria-hidden />}
          ariaLabel="Up one level"
          size="touch"
          onClick={goBack}
          className="shrink-0"
          data-testid="m-order-catalog-back"
        />
      )}
      <Crumb
        label={scope === 'favorites' ? 'Favorites' : 'All products'}
        current={atRoot}
        onClick={() => goCategory(null)}
        testId="m-order-catalog-root"
      />
      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.id} className="flex shrink-0 items-center">
          <ChevronRight className="size-4 shrink-0 text-text-faint" aria-hidden />
          <Crumb
            label={crumb.name}
            current={index === breadcrumbs.length - 1}
            onClick={() => goCategory(crumb.id)}
            testId="m-order-catalog-crumb"
          />
        </span>
      ))}
    </nav>
  );
}

function Crumb({ label, current, onClick, testId }: { label: string; current: boolean; onClick: () => void; testId: string }) {
  return (
    <Button
      variant="ghost"
      size="lg"
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      className={cn('shrink-0 whitespace-nowrap px-2', current ? 'text-text-default' : 'font-medium text-text-soft')}
      data-testid={testId}
    >
      {label}
    </Button>
  );
}

/** The exact filter: this level's sub-categories, plus the scope chips at the root. */
export function MobileCatalogFilter({ catalog }: { catalog: CatalogShelfState }) {
  const { categories, categoryId, scope, hasFavorites, goCategory, showFavorites, showAll } = catalog;
  const atRoot = categoryId == null;
  if (!atRoot && categories.length === 0) return null;
  return (
    <div className={cn(SIDEWAYS_ROW, 'gap-2 px-3 py-2')} role="toolbar" aria-label="Filter">
      {atRoot && hasFavorites ? (
        <ScopeChip label="Favorites" active={scope === 'favorites'} onClick={showFavorites} testId="m-order-catalog-scope-favorites" />
      ) : null}
      {atRoot ? (
        <ScopeChip label="All products" active={scope === 'all'} onClick={showAll} testId="m-order-catalog-scope-all" />
      ) : null}
      {categories.map((category) => (
        <Button
          key={category.id}
          variant="secondary"
          size="lg"
          radius="pill"
          onClick={() => goCategory(category.id)}
          iconRight={category.hasChildren ? <ChevronRight aria-hidden /> : undefined}
          className="shrink-0 whitespace-nowrap"
          data-testid="m-order-catalog-category"
        >
          {category.name}
        </Button>
      ))}
    </div>
  );
}

function ScopeChip({ label, active, onClick, testId }: { label: string; active: boolean; onClick: () => void; testId: string }) {
  return (
    <Button
      variant={active ? 'ink' : 'secondary'}
      size="lg"
      radius="pill"
      aria-pressed={active}
      onClick={onClick}
      className="shrink-0 whitespace-nowrap"
      data-testid={testId}
    >
      {label}
    </Button>
  );
}
