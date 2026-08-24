'use client';

/**
 * FILES — N6, the native file workspace tool (desktop-first ruling, T30).
 *
 * Open a folder (OS picker → workspace root), walk it, organize it — new
 * folder, rename, move, trash — and feed selected files into the workspace
 * import mouth (`POST /api/imports/desktop-files`). The FBA flow this exists
 * for: open the FBA downloads folder, sort the sheets into dated subfolders,
 * select, upload.
 *
 * Everything file-shaped goes through `@/lib/desktop/desktop-host` (the one
 * bridge module); in a plain browser every action degrades to the one honest
 * sentence: this needs the desktop app. No modal dialogs — rename is inline,
 * results land on the rows.
 */

import { useCallback, useState } from 'react';
import {
  desktopFilesAvailable,
  desktopMkdir,
  desktopMoveFile,
  desktopOpenFolder,
  desktopReadFile,
  desktopScanDir,
  desktopTrashFile,
  type DesktopFileEntry,
} from '@/lib/desktop/desktop-host';
import { Icon } from '@/shell/icons';

function fmtSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

const sep = (p: string) => (p.includes('\\') ? '\\' : '/');
const joinPath = (dir: string, name: string) => dir + sep(dir) + name;
const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
const relTo = (root: string, p: string) => (p.startsWith(root) ? p.slice(root.length + 1) : p);

