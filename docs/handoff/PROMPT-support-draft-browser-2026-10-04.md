# PROMPT — Draft with AI: browser proof, nothing posted (2026-10-04)

Paste this whole file as the first message of a fresh session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. You are the tester.
Do not edit product code. Do not plan a redesign. Do not post, send, assign,
or change a ticket.

Dev origin `http://localhost:3050` only. Lane unit `cycleforge-lane@prod`.
Another session may be editing the tree — do not revert what you did not
write, never `git stash`, never commit. If `:3050` is dead or returns `503`
with `x-switch-error`, start the lane
(`systemctl --user start cycleforge-lane@prod`) and retry. Never bind another
port. Never run `next dev`. Never move `PW_BASE_URL`.

## What you are proving

Phase 1 of Support drafting is already in the tree. A staffer clicks
**Draft with AI** in the ticket composer. The server reads the mirrored
thread itself and either fills the **Public** composer with a draft, or
refuses and leaves the composer alone. A person always sends. You are
confirming that, in a real browser, on the four tickets below.

Done is not a unit test, a 200 from curl, or a button that is painted.
Done is each row in **Cases**, driven in the browser, with the network
row, the composer text, a screenshot, and proof that no comment was posted.

## Hard rules

1. The only ticket-page click is **Draft with AI**
   (`[data-testid="composer-draft-with-ai"]` on the desk,
   `[data-testid="mobile-composer-draft-with-ai"]` on the phone).
   Dismiss a toast. Click **Keep mine** if a confirm appears. That is all.
2. Never click **Send reply**, **Add note**, **Update ticket**, a station
   terminal action, status, priority, or assign. Never press Enter in the
   composer — Enter commits. Never press Shift+Enter either.
3. Never `POST` a comment. After each case, the network log must show
   **zero** requests to `/api/zendesk/tickets/*/comments` and zero other
   send/reply writes. `POST /api/support/suggest` is the only write you
   may cause, and it does not post.
4. If the composer already has text when the page loads, do not draft over
   it. Select-all and Backspace (not Enter) to clear it, then click Draft
   with AI. If **Replace your draft?** appears anyway, click **Keep mine**
   and fail that case as "composer was not empty".
5. After you have screenshotted a successful draft, clear the textarea the
   same way (select-all, Backspace). Leave every composer empty. Confirm
   the field is empty before you navigate away.
6. Do not type a customer-visible reply. Do not add an internal note, even
   on #10092.
7. If the session is signed out, load `tests/.auth/admin.json` into the
   browser and reload. Do not invent credentials. If that file does not
   sign you in, stop and say so.

## How to drive the browser

Use the session browser against `http://localhost:3050`. Desk viewport is
the default desktop width. Phone viewport is exactly **390×844** for #9995.

Wait for the testid. Do not invent a click path through the queue. The
URLs below open the ticket.

Watch `POST /api/support/suggest` on each click. Record status, `reason`
when present, and wall time from the click until either the composer text
changes or the error toast is visible. Expect about 2 seconds. Under 8
seconds is a speed pass. Over 20 seconds is a speed fail even if a draft
eventually appears — that was the old "thinking" hang (~52 s). Do not
kill the wait before 25 seconds.

## Cases

| # | Open | Expect |
| --- | --- | --- |
| 9942 | `http://localhost:3050/support?ticket=9942` | Staff-logged repair. `POST /api/support/suggest` **200**. Non-empty draft appears in the Public composer (`mode` forced public; the Internal\|Public toggle reads Public). Toast is not an error. |
| 10092 | `http://localhost:3050/support?ticket=10092` | QA receiving claim. **422** `operations_ticket`. Toast text is exactly: `This is an operations ticket (receiving claim, vendor or trade-in) — not a customer conversation.` Composer stays empty. |
| 9995 | `http://localhost:3050/m/t/9995` at 390×844 | Customer wrote in. **200**. Draft appears in the field whose aria-label is `Public reply`. The Draft with AI control (`[data-testid="mobile-composer-draft-with-ai"]`, aria-label `Draft with AI`) measures **at least 44×44**. Record the measured box. |
| 9996 | `http://localhost:3050/support?ticket=9996` | Trade-in, no support tag. **422** `no_customer_message`. Toast text is exactly: `No customer message on this ticket and it is not tagged as customer support — there is nothing to answer.` Composer stays empty. |

Screenshot each case after the draft or the toast, before you clear the
field. Save them under `/tmp/support-draft-e2e/` as
`9942-desk.png`, `10092-refuse.png`, `9995-phone.png`, `9996-refuse.png`.

On 9942 and 9995, also record the first 240 characters of the draft and
whether it is a customer reply (not an internal note, not a signature
block, not a placeholder like `[name]`). Do not judge tone beyond that.
An invented weekday is a note, not a fail — staff review is the gate.

## Report

Return this table, filled from what you observed. Unobserved cells stay
blank. Do not invent a status code or a screenshot you did not take.

| Ticket | URL | HTTP | reason | ms | Composer | Button box | Comment POSTs | Shot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9942 | | | | | | | | |
| 10092 | | | | | | | | |
| 9995 | | | | | | | | |
| 9996 | | | | | | | | |

Then one line: pass or fail, and the first failing check if any. Do not
fix a failure. Do not start the next Support phase.

## Out of scope

Do not build retrieval, saved views, eBay messaging, auto-send, or a
migration. `rag_documents` and `rag_document_chunks` are empty; do not
touch them. Future SQL is not yours to apply. Dark mode is not this pass.
