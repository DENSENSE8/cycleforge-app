/** The overwrite rule for `ThreadComposerBridge.setDraft`. */

export type ComposerDraftMode = 'public' | 'internal';

type SeedDraftOutcome = 'applied' | 'declined' | 'noop';

interface SeedComposerDraftInput {
  /** What the composer holds right now. */
  currentBody: string;
  /** The drafted text to insert. */
  text: string;
  /** Sets the public/internal toggle so a draft cannot land in the wrong lane. */
  mode?: ComposerDraftMode;
  applyBody: (text: string) => void;
  /** Omitted by a composer with no visibility toggle (entity threads have one). */
  applyMode?: (isPublic: boolean) => void;
  /**
   * Asks the operator before replacing their own text. Injected so this is
   * unit-testable with zero UI; production passes `requestConfirm`.
   */
  confirm: (message: { title: string; description: string; confirmLabel: string; cancelLabel: string }) => Promise<boolean>;
  /** Called only after the draft actually lands. */
  onApplied?: () => void;
}

export async function seedComposerDraft({
  currentBody,
  text,
  mode,
  applyBody,
  applyMode,
  confirm,
  onApplied,
}: SeedComposerDraftInput): Promise<SeedDraftOutcome> {
  const next = text.trim();
  // Nothing to insert. Silently doing nothing beats clearing the agent's box.
  if (!next) return 'noop';

  const hasDraft = currentBody.trim().length > 0;
  if (hasDraft && currentBody.trim() !== next) {
    const ok = await confirm({
      title: 'Replace your draft?',
      description:
        'Your composer already has text in it. Inserting this draft will replace what you typed.',
      confirmLabel: 'Replace',
      cancelLabel: 'Keep mine',
    });
    if (!ok) return 'declined';
  }

  applyBody(next);
  if (mode && applyMode) applyMode(mode === 'public');
  onApplied?.();
  return 'applied';
}
