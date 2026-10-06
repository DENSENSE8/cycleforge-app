'use client';

/**
 * Labels & docs › Bulk — the bare `/shipping/label-intake` (operator
 * 2026-10-06): a file explorer. One row per uploaded PDF, newest first.
 *
 *   sidebar   Find (`q`) · Sort (`sort`) · Print status (`printing`) · Uploaded (`from`/`to`) · Printed (`printedFrom`/`printedTo`)
 *   list      `PrintFileList` — day headers by the sort's date, a Printed badge per file
 *   pane      `PrintFilePane` — the previewed file and its ONE Print, or the checked files
 *
 * Upload (header, ⌘O) and a drop anywhere on the desk send PDFs with no type
 * choice: the server splits each by page size and matches pages to orders
 * silently. Print (header, ⌘P) prints the checked files, else the previewed
 * one: every page in page order, label pages to the 4×6 station and paper
 * pages to the Letter station (`useDeskPress`), one reprint confirm. Esc ends
 * the preview, never the check-set.
 */

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Printer } from '@/components/Icons';
import { DeskSelectionDock } from '@/design-system/components/DeskSelectionDock';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { usePrintStations } from '@/hooks/usePrintStations';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import type { PrintFileRow } from '@/lib/label-prints/print-file-contracts';
import { deletePrintFile, fetchPrintFile, PRINT_FILES_KEY_ROOT } from '@/lib/label-prints/print-files-client';
import { ORDER_PACKETS_KEY_ROOT } from '@/lib/label-prints/order-packets-client';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { stationFace } from '../PrintStationsCard';
import { useFilePicker } from '../orders/pane/SlotFrame';
import { LABEL_DROP_TYPES } from '../orders/pane/slot-faces';
import { LabelUploadTray } from '../upload/LabelUploadTray';
import { reprintWarning, useDeskPress } from '../use-desk-press';
import { usePrintRoutes } from '../use-print-routes';
import { PrintFileList } from './PrintFileList';
import { PrintFilePane } from './PrintFilePane';
import { printFileDocuments, printFileReprintFace } from './print-file-model';
import { printFileDetailKey, usePrintFileChecks, usePrintFileDetail, usePrintFiles } from './use-print-files';
import { usePrintFileUploads } from './use-print-file-uploads';

const UPLOAD_CHORD = 'mod+o';
const PRINT_CHORD = 'mod+p';
/** The file list has no body status cut — the sidebar's `?printing=` is the server's. */
const NO_STATUS: readonly never[] = [];

