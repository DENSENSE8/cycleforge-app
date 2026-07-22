'use client';

/**
 * Compact media-type dropdown for Media Library workbench chrome.
 * Same selection contract as the former sidebar {@link PhotoStationFolders}.
 */

import { useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Folder,
  Image as ImageIcon,
  Loader2,
  Package,
  PackageOpen,
  Plus,
  ShoppingCart,
  Tag,
  TicketHelp,
  Truck,
  Wrench,
} from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { Popover } from '@/design-system';
import { IconButton } from '@/design-system/primitives';
import { useImageTypes } from '@/hooks/useImageTypes';
import {
  PHOTO_SOURCE_SCOPE_LABELS,
  type OutboundDocumentTypeFilter,
  type OutboundMediaFilter,
  type PhotoLibrarySourceScope,
} from '@/lib/photos/library-filter-state';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { OutboundDocumentTypeFilters } from './OutboundDocumentTypeFilters';

type IconCmp = typeof Package;

const ICONS: Record<string, IconCmp> = {
  PackageOpen,
  ShoppingCart,
  Package,
  Wrench,
  TicketHelp,
  Tag,
  Folder,
  Image: ImageIcon,
  Truck,
};

const BUILTIN_ICON_OVERRIDE: Partial<Record<string, IconCmp>> = {
  claims: TicketHelp,
  Truck,
  FileText: ImageIcon,
};

export function PhotoMediaTypeMenu({
  activeScope,
  activeImageType,
  activeDocumentType = 'all',
  activeOutboundMedia = 'documents',
  inferredScope = null,
  onSelect,
  onDocumentTypeSelect,
  onPackPhotosSelect,
}: {
  activeScope: PhotoLibrarySourceScope;
  activeImageType: string | null;
  activeDocumentType?: OutboundDocumentTypeFilter;
  activeOutboundMedia?: OutboundMediaFilter;
  inferredScope?: PhotoLibrarySourceScope | null;
  onSelect: (sel: { scope?: PhotoLibrarySourceScope; imageType?: string }) => void;
  onDocumentTypeSelect?: (documentType: OutboundDocumentTypeFilter) => void;
  onPackPhotosSelect?: () => void;
}) {
  const { builtIn, custom, isLoading, createType } = useImageTypes();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const highlightScope: PhotoLibrarySourceScope | null = activeImageType
    ? null
    : activeScope !== 'all'
      ? activeScope
      : inferredScope;

  const activeLabel = activeImageType
    ? (custom.find((t) => t.key === activeImageType)?.label ?? activeImageType)
    : activeScope !== 'all'
      ? PHOTO_SOURCE_SCOPE_LABELS[activeScope]
      : 'All types';

  const ActiveIcon = (() => {
    if (activeImageType) {
      const customType = custom.find((t) => t.key === activeImageType);
      return (customType?.icon && ICONS[customType.icon]) || Folder;
    }
    if (activeScope !== 'all') {
      const built = builtIn.find((t) => t.key === activeScope);
      return BUILTIN_ICON_OVERRIDE[activeScope] ?? (built ? ICONS[built.icon] : Folder) ?? Folder;
    }
    return ImageIcon;
  })();

  const addType = async () => {
    const label = window.prompt('New media type name')?.trim();
    if (!label) return;
    setAdding(true);
    try {
      const created = await createType.mutateAsync({ label });
      onSelect({ imageType: created.key });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create media type');
    } finally {
      setAdding(false);
    }
  };

  const pick = (sel: { scope?: PhotoLibrarySourceScope; imageType?: string }) => {
    onSelect(sel);
    if (sel.scope !== 'outbound') setOpen(false);
  };

  return (
    <>
      <ToolbarButton
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Media type: ${activeLabel}`}
        active={open || activeScope !== 'all' || !!activeImageType}
        onClick={() => setOpen((o) => !o)}
        className="max-w-[10rem] gap-1 normal-case tracking-normal"
      >
        <ActiveIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{activeLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </ToolbarButton>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom-end"
        gap={6}
        role="menu"
        aria-label="Media type"
        className="w-56 p-1"
        padded={false}
      >
        <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1.5">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">Media type</p>
          <HoverTooltip label="Add media type" asChild>
            <IconButton
              icon={adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              ariaLabel="Add media type"
              onClick={() => void addType()}
              disabled={adding}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-sunken disabled:opacity-40"
            />
          </HoverTooltip>
        </div>

        <button
          type="button"
          role="menuitemradio"
          aria-checked={activeScope === 'all' && !activeImageType}
          onClick={() => pick({ scope: 'all' })}
          className={cn(
            'ds-raw-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-role-caption font-semibold transition-colors',
            activeScope === 'all' && !activeImageType
              ? 'bg-surface-accent text-text-accent'
              : 'text-text-muted hover:bg-surface-hover',
          )}
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">All types</span>
          {activeScope === 'all' && !activeImageType ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
        </button>

        {builtIn.map((type) => {
          const active = highlightScope === type.key;
          const Icon = BUILTIN_ICON_OVERRIDE[type.key] ?? ICONS[type.icon] ?? Folder;
          return (
            <button
              key={type.key}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => pick({ scope: type.key })}
              className={cn(
                'ds-raw-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-role-caption font-semibold transition-colors',
                active ? 'bg-surface-accent text-text-accent' : 'text-text-muted hover:bg-surface-hover',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{type.label}</span>
              {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          );
        })}

        {custom.map((type) => {
          const active = activeImageType === type.key;
          const Icon = (type.icon && ICONS[type.icon]) || Folder;
          return (
            <button
              key={type.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => pick({ imageType: type.key })}
              className={cn(
                'ds-raw-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-role-caption font-semibold transition-colors',
                active ? 'bg-surface-accent text-text-accent' : 'text-text-muted hover:bg-surface-hover',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{type.label}</span>
              {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          );
        })}

        {isLoading && custom.length === 0 ? (
          <p className="flex items-center gap-2 px-2 py-1.5 text-role-caption text-text-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : null}

        {activeScope === 'outbound' && onDocumentTypeSelect && onPackPhotosSelect ? (
          <div className="mt-1 border-t border-border-hairline px-1 pt-1">
            <OutboundDocumentTypeFilters
              documentType={activeDocumentType}
              outboundMedia={activeOutboundMedia}
              onSelectDocumentType={onDocumentTypeSelect}
              onSelectPackPhotos={onPackPhotosSelect}
            />
          </div>
        ) : null}
      </Popover>
    </>
  );
}
