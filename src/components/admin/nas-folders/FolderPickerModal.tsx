import { useCallback, useEffect, useState } from 'react';
import { listNasDir, type NasEntry } from '@/lib/nas-photos';
import { NasBreadcrumb, NasFolderCard, NasSectionLabel } from '@/components/nas/NasBrowserChrome';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';

/**
 * Browse the NAS tree and pick a folder. Reuses the same breadcrumb + folder
 * cards as the receiving picker; "Use this folder" returns the current path.
 */
export function FolderPickerModal({
  station,
  initialDir,
  onCancel,
  onPick,
}: {
  station: string;
  initialDir: string;
  onCancel: () => void;
  onPick: (folder: string) => void;
}) {
  const [dir, setDir] = useState(() => (initialDir || '').replace(/^\/+|\/+$/g, ''));
  const [entries, setEntries] = useState<NasEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (relDir: string) => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listNasDir(relDir));
    } catch (e) {
      setEntries([]);
      setError(e instanceof Error ? e.message : 'Failed to load folder.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(dir);
  }, [dir, load]);

  const folders = entries.filter((e) => e.type === 'directory');

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent
        hideClose
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-role-micro uppercase tracking-[0.18em] text-text-soft">Pick folder · {station}</p>
            <DialogTitle className="truncate text-sm font-bold">/{dir || 'Root'}</DialogTitle>
          </div>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
        </DialogHeader>

        {dir ? (
          <div className="border-b border-border-hairline inset-field">
            <NasBreadcrumb dir={dir} onNavigate={setDir} rootLabel="Root" />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-2xl bg-surface-sunken" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-role-caption font-bold text-rose-600">{error}</p>
              <Button variant="secondary" size="sm" type="button" onClick={() => void load(dir)} className="mt-3">
                Retry
              </Button>
            </div>
          ) : folders.length === 0 ? (
            <p className="py-10 text-center text-role-caption font-bold uppercase tracking-widest text-text-faint">No subfolders here.</p>
          ) : (
            <div className="space-y-1.5">
              <NasSectionLabel>Folders · {folders.length}</NasSectionLabel>
              {folders.map((f) => (
                <NasFolderCard key={f.relPath} name={f.name} onOpen={() => setDir(f.relPath)} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-hairline px-4 py-3">
          <span className="truncate text-role-micro font-bold uppercase tracking-widest text-text-faint">
            {dir ? `Selecting: /${dir}` : 'At root — pick a subfolder or use root'}
          </span>
          <Button variant="primary" size="md" type="button" onClick={() => onPick(dir)} className="shrink-0">
            Use this folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
