'use client';

/**
 * Incoming extract foot — the same {@link StationComposerHost} Unbox uses.
 * Faces off (extract is not Unbox|Ticket); context ring stays. Width is owned
 * by {@link TriageScrollLayout} `footer` (`triageMeasureClass`, left of knobs).
 *
 * Eval: `pnpm run eval:station scan-out` (mouth SoT — not overlay cohort,
 * not `verify:fast` alone). Tripwire: `incoming-add-composer-mouth.test.ts`.
 */

import { StationComposerHost } from '@/components/composer/StationComposerHost';
import { Image as ImageIcon } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { NOTE_OVERLAY_ICON, NOTE_TAG_BTN } from '@/components/receiving/workspace/note-composer-helpers';
import type { NoteComposerInsertAction } from '@/components/receiving/workspace/NoteComposerInsertRail';
import { useMemo } from 'react';

export function IncomingAddExtractComposer({
  extractText,
  onExtractText,
  onExtract,
  extracting,
  pendingCount,
  onFiles,
  canSubmit,
  submitting,
  isReturn,
  onSubmit,
}: {
  extractText: string;
  onExtractText: (next: string) => void;
  onExtract: (live?: string) => void;
  extracting: boolean;
  pendingCount: number;
  onFiles: (files: File[]) => void;
  canSubmit: boolean;
  submitting: boolean;
  isReturn: boolean;
  onSubmit: () => void;
}) {
  const dropzone = usePhotoDropzone(onFiles);
  const insertActions = useMemo((): NoteComposerInsertAction[] => {
    return [
      {
        id: 'screenshot',
        label: pendingCount ? `Screenshots · ${pendingCount}` : 'Attach screenshot',
        ariaLabel: 'Attach a purchase-order screenshot',
        icon: <ImageIcon className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_TAG_BTN,
        onClick: () => dropzone.openPicker(),
      },
    ];
  }, [dropzone, pendingCount]);

  return (
    <div
      className="w-full"
      data-testid="incoming-add-extract-composer"
      {...dropzone.rootProps}
    >
      <input {...dropzone.inputProps} ref={dropzone.inputRef} />
      {pendingCount > 0 ? (
        <p className="mb-2 text-role-caption text-text-muted">
          {pendingCount} screenshot{pendingCount === 1 ? '' : 's'} ready to extract
        </p>
      ) : null}
      <StationComposerHost
        labelValue={extractText}
        onLabelChange={onExtractText}
        onLabelCommit={(live) => onExtract(live)}
        labelCommitDisabled={extracting}
        labelCommitAriaLabel="Extract purchase order fields"
        labelCommitTooltip="Extract fields (Enter)"
        labelPlaceholder={
          extracting
            ? 'Extracting…'
            : 'Paste a PO, packing slip, or eBay order — or attach a screenshot'
        }
        insertActions={insertActions}
        showModeFaces={false}
        forceMode="unbox"
        chrome="raised"
        trailingAction={
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="composer"
            disabled={!canSubmit}
            onClick={onSubmit}
            ariaLabel={
              submitting
                ? 'Saving inbound'
                : isReturn
                  ? 'Add return and ticket'
                  : 'Add to Incoming'
            }
            data-testid="add-inbound-submit"
          >
            {submitting
              ? 'Saving…'
              : isReturn
                ? 'Add return + ticket'
                : 'Add to Incoming'}
          </Button>
        }
      />
    </div>
  );
}
