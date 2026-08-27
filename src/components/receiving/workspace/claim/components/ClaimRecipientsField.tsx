import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { CcEmailField } from './CcEmailField';

interface Props {
  notePublic: boolean;
  onNotePublicChange: (v: boolean) => void;
  ccEmails: string[];
  onCcEmailsChange: (emails: string[]) => void;
  /**
   * Consequence line under the toggle when public. Claim compose owns the
   * default; Send-photos can pass a shorter consequence.
   */
  publicHint?: string;
  /** Consequence line when internal (default matches claim compose). */
  internalHint?: string;
}

const DEFAULT_PUBLIC_HINT =
  'Public reply — emails CC. Photos attach.';
const DEFAULT_INTERNAL_HINT = 'Internal · not emailed';

/**
 * Recipients control — choose whether the Zendesk comment is a private internal
 * note (default) or a public reply, and CC collaborator emails when public.
 *
 * Shared by claim compose and Send-photos. Reuses {@link VisibilityToggle} with
 * `appearance="flush"` (square, no pad) so every ticket surface paints the same
 * Internal note · Public + CC instrument.
 *
 * Sheet-band: flat hairline section — no nested rounded card.
 */
export function ClaimRecipientsField({
  notePublic,
  onNotePublicChange,
  ccEmails,
  onCcEmailsChange,
  publicHint = DEFAULT_PUBLIC_HINT,
  internalHint = DEFAULT_INTERNAL_HINT,
}: Props) {
  return (
    <section className="space-y-0 border-t border-border-hairline px-0">
      <div className="flex items-center justify-between gap-0 py-0 pl-3 pr-0">
        <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">Recipients</p>
        <VisibilityToggle
          appearance="flush"
          value={notePublic}
          onChange={onNotePublicChange}
          internalLabel="Internal note"
          publicLabel="Public + CC"
          className="shrink-0 border-y-0 border-r-0"
        />
      </div>

      {notePublic ? (
        <>
          <div className="px-3">
            <CcEmailField
              emails={ccEmails}
              onChange={onCcEmailsChange}
              placeholder="Add vendor / teammate email to CC…"
            />
          </div>
          <p className="px-3 py-1 text-role-micro font-medium text-blue-700">{publicHint}</p>
        </>
      ) : (
        <p className="px-3 py-1 text-role-micro font-medium text-text-faint">{internalHint}</p>
      )}
    </section>
  );
}
