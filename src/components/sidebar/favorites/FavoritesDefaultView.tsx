'use client';

/**
 * Default favorites list — collapsible header + quiet rows.
 *
 * Primary job: start from a template (row press / Start). Manage (edit/delete)
 * and Add stay secondary chrome — ghost icon buttons, never saturated fills.
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { AlertTriangle, Check, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { sectionLabel, fieldLabel } from '@/design-system/tokens/typography/presets';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { FavoriteForm } from './FavoriteForm';
import type { FavoritesWorkspaceController } from './useFavoritesWorkspace';

export function FavoritesDefaultView({ f }: { f: FavoritesWorkspaceController }) {
  const {
    title,
    description,
    emptyLabel,
    useLabel,
    onUseFavorite,
    hideHeading = false,
    inlineRows = false,
    onAddFavorite,
    isFavoriteAdded,
    readOnly = false,
  } = f.props;

  const chromeBtn =
    'inline-flex items-center justify-center border border-border-soft bg-surface-card text-text-soft transition-colors hover:border-border-default hover:bg-surface-hover hover:text-text-muted';
  const chromeSize = inlineRows ? 'h-7 w-7 rounded-md' : 'h-8 w-8 rounded-lg';
  const chromeIcon = inlineRows ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <section className={inlineRows ? 'space-y-1.5' : 'space-y-3 rounded-none border border-border-soft bg-surface-card p-3'}>
      <div className="flex items-center justify-between gap-2">
        {hideHeading ? (
          <div />
        ) : (
          // ds-raw-button: multi-line text-left collapse header — not a Button shape
          <button
            type="button"
            onClick={() => f.setIsListOpen((prev) => !prev)}
            className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
            aria-expanded={f.isListOpen}
          >
            <motion.span
              animate={{ rotate: f.isListOpen ? 90 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="shrink-0 text-text-faint group-hover:text-text-soft"
            >
              <ChevronRight className={inlineRows ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            </motion.span>
            <div className="min-w-0">
              <h3 className="text-role-caption font-semibold tracking-tight text-text-muted">
                {title}
                {f.favorites.length > 0 ? (
                  <span className="ml-1.5 text-role-micro font-medium tabular-nums text-text-faint">
                    {f.favorites.length}
                  </span>
                ) : null}
              </h3>
              {description && f.isListOpen ? (
                <p className="mt-0.5 text-role-micro leading-relaxed text-text-faint">{description}</p>
              ) : null}
            </div>
          </button>
        )}

        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1">
            <HoverTooltip label={f.isManageMode ? 'Done managing' : 'Manage favorites'} asChild>
              <IconButton
                onClick={() => f.setIsManageMode((prev) => !prev)}
                className={cn(
                  chromeBtn,
                  chromeSize,
                  f.isManageMode && 'border-border-default bg-surface-sunken text-text-muted',
                )}
                ariaLabel={f.isManageMode ? 'Done managing' : 'Manage favorites'}
                icon={
                  f.isManageMode ? (
                    <X className={chromeIcon} />
                  ) : (
                    <Pencil className={chromeIcon} />
                  )
                }
              />
            </HoverTooltip>
            <HoverTooltip label="Add favorite" asChild>
              <IconButton
                onClick={() => {
                  f.resetDraft();
                  f.setShowForm((prev) => (f.editingFavoriteId === null ? !prev : true));
                  f.setIsListOpen(true);
                }}
                className={cn(chromeBtn, chromeSize)}
                ariaLabel="Add favorite"
                icon={<Plus className={chromeIcon} />}
              />
            </HoverTooltip>
          </div>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {f.isListOpen && (
          <motion.div
            key="list-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: motionBezier.easeOut }}
            className="overflow-hidden"
          >
            <div className={inlineRows ? 'space-y-0' : 'space-y-2 pt-0.5'}>
              {!readOnly && f.showForm && f.editingFavoriteId === null ? <FavoriteForm f={f} /> : null}

              {f.error ? (
                <div className="flex items-start gap-2 rounded-none border border-red-100 bg-red-50 inset-field text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className={fieldLabel}>{f.error}</p>
                </div>
              ) : null}

              {f.isLoading ? (
                <div className="flex items-center justify-center px-3 py-8 text-text-faint">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : f.favorites.length === 0 ? (
                <div className="rounded-none border border-dashed border-border-soft px-3 py-6 text-center">
                  <p className={`${sectionLabel} text-text-faint`}>{emptyLabel}</p>
                </div>
              ) : (
                <div className={inlineRows ? 'divide-y divide-border-hairline border-t border-border-hairline' : 'space-y-1'}>
                  {f.favorites.map((favorite) => {
                    const isAdded = isFavoriteAdded?.(favorite) ?? false;
                    const issue = (favorite.issueTemplate || '').trim();
                    const price = favorite.defaultPrice ? `$${favorite.defaultPrice}` : null;

                    const start = () => {
                      onUseFavorite(favorite);
                      onAddFavorite?.(favorite);
                    };

                    const rowBody = (
                      <>
                        <p
                          className={cn(
                            'min-w-0 truncate tracking-tight text-text-default',
                            inlineRows ? 'text-role-caption font-medium' : 'text-sm font-medium',
                          )}
                        >
                          {favorite.label}
                        </p>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          {price ? (
                            <span className="shrink-0 text-role-micro tabular-nums text-text-muted">
                              {price}
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate text-role-micro text-text-faint">
                            {favorite.sku || 'No SKU'}
                          </span>
                        </div>
                        {issue ? (
                          <p className="mt-0.5 line-clamp-1 text-role-micro leading-snug text-text-soft">
                            {issue}
                          </p>
                        ) : null}
                        {!inlineRows && favorite.productTitle ? (
                          <p className="mt-0.5 text-role-micro text-text-faint">{favorite.productTitle}</p>
                        ) : null}
                      </>
                    );

                    return (
                      <div key={`${favorite.workspaceKey}-${favorite.id}`}>
                        <div
                          className={cn(
                            'flex items-start gap-2',
                            inlineRows ? 'py-2' : 'rounded-none px-2.5 py-2 hover:bg-surface-hover/60',
                          )}
                        >
                          {f.isManageMode && !readOnly ? (
                            <div className="min-w-0 flex-1">{rowBody}</div>
                          ) : (
                            // ds-raw-button: full-row text-left start hit target — not a Button shape
                            <button
                              type="button"
                              onClick={start}
                              className={cn(
                                'min-w-0 flex-1 text-left',
                                focusRing('control', 'neutral'),
                                'rounded-md',
                              )}
                              aria-label={`${useLabel}: ${favorite.label}`}
                            >
                              {rowBody}
                            </button>
                          )}

                          <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                            {f.isManageMode && !readOnly ? (
                              <>
                                <HoverTooltip label="Edit favorite" asChild>
                                  <IconButton
                                    onClick={() => {
                                      if (f.editingFavoriteId === favorite.id && f.showForm) f.resetDraft();
                                      else f.openEditForm(favorite);
                                    }}
                                    className={cn(
                                      chromeBtn,
                                      chromeSize,
                                      f.editingFavoriteId === favorite.id &&
                                        f.showForm &&
                                        'border-border-default bg-surface-sunken text-text-muted',
                                    )}
                                    ariaLabel={`Edit ${favorite.label}`}
                                    icon={<Pencil className={chromeIcon} />}
                                  />
                                </HoverTooltip>
                                <HoverTooltip label="Delete favorite" asChild>
                                  <IconButton
                                    onClick={() => void f.handleDelete(favorite.id)}
                                    className={cn(
                                      chromeBtn,
                                      chromeSize,
                                      'hover:border-red-200 hover:bg-red-50 hover:text-red-700',
                                    )}
                                    ariaLabel={`Delete ${favorite.label}`}
                                    icon={<Trash2 className={cn(chromeIcon, 'text-text-soft')} />}
                                  />
                                </HoverTooltip>
                              </>
                            ) : (
                              <HoverTooltip label={useLabel} asChild>
                                <IconButton
                                  onClick={start}
                                  className={cn(
                                    chromeBtn,
                                    chromeSize,
                                    isAdded && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                                  )}
                                  ariaLabel={useLabel}
                                  icon={
                                    isAdded ? (
                                      <Check className={chromeIcon} />
                                    ) : (
                                      <Plus className={chromeIcon} />
                                    )
                                  }
                                />
                              </HoverTooltip>
                            )}
                          </div>
                        </div>

                        {!readOnly && f.showForm && f.editingFavoriteId === favorite.id ? (
                          <FavoriteForm f={f} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
