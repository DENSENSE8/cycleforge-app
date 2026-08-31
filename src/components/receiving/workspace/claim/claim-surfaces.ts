/**
 * WHERE A FILED CLAIM OPENS — the one switch, shared by every station.
 *
 * ## TRANSITIONAL (operator ruling, 2026-08-30)
 *
 * The claim used to live only in the right-rail Displays Ticket leaf
 * ({@link TicketDisplayHost}); it now also renders in the centre Ticket pane
 * ({@link StationTicketPane}), which is where it is going. Opening one and not
 * the other would take the familiar surface away from the floor mid-shift, so
 * for now the Claim action lights BOTH and the operator can work in whichever
 * they reach for.
 *
 * ## The grain, so stations do not drift
 *
 * - **Open lights both.** Both start in the same Create/Link mode, so the pair
 *   never opens disagreeing.
 * - **Close closes the centre only.** The rail is the surface the floor already
 *   trusts; yanking it shut because someone dismissed the centre is the exact
 *   thing this flag exists to avoid. Unbox's `closeClaimView` set this rule and
 *   Testing matches it.
 * - **Only stations that host both surfaces pair.** Triage renders the rail
 *   Ticket leaf and no centre pane, so it is rail-only by construction and does
 *   not read this flag.
 *
 * ## This is scaffolding with an end date
 *
 * When the floor is used to the centre, delete this constant and the single
 * guarded rail-open in each station's `onOpenClaim`; the claim is then
 * centre-only. Nothing else depends on the pair — no writes fire on mount, and
 * every POST is user-triggered, so two mounted claim panels cannot double-file
 * on their own.
 *
 * NOTE: the two mounts hold INDEPENDENT drafts (own `reason`, body, claim type,
 * CC list, `idempotencyKey`). Typing in the rail does not appear in the centre.
 * Both seed from the same template, so neither is blank; the live risk is an
 * operator drafting in one and sending from the other. Accepted for the length
 * of the transition — if it runs long, lift the claim controller so both mounts
 * read one state.
 */
export const CLAIM_RENDERS_IN_BOTH = true;
