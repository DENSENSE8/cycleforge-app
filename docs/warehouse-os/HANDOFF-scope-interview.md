# HANDOFF — the scope interview

**Paste everything below the rule into a fresh session pointed at this worktree
(`.claude/worktrees/warehouse-os-refactor-8f2dc3`, branch
`claude/warehouse-os-refactor-8f2dc3`).**

Written 2026-08-24, after the omni-command composer landed (`ec0b5d13`). Its
job is not to build anything. Its job is to find out what this is *for*.

---

You are interviewing the operator to pin down the endgame of Cycle Forge.

The refactor has been running for three days and has produced a shell with no
declared destination. Every handoff in `docs/warehouse-os/` describes *how* the
screen should behave; none of them says what the finished application is, who
runs it, or what "shipped" means. You are going to extract that, ruthlessly,
and write it down as the plan of record.

**You are not here to help, agree, or design.** You are here to find the
contradictions the operator has been carrying and make them choose. If you
finish this session having written encouraging summaries of what they already
believe, you failed.

## The deliverable

One file: `docs/warehouse-os/00-endgame.md`. It is numbered `00` because it
outranks every other doc in that directory — the phases, the laws, and the
target architecture are all downstream of it, and where it contradicts them,
**it wins and you say so explicitly**.

It contains decisions, not options. Every line is either something the operator
committed to, something they explicitly refused, or something flagged as a
genuine unknown with a way to find out. Nothing else goes in it.

## Ground yourself first — do this before the first question

Twenty minutes, no questions asked yet. The first question must already be
sharp; a naive opener wastes the operator's patience and teaches them you
haven't read anything.

```bash
git log --oneline -12
find src/app -name 'page.tsx' | sort            # the surviving UI
find src/app/api -name 'route.ts' | wc -l       # the surviving backend
ls src/lib/assistant/ src/lib/sessions/
grep -rn "lib/assistant" src/shell/             # returns nothing. that matters
```

Then read, in this order:

1. `docs/warehouse-os/README.md` and `04-roadmap.md` — the claimed plan
2. `docs/warehouse-os/HANDOFF-ai-centre.md` — the current thesis, and the
   "Fight this brief" section at the end
3. `docs/warehouse-os/HANDOFF-ux-fighting.md` — **how the operator has asked
   to be argued with. Obey it.**
4. `LAWS.md` — skim for the T-, S-, I- and X- rows you'll need to cite
5. `src/shell/useShell.ts` and `src/shell/AssistantFeed.tsx` — what actually
   runs today

## The three facts that frame everything

Verified 2026-08-24. Lead with these; they reframe the conversation before it
starts, and they are the reason this interview exists.

**1 · The UI was deleted. The backend was not.**
`main` has 142 `page.tsx` files. This worktree has **14**, and all of them are
chromeless — the GS1/short-link resolvers, `/signin`, `/signup`, `/invite`,
`/offline`, `/not-authorized`. Every operator surface (`/dashboard`, `/unbox`,
`/triage`, `/receiving`, `/repair`, `/pickup`, `/m/*`, `/kiosk*`) is gone from
this branch. Meanwhile **939 API routes survive untouched**, plus the whole
domain layer beneath them.

So the refactor's real shape is: *a new front end, ~1% built, in front of a
backend that is ~100% intact and now almost entirely unreachable.* Nobody has
written down which of those 939 routes the shell is ever meant to reach again.
That is the central scoping question and most of the interview orbits it.

**2 · The AI centre has a working brain that has never been plugged in.**
`src/lib/assistant/agent-loop.ts` is real: `@anthropic-ai/sdk`, a tool loop, a
mutation gate, trust stats, an `/api/assistant/chat` route. **`src/shell/`
does not import any of it.** The feed answers every message with one hardcoded
string (`FEED_STARTER_REPLY` in `model.ts`) and two starter buttons. The entire
"the assistant IS the surface" thesis currently renders a canned reply.
(Note also: the loop pins `ASSISTANT_MODEL = 'claude-opus-4-8'`, which is stale
— but do not let a model-id detail eat the session.)

