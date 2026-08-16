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
import type { PhotoGalleryController } from './usePhotoGallery';

/** The launcher surface — thumbnail strip, slim toolbar, or the default button. */
export function PhotoLauncher({ g }: { g: PhotoGalleryController }) {
  const { photoItems, className, loadedCount, errorCount } = g;

  if (g.launcherLayout === 'thumbnails') {
    return (
      <div className={`flex w-full flex-wrap items-center gap-1.5 ${className}`}>
        {photoItems.map((photo, index) => (
          <HoverTooltip key={index} label={`View photo ${index + 1} fullscreen`} asChild>
            {/* ds-raw-button: image tile (renders photo / loading / error states) — not a Button shape */}
            <button
              type="button"
              onClick={() => g.openViewer(index)}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-blue-200 bg-blue-50 transition-all hover:ring-2 hover:ring-blue-300 active:scale-95"
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
                <div className="flex h-full w-full items-center justify-center bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                </div>
              ) : (
                <div className="h-full w-full animate-pulse bg-blue-100" />
              )}
            </button>
          </HoverTooltip>
        ))}
      </div>
    );
  }

  if (g.launcherLayout === 'toolbar') {
    const hasPhotos = photoItems.length > 0;
    const canDownload =
      !g.downloading && hasPhotos && !photoItems.every((p) => p.status === 'error');

    const items: CopyChipHoverMenuItem[] = [
      {
        id: 'view',
        label: 'View',
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
        onSelect: () => g.openUploadOverlay(),
      });
    }

    items.push({
      id: 'download',
      label: g.downloading ? 'Downloading…' : 'Download',
      icon: g.downloading ? <Loader2 className="animate-spin" /> : <Download />,
      disabled: !canDownload,
      onSelect: () => {
        void g.handleDownloadAll();
      },
    });

    if (g.allowReassign) {
      items.push({
        id: 'move',
        label: 'Move',
        icon: <ArrowLeftRight />,
        disabled: !hasPhotos,
        onSelect: () => g.openMovePhotos(),
      });
    }

    if (g.onSendToTicket) {
      items.push({
        id: 'ticket',
        label: 'Ticket',
        icon: <Ticket />,
        onSelect: () => g.onSendToTicket?.(),
      });
    }

    items.push({
      id: 'details',
      label: 'Details',
      icon: <Info />,
      disabled: !hasPhotos,
      onSelect: () => g.openViewer(0, { details: true }),
    });

    const panel = (
      <CopyChipHoverMenuPanel
        items={items}
        menuLabel="Photo actions"
        denseLabel
        className={className}
        data-testid="photo-launcher-toolbar"
      />
    );

    if (!g.toolbarShowLabel) return panel;

    return (
      <div className={cn('flex w-fit max-w-full flex-col items-stretch gap-0', className)}>
        <HoverTooltip label={hasPhotos ? 'View photos fullscreen' : 'No photos yet'} asChild>
          {/* ds-raw-button: composite text-left launcher (label + chevron) — not a Button shape */}
          <button
            type="button"
            onClick={() => {
              if (hasPhotos) g.openViewer(0);
            }}
            disabled={!hasPhotos}
            className="flex min-w-0 shrink-0 items-center gap-1 rounded-lg py-0.5 pl-1 pr-1.5 text-left transition-all hover:bg-blue-100/50 active:scale-[0.995] disabled:pointer-events-none disabled:opacity-40"
            aria-label={hasPhotos ? 'View photos fullscreen' : 'No photos yet'}
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-role-micro uppercase tracking-wider text-blue-600">
                {photoItems.length} {photoItems.length === 1 ? 'photo' : 'photos'}
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-role-micro font-semibold">
                {loadedCount < photoItems.length && errorCount === 0 ? (
                  <span className="text-amber-600">Loading…</span>
                ) : null}
                {errorCount > 0 ? <span className="text-red-600">{errorCount} failed</span> : null}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
          </button>
        </HoverTooltip>
        <CopyChipHoverMenuPanel
          items={items}
          menuLabel="Photo actions"
          denseLabel
          data-testid="photo-launcher-toolbar"
        />
      </div>
    );
  }

  return (
    /* ds-raw-button: full-width composite launcher card (icon tile + title + photo counts + chevron) — not a Button shape */
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 shadow-sm">
            <ImageIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-text-default">{g.launcherTitle}</span>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-role-micro uppercase tracking-wider text-blue-600">
                {photoItems.length} {photoItems.length === 1 ? 'Photo' : 'Photos'}
              </span>
              {loadedCount < photoItems.length && errorCount === 0 && (
                <span className="text-role-micro font-semibold text-amber-600">• Loading...</span>
              )}
              {errorCount > 0 && <span className="text-role-micro font-semibold text-red-600">• {errorCount} Failed</span>}
            </div>
          </div>
        </div>
        <ChevronRight
          className={cn(
            'h-5 w-5 transition-transform group-hover:translate-x-1',
            g.launcherTone === 'neutral' ? 'text-text-soft' : 'text-blue-600',
          )}
        />
      </div>
    </button>
  );
}
