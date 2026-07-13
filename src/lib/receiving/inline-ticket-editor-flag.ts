/**
 * inline-ticket-editor-flag — client-safe rollout flag for the unbox pane's
 * inline support-ticket editor (docs/todo/receiving-inline-ticket-editor-plan.md).
 *
 * Lives outside `src/lib/feature-flags.ts` (server-only, imports the DB pool)
 * because the reply-toggle button + body swap are client components. A
 * `NEXT_PUBLIC_*` env is inlined into the client bundle at build time, so a
 * static read resolves in the browser — mirrors `operations-history-flags.ts`.
 *
 * Default **OFF** — ships dark. Set `NEXT_PUBLIC_RECEIVING_INLINE_TICKET_EDITOR`
 * to `1` / `true` / `on` to enable (for USAV first). Flag-off tenants render the
 * pre-existing carton chip cluster and body untouched.
 */
export function isReceivingInlineTicketEditorEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_RECEIVING_INLINE_TICKET_EDITOR ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}
