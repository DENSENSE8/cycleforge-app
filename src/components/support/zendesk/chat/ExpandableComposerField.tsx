'use client';

import {
  useState,
  type ChangeEvent,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import { Maximize2, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton } from '@/design-system/primitives';
import {
  NOTE_COMPOSER_OVERLAY_PAD_BOTTOM_ACTIONS,
  NOTE_OVERLAY_ICON,
  NOTE_OVERLAY_ICON_BTN,
} from '@/components/receiving/workspace/note-composer-helpers';
import { cn } from '@/utils/_cn';

export interface ExpandableComposerFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** Extra classes on the inline textarea (focus rings live on the wrapper). */
  textareaClassName?: string;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  inputRef?: Ref<HTMLTextAreaElement>;
  disabled?: boolean;
  /** Overlay title — e.g. "Compose reply". */
  expandTitle?: string;
  /**
   * Footer for the expanded overlay. When omitted, the overlay is edit-only
   * (⌘↵ still fires `onKeyDown` if the parent wires submit).
   */
  expandFooter?: ReactNode;
}

/**
 * Compact message textarea with a bottom-right expand control that opens a
 * taller {@link RightPaneOverlay} editor sharing the same value / keyboard
 * handlers — used by support chat and claim ticket reply composers.
 */
export function ExpandableComposerField({
  value,
  onChange,
  placeholder,
  rows = 3,
  textareaClassName,
  className,
  onKeyDown,
  inputRef,
  disabled,
  expandTitle = 'Compose message',
  expandFooter,
}: ExpandableComposerFieldProps) {
  const [expanded, setExpanded] = useState(false);

  const sharedProps = {
    value,
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
    onKeyDown,
    placeholder,
    disabled,
  };

  return (
    <>
      <div className={cn('group relative', className)}>
        <textarea
          ref={inputRef}
          {...sharedProps}
          rows={rows}
          className={cn(
            'block w-full resize-none bg-transparent text-text-default outline-none placeholder:text-text-faint',
            NOTE_COMPOSER_OVERLAY_PAD_BOTTOM_ACTIONS,
            textareaClassName,
          )}
        />
        <div className="pointer-events-none absolute bottom-2 right-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <div className="pointer-events-auto">
            <HoverTooltip label="Expand composer" asChild>
              {/* ds-raw-button */}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                disabled={disabled}
                aria-label="Expand composer"
                className={cn(
                  NOTE_OVERLAY_ICON_BTN,
                  'bg-surface-card/90 text-text-faint shadow-sm ring-1 ring-border-soft/60 transition hover:bg-surface-sunken hover:text-text-muted disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                <Maximize2 className={NOTE_OVERLAY_ICON} />
              </button>
            </HoverTooltip>
          </div>
        </div>
      </div>

      <RightPaneOverlay
        open={expanded}
        onClose={() => setExpanded(false)}
        align="center"
        resizable
        storageKey="expandable-composer-size"
        minWidth={420}
        minHeight={360}
        className="flex h-[min(72vh,36rem)] w-[min(92vw,40rem)] flex-col"
        aria-label={expandTitle}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-hairline px-4 py-3">
          <h2 className="text-sm font-bold text-text-default">{expandTitle}</h2>
          <IconButton
            type="button"
            onClick={() => setExpanded(false)}
            ariaLabel="Collapse composer"
            className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-surface-sunken hover:text-text-muted"
            icon={<X className="h-4 w-4" />}
          />
        </div>
        <div className="min-h-0 flex-1 p-4">
          <textarea
            {...sharedProps}
            autoFocus
            rows={12}
            className={cn(
              'block h-full min-h-[14rem] w-full resize-none rounded-xl border border-border-soft bg-surface-card px-3.5 py-2.5 text-role-caption leading-relaxed text-text-default outline-none placeholder:text-text-faint focus:border-border-emphasis focus:ring-2 focus:ring-text-soft/20',
            )}
          />
        </div>
        {expandFooter ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-hairline px-4 py-3">
            {expandFooter}
          </div>
        ) : (
          <div className="flex shrink-0 justify-end border-t border-border-hairline px-4 py-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(false)}>
              Done
            </Button>
          </div>
        )}
      </RightPaneOverlay>
    </>
  );
}
