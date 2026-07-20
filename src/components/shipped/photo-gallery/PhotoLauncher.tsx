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
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import type { PhotoGalleryController } from './usePhotoGallery';

/** The launcher surface — thumbnail strip, slim toolbar, or the default button. */
export function PhotoLauncher({ g }: { g: PhotoGalleryController }) {
  const { photoItems, compact, className, loadedCount, errorCount } = g;

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
                <img src={photo.url} alt={`Photo ${index + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
    const iconBtn = cn(
      compact ? 'p-1.5' : 'p-2',
      'text-blue-700 transition-all hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-40',
    );
    const sep = 'border-l border-blue-200/90';
    const canDownload =
      !g.downloading && photoItems.length > 0 && !photoItems.every((p) => p.status === 'error');

    return (
      <div
        className={cn(
          'flex w-fit max-w-full items-stretch gap-0 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100/50',
          compact ? 'min-h-9 py-0.5 pl-1 pr-0.5' : 'min-h-[3.25rem] py-1 pl-2 pr-1',
          className,
        )}
      >
        {g.toolbarShowLabel ? (
          <HoverTooltip label="View photos fullscreen" asChild>
            {/* ds-raw-button: composite text-left launcher (label + chevron) — not a Button shape */}
            <button
              type="button"
              onClick={() => g.openViewer(0)}
              className="flex min-w-0 shrink-0 items-center gap-1 rounded-lg py-0.5 pl-1 pr-1.5 text-left transition-all hover:bg-blue-100/50 active:scale-[0.995]"
              aria-label="View photos fullscreen"
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
        ) : null}

        <div className="flex shrink-0 items-stretch self-center overflow-hidden rounded-lg border border-blue-200/90 bg-surface-card/90 shadow-sm">
          <HoverTooltip label="View photos fullscreen" asChild>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                g.openViewer(0);
              }}
              className={iconBtn}
              ariaLabel="View photos fullscreen"
              icon={<ImageIcon className="h-4 w-4 text-blue-700" />}
            />
          </HoverTooltip>

          <HoverTooltip label="Show photo details" asChild>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                g.openViewer(0, { details: true });
              }}
              className={cn(iconBtn, sep)}
              ariaLabel="Show photo details"
              icon={<Info className="h-4 w-4 text-blue-700" />}
            />
          </HoverTooltip>

          {g.canUpload ? (
            <HoverTooltip label={g.uploading ? 'Uploading…' : 'Upload photos'} asChild>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  g.openUploadOverlay();
                }}
                disabled={g.uploading}
                className={cn(iconBtn, sep)}
                ariaLabel="Upload photos"
                icon={
                  g.uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                  ) : (
                    <Upload className="h-4 w-4 text-blue-700" />
                  )
                }
              />
            </HoverTooltip>
          ) : null}

          <HoverTooltip label={g.downloading ? 'Downloading…' : 'Download all photos'} asChild>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                void g.handleDownloadAll();
              }}
              disabled={!canDownload}
              className={cn(iconBtn, sep)}
              ariaLabel="Download all photos"
              icon={<Download className="h-4 w-4 text-blue-700" />}
            />
          </HoverTooltip>

          {g.allowReassign ? (
            <HoverTooltip label="Move to another PO" asChild>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  g.openMovePhotos();
                }}
                className={cn(iconBtn, sep, g.movePhotosOpen ? 'bg-blue-100' : '')}
                ariaLabel="Move to another PO"
                aria-pressed={g.movePhotosOpen}
                icon={<ArrowLeftRight className="h-4 w-4 text-blue-700" />}
              />
            </HoverTooltip>
          ) : null}

          {g.onSendToTicket ? (
            <HoverTooltip label="Send photos to a support ticket" asChild>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  g.onSendToTicket?.();
                }}
                className={cn(iconBtn, sep)}
                ariaLabel="Send photos to a support ticket"
                icon={<Ticket className="h-4 w-4 text-blue-700" />}
              />
            </HoverTooltip>
          ) : null}

          {g.libraryHref ? (
            <HoverTooltip label="Open in media library" asChild>
              <a
                href={g.libraryHref}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={cn(iconBtn, sep, 'inline-flex items-center justify-center')}
                aria-label="Open in media library"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </HoverTooltip>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    /* ds-raw-button: full-width composite launcher card (icon tile + title + photo counts + chevron) — not a Button shape */
    <button
      type="button"
      onClick={() => g.openViewer(0)}
      className={`w-full bg-gradient-to-r from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-100 border border-blue-200 hover:border-blue-300 rounded-xl px-4 py-3 transition-all active:scale-[0.98] group ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-500 rounded-lg flex items-center justify-center shadow-sm">
            <ImageIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-text-default">{g.launcherTitle}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-role-micro text-blue-600 uppercase tracking-wider">
                {photoItems.length} {photoItems.length === 1 ? 'Photo' : 'Photos'}
              </span>
              {loadedCount < photoItems.length && errorCount === 0 && (
                <span className="text-role-micro font-semibold text-amber-600">• Loading...</span>
              )}
              {errorCount > 0 && <span className="text-role-micro font-semibold text-red-600">• {errorCount} Failed</span>}
            </div>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-blue-600 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
}
