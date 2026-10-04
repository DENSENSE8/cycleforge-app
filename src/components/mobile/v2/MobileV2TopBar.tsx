'use client';

import { Suspense, useEffect, useState, type ClipboardEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ClipboardList, ClipboardPaste, Search } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { Button, IconButton, SearchField } from '@/design-system/primitives';
import { getMobileAppTitle } from '@/lib/mobile-context-navigation';
import { toast } from '@/lib/toast';
import { mobileTopBarClass } from '@/design-system/tokens/mobile-viewport';
import { useMobileActionSlotNode } from './MobileV2ActionSlot';
import { MobileV2ScanCta } from './MobileV2ScanCta';
import { MobileV2AppSwitcher } from './MobileV2AppSwitcher';
import { MobileV2PasteListSheet } from './MobileV2PasteListSheet';
import { useMobileV2Search } from './MobileV2SearchContext';

interface ContextualSearchFace {
  closeLabel: string;
  inputLabel: string;
  placeholder: string;
  triggerLabel: string;
}

const CONTEXTUAL_SEARCH_FACES: Readonly<Record<string, ContextualSearchFace>> = {
  '/m/customers': {
    closeLabel: 'Close customer search',
    inputLabel: 'Search customers',
    placeholder: 'Search name, phone or email',
    triggerLabel: 'Search customers',
  },
  '/m/orders': {
    closeLabel: 'Close order search',
    inputLabel: 'Search fulfillment orders',
    placeholder: 'Search orders, SKU or tracking',
    triggerLabel: 'Search orders',
  },
  '/m/stock': {
    closeLabel: 'Close stock search',
    inputLabel: 'Search warehouse stock',
    placeholder: 'Search location, SKU or product',
    triggerLabel: 'Search stock',
  },
  '/m/work': {
    closeLabel: 'Close order search',
    inputLabel: 'Search fulfillment orders',
    placeholder: 'Search orders, SKU or tracking',
    triggerLabel: 'Search orders',
  },
};

function MobileV2PageTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <h1
      data-testid="mobile-page-title"
      className="min-w-0 truncate text-role-body font-semibold tracking-tight text-text-default"
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
  const searchFace = pathname ? CONTEXTUAL_SEARCH_FACES[pathname] : null;
  const { pasteList } = search;
  const listed = pasteList.selection.refs.length;
  // A held list reopens its sheet when the bar comes back from a row's record.
  const [listOpen, setListOpen] = useState(listed > 0);
  // The shell's scrollport is the sibling <main>, so this bar is already
  // stationary in normal flex flow. `position: sticky` only asks iOS PWA's
  // compositor to maintain a second paint position — and on iOS 26 that paint
  // can drift away from the button's hit-test box.
  const headerClass = mobileTopBarClass;

  useEffect(() => {
    if (!searchFace) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      search.openSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [search, searchFace]);

  if (searchFace && search.isOpen) {
    // A paste of 2+ numbers is a list, not a query; one number stays a search.
    const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
      if (!pasteList.paste(event.clipboardData.getData('text'))) return;
      event.preventDefault();
      setListOpen(true);
    };
    const pasteFromClipboard = async () => {
      const text = await navigator.clipboard?.readText().catch(() => '');
      if (pasteList.paste(text ?? '')) setListOpen(true);
      else toast.message('Copy two or more numbers, then tap paste.');
    };
    return (
      <header className={headerClass} data-mobile-search-mode="open">
        <IconButton
          size="touch"
          radius="surface"
          ariaLabel={searchFace.closeLabel}
          icon={<ChevronLeft className="h-5 w-5" />}
          onClick={search.closeSearch}
          className="m-1 text-text-default"
        />
        <div className="flex h-10 min-w-0 flex-1" onPaste={onPaste}>
          <SearchField
            value={search.query}
            onChange={search.setQuery}
            onClear={() => search.setQuery('')}
            placeholder={searchFace.placeholder}
            tone="neutral"
            size="default"
            autoFocus
            debounceMs={250}
            fillHost
            className="h-10 min-w-0"
            inputProps={{
              'aria-label': searchFace.inputLabel,
              'data-testid': 'mobile-v2-contextual-search',
            }}
          />
        </div>
        {listed > 0 ? (
          <Button
            size="lg"
            radius="surface"
            variant="secondary"
            icon={<ClipboardList />}
            ariaLabel={`Pasted numbers · ${listed}`}
            aria-haspopup="dialog"
            onClick={() => setListOpen(true)}
            className="m-1 shrink-0 shadow-sm"
            data-testid="mobile-paste-list-open"
          >
            <AnimatedStat value={listed} />
          </Button>
        ) : (
          <IconButton
            size="touch"
            radius="surface"
            ariaLabel="Paste a list"
            icon={<ClipboardPaste className="h-5 w-5" />}
            onClick={() => void pasteFromClipboard()}
            className="m-1 text-text-default"
            data-testid="mobile-paste-list-paste"
          />
        )}
        <MobileV2PasteListSheet
          list={pasteList}
          open={listOpen && listed > 0}
          onOpenChange={setListOpen}
          onClear={() => {
            pasteList.clear();
            setListOpen(false);
          }}
        />
      </header>
    );
  }

  return (
    <header className={headerClass}>
      <MobileV2AppSwitcher />
      {searchFace ? (
        <IconButton
          size="touch"
          radius="surface"
          ariaLabel={searchFace.triggerLabel}
          title={`${searchFace.triggerLabel} · ⌘K`}
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
      <MobileV2ScanCta rounded />
    </header>
  );
}
