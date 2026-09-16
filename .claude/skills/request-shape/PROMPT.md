# Reusable prompts — request-shape audit

Copy one of these, swap `<ROUTE>`, paste into a fresh session. The
[`request-shape`](SKILL.md) skill carries the method; these carry the *task*:
what to point it at, what the deliverable is, and where to stop and ask.

Candidate routes (the data-heavy workbenches named in `AGENTS.md`):
`/dashboard` · `/unbox` · `/triage` · `/search` · `/test` · `/incoming` ·
`/packer` · `/receiving/history` · `/m/receive` · `/m/scan` · `/m/home`

---

## A · Audit only — identify, change nothing

> Run a request-shape audit on `<ROUTE>`. **Do not implement anything** — this is
> the audit and the plan.
>
> Use the `request-shape` skill. It has the harness (`npm run perf:requests`),
> the four axes, the fix catalog, the RSC-seed gate, and the suspects already
> ruled out on this codebase. Don't re-derive those.
>
> Scope is the **number and critical-path weight** of the requests `<ROUTE>`
> fires. Not bundle weight — that hunt is closed. Not query cost — if one
> request is slow, name it and hand it back rather than consolidating around it.
>
> Measure a **production build** on an isolated distDir and a throwaway port —
> the ONE measurement exception to the `:3050`-only rule. `:3050` is the single
> app origin and it is mine: attach, never restart, never build into the
> `.next` it owns, and never probe a lane port instead.
>
> Deliver a ranked list, highest (requests removed × ms saved) ÷ risk first.
> For each item:
> - what fires today — file:line, request shape, what triggers it
> - which of the four axes it costs on (depth / width / redundancy / poll-vs-push)
> - what it should become, and why the other catalog techniques don't apply
> - requests and bytes removed, ms off the critical path — measured, not guessed
> - what existing behaviour it must not break, named specifically (the test, the
>   optimistic-update contract, the cold-reload seed)
>
> Then tell me, separately: which suspects you checked and **cleared**, and
> anything out of scope you tripped over.

---

## B · Audit and land it — the full loop

> Run a request-shape audit on `<ROUTE>` and land the fixes.
>
> Use the `request-shape` skill — harness, fix catalog, ruled-out suspects,
> seed gate. Don't re-derive them.
>
> Scope: the number and critical-path weight of the requests `<ROUTE>` fires.
> Not bundle weight (closed). Not query cost — report it, don't fix it.
>
> **How to work:**
> 1. Measure a production build on an isolated distDir + throwaway port. `:3050`
>    stays the only app origin — never touch it, never probe a lane port.
> 2. Classify every finding against the four axes *before* proposing a fix.
>    Read the second focus cycle first — anything firing there ignores its own
>    `staleTime`.
> 3. Prove each attribution. Name the file:line, then **re-measure after the fix
>    and confirm the count actually moved**. A caller that exists is not a
>    caller that fired.
> 4. Land them one at a time, `npm run verify` green each time.
> 5. Re-measure at the end against a fresh build; report before/after from the
>    two JSON baselines.
>
> **What I want back:**
> - Before/after numbers for cold load and both focus cycles.
> - Per item: what it bought, measured.
> - **Lead with anything that under-delivered against your own prediction.**
> - Anything that removed nothing, or that you couldn't attribute — say so
>   plainly rather than describing the change as if it worked.
> - Anything you deferred, and why the scope turned out bigger than it looked.
> - Anything out of scope you found — slow queries, wrong `total` semantics,
>   broken badges. Name them, don't fix them.
>
> **Stop and ask me if** a fix needs a migration, touches tenancy/RLS or
> `orgId` threading, changes an optimistic-update or undo contract, or the
> RSC-seed gate fails. Don't commit or push unless I ask.

---

## C · Sweep — several routes, triage first

> Capture request shape for `/dashboard`, `/unbox`, `/triage`, `/search` and
> `/test` in one pass (`request-shape` skill, one production build, one server).
>
> Don't fix anything yet. Give me a single table ranked by total waste:
> route · requests · bytes · peak concurrency · duplicate requests · count
> probes · focus-cycle-2 cost.
>
> Then tell me which **one** route to spend a session on and why — the biggest
> (requests removed × ms saved) ÷ risk, not the biggest raw number. Call out
> any finding that repeats across routes, because that's a shared hook or a
> global default and it's worth more than any per-route fix.

---

## Why these read the way they do

Each instruction below exists because its absence cost a session:

| Line | What went wrong without it |
|---|---|
| "production build" | Dev StrictMode double-invokes effects; the redundancy column was fiction. |
| "re-measure and confirm the count moved" | A fix shipped against a caller that never fired, and removed nothing. |
| "lead with what under-delivered" | `count_only` was projected to remove ~3.5s and ~5.8s; it removed about half. |
| "name it and hand it back" | The real remaining number on `/triage` is a query taking 1.8–3.6s to return 15 rows. No consolidation fixes that. |
| "the seed gate" | A blocking 3.6s seed is strictly worse than a non-blocking 3.6s fetch. |
| "never touch `:3050`", "never probe a lane port" | A plain `pnpm build` clobbers the `.next` the operator's dev server owns; and a lane-port probe skips the switchboard's cookie scoping, so it tests a namespace the operator's browser never sees. |
