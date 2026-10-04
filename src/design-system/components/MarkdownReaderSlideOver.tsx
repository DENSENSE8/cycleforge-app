'use client';

/**
 * Read-only markdown reader — a document slide-over for prose (a task Brief
 * today, the day Briefing next). Separate from any editor: `onEdit` hands the
 * caller back its own edit path. Width is remembered; the ⤢ latch lifts the
 * reader off the right pane to the whole viewport. Esc closes only the reader
 * (RightPaneOverlay claims the overlay stack).
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, Pencil, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

const HEADER_ICON = 'rounded-md p-1.5 text-text-muted hover:bg-surface-strong hover:text-text-default';

export function MarkdownReaderSlideOver({
  open,
  onClose,
  title,
  meta,
  content,
  onEdit,
  live,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  meta?: ReactNode;
  content: string;
  onEdit?: () => void;
  /** A task Brief / document: live reference chips and ```tasks``` blocks (MarkdownRenderer `live`). */
  live?: 'desk' | 'phone';
}) {
  const titleId = useId();
  const [fullscreen, setFullscreen] = useState(false);
  // Every open starts at the remembered width, not wherever the last read ended.
  useEffect(() => {
    if (!open) setFullscreen(false);
  }, [open]);

  const latchLabel = fullscreen ? 'Exit full screen' : 'Read full screen';

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="right"
      anchor={fullscreen ? 'viewport' : 'pane'}
      width={720}
      minWidth={420}
      // Full screen is its own width; the drag handle (and its persisted
      // width) comes back untouched when the latch is released.
      resizable={!fullscreen}
      storageKey="markdown-reader-width"
      aria-labelledby={titleId}
      className={cn('min-w-0', fullscreen && '!w-full border-l-0')}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border-hairline bg-surface-canvas px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-role-data font-semibold text-text-default">
            {title}
          </h2>
          {meta ? <div className="mt-0.5 truncate text-role-caption text-text-muted">{meta}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onEdit ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={onEdit}
              data-testid="markdown-reader-edit"
            >
              Edit
            </Button>
          ) : null}
          <HoverTooltip label={latchLabel} asChild>
            <IconButton
              ariaLabel={latchLabel}
              aria-pressed={fullscreen}
              icon={fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              onClick={() => setFullscreen((value) => !value)}
              data-testid="markdown-reader-fullscreen"
              className={HEADER_ICON}
            />
          </HoverTooltip>
          <HoverTooltip label="Close reader" asChild>
            <IconButton
              ariaLabel="Close reader"
              icon={<X className="h-4 w-4" />}
              onClick={onClose}
              data-testid="markdown-reader-close"
              className={HEADER_ICON}
            />
          </HoverTooltip>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="markdown-reader-body">
        <article className="mx-auto w-full max-w-[70ch] px-6 py-5">
          {content.trim() ? (
            <MarkdownRenderer content={content} live={live} />
          ) : (
            <p className="text-role-caption text-text-muted">Nothing written yet.</p>
          )}
        </article>
      </div>
    </RightPaneOverlay>
  );
}
