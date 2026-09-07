# AG-UI validation — 20 screenshots

Every shot is the real session surface at `localhost:3050`: **chat transcript on the left, the
AG-UI artifact plane on the right**, one shot per angle of
`docs/todo/operator-reports-adversarial-VERIFY-HANDOFF.md`. Full write-up with pasted evidence:
`docs/todo/operator-reports-adversarial-VERIFY-RESULT.md`.

The only faked component is the model: `/api/assistant/chat` is answered with scripted SSE frames
because the configured gateway on `127.0.0.1:8081` never returns a completion. Everything after the
wire is shipping code — SSE parser → zod validation → `ArtifactViewPanel` → `ReportArtifact`.

`PANE` below is which door opened the artifact plane. `auto` means an arriving artifact took the
pane by itself, which is what the fix landed in this pass restored; `manual-cmd-b` would mean the
regression is back.

| Shot | Angle | Verdict | Sev | Pane | What to look at |
|---|---|---|---|---|---|
| `01-schema-fuzz.png` | 1 — Fuzz artifactReportSchema until the rendere… | **FAIL** | S4 | auto | Turn 1: a non-finite cell is refused on the panel. Turn 2: the finite boundary payload renders — duplicate keys, orphan rows, ghost totals, -0, 2^53,… |
| `02-proto-pollution.png` | 2 — Prototype pollution through row and column … | **FAIL** | S3 | auto | The prototype-key payload crashes the whole route (probe shot in evidence/); the numbered shot is the finding table. |
| `03-cell-injection.png` | 3 — Injection through cell values | **FAIL** | S1 | auto | XSS, scheme, template, ANSI, RTL-override and emoji vectors in every printed string. |
| `04-split-hijack.png` | 4 — Hijack the panel through splitToolArtifact | **FAIL** | S5 | auto | Document-sourced envelope reaching the panel with no provenance marker. |
| `05-cross-tenant.png` | 5 — Cross-tenant read through the five operator… | **PASS** | — | auto | Tenancy: org-B sentinels against an org-A context, plus model-supplied org override. |
| `06-permissions.png` | 6 — Permission escalation and downgrade on the … | **FAIL** | S2 | auto | Permission gate per report, tool advertisement, and cross-permission field leaks. |
| `07-real-schema.png` | 7 — Real-schema execution, not just parse | **FAIL** | S1 | auto | Every builder statement prepared and explained against the real schema. Panel shows the REAL live-database report; the statement audit is the turn ab… |
| `08-numeric-truth.png` | 8 — Numeric truth — money strings and the total… | **FAIL** | S1 | auto | Numeric-string abuse and the totals-reconcile property over every section. |
| `09-time-dst.png` | 9 — Time — timezone agreement, DST folds, day b… | **FAIL** | S4 | auto | Three timezones, both DST transitions, and the PT day boundary. |
| `10-scan-pairing.png` | 10 — Adversarial scan pairing — efficiency is co… | **FAIL** | S1 | auto | Scan pairing: negative handles, duplicates, interleaves and the break threshold. |
| `11-thresholds.png` | 11 — Verdict thresholds — efficiency and utiliza… | **FAIL** | S1 | auto | Threshold boundaries and the hunt for a green tile on bad data. |
| `12-recompute.png` | 12 — Independent recompute — 113 of 123 numbers … | **FAIL** | S1 | auto | Second implementation from the declared standards, diffed number by number. |
| `13-empty-zero-broken.png` | 13 — Empty vs zero vs broken | **FAIL** | S1 | auto | Turn 1 paints the zero state; turn 2 throws — does the panel still show turn 1 as current? |
| `14-prompt-injection.png` | 14 — Prompt injection through warehouse data | **PASS** | — | auto | Row text carrying instructions and wire syntax for three wires; the shot is taken after clicking the injected follow-up chip. |
| `15-hostile-model.png` | 15 — A hostile model | **FAIL** | S1 | auto | 50 render_artifact calls in one turn plus a prose answer with numbers no tool produced. |
| `16-providers.png` | 16 — Six providers, one artifact | **FAIL** | S3 | auto | Provider-agnosticism: identical artifact bytes and the mouth truth table. |
| `17-containment.png` | 17 — Break the mutation containment on purpose | **FAIL** | S2 | auto | Static import-graph walk plus a planted-probe run of the containment tripwire. |
| `18-a11y-greyscale-keyboard.png` | 18 — Read it the way the owner will | **FAIL** | S3 | auto | Greyscale + keyboard focus at 1100 px; the same DOM re-measured at 320 px in evidence/18-at-320px.png. |
| `19-definitions.png` | 19 — The definitions audit | **FAIL** | S1 | auto | Every definition against its own SQL, and the constants behind the printed standards. |
| `20-ratchets.png` | 20 — Do the ratchets bite in six months? | **FAIL** | S1 | auto | Each guard broken on purpose: which fire, which stay silent. |

## evidence/

Two observations cannot show both panes, so they live beside the numbered set:

- `evidence/02-proto-pollution-raw-crash.png` — the prototype-key payload passes zod and takes the
  **whole route** down (`Functions are not valid as a React child` → `Objects are not valid as a
  React child` → `uncaught route render error`). There is no panel and no transcript left to
  photograph; that is the finding. Numbered shot 02 is the finding table instead.
- `evidence/18-at-320px.png` — the same painted report squeezed to 320 px: the panel itself
  overflows by 119 px because the surface keeps a 520 px work column (min 360) beside it.

## Reproduce

```bash
# from the repo root, with the dev server already on :3050
npx tsx scripts/agui-validation/build-cases.ts      # 20 scripted turns → .tmp/agui-validation/cases.json
node scripts/agui-validation/shots.mjs              # → docs/todo/screenshots/ag-ui-validation
AGUI_ANGLES=2,18 node scripts/agui-validation/shots.mjs   # just those angles
```

Per-shot measurements (DOM boxes, overflow, injected scripts/handlers, bidi cells, stack depth,
axe violations, console errors) are recorded in `.tmp/agui-validation/shots-report.json`.
