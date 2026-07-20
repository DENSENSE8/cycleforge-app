'use client';

import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronLeft, Copy, History, Info, Link2, MoreVertical, RefreshCw, ArrowLeftRight } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  PaneHeaderActionBar,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_CLUSTER,
  HEADER_ICON_GLYPH,
  HEADER_ICON_WRAP,
} from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';
import { dispatchReceivingDetailsOverlay } from '@/utils/events';
import {
  workspaceMode,
  type HeaderActionKey,
  type WorkspaceMode,
} from './mode-registry';

/** Unbox: refresh stays inline; share + the rest live in the overflow menu.
 *  Ticket (photoNote) is on the carton photo dropdown, not More. */
const UNBOX_INLINE_ACTIONS: ReadonlyArray<Exclude<HeaderActionKey, 'details'>> = [
  'refresh',
];
const UNBOX_OVERFLOW_ACTIONS: ReadonlyArray<Exclude<HeaderActionKey, 'details'>> = [
  'share',
  'audit',
  'copy',
  'movePhotos',
];

/**
 * Frozen utility toolbar — icon-only actions driven by the mode registry
 * (`WORKSPACE_MODES[mode].headerActions`). Unbox mounts this inside
 * {@link ReceivingStationMoreDetails} (corner slot of
 * {@link ReceivingStationContextBar}, `embedded`) using GlobalHeader icon
 * hit-box / gap SoT. Testing/other modes keep the standalone header band.
 * Unbox: refresh · ⋯ · info (no prev/next). Testing keeps prev/next via
 * navChannel.
 */
