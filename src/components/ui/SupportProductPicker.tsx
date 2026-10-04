'use client';

/**
 * "Product sent to customer" — the picker body behind the ticket composer's
 * `+`, one face for the desk's upward popover and the phone's bottom sheet
 * (owner 2026-10-03). Picking is recognition, not recall (task-principles P7):
 * the list is already populated before a key is pressed — the ticket's linked
 * products, else recent picks — and filters as the operator types.
 *
 * Order top to bottom: role → search → results. The highlighted row carries
 * the qty stepper and the one commit ("Add"); Enter does the same from the
 * search field. Titles arrive pre-resolved by the API (SKU identity law);
 * this file never re-derives one.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Package } from '@/components/Icons';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { TouchQtyStepper } from '@/design-system/components/TouchQtyStepper';
import { Button, SearchField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { useSupportProductSearch } from '@/hooks/useSupportTicketItems';
import {
  DEFAULT_TICKET_ITEM_ROLE,
  TICKET_ITEM_MAX_QTY,
  TICKET_ITEM_ROLES,
  TICKET_ITEM_ROLE_LABEL,
  type TicketItemRole,
} from '@/lib/support/product-token';
import type { SupportProductFace, SupportProductSource } from '@/lib/support/ticket-items-shared';
import { cn } from '@/utils/_cn';

const SOURCE_EYEBROW: Record<SupportProductSource, string> = {
  ticket: 'On this ticket',
  recent: 'Recent picks',
  search: 'Results',
  ids: 'Results',
  sku: 'Results',
};

const ROLE_TABS = TICKET_ITEM_ROLES.map((role) => ({
  id: role,
  label: TICKET_ITEM_ROLE_LABEL[role],
  testId: `product-picker-role-${role}`,
}));

export function SupportProductPicker({
  ticketId,
  onPick,
  onClose,
  variant,
}: {
  /** Zendesk ticket number — scopes the empty-query list to this ticket's products. */
  ticketId: number;
  onPick: (face: SupportProductFace, role: TicketItemRole, qty: number) => void;
  /** Esc. The host decides where focus lands (the desk returns it to the textarea). */
  onClose: () => void;
  variant: 'desk' | 'phone';
}) {
  const phone = variant === 'phone';
  const [role, setRole] = useState<TicketItemRole>(DEFAULT_TICKET_ITEM_ROLE);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [qty, setQty] = useState(1);
  const { data, isLoading, isFetching } = useSupportProductSearch(query, ticketId);
  const products = data?.products ?? [];
  const listId = useId();
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  // A new list is a new question: the highlight goes back to the top, qty to 1.
  useEffect(() => {
    setHighlight(0);
    setQty(1);
  }, [data]);

  useEffect(() => {
    rowRefs.current[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const choose = (index: number) => {
    if (index === highlight) return;
    setHighlight(index);
    setQty(1);
  };

  const pick = (index = highlight) => {
    const face = products[index];
    if (face) onPick(face, role, qty);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (products.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      choose(Math.min(products.length - 1, Math.max(0, highlight + step)));
      return;
    }
    // Enter from the search field picks; a focused button (− / + / Add) keeps its own press.
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      pick();
    }
  };

  const activeId = products[highlight] ? `${listId}-${highlight}` : undefined;

  return (
    <div
      data-testid="product-picker"
      data-variant={variant}
      onKeyDown={onKeyDown}
      className={cn('flex min-w-0 flex-col', phone ? 'gap-3' : 'w-96 gap-2 py-2')}
    >
      <div className={phone ? undefined : 'px-3'}>
        <TabSwitch
          tabs={ROLE_TABS}
          activeTab={role}
          onTabChange={(id) => setRole(id as TicketItemRole)}
          size={phone ? 'md' : 'sm'}
        />
      </div>
      <div className={phone ? undefined : 'px-3'}>
        <SearchField
          value={query}
          onChange={setQuery}
          // The search hook owns the debounce; a second one here would only add lag.
          debounceMs={0}
          autoFocus
          tone="neutral"
          size="default"
          isSearching={isFetching}
          placeholder="Search title or SKU"
          inputProps={{
            role: 'combobox',
            'aria-label': 'Search products',
            'aria-expanded': true,
            'aria-controls': listId,
            'aria-activedescendant': activeId,
            'aria-autocomplete': 'list',
            autoComplete: 'off',
            'data-testid': 'product-picker-search',
          }}
        />
      </div>

      {data && products.length > 0 ? (
        <span className={cn(sectionLabel, phone ? undefined : 'px-3')}>{SOURCE_EYEBROW[data.source]}</span>
      ) : null}

      {isLoading && !data ? (
        <p className={cn('py-3 text-role-caption text-text-muted', phone ? undefined : 'px-3')}>Loading products…</p>
      ) : products.length === 0 ? (
        <p className={cn('py-3 text-role-caption text-text-muted', phone ? undefined : 'px-3')}>
          {data?.source === 'search' ? 'No product matches that search.' : 'Type a title or SKU to search the catalog.'}
        </p>
      ) : (
        <ul
          id={listId}
          role="listbox"
          aria-label="Products"
          className={cn('flex flex-col', phone ? 'gap-1' : 'max-h-72 overflow-y-auto')}
        >
          {products.map((face, index) => {
            const active = index === highlight;
            return (
              <li
                key={face.skuCatalogId}
                id={`${listId}-${index}`}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                role="option"
                aria-selected={active}
                data-testid="product-picker-row"
                data-sku={face.sku}
                className={cn(active && 'bg-surface-hover', phone && cornerClass('control'))}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => choose(index)}
                  className={cn(
                    'ds-raw-button flex w-full min-w-0 items-center gap-3 text-left',
                    phone ? 'min-h-14 px-2 py-2' : 'px-3 py-1.5 hover:bg-surface-hover',
                    focusRing('control', 'accent'),
                  )}
                >
                  <ProductPickerFace face={face} />
                </button>
                {active ? (
                  <div className={cn('flex items-stretch gap-2', phone ? 'px-2 pb-2' : 'px-3 pb-2')}>
                    <div className="min-w-0 flex-1">
                      <TouchQtyStepper
                        value={qty}
                        onChange={setQty}
                        min={1}
                        max={TICKET_ITEM_MAX_QTY}
                        unit={['unit', 'units']}
                        label="Quantity sent"
                        testId="product-picker-qty"
                      />
                    </div>
                    <Button
                      variant="primary"
                      size={phone ? 'lg' : 'md'}
                      className="h-auto shrink-0 self-stretch"
                      onClick={() => pick(index)}
                      data-testid="product-picker-add"
                    >
                      Add
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Photo · identity title · SKU · on hand — the intake product row's face. */
function ProductPickerFace({ face }: { face: SupportProductFace }) {
  return (
    <>
      {face.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog photos are remote, unsized thumbnails
        <img
          src={face.imageUrl}
          alt=""
          className={cn('size-10 shrink-0 bg-surface-sunken object-cover', cornerClass('chip'))}
        />
      ) : (
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center bg-surface-sunken text-text-faint',
            cornerClass('chip'),
          )}
        >
          <Package className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-role-caption font-medium text-text-default">{face.title}</span>
        <span className="block break-words text-role-micro text-text-muted">{face.sku}</span>
      </span>
      <span className="shrink-0 text-right text-role-micro text-text-muted">
        <span className={cn('block', face.onHand > 0 ? 'text-text-success' : 'text-text-faint')}>
          {face.onHand > 0 ? `${face.onHand} on hand` : 'None on hand'}
        </span>
        {face.bin ? <span className="block">Bin {face.bin}</span> : null}
      </span>
    </>
  );
}
