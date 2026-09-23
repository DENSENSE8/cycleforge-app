import { Check, Loader2, Package, Plus, Search, X } from '@/components/Icons';
import { FbaSelectedLineRow } from '@/components/fba/sidebar/FbaSelectedLineRow';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, TextField } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import type { FnskuSearchResult } from '@/components/fba/hooks/useFnskuSearch';
import type { StationTheme } from '@/utils/staff-colors';
import type { ShipmentCardItem } from '@/lib/fba/types';

/**
 * FNSKU search popup — DS Dialog portals to body so it escapes any transformed ancestor.
 * Searches the shipment catalog and adds a matching FNSKU as a 1-qty plan line.
 */
export function FnskuSearchModal({
  open,
  onClose,
  query,
  onQueryChange,
  searchInputRef,
  searching,
  results,
  items,
  addingFnsku,
  stationTheme,
  onAddFnsku,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  searching: boolean;
  results: FnskuSearchResult[];
  items: ShipmentCardItem[];
  addingFnsku: string | null;
  stationTheme: StationTheme;
  onAddFnsku: (result: FnskuSearchResult) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="space-y-0 border-b border-border-soft px-4 py-3 text-left">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-role-micro uppercase tracking-[0.16em] text-text-accent">Add Amazon SKU</p>
              <DialogTitle className="mt-0.5 text-sm font-semibold">Search shipment catalog</DialogTitle>
              <DialogDescription className="sr-only">
                Search the shipment catalog by Amazon SKU (FNSKU), ASIN, SKU, or product title.
              </DialogDescription>
            </div>
            <IconButton
              type="button"
              onClick={onClose}
              radius="flush"
              className="border border-border-soft bg-surface-card p-2 text-text-soft hover:border-border-default hover:bg-surface-hover hover:text-text-default"
              ariaLabel="Close"
              icon={<X className="h-4 w-4" />}
            />
          </div>
          <TextField
            ref={searchInputRef}
            label="Search Amazon SKU, ASIN, SKU, or product title"
            value={query}
            onChange={onQueryChange}
            inputClassName="font-semibold"
          />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {query.trim().length < 2 ? (
            <div className="py-16 text-center">
              <Search className="mx-auto h-6 w-6 text-text-faint" />
              <p className="mt-2 text-xs font-semibold text-text-faint">
                Type at least 2 characters to search
              </p>
            </div>
          ) : searching ? (
            <div className="flex items-center justify-center gap-2 py-16">
              <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
              <p className="text-xs font-semibold text-text-soft">Searching...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-xs font-semibold text-text-faint">No matching Amazon SKUs found</p>
              <p className="mt-1 text-role-micro text-text-faint">Try a different search term</p>
            </div>
          ) : (
            <div className="divide-y divide-border-hairline overflow-hidden rounded-none border border-border-soft">
              {results.map((result) => {
                const alreadyAdded = items.some(
                  (i) => i.fnsku.toUpperCase() === result.fnsku.toUpperCase(),
                );
                const isAdding = addingFnsku === result.fnsku;
                return (
                  <FbaSelectedLineRow
                    key={result.fnsku}
                    displayTitle={result.product_title || result.fnsku}
                    fnsku={result.fnsku.toUpperCase()}
                    stationTheme={stationTheme}
                    leadingSlot={
                      <div className="flex h-5 w-5 items-center justify-center bg-surface-accent">
                        <Package className="h-3 w-3 text-text-accent" />
                      </div>
                    }
                    rightSlot={
                      <HoverTooltip label={alreadyAdded ? 'Already in shipment' : 'Add to shipment'} asChild>
                        <IconButton
                          type="button"
                          radius="flush"
                          disabled={alreadyAdded || isAdding}
                          onClick={() => void onAddFnsku(result)}
                          className={[
                            'flex h-7 w-7 items-center justify-center border',
                            alreadyAdded
                              ? 'cursor-default border-border-success bg-surface-success text-text-success'
                              : isAdding
                                ? 'cursor-wait border-border-accent bg-surface-accent text-text-accent'
                                : 'border-border-accent bg-surface-card text-text-accent hover:bg-surface-accent',
                          ].join(' ')}
                          ariaLabel={alreadyAdded ? 'Already in shipment' : `Add ${result.fnsku} to shipment`}
                          icon={
                            isAdding ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : alreadyAdded ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )
                          }
                        />
                      </HoverTooltip>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
