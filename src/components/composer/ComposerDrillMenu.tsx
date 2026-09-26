'use client';

/**
 * `+` → “Add to message” — a Telegram-mobile drill menu.
 * for a question nobody asked (operator ruling 2026-08-30). A pushed submenu
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  ComposerPlusMenuPanel,
  ComposerPlusMenuRow,
  ComposerPlusTrigger,
} from './ComposerPlusMenu';

export type ComposerDrillNode =
  | {
      type: 'action';
      id: string;
      label: string;
      icon?: ReactNode;
      iconTone?: string;
      disabled?: boolean;
      onSelect: () => void;
    }
  | {
      type: 'submenu';
      id: string;
      label: string;
      icon?: ReactNode;
      iconTone?: string;
      disabled?: boolean;
      children: ComposerDrillNode[];
    };

type DrillPage = { title: string; nodes: ComposerDrillNode[] };

function DrillHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1 border-b border-border-hairline px-1.5 py-1">
      <button
        type="button"
        aria-label="Back"
        data-testid="composer-drill-back"
        onClick={onBack}
        className={cn(
          'ds-raw-button inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm',
          'text-text-faint hover:bg-surface-sunken hover:text-text-muted',
          focusRing('control', 'accent'),
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-role-micro font-semibold uppercase tracking-widest text-text-faint">
        {title}
      </span>
    </div>
  );
}

/** Trigger + panel + stack. */
export function ComposerDrillMenu({
  nodes,
  open,
  onOpenChange,
  triggerAriaLabel = 'Add to message',
  triggerDisabled,
  emptyLabel = 'Nothing to add yet',
}: {
  nodes: ComposerDrillNode[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  triggerAriaLabel?: string;
  triggerDisabled?: boolean;
  emptyLabel?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [path, setPath] = useState<string[]>([]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Reset to the root whenever the panel closes — including a close driven by
  // Escape / outside click inside the Popover, which never calls our handlers.
  useEffect(() => {
    if (!open) setPath([]);
  }, [open]);

  // Walk the declared path; a stale id (the tree rebuilt under us when a fact
  // was attached) drops back to the deepest page that still exists.
  const pages: DrillPage[] = [{ title: '', nodes }];
  for (const id of path) {
    const parent = pages[pages.length - 1]!;
    const next = parent.nodes.find((n) => n.id === id && n.type === 'submenu');
    if (!next || next.type !== 'submenu') break;
    pages.push({ title: next.label, nodes: next.children });
  }
  const page = pages[pages.length - 1]!;
  const depth = pages.length - 1;

  return (
    <div className="relative h-8 w-8 shrink-0">
      <ComposerPlusTrigger
        ref={triggerRef}
        open={open}
        disabled={triggerDisabled}
        ariaLabel={triggerAriaLabel}
        tooltip={triggerAriaLabel}
        onClick={() => onOpenChange(!open)}
      />
      <ComposerPlusMenuPanel
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        data-testid="composer-drill-menu"
        ariaLabel={triggerAriaLabel}
      >
        {depth > 0 ? (
          <DrillHeader
            title={page.title}
            onBack={() => setPath((p) => p.slice(0, -1))}
          />
        ) : null}
        {page.nodes.length === 0 ? (
          <ComposerPlusMenuRow disabled onClick={() => {}}>
            {emptyLabel}
          </ComposerPlusMenuRow>
        ) : (
          page.nodes.map((node) =>
            node.type === 'submenu' ? (
              <ComposerPlusMenuRow
                key={node.id}
                icon={node.icon}
                iconTone={node.iconTone}
                disabled={node.disabled}
                onClick={() => setPath((p) => [...p, node.id])}
              >
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">{node.label}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
                </span>
              </ComposerPlusMenuRow>
            ) : (
              <ComposerPlusMenuRow
                key={node.id}
                icon={node.icon}
                iconTone={node.iconTone}
                disabled={node.disabled}
                onClick={() => {
                  node.onSelect();
                  close();
                }}
              >
                {node.label}
              </ComposerPlusMenuRow>
            ),
          )
        )}
      </ComposerPlusMenuPanel>
    </div>
  );
}
