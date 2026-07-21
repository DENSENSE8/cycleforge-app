'use client';

/**
 * Local-pickup main-pane editor.
 *
 * Composes the Unbox-family station SoTs: sticky {@link StationContextBar}
 * identity, utility toolbar, Item/Add SectionTabs displays, and one
 * tab-aware terminal action. Selection + cart live in the shared
 * {@link localPickupStore}; the slim sidebar list drives `selectedKey`.
 *
 * Replaces the old `LocalPickupCatalogPanel` browse grid — adding is now a
 * focused catalog display, while the Item display edits one staged line.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, ShoppingCart, X } from '@/components/Icons';
import { PaneHeaderActionBar } from '@/components/ui/pane-header';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SectionTabsSlider } from '@/design-system/components';
import { Button, EmptyState, IconButton } from '@/design-system/primitives';
import { StationWorkbench } from '@/components/station/workbench';
import { StationContextBar } from '@/components/station/entity-context';
import {
  StationTerminalDock,
  useStationTerminalAction,
} from '@/components/station/terminal';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import {
  EcwidProductSearchInline,
  type EcwidProductSelection,
} from '@/components/receiving/unfound/EcwidProductSearchInline';
import {
  PickupEntityContextHeader,
  PickupProductSummary,
} from './PickupEntityContextHeader';
import { buildPickupTabs } from './build-pickup-tabs';
import { resolvePickupTerminal } from './terminal/pickup-terminal';
import {
  addLine,
  closeReview,
  getSelectedLine,
  openReview,
  patchLine,
  removeLine,
  selectLine,
  useLocalPickupCart,
  type CartLine,
  type ConditionGrade,
} from './localPickupStore';
import { LocalPickupReviewPanel } from './LocalPickupReviewPanel';

type PickupView = 'item' | 'add';

export function LocalPickupEditPanel() {
  const cartState = useLocalPickupCart();
  const { cart, selectedKey, reviewOpen } = cartState;
  const selected = getSelectedLine(cartState);
  const [view, setView] = useState<PickupView>('item');

  // Keep a selection alive whenever there are staged items (e.g. after
  // navigating away and back, or after the sidebar cleared it).
  useEffect(() => {
    if (cart.length > 0 && !selectedKey) {
      selectLine(cart[0].key);
    }
  }, [cart, selectedKey]);

  // Sidebar selection always returns focus to the Item display. Opening Add
  // does not change selectedKey, so the catalog remains mounted until a pick.
  useEffect(() => {
    if (selectedKey) setView('item');
  }, [selectedKey]);

  // Reuse the unfound carton's product lookup (Ecwid catalog search + the
  // "Product not added yet?" manual-title path) so pickup can stage items that
  // aren't in the system yet. The selection maps straight onto a cart line;
  // pickup persists on submit, so we ignore the receiving-line identifiers.
  const handleAddSelection = (sel: EcwidProductSelection) => {
    addLine({
      sku: sel.sku,
      product_title: sel.item_name,
      image_url: sel.image_url,
      category: null,
    });
    setView('item');
  };

  const index = selected ? cart.findIndex((l) => l.key === selected.key) : -1;
  const canPrev = index > 0;
  const canNext = index >= 0 && index < cart.length - 1;
  const goPrev = () => {
    if (canPrev) selectLine(cart[index - 1].key);
  };
  const goNext = () => {
    if (canNext) selectLine(cart[index + 1].key);
  };

  const terminalVm = useStationTerminalAction({
    surface: 'pickup',
    mode: 'pickup',
    tabId: view,
    build: (kind) =>
      resolvePickupTerminal(kind, {
        itemCount: cart.length,
        onAddItem: () => setView('add'),
        onReview: openReview,
        addIcon: <Plus className="h-4 w-4" />,
        reviewIcon: <ShoppingCart className="h-4 w-4" />,
      }),
  });

  const tabs = buildPickupTabs({
    itemCount: cart.length,
    itemContent: selected ? (
      <LocalPickupLineEditor key={selected.key} line={selected} />
    ) : (
      <EmptyState
        className="min-h-[20rem]"
        icon={<ShoppingCart className="h-7 w-7 text-text-faint" />}
        title="No items yet"
        description="Add a product to start this local pickup. It will appear in the sidebar and open here for intake details."
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            onClick={() => setView('add')}
          >
            Add item
          </Button>
        }
      />
    ),
    addContent: (
      <EcwidProductSearchInline
        showHeader
        receivingId={0}
        popoverMode="search"
        searchFieldOverride="zoho_catalog"
        onSelect={handleAddSelection}
        onClose={() => setView('item')}
      />
    ),
  });

  return (
    <>
      <div className="relative flex h-full min-h-0 w-full flex-col bg-surface-canvas">
        <StationContextBar
          identity={<PickupEntityContextHeader selected={selected} />}
        />
        <StationWorkbench
          ambientWash={false}
          className="relative z-0 w-full flex-1 bg-transparent"
          toolbar={
            <PaneHeaderActionBar
              variant="header"
              actions={[]}
              leftSlot={
                <span className="text-role-eyebrow font-black uppercase tracking-widest text-text-muted">
                  Local Pickup
                  {selected && cart.length > 1 ? (
                    <span className="ml-1 text-text-soft">
                      · Item {index + 1} of {cart.length}
                    </span>
                  ) : null}
                </span>
              }
              onPrev={cart.length > 1 ? goPrev : undefined}
              onNext={cart.length > 1 ? goNext : undefined}
              prevDisabled={!canPrev}
              nextDisabled={!canNext}
              prevTitle="Previous item"
              nextTitle="Next item"
            />
          }
          entityContext={<PickupProductSummary selected={selected} />}
          tabs={
            <SectionTabsSlider
              tabs={tabs}
              value={view}
              onChange={(id) => setView(id as PickupView)}
              ariaLabel="Local Pickup displays"
            />
          }
          dock={<StationTerminalDock vm={terminalVm} />}
        />
      </div>
      {reviewOpen ? (
        <LocalPickupReviewPanel mode="finalize" onClose={closeReview} />
      ) : null}
    </>
  );
}

// ── Line editor body — the modern, full-width version of the old inline card ──

function LocalPickupLineEditor({ line }: { line: CartLine }) {
  const isMissing = line.partsStatus === 'MISSING_PARTS';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 rounded-2xl border border-border-soft bg-surface-card p-4 sm:p-5"
    >
      {/* Image + remove */}
      <div
        className="relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-surface-canvas"
        style={{ height: 280 }}
      >
        {line.image_url ? (
          <img src={line.image_url} alt="" className="h-full w-full object-contain" />
        ) : (
          <Package className="h-14 w-14 text-text-faint" />
        )}
        <HoverTooltip label="Remove item" asChild>
          <IconButton
            onClick={() => removeLine(line.key)}
            ariaLabel="Remove item"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-card/90 text-text-faint shadow-sm hover:bg-rose-50 hover:text-rose-600"
            icon={<X className="h-4 w-4" />}
          />
        </HoverTooltip>
      </div>

      {/* Title + SKU */}
      <div>
        <h2 className="text-base font-black leading-snug text-text-default">
          {line.product_title}
        </h2>
        <p className="mt-1 font-mono text-role-micro uppercase text-emerald-600">
          Ecwid: {line.sku}
        </p>
      </div>

      {/* Condition Received */}
      <div>
        <label className="mb-1 block text-role-eyebrow uppercase tracking-wider text-text-soft">
          Condition Received
        </label>
        <ConditionPills
          value={line.conditionGrade}
          onChange={(next) =>
            patchLine(line.key, { conditionGrade: next as ConditionGrade })
          }
        />
      </div>

      {/* Parts status */}
      <div>
        <label className="mb-1 block text-role-eyebrow uppercase tracking-wider text-text-soft">
          Parts
        </label>
        <div className="grid grid-cols-2 gap-2">
          {/* ds-raw-button: two-state segmented toggle (conditional active bg), no single DS variant */}
          <button
            type="button"
            onClick={() => patchLine(line.key, { partsStatus: 'COMPLETE' })}
            className={`h-9 rounded-lg text-role-caption font-black uppercase tracking-wider transition-colors ${
              !isMissing
                ? 'bg-emerald-600 text-white'
                : 'bg-surface-sunken text-text-soft hover:bg-surface-strong'
            }`}
          >
            Complete
          </button>
          {/* ds-raw-button: two-state segmented toggle (conditional active bg), no single DS variant */}
          <button
            type="button"
            onClick={() => patchLine(line.key, { partsStatus: 'MISSING_PARTS' })}
            className={`h-9 rounded-lg text-role-caption font-black uppercase tracking-wider transition-colors ${
              isMissing
                ? 'bg-amber-500 text-white'
                : 'bg-surface-sunken text-text-soft hover:bg-surface-strong'
            }`}
          >
            Missing Parts
          </button>
        </div>
        {isMissing ? (
          <textarea
            value={line.missingPartsNote}
            onChange={(e) => patchLine(line.key, { missingPartsNote: e.target.value })}
            placeholder="List missing parts…"
            className="mt-2 min-h-[56px] w-full rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-role-caption text-text-default placeholder:text-text-faint focus:border-amber-400 focus:outline-none"
          />
        ) : null}
      </div>

      {/* Condition note */}
      <div>
        <label className="mb-1 block text-role-eyebrow uppercase tracking-wider text-text-soft">
          Condition note
        </label>
        <textarea
          value={line.conditionNote}
          onChange={(e) => patchLine(line.key, { conditionNote: e.target.value })}
          placeholder="What's wrong or notable about the unit…"
          className="min-h-[56px] w-full rounded-lg border border-border-soft bg-surface-card px-3 py-2 text-role-caption text-text-default placeholder:text-text-faint focus:border-emerald-400 focus:outline-none"
        />
      </div>

      {/* Total Price + Qty */}
      <div className="grid grid-cols-2 gap-3 border-t border-border-hairline pt-4">
        <div>
          <label className="mb-1 block text-role-eyebrow uppercase tracking-wider text-text-soft">
            Total Price
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-role-caption font-bold text-emerald-700">
              $
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={line.total}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || Number(v) >= 0) patchLine(line.key, { total: v });
              }}
              placeholder="0.00"
              className="h-9 w-full rounded-lg border border-border-soft bg-surface-card pl-6 pr-3 text-role-caption font-bold text-emerald-700 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-role-eyebrow uppercase tracking-wider text-text-soft">
            Qty
          </label>
          <input
            type="number"
            min={1}
            defaultValue={line.quantity}
            key={`${line.key}-qty-${line.quantity}`}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v >= 1) patchLine(line.key, { quantity: Math.floor(v) });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="h-9 w-full rounded-lg border border-border-soft bg-surface-card px-3 text-center text-role-caption font-black text-text-default focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>
    </motion.div>
  );
}
