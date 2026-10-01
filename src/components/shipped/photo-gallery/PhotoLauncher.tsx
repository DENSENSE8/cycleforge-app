import {
  ArrowLeftRight,
  ChevronRight,
  Image as ImageIcon,
  AlertCircle,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Ticket,
  Upload,
} from '../../Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  CopyChipHoverMenuPanel,
  type CopyChipHoverMenuItem,
} from '@/components/ui/CopyChipHoverMenu';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import type { PhotoGalleryController } from './usePhotoGallery';

function photoActionItems(g: PhotoGalleryController): CopyChipHoverMenuItem[] {
  const hasPhotos = g.photoItems.length > 0;
  const canDownload =
    !g.downloading && hasPhotos && !g.photoItems.every((photo) => photo.status === 'error');
  const items: CopyChipHoverMenuItem[] = [
    {
      id: 'view',
      label: String(g.photoItems.length),
      tone: 'accent',
      icon: <ImageIcon />,
      disabled: !hasPhotos,
      onSelect: () => g.openViewer(0),
    },
  ];

  if (g.libraryHref) {
    const href = g.libraryHref;
    items.push({
      id: 'media',
      label: 'Media',
      tone: 'accent',
      icon: <ExternalLink />,
      onSelect: () => window.open(href, '_blank', 'noopener,noreferrer'),
    });
  }
  if (g.canUpload) {
    items.push({
      id: 'upload',
      label: g.uploading ? 'Uploading…' : 'Upload',
      icon: g.uploading ? <Loader2 className="animate-spin" /> : <Upload />,
      disabled: g.uploading,
      onSelect: g.openUploadOverlay,
    });
  }
  items.push({
    id: 'download',
    label: g.downloading ? 'Downloading…' : 'Download',
    icon: g.downloading ? <Loader2 className="animate-spin" /> : <Download />,
    disabled: !canDownload,
    onSelect: () => void g.handleDownloadAll(),
  });
  if (g.allowReassign) {
    items.push({
      id: 'move',
      label: 'Move',
      icon: <ArrowLeftRight />,
      disabled: !hasPhotos,
      onSelect: g.openMovePhotos,
    });
  }
  if (g.onSendToTicket) {
    items.push({
      id: 'ticket',
      label: 'Ticket',
      icon: <Ticket />,
      onSelect: g.onSendToTicket,
    });
  }
  items.push({
    id: 'details',
    label: 'Details',
    icon: <Info />,
    disabled: !hasPhotos,
    onSelect: () => g.openViewer(0, { details: true }),
  });
  return items;
}

function PhotoTile({
  g,
  index,
  className,
}: {
  g: PhotoGalleryController;
  index: number;
  className: string;
}) {
  const photo = g.photoItems[index];
  return (
    <HoverTooltip label={`View photo ${index + 1} fullscreen`} asChild>
      {/* ds-raw-button: image tile, not a Button shape. */}
      <button
        type="button"
        onClick={() => g.openViewer(index)}
        className={cn(
          'relative shrink-0 overflow-hidden border border-mode-edge bg-mode-well transition-colors hover:ring-2 hover:ring-mode-control',
          className,
        )}
        aria-label={`View photo ${index + 1} fullscreen`}
      >
        {photo.status === 'loaded' ? (
          <img
            src={photo.thumbUrl ?? photo.url}
            alt={`Photo ${index + 1}`}
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : undefined}
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : photo.status === 'error' ? (
          <span className="flex h-full w-full items-center justify-center bg-red-50">
            <AlertCircle className="size-4 text-red-400" />
          </span>
        ) : (
          <span className="block h-full w-full animate-pulse bg-blue-100" />
        )}
      </button>
    </HoverTooltip>
  );
}

