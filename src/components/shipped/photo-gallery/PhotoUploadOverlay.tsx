'use client';

/**
 * Desktop photo-upload popover — {@link RightPaneOverlay} chrome matching
 * {@link ReceivingClaimModal} (center-aligned, resizable pane card).
 *
 * Drop zone + explicit "Upload from device" button. Callers own the upload
 * (`onFiles`); this shell only collects files via {@link usePhotoDropzone}.
 */

import { Loader2, Upload, X } from '@/components/Icons';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton } from '@/design-system/primitives';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { cn } from '@/utils/_cn';

interface PhotoUploadOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Called with image files from drop or the device picker. */
  onFiles: (files: File[]) => void | Promise<void>;
  uploading?: boolean;
  uploadError?: string | null;
  onClearError?: () => void;
  title?: string;
  subtitle?: string;
  /** Optional secondary action (e.g. send capture request to paired phone). */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
  };
}

export function PhotoUploadOverlay({
  open,
  onClose,
  onFiles,
  uploading = false,
  uploadError = null,
  onClearError,
  title = 'Upload photos',
  subtitle = 'Drop images here or choose files from this device.',
  secondaryAction,
}: PhotoUploadOverlayProps) {
  const dz = usePhotoDropzone((files) => {
    onClearError?.();
    void onFiles(files);
  });

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="photo-upload-overlay-size"
      minWidth={420}
      minHeight={320}
      className="-mt-8 h-[min(70vh,28rem)] w-[min(94vw,32rem)]"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline bg-surface-canvas px-4 py-3">
        <div>
          <p className="text-role-micro uppercase tracking-[0.14em] text-blue-700">Photos</p>
          <p className="mt-0.5 text-sm font-semibold tracking-tight text-text-default">{title}</p>
        </div>
        <IconButton
          onClick={onClose}
          disabled={uploading}
          ariaLabel="Close"
          icon={<X className="h-4 w-4" />}
          className="rounded-lg p-1.5 text-text-faint hover:bg-surface-card hover:text-text-muted disabled:opacity-50"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <input ref={dz.inputRef} {...dz.inputProps} />

        <div
          {...dz.rootProps}
          className={cn(
            'flex min-h-[11rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            dz.isDragging
              ? 'border-blue-400 bg-blue-50/70'
              : 'border-border-default bg-surface-canvas hover:border-blue-300 hover:bg-blue-50/40',
            uploading && 'pointer-events-none opacity-70',
          )}
        >
          <span
            className={cn(
              'grid h-12 w-12 place-items-center rounded-full ring-1 transition-colors',
              dz.isDragging
                ? 'bg-blue-100 text-blue-700 ring-blue-300'
                : 'bg-surface-card text-text-faint ring-border-soft',
            )}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </span>
          <div className="space-y-1">
            <p className="text-role-caption font-semibold text-text-muted">
              {uploading
                ? 'Uploading…'
                : dz.isDragging
                  ? 'Drop to upload'
                  : 'Drag & drop photos here'}
            </p>
            <p className="max-w-xs text-role-micro font-medium leading-4 text-text-faint">
              {subtitle}
            </p>
          </div>
        </div>

        {uploadError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-role-micro font-semibold text-rose-700">
            {uploadError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={uploading}
            loading={uploading}
            icon={<Upload className="h-4 w-4" />}
            onClick={() => {
              onClearError?.();
              dz.openPicker();
            }}
            className="w-full sm:flex-1"
          >
            Upload from device
          </Button>
          {secondaryAction ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={uploading || secondaryAction.disabled || secondaryAction.loading}
              loading={secondaryAction.loading}
              onClick={secondaryAction.onClick}
              className="w-full sm:flex-1"
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>
    </RightPaneOverlay>
  );
}
