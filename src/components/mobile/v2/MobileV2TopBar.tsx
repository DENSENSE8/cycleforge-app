'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, Search } from '@/components/Icons';
import { IconButton, SearchField } from '@/design-system/primitives';
import { getMobileAppTitle } from '@/lib/mobile-context-navigation';
import { useMobileActionSlotNode } from '@/components/mobile/redesign/MobileActionSlot';
import { MobileScanCta } from '@/components/mobile/redesign/mobile-scan-cta';
import { MobileV2AppSwitcher } from './MobileV2AppSwitcher';
import { useMobileV2Search } from './MobileV2SearchContext';

function MobileV2PageTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <h1
      data-testid="mobile-page-title"
      className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-text-default"
    >
      {getMobileAppTitle(pathname, searchParams)}
    </h1>
  );
}

/** Compact V2 chrome: application switcher, current destination and one page action. */
export function MobileV2TopBar() {
  const pathname = usePathname();
  const pageAction = useMobileActionSlotNode();
  const search = useMobileV2Search();
  const supportsContextualSearch = pathname === '/m/orders' || pathname === '/m/work' || pathname === '/m/stock';
  const searchingStock = pathname === '/m/stock';
  const headerClass = 'sticky top-0 z-header flex h-[3.25rem] shrink-0 items-center border-b border-border-soft bg-surface-card/95 backdrop-blur-xl';

  useEffect(() => {
    if (!supportsContextualSearch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      search.openSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [search, supportsContextualSearch]);

  if (supportsContextualSearch && search.isOpen) {
    return (
      <header className={headerClass} data-mobile-search-mode="open">
        <IconButton
          size="touch"
          radius="surface"
          ariaLabel={searchingStock ? 'Close stock search' : 'Close order search'}
          icon={<ChevronLeft className="h-5 w-5" />}
          onClick={search.closeSearch}
          className="m-1 text-text-default"
        />
        <SearchField
          value={search.query}
          onChange={search.setQuery}
          onClear={() => search.setQuery('')}
          placeholder={searchingStock ? 'Search location, SKU or product' : 'Search orders, SKU or tracking'}
          tone="neutral"
          size="default"
          autoFocus
          debounceMs={250}
          fillHost
          className="h-10 min-w-0"
          inputProps={{
            'aria-label': searchingStock ? 'Search warehouse stock' : 'Search fulfillment orders',
            'data-testid': 'mobile-v2-contextual-search',
          }}
        />
      </header>
    );
  }

  return (
    <header className={headerClass}>
      <MobileV2AppSwitcher />
      {supportsContextualSearch ? (
        <IconButton
          size="touch"
          radius="surface"
          ariaLabel={searchingStock ? 'Search stock' : 'Search orders'}
          title={`${searchingStock ? 'Search stock' : 'Search orders'} · ⌘K`}
          icon={<Search className="h-5 w-5" />}
          onClick={search.openSearch}
          className="my-1 border border-border-soft bg-surface-card text-text-default shadow-sm"
          data-testid="mobile-v2-search-trigger"
        />
      ) : null}
      <div className="min-w-0 flex-1 px-2">
        <Suspense fallback={<span className="block h-4" aria-hidden />}>
          <MobileV2PageTitle />
        </Suspense>
      </div>
      {pageAction ? <div className="flex shrink-0 items-center">{pageAction}</div> : null}
      <MobileScanCta rounded />
    </header>
  );
}
