'use client';

import { Check, Loader2, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

interface ShippedNotesComposerProps {
  value: string;
  onChange?: (value: string) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
  onClick?: () => void;
  isSaving?: boolean;
  readOnly?: boolean;
}

export function ShippedNotesComposer({
  value,
  onChange,
  onCancel,
  onSubmit,
  onClick,
  isSaving = false,
  readOnly = false,
}: ShippedNotesComposerProps) {
  return (
    <section className="mx-8 pt-2">
      <div className={cn('relative border border-border-soft bg-surface-card', cornerClass('flush'))}>
        <span className="pointer-events-none absolute left-4 top-2 z-10 text-role-micro font-semibold text-text-faint">
          Notes
        </span>
        {readOnly ? (
          <HoverTooltip label="Click to edit" asChild>
            <button
              type="button"
              onClick={onClick}
              className={cn(
                'ds-raw-button block w-full px-4 pb-3 pt-7 text-left transition hover:bg-surface-hover',
                cornerClass('flush'),
              )}
              aria-label="Edit note"
            >
              <div className="whitespace-pre-wrap text-sm font-medium leading-6 text-text-muted">
                {value}
              </div>
            </button>
          </HoverTooltip>
        ) : (
          <>
            <textarea
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!isSaving) onSubmit?.();
                }
              }}
              rows={4}
              placeholder="Add a note for this order"
              className={"min-h-[108px] w-full resize-none border-0 bg-transparent px-4 pb-3 pt-7 text-sm font-medium leading-6 text-text-default outline-none placeholder:text-text-faint focus:ring-0" /* ds-allow-focus: identity/one-off hue or ring-0 */}
              autoFocus
            />
            <div className="flex items-center justify-between border-t border-border-hairline px-3 py-2">
              <HoverTooltip label="Cancel" asChild>
                <IconButton
                  onClick={onCancel}
                  disabled={isSaving}
                  ariaLabel="Cancel note"
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center text-text-faint hover:bg-surface-danger hover:text-text-danger',
                    cornerClass('flush'),
                  )}
                  icon={<X className="h-4 w-4" />}
                />
              </HoverTooltip>
              <HoverTooltip label={isSaving ? 'Saving' : 'Save'} asChild>
                <IconButton
                  onClick={onSubmit}
                  disabled={isSaving}
                  ariaLabel={isSaving ? 'Saving note' : 'Save note'}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center bg-surface-inverse text-white hover:bg-surface-inverse-hover',
                    cornerClass('flush'),
                  )}
                  icon={isSaving ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Check className="h-4 w-4 text-white" />}
                />
              </HoverTooltip>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