export function LineEditToolbar({
  mode = 'unbox',
  receivingId,
  zohoSyncing = false,
  copyingAll,
  pairing = false,
  handlers,
  onBackToBrowse,
  embedded = false,
}: {
  /** Drives which header actions + nav channel render. Defaults to unbox. */
  mode?: WorkspaceMode;
  receivingId: number | null;
  zohoSyncing?: boolean;
  /** saving || platformSaving — surfaces the "Saving" status pill. */
  busy: boolean;
  copyingAll: boolean;
  /** SKU-pairing modal opening — disables the pair button (testing). */
  pairing?: boolean;
  /** Handler per action key; only the keys this mode lists are read. */
  handlers: Partial<Record<HeaderActionKey, () => void>>;
  /** Testing: return to the tested-lines browse (history empty state). */
  onBackToBrowse?: () => void;
  /**
   * Station context bar: flat icon cluster matching GlobalHeader rail.
   * Default false keeps the legacy standalone toolbar band.
   */
  embedded?: boolean;
}) {
  const def = workspaceMode(mode);
  const disabled = receivingId == null;
  const [overflowOpen, setOverflowOpen] = useState(false);
  const glyph = embedded ? HEADER_ICON_GLYPH : 'h-3.5 w-3.5';

  const META: Record<
    Exclude<HeaderActionKey, 'details'>,
    { label: string; icon: ReactNode; disabled?: boolean; title: string; ariaLabel: string }
  > = {
    refresh: {
      label: 'Refresh',
      icon: <RefreshCw className={cn(glyph, zohoSyncing && 'animate-spin')} />,
      disabled: zohoSyncing,
      title: 'Sync purchase order by tracking number',
      ariaLabel: 'Refresh line from inventory',
    },
    share: {
      label: 'Share',
      icon: <Link2 className={glyph} />,
      disabled,
      title: 'Copy link to open this package on Receiving',
      ariaLabel: 'Share receiving link',
    },
    audit: {
      label: 'Audit',
      icon: <History className={glyph} />,
      disabled,
      title: 'Audit log (inventory events)',
      ariaLabel: 'View audit log',
    },
    copy: {
      label: 'Copy',
      icon: <Copy className={cn(glyph, copyingAll && 'animate-pulse')} />,
      disabled: disabled || copyingAll,
      title: 'Copy package + PO details to clipboard',
      ariaLabel: 'Copy all receiving details',
    },
    movePhotos: {
      label: 'Photos',
      icon: <ArrowLeftRight className={glyph} />,
      disabled,
      title: 'Move photos between this carton and another PO',
      ariaLabel: 'Move photos between purchase orders',
    },
    pair: {
      label: 'Pair',
      icon: <Link2 className={glyph} />,
      disabled: disabled || pairing,
      title: 'Pair this SKU across platforms',
      ariaLabel: 'Open SKU pairing',
    },
  };

  const toAction = (key: Exclude<HeaderActionKey, 'details'>): PaneHeaderActionBarAction => {
    const m = META[key];
    const onClick = handlers[key];
    return {
      key,
      label: m.label,
      icon: m.icon,
      onClick: onClick ?? (() => {}),
      disabled: m.disabled || !onClick,
      title: m.title,
      ariaLabel: m.ariaLabel,
    };
  };

  const isUnbox = mode === 'unbox';
  const enabledKeys = def.headerActions.filter(
    (key): key is Exclude<HeaderActionKey, 'details'> => key !== 'details',
  );

  const inlineKeys = isUnbox
    ? enabledKeys.filter((k) => UNBOX_INLINE_ACTIONS.includes(k))
    : enabledKeys;
  const overflowKeys = isUnbox
    ? enabledKeys.filter((k) => UNBOX_OVERFLOW_ACTIONS.includes(k))
    : [];

  const inlineActions = inlineKeys.map(toAction);

  const overflowMenu = (align: 'start' | 'end' = 'start') =>
    overflowKeys.length > 0 ? (
      <Popover.Root open={overflowOpen} onOpenChange={setOverflowOpen}>
        <HoverTooltip label="More actions">
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className={cn(
                embedded
                  ? cn(HEADER_ICON_BTN_CLASS, 'inline-flex h-8 w-8 items-center justify-center')
                  : 'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-soft transition-colors hover:bg-surface-hover hover:text-text-default',
              )}
            >
              <MoreVertical className={glyph} />
            </button>
          </Popover.Trigger>
        </HoverTooltip>
        <Popover.Portal>
          <Popover.Content
            align={align}
            sideOffset={4}
            className="z-50 min-w-[10rem] rounded-lg border border-border-soft bg-surface-card p-1 shadow-lg"
          >
            {overflowKeys.map((key) => {
              const m = META[key];
              const onClick = handlers[key];
              const itemDisabled = m.disabled || !onClick;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={itemDisabled}
                  onClick={() => {
                    onClick?.();
                    setOverflowOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-role-micro font-bold uppercase tracking-widest text-text-soft transition-colors hover:bg-surface-hover hover:text-text-default disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {m.icon}
                  {m.label}
                </button>
              );
            })}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    ) : null;

  if (embedded) {
    const embeddedOverflow = overflowMenu('end');
    return (
      <div className={HEADER_ICON_CLUSTER}>
        {inlineActions.map((action) => (
          <div key={action.key} className={HEADER_ICON_WRAP}>
            <HoverTooltip
              label={
                (typeof action.title === 'string' ? action.title : null) ??
                (typeof action.label === 'string' ? action.label : action.key)
              }
              asChild
            >
              <IconButton
                size="md"
                onClick={action.onClick}
                disabled={action.disabled}
                ariaLabel={action.ariaLabel ?? String(action.label)}
                className={HEADER_ICON_BTN_CLASS}
                icon={action.icon}
              />
            </HoverTooltip>
          </div>
        ))}
        {embeddedOverflow ? <div className={HEADER_ICON_WRAP}>{embeddedOverflow}</div> : null}
        {def.showDetails && receivingId != null ? (
          <div className={HEADER_ICON_WRAP}>
            <HoverTooltip label="Receiving details" asChild>
              <IconButton
                size="md"
                onClick={() => dispatchReceivingDetailsOverlay(receivingId)}
                ariaLabel="Open receiving details"
                className={HEADER_ICON_BTN_CLASS}
                icon={<Info className={HEADER_ICON_GLYPH} />}
              />
            </HoverTooltip>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <PaneHeaderActionBar
      variant="header"
      iconOnly
      leftSlot={
        onBackToBrowse ? (
          <HoverTooltip label="All tested lines" asChild>
            <button
              type="button"
              onClick={onBackToBrowse}
              aria-label="Back to all tested lines"
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-role-micro font-bold uppercase tracking-widest text-text-soft transition-colors hover:bg-surface-hover hover:text-text-default"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">All lines</span>
            </button>
          </HoverTooltip>
        ) : null
      }
      rightSlot={
        <>
          {overflowMenu()}
          {def.showDetails && receivingId != null ? (
            <HoverTooltip label="Receiving details" asChild>
              <IconButton
                onClick={() => dispatchReceivingDetailsOverlay(receivingId)}
                ariaLabel="Open receiving details"
                icon={<Info className="h-4 w-4 text-text-soft hover:text-text-default" />}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-hover"
              />
            </HoverTooltip>
          ) : null}
        </>
      }
      actions={inlineActions}
      status={zohoSyncing ? 'Syncing' : undefined}
      onPrev={
        isUnbox
          ? undefined
          : () => window.dispatchEvent(new CustomEvent(def.navChannel, { detail: 'prev' }))
      }
      onNext={
        isUnbox
          ? undefined
          : () => window.dispatchEvent(new CustomEvent(def.navChannel, { detail: 'next' }))
      }
      prevTitle="Previous PO (↑)"
      nextTitle="Next PO (↓)"
      navClassName="hidden sm:inline-flex"
    />
  );
}
