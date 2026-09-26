'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import type { ManualRow } from '../manuals-tree';

export interface UseManualNavigation {
  /** Currently selected file id (from `?id=`), or null. */
  selectedId: number | null;
  currentPath: string[];
  setCurrentPath: React.Dispatch<React.SetStateAction<string[]>>;
  currentFolderPath: string;
  /** Write `?id=` on basePath to open a file in the right pane. */
  handleSelectFile: (id: number) => void;
  enterFolder: (segment: string) => void;
  goToCrumb: (index: number) => void;
}

/** Owns folder navigation: */
export function useManualNavigation(basePath: string, manuals: ManualRow[]): UseManualNavigation {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlSelectedId = useMemo(() => {
    const raw = searchParams.get('id');
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [searchParams]);

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, searchParams, basePath],
  );

  const write = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('id', String(next));
    else params.delete('id');
  }, []);

  const { value: selectedId, setValue: setSelectedId } = useOptimisticUrlParam<number | null>({
    urlValue: urlSelectedId,
    replace,
    write,
  });

  const [currentPath, setCurrentPath] = useState<string[]>([]);

  const handleSelectFile = useCallback(
    (id: number) => setSelectedId(id),
    [setSelectedId],
  );

  const enterFolder = useCallback((segment: string) => {
    setCurrentPath((prev) => [...prev, segment]);
  }, []);

  const goToCrumb = useCallback((index: number) => {
    setCurrentPath((prev) => prev.slice(0, index));
  }, []);

  // Deep link to a file: jump the breadcrumb to its folder (once, when at root).
  useEffect(() => {
    if (!selectedId) return;
    const file = manuals.find((m) => m.id === selectedId);
    if (!file?.folder_path) return;
    const target = file.folder_path.split('/').map((s) => s.trim()).filter(Boolean);
    setCurrentPath((prev) => (prev.length === 0 ? target : prev));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    selectedId,
    currentPath,
    setCurrentPath,
    currentFolderPath: currentPath.join('/'),
    handleSelectFile,
    enterFolder,
    goToCrumb,
  };
}