**3 · Blocks of time do not survive a refresh.**
`SessionBlock` is documented as the UI twin of `work_session_intervals`, and
line items as the twin of `ops_events`. Both durable layers exist
(`src/lib/sessions/*`, `src/lib/ops-events.ts`). **The shell writes to neither.**
"Scrolling up is scrolling back in time" is true only until the tab reloads.

## Interview rules — follow these exactly

- **One question per message. Never a list.** A batch of four questions gets
  you one vague answer to the easiest one. Ask, wait, react.
- **Never accept an abstraction.** "Faster", "cleaner", "better UX", "more
  intuitive" are not answers. Convert every answer into something observable:
  a number, a name, a date, a role, a table, a dollar figure, a count of
  people. If they say "faster", ask *faster than what, measured how, and what
  is the current number*.
- **Play back every answer as a falsifiable claim** before moving on: "So:
  three packers, one shift, and if the shell is down they cannot ship —
  correct?" Let them correct you. This is where the real answer usually shows
  up.
- **Verify claims against the code, and report when they're wrong.** You have
  the repo. If they say "nobody uses the mobile routes any more", go check
  what still references them and come back with what you found. An interview
  that never contradicts the interviewee is a transcript, not an interview.
- **Name contradictions the moment they appear**, quoting both sides. "Ten
  minutes ago native was the product; that answer needs the web build. Which
  one is wrong?"
- **Force cuts, because priority is only revealed by sacrifice.** "If you ship
  exactly one of these in ninety days and the others slip to next year, which
  ships?" Ask this repeatedly. Refuse "both".
- **Separate four things and label them out loud**: already decided · what you
  want · what the business needs · what you're assuming but have never tested.
  Most stated requirements are the fourth kind.
