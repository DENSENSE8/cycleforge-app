# Spec loop — operator guide

The loop's core is the Garisek spec kernel (Garisek-OS `docs/loops/SPEC-KERNEL.md`, `AUTORESEARCH.md`);
this repo is its pack (`tools/spec-loop/pack.mjs`). No model decides pass/fail: rules (each 1/0, with
frozen shrink-only debt) score the repo; the hidden exam scores the agent system. You decide only at
three checkpoints — accept a rule, grant an exception, apply a patch — on concrete evidence.

## 1. Reject what you see → a rule

```
pnpm spec:reject -- --words "<what you said, verbatim>" --url /repair [--files a,b] [--commit <sha> | --working] [--by <who>]
```

- `--url`: screenshotted at `:3050` into `.garisek/spec/rejections/<ts>.png` when the lane answers
  (lane down → a notice, the rejection is recorded without it).
- `--commit` (default HEAD) judges committed content; `--working` snapshots the current files
  (`--files` required). The words are kept verbatim; re-rejecting the same thing updates one item.
- Prints the `rule-proposal` queue id.

```
pnpm spec:propose <queueId>                      # a drafter writes the probe; the kernel machine-checks it
node scripts/spec.mjs queue show <queueId>       # words, interpretation, violations in what you rejected, HEAD debt, plant
node scripts/spec.mjs queue decide <queueId> --by <who> --words "<why>" --outcome accepted|rejected
```

Answer one question at `show`: *is that the thing I hated, and is that its reach?* A draft that fails
the machine check (evidence, plant, determinism, bounded) is never shown; it stays `check-failed` —
rewrite the words or draft by hand. `accepted` installs it into
`tools/spec-loop/rules/accepted/<ruleId>/` (`rule.mjs`, `ruling.json`, shrink-only `baseline.json`,
`evidence/`); `contracts.mjs` / `mutants.mjs` pick it up on the next sweep. Fix its frozen debt with
`pnpm spec:loop --debt contract:<ruleId>`. `rejected` records why — evidence for the next draft.

## 2. Grant an exception (human only)

```
node scripts/spec.mjs except --rule <id> --files 'glob,glob' --by <who> --words "<verbatim>" \
  --review-by YYYY-MM-DD --exit "<what ends it>"
```

Writes `tools/spec-loop/exceptions.json`. A live exception downgrades matching findings to advisory;
after `reviewBy` it stops masking, an `exception-expired` finding appears and a review gap is queued.
Workers can only propose an exception (as a gap). Registered today: A2 mobile and A3 CSV staging
(`layout.sidebar-owns-table-controls`, review 2026-11-04). Baselined debt is not an exception.

## 3. The hidden exam (agent system, not the repo)

```
pnpm spec:exam --admit                                     # each job: base fails, good passes, bad fails, twice
pnpm spec:exam --run [--jobs a,b] [--brief on|off] [--guards on|off] [--writer <model>] [--harness <h>]
pnpm spec:exam --history                                   # score, brief sha, taker, examVersion
```

Jobs live in `tools/spec-loop/exam/<id>/` and are never copied into a worker or exam sandbox. The domain
brief (`docs/loops/DOMAIN-BRIEF.md`) goes into every work order; an edit to it is kept only if the
exam score rises on the same `examVersion` (compare `--brief off` vs `--brief on`). Harness failures
are `no_data`, never pass or fail.

## 4. Where receipts live

| What | Where |
|---|---|
| Sweep receipts | `.garisek/spec/{static,live,full}/<ts>.json` |
| Queue (proposals, gaps, held patches) | `.garisek/spec/queue/` |
| Rejection evidence (screenshots, `--working` snapshots) | `.garisek/spec/rejections/` |
| Loop runs | `.garisek/spec/runs/` |
| Exam receipts | `.garisek/spec/exam/<id>.json` |
| Accepted rules (evaluator, committed) | `tools/spec-loop/rules/accepted/<ruleId>/` |
| Exceptions (evaluator, committed) | `tools/spec-loop/exceptions.json` |
| Spend | `.garisek/spec/spend.jsonl` |

Everything under `tools/spec-loop/**` and `docs/loops/**` is evaluator or brief: workers may not edit
it; a changed evaluator is reported `anchor-changed` and never auto-kept.
