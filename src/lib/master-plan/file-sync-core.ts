/**
 * File↔doc sync engine (ALP-2.2 / ALP-2.3) — the testable core of the local
 * sync daemon. The daemon shell (.cycle_forge_ops/scripts/
 * master-plan-sync-daemon.mjs) wires fs.watch + Ably around this; unit tests
 * inject fakes. No Node imports here — everything I/O comes through Deps.
 *
 * Echo suppression (generation tokens): every downstream write records the
 * exact text written. When the file watcher fires, the engine compares the
 * file content against the last written generation — a match is our own echo
 * and is dropped; the Ably side is separately suppressed by the provider's
 * clientTag (see README.md). Together these break the
 * file→doc→Ably→doc→file loop in both directions.
 */

import type * as Y from 'yjs';
import { applyMasterPlanReplace, isMasterPlanEmpty, readMasterPlan, createSeedUpdate, SEED_APPLY_ORIGIN } from './doc';
import * as Yjs from 'yjs';

/** Origin tag for doc transactions that came FROM the file plane. */
export const FILE_ORIGIN = 'master-plan:file';
/** Origin tag for the startup seed transaction. */
export const SEED_ORIGIN = SEED_APPLY_ORIGIN;

export interface FileSyncDeps {
  /** Atomic write (temp + rename). The shell implements it; tests capture. */
  writeFile: (text: string) => Promise<void>;
  /** Debounced-callback scheduler; tests run it synchronously. */
  schedule: (cb: () => void, ms: number) => void;
  log: (msg: string) => void;
}

export interface FileSyncOptions {
  /** Downstream write debounce (ms). */
  writeDebounceMs?: number;
}

export class FileSyncEngine {
  private readonly doc: Y.Doc;
  private readonly deps: FileSyncDeps;
  private readonly writeDebounceMs: number;

  /** Generation token: the exact text of our last downstream write. */
  private lastWritten: string | null = null;
  private writeQueued = false;
  private stopped = false;

  private readonly onDocUpdate = (_update: Uint8Array, origin: unknown) => {
    // Changes that CAME from the file must not bounce back into the file.
    if (origin === FILE_ORIGIN || this.stopped) return;
    this.queueWrite();
  };

  constructor(doc: Y.Doc, deps: FileSyncDeps, opts: FileSyncOptions = {}) {
    this.doc = doc;
    this.deps = deps;
    this.writeDebounceMs = opts.writeDebounceMs ?? 200;
    doc.on('update', this.onDocUpdate);
  }

  /**
   * Startup policy (documented in README.md):
   * - Empty doc after the sync window → seed from the file text (idempotent
   *   fixed-clientID update; peers racing with the same canonical text merge
   *   to one copy). Empty file too → nothing to do.
   * - Non-empty doc that DIFFERS from the file → the network doc wins the
   *   file (previous sessions already synced local edits up). The engine
   *   reports the divergence so the shell can back up the local file first —
   *   nothing is silently lost.
   */
  startup(fileText: string | null): { seeded: boolean; docWonFile: boolean } {
    if (isMasterPlanEmpty(this.doc)) {
      if (fileText && fileText.length > 0) {
        Yjs.applyUpdate(this.doc, createSeedUpdate(fileText), SEED_ORIGIN);
        this.deps.log('seeded empty doc from local file');
        // Seeding must not immediately rewrite the identical file.
        this.lastWritten = fileText;
        return { seeded: true, docWonFile: false };
      }
      return { seeded: false, docWonFile: false };
    }
    const docText = readMasterPlan(this.doc);
    if (fileText !== docText) {
      this.queueWrite();
      return { seeded: false, docWonFile: true };
    }
    this.lastWritten = docText;
    return { seeded: false, docWonFile: false };
  }

  /** Upstream: the watcher saw the file change; `text` is its new content. */
  handleFileChanged(text: string): 'echo' | 'applied' | 'noop' {
    if (this.stopped) return 'noop';
    if (this.lastWritten !== null && text === this.lastWritten) {
      // Our own write bouncing back through fs.watch — the whole point of
      // the generation token. Swallow it.
      return 'echo';
    }
    const changed = applyMasterPlanReplace(this.doc, text, FILE_ORIGIN);
    if (changed) {
      // The file is now the freshest representation; remember it so the
      // watcher's duplicate events for the same save are also swallowed.
      this.lastWritten = text;
      return 'applied';
    }
    return 'noop';
  }

  private queueWrite(): void {
    if (this.writeQueued || this.stopped) return;
    this.writeQueued = true;
    this.deps.schedule(() => {
      this.writeQueued = false;
      if (this.stopped) return;
      const text = readMasterPlan(this.doc);
      if (text === this.lastWritten) return; // nothing new to persist
      this.lastWritten = text;
      void this.deps.writeFile(text).catch((err) => {
        this.deps.log(`file write failed: ${String(err)}`);
        // Allow a retry on the next doc update.
        this.lastWritten = null;
      });
    }, this.writeDebounceMs);
  }

  /** Flush synchronously-known state and detach from the doc. */
  stop(): void {
    if (this.stopped) return;
    const text = readMasterPlan(this.doc);
    if (text !== this.lastWritten) {
      this.lastWritten = text;
      void this.deps.writeFile(text).catch((err) => this.deps.log(`final write failed: ${String(err)}`));
    }
    this.stopped = true;
    this.doc.off('update', this.onDocUpdate);
  }
}
