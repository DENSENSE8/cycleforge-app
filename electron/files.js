/**
 * N6 — native file workspaces (operator ruling, 2026-08-23: desktop-first).
 *
 * Full CRUD over the operator's own files — open a folder, scan it, read,
 * write, make folders, move/rename, trash — so the desktop app can organize
 * local documents (FBA folders first) and feed them into the workspace import
 * pipe. This is the capability the browser structurally cannot have, and it is
 * the reason the app is a desktop application rather than a hosted page.
 *
 * ## The trust model — Cursor's, not a loosened web one
 *
 * Every operation is scoped to a WORKSPACE ROOT the operator chose through the
 * OS folder picker (or that a selftest registered). Nothing outside a chosen
 * root is readable or writable, ever — "full control over files" means full
 * control of the workspaces the operator opened, exactly like a code editor.
 * The guard is structural (`insideRoots`), not per-handler discipline.
 *
 * ## Shape
 *
 * Handlers never throw into the renderer: every result is
 * `{ ok: true, ... } | { ok: false, error }`. Deletion goes to the OS trash
 * (`shell.trashItem`) — CRUD's D is recoverable on a warehouse PC, where a
 * mis-click is a real event. Scans are non-recursive per call (the renderer
 * walks lazily), entry-capped, and skip symlinks so a loop cannot wedge the
 * main process.
 */

const { dialog, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

/** Workspace roots the operator has opened. Resolved absolute paths. */
const openRoots = new Set();

const MAX_SCAN_ENTRIES = 2000;
const MAX_READ_BYTES = 64 * 1024 * 1024; // 64 MB — plenty for FBA sheets/PDFs

function insideRoots(candidate) {
  const resolved = path.resolve(String(candidate));
  for (const root of openRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;
  }
  return null;
}

function fail(error) {
  return { ok: false, error: String(error?.message ?? error) };
}

const OUTSIDE = { ok: false, error: 'path is outside every open workspace root' };

async function entryOf(dir, dirent) {
  const full = path.join(dir, dirent.name);
  try {
    const stat = await fs.stat(full);
    return {
      name: dirent.name,
      path: full,
      kind: stat.isDirectory() ? 'dir' : 'file',
      size: stat.isDirectory() ? 0 : stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
    };
  } catch {
    return null; // raced a delete — a listing is a snapshot, not a promise
  }
}

/** One directory level: dirs first, then files, both name-sorted. */
async function scanDir(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const dirent of dirents) {
    if (out.length >= MAX_SCAN_ENTRIES) break;
    if (dirent.isSymbolicLink()) continue;
    const entry = await entryOf(dir, dirent);
    if (entry) out.push(entry);
  }
  out.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
  );
  return out;
}

function registerFileHandlers(ipcMain, getWindow, log) {
  ipcMain.handle('cf:files-open-folder', async () => {
    try {
      const win = getWindow();
      const picked = await dialog.showOpenDialog(win ?? undefined, {
        title: 'Open a folder as a workspace',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { ok: true, root: null, entries: [] };
      }
      const root = path.resolve(picked.filePaths[0]);
      openRoots.add(root);
      log.info(`[files] workspace opened: ${root}`);
      return { ok: true, root, entries: await scanDir(root) };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('cf:files-roots', async () => ({ ok: true, roots: [...openRoots] }));

  ipcMain.handle('cf:files-scan', async (_event, payload) => {
    const dir = insideRoots(payload?.dir);
    if (!dir) return OUTSIDE;
    try {
      return { ok: true, entries: await scanDir(dir) };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('cf:files-read', async (_event, payload) => {
    const file = insideRoots(payload?.path);
    if (!file) return OUTSIDE;
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return { ok: false, error: 'not a file' };
      if (stat.size > MAX_READ_BYTES) {
        return { ok: false, error: `file exceeds the ${MAX_READ_BYTES / 1024 / 1024} MB read ceiling` };
      }
      const data = await fs.readFile(file);
      return { ok: true, base64: data.toString('base64'), size: stat.size };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('cf:files-write', async (_event, payload) => {
    const file = insideRoots(payload?.path);
    if (!file) return OUTSIDE;
    try {
      const data = Buffer.from(String(payload?.base64 ?? ''), 'base64');
      await fs.writeFile(file, data);
      return { ok: true, size: data.length };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('cf:files-mkdir', async (_event, payload) => {
    const dir = insideRoots(payload?.path);
    if (!dir) return OUTSIDE;
    try {
      await fs.mkdir(dir, { recursive: true });
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('cf:files-move', async (_event, payload) => {
    const from = insideRoots(payload?.from);
    const to = insideRoots(payload?.to);
    if (!from || !to) return OUTSIDE;
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      try {
        await fs.rename(from, to);
      } catch (err) {
        if (err?.code !== 'EXDEV') throw err;
        // Cross-device move (USB stick → disk): copy then remove.
        await fs.cp(from, to, { recursive: true });
        await fs.rm(from, { recursive: true });
      }
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('cf:files-trash', async (_event, payload) => {
    const target = insideRoots(payload?.path);
    if (!target) return OUTSIDE;
    try {
      await shell.trashItem(target);
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });
}

/**
 * Prove the whole layer inside a REAL build with no UI: register a temp
 * workspace, then exercise create → scan → read → move → guard → trash.
 * Run with `--cf-selftest`; the process prints one JSON line and exits.
 */
async function runFilesSelftest() {
  const steps = [];
  const step = (name, ok, detail) => steps.push({ name, ok, ...(detail ? { detail } : {}) });
  let root = null;
  try {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-files-selftest-'));
    openRoots.add(path.resolve(root));

    await fs.mkdir(path.join(root, 'FBA-inbox'));
    await fs.writeFile(path.join(root, 'FBA-inbox', 'shipment-plan.csv'), 'sku,qty\nA-1,3\n');
    step('create', true);

    const listed = await scanDir(path.join(root, 'FBA-inbox'));
    step('scan', listed.length === 1 && listed[0].name === 'shipment-plan.csv');

    const read = await fs.readFile(path.join(root, 'FBA-inbox', 'shipment-plan.csv'), 'utf8');
    step('read', read.startsWith('sku,qty'));

    await fs.mkdir(path.join(root, 'FBA-2026-08'));
    await fs.rename(
      path.join(root, 'FBA-inbox', 'shipment-plan.csv'),
      path.join(root, 'FBA-2026-08', 'shipment-plan.csv'),
    );
    const moved = await scanDir(path.join(root, 'FBA-2026-08'));
    step('organize(move)', moved.length === 1);

    step('root-guard', insideRoots(path.join(os.homedir(), '.ssh', 'id_rsa')) === null);
    step('root-guard-inside', insideRoots(path.join(root, 'FBA-2026-08')) !== null);

    await fs.rm(root, { recursive: true });
    step('delete', true);
  } catch (err) {
    step('unexpected', false, String(err?.message ?? err));
    if (root) await fs.rm(root, { recursive: true }).catch(() => {});
  }
  return { ok: steps.every((s) => s.ok), steps };
}

module.exports = { registerFileHandlers, runFilesSelftest };