export function FilesDesk() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const apple = useApplePlatform();
  const { refresh: refreshRoutes } = usePrintRoutes();
  const stations = usePrintStations();
  const { print, notice, setNotice } = useDeskPress(stations, refreshRoutes);
  const cut = useTriageCut({ statusKeys: NO_STATUS, recordParams: [] });
  const data = usePrintFiles(searchParams, cut.url);
  const { filters, rows } = data;
  const { selection, checkedFiles, uncheck } = usePrintFileChecks(rows);

  // ── The previewed file: a row click or J / K; Esc ends it ──
  const [openId, setOpenId] = useState<number | null>(null);
  const [drawerHidden, setDrawerHidden] = useState(false);
  const openRow = useMemo(
    () => rows.find((file) => file.id === openId) ?? checkedFiles.find((file) => file.id === openId) ?? null,
    [rows, checkedFiles, openId],
  );
  const shown = openRow ?? (checkedFiles.length === 1 ? checkedFiles[0]! : null);
  const detail = usePrintFileDetail(shown?.id ?? null);
  const openFile = useCallback((file: PrintFileRow) => {
    setDrawerHidden(false);
    setOpenId(file.id);
  }, []);
  const closeFile = useCallback(() => setOpenId(null), []);
  useEffect(() => {
    if (checkedFiles.length > 0) setDrawerHidden(false);
  }, [checkedFiles.length]);

  const refreshLists = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: PRINT_FILES_KEY_ROOT }),
        queryClient.invalidateQueries({ queryKey: ORDER_PACKETS_KEY_ROOT }),
      ]),
    [queryClient],
  );

  // ── Print: every page of each file, in page order; each stock to its station ──
  const [loadingPages, setLoadingPages] = useState(false);
  const printFiles = useCallback(
    async (files: readonly PrintFileRow[]) => {
      if (print.isPending || loadingPages) return;
      if (files.length === 0) {
        setNotice('Check or open a file to print.');
        return;
      }
      setLoadingPages(true);
      try {
        const details = await Promise.all(
          files.map((file) => queryClient.fetchQuery({ queryKey: printFileDetailKey(file.id), queryFn: () => fetchPrintFile(file.id), staleTime: 0 })),
        );
        const documents = details.flatMap(printFileDocuments);
        if (documents.length === 0) {
          setNotice(files.length === 1 ? `${files[0]!.fileName} has no printable pages.` : 'The checked files have no printable pages.');
          return;
        }
        print.mutate(
          {
            documents,
            reprint: details.some((file) => file.printedPages > 0),
            confirm: reprintWarning(details.map(printFileReprintFace)),
          },
          { onSettled: () => void refreshLists() },
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'The pages could not be read.');
      } finally {
        setLoadingPages(false);
      }
    },
    [print, loadingPages, setNotice, queryClient, refreshLists],
  );
  const printing = print.isPending || loadingPages;
  const printTargets = useCallback(() => {
    void printFiles(checkedFiles.length > 0 ? checkedFiles : shown ? [shown] : []);
  }, [printFiles, checkedFiles, shown]);

  // ── Delete: only while no page is on an order (the server refuses otherwise) ──
  const [deleting, setDeleting] = useState(false);
  const deleteFile = useCallback(
    async (file: PrintFileRow) => {
      setDeleting(true);
      try {
        await deletePrintFile(file.id);
        uncheck([file.id]);
        setOpenId((current) => (current === file.id ? null : current));
        toast.success(`${file.fileName} deleted`);
        await refreshLists();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `${file.fileName} could not be deleted.`);
      } finally {
        setDeleting(false);
      }
    },
    [uncheck, refreshLists],
  );

  // ── Upload: no type choice; a drop anywhere on the desk ──
  const uploads = usePrintFileUploads();
  const picker = useFilePicker(LABEL_DROP_TYPES, uploads.submit);
  const openUpload = picker.open;
  const [dragging, setDragging] = useState(false);

  // ── Header intents, chords, Esc ──
  useNavIntent('labels-docs:upload', openUpload);
  useNavIntent('labels-docs:print-selected', printTargets);
  useEffect(
    () =>
      registerShortcutOverviewGroup({
        id: 'labels-docs-files',
        title: 'Labels & docs · Bulk',
        rows: [
          { keys: ['J', 'K'], label: 'Next / previous file' },
          { keys: ['X'], label: 'Select the file' },
          { keys: chordKeys(PRINT_CHORD, apple), label: 'Print the selected files, else the open one' },
          { keys: chordKeys(UPLOAD_CHORD, apple), label: 'Upload PDFs' },
          { keys: ['Esc'], label: 'End the preview (the selection stays)' },
        ],
      }),
    [apple],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || hasOpenOverlay()) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        printTargets();
      } else if (key === 'o') {
        event.preventDefault();
        openUpload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [printTargets, openUpload]);
  // On `document`, so it runs before the stage's own Esc on `window`.
  const previewing = openId != null;
  useEffect(() => {
    if (!previewing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      setOpenId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewing]);

  // ── Faces ──
  const checkedCount = checkedFiles.length;
  const bulkVerbs = useMemo<RecordActionVerb[]>(
    () => [
      {
        id: 'print-files',
        label: `Print ${checkedCount} ${checkedCount === 1 ? 'file' : 'files'}`,
        icon: <Printer />,
        disabled: printing,
        disabledReason: 'Printing…',
        run: () => void printFiles(checkedFiles),
      },
    ],
    [checkedCount, printing, printFiles, checkedFiles],
  );
  const narrowed = Boolean(filters.q || filters.printing || filters.from || filters.to || filters.printedFrom || filters.printedTo);
  const paneOpen = (checkedCount >= 2 || shown != null) && !drawerHidden;

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', dragging && 'outline outline-2 -outline-offset-2 outline-mode-mark')}
      data-testid="labels-docs-desk"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragging(false);
        uploads.submit([...event.dataTransfer.files]);
      }}
    >
      {picker.input}
      <DeskSelectionDock
        open={paneOpen}
        onDismiss={() => setDrawerHidden(true)}
        label={checkedCount >= 2 ? 'Selected files' : 'Open file'}
        testId="files-dock"
        ledger={
          <PrintFileList
            data={data}
            cut={cut}
            narrowed={narrowed}
            selection={selection}
            openId={openId}
            onOpen={openFile}
            onClose={closeFile}
            bulk={<RecordActionStrip verbs={bulkVerbs} label="Selected file actions" testId="files-select-actions" />}
            banner={
              notice || uploads.items.length > 0 ? (
                <>
                  {notice ? (
                    <p aria-live="polite" className="text-role-caption text-mode-muted" data-testid="labels-docs-status">
                      {notice}
                    </p>
                  ) : null}
                  <LabelUploadTray uploads={uploads} kind="files" />
                </>
              ) : null
            }
          />
        }
        pane={(mode) => (
          <PrintFilePane
            mode={mode}
            file={shown}
            detail={detail.data}
            checked={checkedFiles}
            onUncheck={(id) => uncheck([id])}
            onClose={() => setDrawerHidden(true)}
            onPrint={(files) => void printFiles(files)}
            printing={printing}
            onDelete={deleteFile}
            deleting={deleting}
            blockedReason={stations.blockedReason}
            stationFace={{ paper: stationFace(stations.target.paper, 'paper'), label: stationFace(stations.target.label, 'label') }}
          />
        )}
      />
    </div>
  );
}
