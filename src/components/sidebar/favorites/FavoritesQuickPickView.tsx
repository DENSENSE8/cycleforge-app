'use client';

/**
 * Quick-pick favorites — large-hit templates for intake / kiosk.
 * Same quiet fact stack as the sidebar list; tap card (or Start) to use.
 * CRUD chrome is optional (`readOnly` hides it — kiosk device principal).
 */

import { AlertTriangle, ChevronDown, Loader2, Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { fieldLabel } from '@/design-system/tokens/typography/presets';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { FavoriteForm } from './FavoriteForm';
import type { FavoritesWorkspaceController } from './useFavoritesWorkspace';

export function FavoritesQuickPickView({ f }: { f: FavoritesWorkspaceController }) {
  const { title, emptyLabel, useLabel, onUseFavorite, readOnly = false } = f.props;

  const chromeBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-border-soft bg-surface-card text-text-soft transition-colors hover:border-border-default hover:text-text-muted';

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-role-caption font-semibold tracking-tight text-text-muted">
          {title}
          {!f.isLoading && f.favorites.length > 0 ? (
            <span className="ml-1.5 tabular-nums text-role-micro font-medium text-text-faint">
              {f.favorites.length}
            </span>
          ) : null}
        </h3>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!readOnly ? (
            <HoverTooltip label="Add favorite" asChild>
              <IconButton
                onClick={() => {
                  f.resetDraft();
                  f.setShowForm(true);
                  f.setEditingFavoriteId(null);
                  f.setIsListOpen(true);
                }}
                className={chromeBtn}
                ariaLabel="Add favorite"
                icon={<Plus className="h-3.5 w-3.5" />}
              />
            </HoverTooltip>
          ) : null}
          <HoverTooltip label={f.isListOpen ? 'Collapse' : 'Expand'} asChild>
            <IconButton
              onClick={() => f.setIsListOpen((prev) => !prev)}
              className={chromeBtn}
              ariaLabel={f.isListOpen ? 'Collapse favorites' : 'Expand favorites'}
              aria-expanded={f.isListOpen}
              icon={
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-200',
                    f.isListOpen && 'rotate-180',
                  )}
                />
              }
            />
          </HoverTooltip>
        </div>
      </div>

      {!readOnly && f.showForm && f.editingFavoriteId === null ? <FavoriteForm f={f} /> : null}

      {f.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 inset-field text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className={fieldLabel}>{f.error}</p>
        </div>
      ) : null}

      {f.isListOpen ? (
        <>
          {f.isLoading ? (
            <div className="flex items-center justify-center px-3 py-10 text-text-faint">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : f.favorites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-soft px-4 py-8 text-center">
              <p className="text-role-micro text-text-faint">{emptyLabel}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {f.favorites.map((favorite) => {
                const priceLabel = favorite.defaultPrice ? `$${favorite.defaultPrice}` : null;
                const issue = (favorite.issueTemplate || '').trim();
                const start = () => onUseFavorite(favorite);

                return (
                  <div
                    key={`${favorite.workspaceKey}-${favorite.id}`}
                    className="flex min-h-[7.5rem] flex-col overflow-hidden rounded-xl border border-border-soft bg-surface-card"
                  >
                    {/* ds-raw-button: card-face start hit target — not a Button shape */}
                    <button
                      type="button"
                      onClick={start}
                      className={cn(
                        'flex flex-1 flex-col p-3.5 pb-2.5 text-left',
                        focusRing('control', 'neutral'),
                        'rounded-t-xl',
                      )}
                      aria-label={`${useLabel}: ${favorite.label}`}
                    >
                      <p className="text-sm font-medium leading-snug tracking-tight text-text-default">
                        {favorite.label}
                      </p>
                      <div className="mt-1.5 flex min-w-0 items-baseline gap-2">
                        {priceLabel ? (
                          <span className="shrink-0 text-role-micro tabular-nums text-text-muted">
                            {priceLabel}
                          </span>
                        ) : null}
                        {favorite.sku ? (
                          <span className="min-w-0 truncate text-role-micro text-text-faint">
                            {favorite.sku}
                          </span>
                        ) : null}
                      </div>
                      {issue ? (
                        <p className="mt-1.5 line-clamp-2 text-role-micro leading-relaxed text-text-soft">
                          {issue}
                        </p>
                      ) : null}
                    </button>
                    <div className="border-t border-border-hairline p-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={start}
                        className="w-full justify-center text-role-micro font-semibold text-text-muted"
                      >
                        {useLabel}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