export function FilesBody() {
  const [root, setRoot] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly DesktopFileEntry[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ path: string; draft: string } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState<string>('');

  const refresh = useCallback(async (dir: string) => {
    const scan = await desktopScanDir(dir);
    if (scan.ok) {
      setEntries(scan.entries ?? []);
      setCwd(dir);
    } else {
      setNote(scan.error ?? 'scan failed');
    }
  }, []);

  const openFolder = useCallback(async () => {
    setBusy(true);
    setNote(null);
    const opened = await desktopOpenFolder();
    setBusy(false);
    if (!opened.ok) return setNote(opened.error ?? 'open failed');
    if (!opened.root) return; // picker cancelled — nothing to say
    setRoot(opened.root);
    setCwd(opened.root);
    setEntries(opened.entries ?? []);
    setSelected(new Set());
  }, []);

  const toggle = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const act = useCallback(
    async (work: () => Promise<string | null>) => {
      if (!cwd) return;
      setBusy(true);
      const failure = await work();
      setNote(failure);
      setBusy(false);
      await refresh(cwd);
      setSelected(new Set());
    },
    [cwd, refresh],
  );

  const makeFolder = () =>
    act(async () => {
      const name = creatingFolder.trim();
      if (!name || !cwd) return 'name the folder first';
      const made = await desktopMkdir(joinPath(cwd, name));
      setCreatingFolder('');
      return made.ok ? null : (made.error ?? 'mkdir failed');
    });

  const commitRename = () =>
    act(async () => {
      if (!renaming) return null;
      const target = renaming.draft.trim();
      if (!target) return 'name it first';
      const moved = await desktopMoveFile(renaming.path, joinPath(parentOf(renaming.path), target));
      setRenaming(null);
      return moved.ok ? null : (moved.error ?? 'rename failed');
    });

  const moveSelectedInto = (dir: DesktopFileEntry) =>
    act(async () => {
      for (const from of selected) {
        const moved = await desktopMoveFile(from, joinPath(dir.path, from.split(sep(from)).pop()!));
        if (!moved.ok) return moved.error ?? 'move failed';
      }
      return null;
    });

  const trashSelected = () =>
    act(async () => {
      for (const path of selected) {
        const trashed = await desktopTrashFile(path);
        if (!trashed.ok) return trashed.error ?? 'trash failed';
      }
      return null;
    });

  /** Feed the selected FILES to the workspace import mouth, one honest result. */
  const uploadSelected = () =>
    act(async () => {
      if (!root) return null;
      const files = entries.filter((e) => e.kind === 'file' && selected.has(e.path));
      if (files.length === 0) return 'select at least one file';
      const payload = [];
      for (const file of files) {
        const read = await desktopReadFile(file.path);
        if (!read.ok || !read.base64) return `${file.name}: ${read.error ?? 'read failed'}`;
        payload.push({
          name: file.name,
          relPath: relTo(root, file.path),
          size: read.size ?? file.size,
          contentBase64: read.base64,
        });
      }
      const res = await fetch('/api/imports/desktop-files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ files: payload }),
      }).catch(() => null);
      if (!res) return 'upload failed: network';
      if (res.ok) return null;
      const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
      return `upload refused (${res.status}): ${body?.detail ?? body?.error ?? res.statusText}`;
    });

  if (!desktopFilesAvailable()) {
    return (
      <div className="tool-empty">
        Native files need the desktop app
        <br />
        <span className="tool-empty-sub">
          Open Cycle Forge Desktop — the browser cannot reach your folders.
        </span>
      </div>
    );
  }

  if (!root || !cwd) {
    return (
      <div className="tool-block">
        <div className="tool-copy">
          Open a folder as a workspace — your FBA downloads, a batch of manuals, a photos dump.
          Organize it here, then upload the keepers to the workspace tables.
        </div>
        <button type="button" className="btn btn-primary" onClick={openFolder} disabled={busy}>
          Open folder…
        </button>
        {note ? <div className="files-note">{note}</div> : null}
      </div>
    );
  }

  const dirs = entries.filter((e) => e.kind === 'dir');

  return (
    <div className="tool-block files-tool">
      <div className="files-crumbs mono" title={cwd}>
        {relTo(root, cwd) || root.split(sep(root)).pop()}
      </div>

      <div className="files-list" aria-label="Files">
        {cwd !== root ? (
          <button type="button" className="files-row" onClick={() => refresh(parentOf(cwd))}>
            <Icon name="folder" size={12} />
            <span className="files-name">..</span>
          </button>
        ) : null}
        {entries.map((entry) =>
          renaming?.path === entry.path ? (
            <div className="files-row" key={entry.path}>
              <Icon name={entry.kind === 'dir' ? 'folder' : 'file'} size={12} />
              <input
                autoFocus
                className="files-rename"
                value={renaming.draft}
                aria-label={`Rename ${entry.name}`}
                onChange={(e) => setRenaming({ path: entry.path, draft: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            </div>
          ) : (
            <div className={`files-row${selected.has(entry.path) ? ' selected' : ''}`} key={entry.path}>
              <input
                type="checkbox"
                checked={selected.has(entry.path)}
                aria-label={`Select ${entry.name}`}
                onChange={() => toggle(entry.path)}
              />
              <button
                type="button"
                className="files-open"
                title={entry.kind === 'dir' ? 'Open folder' : entry.name}
                onClick={() => (entry.kind === 'dir' ? void refresh(entry.path) : toggle(entry.path))}
              >
                <Icon name={entry.kind === 'dir' ? 'folder' : 'file'} size={12} />
                <span className="files-name">{entry.name}</span>
              </button>
              {entry.kind === 'file' ? <span className="files-size mono">{fmtSize(entry.size)}</span> : null}
              <button
                type="button"
                className="files-act"
                title="Rename"
                onClick={() => setRenaming({ path: entry.path, draft: entry.name })}
              >
                <Icon name="edit" size={11} />
              </button>
            </div>
          ),
        )}
        {entries.length === 0 ? <div className="tool-empty-sub">Empty folder</div> : null}
      </div>

      <div className="files-newfolder">
        <input
          type="text"
          placeholder="New folder name…"
          aria-label="New folder name"
          value={creatingFolder}
          onChange={(e) => setCreatingFolder(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void makeFolder()}
        />
        <button type="button" className="btn btn-sm" onClick={makeFolder} disabled={busy}>
          New folder
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="files-actions">
          <span className="mono">{selected.size} selected</span>
          {dirs
            .filter((d) => !selected.has(d.path))
            .slice(0, 4)
            .map((d) => (
              <button key={d.path} type="button" className="btn btn-sm" onClick={() => moveSelectedInto(d)}>
                → {d.name}
              </button>
            ))}
          <button type="button" className="btn btn-sm" onClick={trashSelected} disabled={busy}>
            Trash
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={uploadSelected} disabled={busy}>
            Upload to workspace
          </button>
        </div>
      ) : null}

      <div className="files-actions">
        <button type="button" className="btn btn-sm" onClick={openFolder} disabled={busy}>
          Open another folder…
        </button>
        <button type="button" className="btn btn-sm" onClick={() => refresh(cwd)} disabled={busy}>
          Refresh
        </button>
      </div>

      {note ? <div className="files-note">{note}</div> : null}
    </div>
  );
}
