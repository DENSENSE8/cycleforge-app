'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';

/** Generic dropzone (images by default; `acceptFile` widens it) — drag-drop, click-to-pick, OR **paste** (images only). */
export interface UsePhotoDropzone {
  isDragging: boolean;
  rootProps: {
    onDragEnter: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onPaste: (e: ClipboardEvent) => void;
  };
  /** Callback ref for the hidden <input> ({@link inputProps} carries the rest). */
  inputRef: (el: HTMLInputElement | null) => void;
  inputProps: {
    type: 'file';
    accept: string;
    multiple: boolean;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    className: string;
  };
  openPicker: () => void;
}

const isFileDrag = (e: DragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

const isImageFile = (file: File): boolean => file.type.startsWith('image/');

/** Image files on a clipboard, or `[]`. */
function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && file.type.startsWith('image/')) out.push(file);
  }
  if (out.length) return out;
  return Array.from(data.files ?? []).filter((f) => f.type.startsWith('image/'));
}

export function usePhotoDropzone(
  onFiles: (files: File[]) => void,
  opts: {
    accept?: string;
    /** Which dropped / picked files are kept. Default: images. A CSV drop passes its own test. */
    acceptFile?: (file: File) => boolean;
    multiple?: boolean;
    /**
     * Also listen for paste on `document`, so an image lands even when nothing
     * inside the dropzone has focus. Opt-in: two surfaces claiming it would
     * stage the same screenshot twice.
     */
    documentPaste?: boolean;
    /** Set `false` when a HOST above this dropzone owns paste for the whole surface. */
    paste?: boolean;
  } = {},
): UsePhotoDropzone {
  const { accept = 'image/*', multiple = true, documentPaste = false, paste = true, acceptFile = isImageFile } = opts;
  const elRef = useRef<HTMLInputElement | null>(null);
  // Callback ref — assignable to <input ref> across React 18/19 typings, unlike
  // a RefObject<HTMLInputElement | null> which trips LegacyRef variance.
  const inputRef = useCallback((el: HTMLInputElement | null) => {
    elRef.current = el;
  }, []);
  // Counter, not a boolean — nested children fire dragenter/leave so a plain flag
  // flickers. Increment on enter, decrement on leave; dragging = depth > 0.
  const depth = useRef(0);
  const [isDragging, setDragging] = useState(false);

  const acceptFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list).filter(acceptFile);
      if (files.length) onFiles(files);
    },
    [onFiles, acceptFile],
  );

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      acceptFiles(e.dataTransfer.files);
    },
    [acceptFiles],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      if (!paste) return;
      const files = imageFilesFromClipboard(e.clipboardData as DataTransfer | null);
      if (!files.length) return; // text paste — leave it entirely alone
      e.preventDefault();
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [onFiles, multiple, paste],
  );

  // The document-scoped variant. Kept in a ref-free effect keyed on the same
  // callback so it never goes stale, and it defers to the element handler by
  // simply doing the same thing — a paste fires once, on one target.
  useEffect(() => {
    if (!documentPaste || typeof document === 'undefined') return;
    const handler = (event: Event) => {
      // The element handler runs first (React's root listener sits below
      // document) and calls preventDefault. Without this the same screenshot
      // would stage twice on a surface that spreads rootProps AND opts in here.
      if (event.defaultPrevented) return;
      const files = imageFilesFromClipboard((event as globalThis.ClipboardEvent).clipboardData);
      if (!files.length) return;
      event.preventDefault();
      onFiles(multiple ? files : files.slice(0, 1));
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [documentPaste, onFiles, multiple]);

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      acceptFiles(e.target.files);
      // Reset so picking the same file twice still fires onChange.
      e.target.value = '';
    },
    [acceptFiles],
  );

  const openPicker = useCallback(() => elRef.current?.click(), []);

  return {
    isDragging,
    rootProps: { onDragEnter, onDragOver, onDragLeave, onDrop, onPaste },
    inputRef,
    inputProps: { type: 'file', accept, multiple, onChange, className: 'hidden' },
    openPicker,
  };
}
