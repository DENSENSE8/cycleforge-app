/**
 * Capture-upload visibility — the Station SoT for "what happened to the photo
 * I just took".
 *
 * Three layers, deliberately separable:
 *   - `capture-upload-model`  — pure vocabulary + summary law (no React)
 *   - `CaptureUploadStatus`   — the compound; plain props, imports no queue
 *   - `useCaptureUploadStatus` / `CaptureUploadDock` — the phone-side wiring
 *
 * A new bench renders `CaptureUploadStatus`; it does NOT fork a strip. A
 * surface whose entries come from somewhere else (the P1 desk-side seam) skips
 * the hook and passes its own — which is why the compound imports no queue.
 *
 * **This barrel exports only what something imports.** Consumers reach the
 * compound, the hook and the model through their concrete modules
 * (`./CaptureUploadStatus`, `./useCaptureUploadStatus`, `./capture-upload-model`).
 * Re-exporting the whole surface here for symmetry would add a dozen entries
 * that nothing imports, and every one lands in the knip ledger as dead code —
 * the same trap documented on `design-system/components/capture-stack/index.ts`.
 * Add a name here when a real caller needs it from this path, not before.
 *
 * Law: `.claude/rules/display/station.md` §6 (pass/fail is a card, not a toast).
 * Program: `docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`.
 */

export { CaptureUploadDock } from './CaptureUploadDock';
