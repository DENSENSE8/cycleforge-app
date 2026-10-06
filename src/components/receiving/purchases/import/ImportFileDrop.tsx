'use client';

/** Import orders › File — drop or pick one CSV / TSV export; once loaded, its name, rows and columns. */

import { useCallback } from 'react';
import { Upload } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { cn } from '@/utils/_cn';

export interface LoadedImportFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

const FILE_ACCEPT = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
const FILE_NAME_RE = /\.(csv|tsv|txt)$/i;

/** "1,204 rows" — the counts every step of the import prints. */
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function ImportFileDrop({
  file,
  error,
  onFile,
}: {
  file: LoadedImportFile | null;
  error: string | null;
  onFile: (upload: File) => void;
}) {
  const onFiles = useCallback((files: File[]) => files[0] && onFile(files[0]), [onFile]);
  const drop = usePhotoDropzone(onFiles, {
    accept: FILE_ACCEPT,
    multiple: false,
    paste: false,
    acceptFile: (candidate) => FILE_NAME_RE.test(candidate.name),
  });
  return (
    <RecordGroup
      title="File"
      testId="purchase-import-file"
      action={
        file ? (
          <Button size="sm" variant="secondary" icon={<Upload />} onClick={drop.openPicker}>
            Choose another file
          </Button>
        ) : null
      }
    >
      <div
        {...drop.rootProps}
        className={cn(
          'mx-4 mb-4 mt-2 flex flex-col items-center gap-2 rounded-mode border border-dashed border-border-default px-4 py-6 text-center',
          drop.isDragging && 'border-border-accent bg-surface-accent',
        )}
      >
        {/* ds-raw-button: the hidden native file input the dropzone hook drives — no primitive wraps a file picker. */}
        <input ref={drop.inputRef} {...drop.inputProps} data-testid="purchase-import-file-input" />
        {file ? (
          <p className="text-role-body text-text-default">
            <span className="font-medium">{file.fileName}</span>
            <span className="text-text-muted">
              {' '}
              · {plural(file.rows.length, 'row', 'rows')} · {plural(file.headers.length, 'column', 'columns')}
            </span>
          </p>
        ) : (
          <>
            <p className="text-role-body text-text-muted">Drop a platform's order export here — CSV or TSV.</p>
            <Button variant="secondary" icon={<Upload />} onClick={drop.openPicker}>
              Choose file
            </Button>
          </>
        )}
        {error ? <p className="text-role-caption text-text-danger">{error}</p> : null}
      </div>
    </RecordGroup>
  );
}