/** The launcher surface — thumbnail strip, shared action toolbar, or default button. */
export function PhotoLauncher({ g }: { g: PhotoGalleryController }) {
  const { photoItems, className, loadedCount, errorCount } = g;

  if (g.launcherLayout === 'thumbnails') {
    return (
      <div className={cn('flex w-full flex-wrap items-center gap-1.5', className)}>
        {photoItems.map((_photo, index) => (
          <PhotoTile key={index} g={g} index={index} className="size-14" />
        ))}
      </div>
    );
  }

  if (g.launcherLayout === 'compact') {
    const visiblePhotos = photoItems.slice(0, 6);
    return (
      <section
        aria-label="Carton photos"
        data-selected="false"
        className={cn(
          'w-72 max-w-full overflow-hidden border border-border-soft bg-surface-sunken/40 shadow-none',
          cornerClass('card'),
          className,
        )}
        data-testid="photo-launcher-compact"
      >
        {visiblePhotos.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5 p-2">
            {visiblePhotos.map((_photo, index) => (
              <div key={index} className={cn('relative overflow-hidden', cornerClass('control'))}>
                <PhotoTile g={g} index={index} className={cn('aspect-square w-full', cornerClass('control'))} />
                {index === 5 && photoItems.length > 6 ? (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-role-caption font-semibold text-white">
                    +{photoItems.length - 6}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center gap-2 text-role-caption font-semibold text-text-soft">
            <ImageIcon className="size-4" aria-hidden />
            No photos yet
          </div>
        )}
        <CopyChipHoverMenuPanel
          items={photoActionItems(g)}
          menuLabel="Photo actions"
          denseLabel
          itemPad="chip"
          data-testid="photo-launcher-toolbar"
        />
      </section>
    );
  }

  if (g.launcherLayout === 'toolbar') {
    const hasPhotos = photoItems.length > 0;
    const items = photoActionItems(g);
    const panel = (
      <CopyChipHoverMenuPanel
        items={items}
        menuLabel="Photo actions"
        denseLabel
        itemPad="chip"
        className={className}
        data-testid="photo-launcher-toolbar"
      />
    );
    if (!g.toolbarShowLabel) return panel;

    return (
      <div className={cn('flex w-fit max-w-full flex-col items-stretch gap-0', className)}>
        <HoverTooltip label={hasPhotos ? 'View photos fullscreen' : 'No photos yet'} asChild>
          {/* ds-raw-button: composite text-left launcher, not a Button shape. */}
          <button
            type="button"
            onClick={() => hasPhotos && g.openViewer(0)}
            disabled={!hasPhotos}
            className="flex min-w-0 shrink-0 items-center gap-1 rounded-lg py-0.5 pl-1 pr-1.5 text-left transition-all hover:bg-blue-100/50 active:scale-[0.995] disabled:pointer-events-none disabled:opacity-40"
            aria-label={hasPhotos ? 'View photos fullscreen' : 'No photos yet'}
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-role-micro text-blue-600">
                {photoItems.length} {photoItems.length === 1 ? 'photo' : 'photos'}
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-role-micro font-semibold">
                {loadedCount < photoItems.length && errorCount === 0 ? (
                  <span className="text-amber-600">Loading…</span>
                ) : null}
                {errorCount > 0 ? <span className="text-red-600">{errorCount} failed</span> : null}
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-blue-600" aria-hidden />
          </button>
        </HoverTooltip>
        <CopyChipHoverMenuPanel
          items={items}
          menuLabel="Photo actions"
          denseLabel
          itemPad="chip"
          data-testid="photo-launcher-toolbar"
        />
      </div>
    );
  }

  return (
    /* ds-raw-button: full-width composite launcher card, not a Button shape. */
    <button
      type="button"
      onClick={() => g.openViewer(0)}
      className={cn(
        'group w-full rounded-xl px-4 py-3 transition-all active:scale-[0.98]',
        g.launcherTone === 'neutral'
          ? 'border border-border-soft bg-surface-card hover:border-border-default hover:bg-surface-hover'
          : 'border border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100/50 hover:border-blue-300 hover:from-blue-100 hover:to-blue-100',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500 shadow-sm">
            <ImageIcon className="size-5 text-white" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-text-default">{g.launcherTitle}</span>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-role-micro text-blue-600">
                {photoItems.length} {photoItems.length === 1 ? 'Photo' : 'Photos'}
              </span>
              {loadedCount < photoItems.length && errorCount === 0 ? (
                <span className="text-role-micro font-semibold text-amber-600">• Loading…</span>
              ) : null}
              {errorCount > 0 ? (
                <span className="text-role-micro font-semibold text-red-600">• {errorCount} Failed</span>
              ) : null}
            </div>
          </div>
        </div>
        <ChevronRight
          className={cn(
            'size-5 transition-transform group-hover:translate-x-1',
            g.launcherTone === 'neutral' ? 'text-text-soft' : 'text-blue-600',
          )}
        />
      </div>
    </button>
  );
}