- **Apply X3 to the operator themselves.** The repo's own law says no assertion
  without evidence. When they assert a user behaviour ("the packers will love
  the chat"), ask what they've observed. If nothing, it is an experiment, not
  a requirement, and it gets recorded as one.
- **Do not propose solutions.** No architecture, no "we could just", no
  offering options to be polite. If they ask what you'd do, answer in one
  sentence and return to the question.
- **When a decision is made, write it down and never reopen it.** Say "logged"
  and move on. Re-litigating is how these sessions die at question nine.
- **Let them park anything**, once, with a reason. Parked items go in the
  artifact as open experiments, not as decisions.

Budget roughly 25–35 questions. If the operator goes quiet or terse, you are
probably asking about something they haven't thought about — say so plainly
and offer to park it rather than grinding.

## The fault lines — your ammunition

Do not walk these in order like a checklist. They are the places where the
project currently contradicts itself; steer toward whichever one the current
answer exposes.

**A · The business, before the software.** What does this company physically
do, end to end, and where does the money get made? The fixtures say
refurbished consumer electronics (Bose, Sony, Apple) resold across eBay,
Amazon, Walmart, Ecwid, with receiving, testing, grading, packing and
shipping. Confirm it, then find the bottleneck — the step where hours or
margin actually leak. **If the shell does not attack that step, it is
decoration.** Get them to name the step.

**B · Who is at the keyboard, physically.** The design scenario is one-handed
while holding a phone to your ear. The performance manifest calls desk
workbenches LAN workstations. There is a kiosk form factor and a wedge
scanner. How many humans, in what roles, on what shifts, on which devices?
A shell tuned for a one-handed phone call and a shell tuned for a two-monitor
LAN desk are different products.

**C · The 939 orphaned routes.** Of the backend that survived, what does the
shell need to reach for v1 — and what is being abandoned on purpose? Push for
an explicit non-goals list with names on it. Dead code that nobody has
declared dead will be maintained forever by accident.

**D · The 142 deleted pages.** Were they deleted because they were wrong, or
because the shell will re-express them? If `/dashboard` and `/triage` come
back as right-panel detail, that is months of work nobody has scheduled. If
they don't come back, say which workflows die with them and who is affected.

**E · Is the assistant real?** This is the highest-stakes question in the
session. If the AI centre is a genuine model loop: what may it do without
asking (T28 says reads free, writes gated — but which writes?), what is the
latency budget for a warehouse worker mid-scan, what happens when the network
is down in a metal building, and who pays per token per shift? If it is really
a command palette that looks like a chat, say that out loud — it is a
defensible product and it costs a tenth as much to build. **What it cannot
stay is undecided**, because the entire shell is shaped around the answer.

**F · Persistence, or the honesty of the chronology.** Is a session block that
evaporates on refresh acceptable for v1? If the shift's record is the point,
the durable write is not a later phase, it is the feature.

**G · One warehouse or a product to sell.** RLS, per-org OAuth vaults, a QA
sandbox tenant, tenancy guards in CI. That is SaaS scaffolding. Is anyone
outside this building ever going to log in? If no, a great deal of complexity
is being paid for and should be named as deliberate insurance. If yes, ask who
the second customer is and whether they've been spoken to.

**H · Native versus web.** T30/T31 say native is the product; an AppImage
exists. There is also a Vercel deploy, a Lighthouse budget with an LCP target,
and a tunnel for phone testing. Three delivery mechanisms, one team. Which one
does a real operator open on a real Tuesday?

**I · What "done" means, with a date.** All GitHub Actions workflows were
deleted (`2f6dcd78`); the only gate is a local hook, and three unit suites are
currently red from the deletions. Lighthouse ≥90 is a stated target while LCP
sits at 5.9–12.3s. What is the actual gate for putting this in front of a
human being, and when? If there is no date, ask what the forcing function is
— and if there isn't one, that is itself the finding.

**J · The AI's write authority.** Concretely: it may print a label, set a
grade, message a buyer, issue a refund, change a price — every verb (operator
ruling 2026-09-26: approval-first by default, per-automation auto-approve).
Walk the list one verb at a time and get, for each, who the named approver is
and whether the org wants it on auto-approve. "Gated" is not an answer; who
approves, and how long do they have before the customer notices?

## The artifact

Write `docs/warehouse-os/00-endgame.md` with exactly these sections. Keep the
operator's own words where they were vivid; do not launder them into
consultant prose.

1. **The endgame, in one sentence.** Their words. If you cannot get one
   sentence, the interview is not finished.
2. **The business, and the bottleneck this software attacks.**
3. **The users** — roles, counts, shifts, devices, tolerance for change.
4. **The product shape** — native/web/mobile/kiosk, single-tenant or SaaS,
   each with the reason.
5. **The assistant's job and its approvals** — the verb-by-verb write list:
   named approver per verb, and which verbs the org sets to auto-approve
   (operator ruling 2026-09-26: approval-first, AI may perform any verb).
6. **What the shell must reach** — the routes and domain modules in v1 scope.
7. **Non-goals, dated and named** — what is abandoned, and what dies with it.
8. **The v1 ship gate** — observable, with a date and a forcing function.
9. **Open experiments** — the honest unknowns, each with how you'd find out.
10. **Contradictions this file creates** — every line in `LAWS.md`,
    `04-roadmap.md`, `02-target-architecture.md` or a `HANDOFF-*.md` that is
    now wrong, quoted, with what it should say instead. Do not silently edit
    those files in this session; list them and let the operator schedule it.

## What not to do

- Do not write code, refactor anything, or start a phase.
- Do not start, restart, or kill a dev server. `:3050` and `:3051` are the
  operator's. A dead server is a report.
- Do not commit. Write the artifact and stop.
- Do not reconstruct the deleted house-law corpus, and do not add new laws.
  This file produces a destination, not doctrine.
- Do not soften a finding to be agreeable. The operator asked to be
  interviewed ruthlessly; the failure mode they are trying to avoid is another
  three days of beautifully-built screen with no declared purpose.
