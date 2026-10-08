# PROMPT — Label peek: always reachable + close button; label-face vs display names for platform / type (2026-10-08)

Paste this whole file as the first message of a fresh session in `~/Projects/cycleforge-lanes/prod`.

Read first: `docs/handoff/HANDOFF-qc-fnsku-pair-2026-10-08.md`, ruling 6. That ruling is the state this session left. Other sessions edit this worktree too: re-read each file just before you edit it, and never revert work you didn't do.

## Lane rules (AGENTS.md — binding)

- Test only at `http://localhost:3050`. Never start, restart or stop a `cycleforge-lane@…` unit, and never run `next dev`.
- On 2026-10-08 the lane was `inactive (dead)` (stopped by the operator at 22:57). If it is still down, finish the code and report. Do not start it.
- Migration `src/lib/migrations/2026-10-08_fba_fnskus_paired_condition_grade.sql` is **written, not applied**. Until the operator applies it with `/db-migrate`, `/api/qc/fnsku-candidates` and `/api/qc/fnsku-pair` will error, because both read that column. Ask before applying it. Do not edit the file once it has been applied.

## What exists now (built 2026-10-08, lint + typecheck green, not yet smoked on the lane)

- `src/components/station/label-peek/StationLabelPeek.tsx`:
  - a `Tag` IconButton positioned `absolute right-full top-1.5` (in the gutter left of the composer outline);
  - a spring-animated `Panel` at `absolute bottom-full left-0 origin-bottom-left`;
  - it opens when `signal` changes, hides `LABEL_PEEK_IDLE_MS = 4000` after the last edit, stays while the pointer or focus is inside, and the icon toggles `pinned`;
  - Esc closes it;
  - children are a render prop, `({ reveal }) => …`.
- It mounts through the `labelPeek` slot on `StationComposerHost` (`src/components/composer/StationComposerHost.tsx`, inside a `relative min-w-0` box around `OmnichannelComposerDock`), passed through `WorkspaceNotesCard` → `LineNotesCard`. Both stations use it:
  - **Quality control:** `src/components/tech/TestingPanel.tsx` (`testId="testing-label-peek"`). The signal is made of the note, `activeGrade`, the label kind, the active slot and `labelEditorRequestId`.
  - **Unbox:** `src/components/receiving/workspace/LineEditPanel.tsx` (`testId="unbox-label-peek"`).
  - Both render `UnboxLabelPreview` inside the peek. The inline Label band (QC) and the context-bar label bubble (Unbox) were removed.

## Ask 1 — the label must be reachable at all times

Operator, 2026-10-08: "There must be an X button top right and I must be able to always bring up the label no matter what. There must be a button above the composer that's just a label button to bring up a preview of the label so I'm able to preview it at any time."

1. **An X close button at the peek panel's top-right.** Use the house `IconButton` with the X glyph from `@/components/Icons`. Check the close-button primitive with `ds_contract 'close button'`; do not hand-roll one. X unpins and closes the panel, the same as Esc.
2. **A labelled Label button above the composer**, always visible on both stations, that opens the preview at any time:
   - it pins the peek open, and pressing it again closes it;
   - it replaces the bare gutter icon as the primary way in. Decide whether the gutter icon stays as a second entry point, or the button takes over its position at the composer's top-left — the label should still grow from that spot;
   - why: today the icon is a small `size="sm"` glyph in a 24 px gutter, which reads as decoration.
3. **"No matter what":** the button must work:
   - before any edit;
   - with no serial scanned;
   - in Ticket composer mode as well as note mode;
   - while the Pair FNSKU dropdown is open;
   - on lines with no SKU — show what can be drawn (the carton label), or one sentence explaining why nothing can be drawn. Never a dead button.

   Check that `UnboxLabelPreview` renders inside the peek in each of these cases. It returns `null` when `options.length === 0`. In that case the panel must still open and say why, never as an empty white box.
4. **Keyboard:** if you add a shortcut, run it through the same `createScanFieldLetterKey` mechanics as `useTestingPrimaryAction`. Keys already taken on `/test`: P, T, F, K, 1–7, Enter. Never paint keys inline; the lint rule `cf-keys/no-raw-kbd` forbids it. Use the HoverTooltip `shortcut` instead.
5. **Motion:** keep the pop from the composer's top-left (operator-approved). The X and the Label button must not move the panel while it animates.

## Ask 2 — systemic: separate label-face words from display names for platform and type

Operator, 2026-10-08: "the labels and the platforms and the types should have a small label, small text variant just for it being on a label and the actual name of the type and the platform. For example, return is rtr but it should say return when you are viewing the type and the platform."

The problem: the short codes printed on a 2×1 sticker (for example `RTR` for Return) are leaking into on-screen pickers, pills and menus. On screen, the full name should show ("Return").

1. **Find the source.** The tiny printed form comes from the platform / type catalog. Start with:
   - `usePlatformCatalog`, `useReceivingTypeCatalog`, `usePlatformTypeRules` in `src/hooks/useCatalog`;
   - `src/lib/source-platform.ts` (`SOURCE_PLATFORMS`, `sourcePlatformMeta`);
   - `src/lib/receiving/platform-type-rules.ts`;
   - `src/components/labels/LabelPlatformTypeMenu.tsx`;
   - `src/components/labels/LabelFaceReceivingSlots.tsx`;
   - `src/components/receiving/workspace/line-edit/classify-pill-options` (`catalogIdentityDot`);
   - the carton face in `src/lib/print/workspace-label-kinds.ts` → `workspaceLabelToFace`.

   A plain text grep for `rtr` found nothing, so the code is probably catalog data or a derived abbreviation. Find out which and record it.
2. **Model it once:**
   - every platform and type carries both a `label` (the display name: "Return", "eBay") and a `labelFace` (the sticker word: "RTR");
   - follow the existing pattern in `src/lib/conditions.ts`, `CONDITION_LABELS` (`full` / `label` / `pill` / `table` variants) — the house already solves this for condition grades;
   - store the sticker word where the catalog lives. If that is a DB column, write a migration with the `db-migration-author` skill and ask before applying it. Otherwise use a code map;
   - one source of truth: no second abbreviation table.
3. **Use it everywhere:**
   - printed stickers and on-screen label previews (`LabelFacePreview` / `WorkspaceLabelPreviewCard`, the print path) use `labelFace`;
   - every picker, pill, menu, chip, sidebar facet and record field uses the display `label`. That includes the classify pills on the Unbox / QC header (`CartonContextCard` classify cluster), `LabelPlatformTypeMenu` rows and Edit colours (catalog manager);
   - go through the call sites with LSP references — do not text-replace.
4. **Guard:** add a check so this cannot come back. A unit test is enough: render the classify pill and the menu row for Return, and assert "Return" shows, never "RTR". If a cheap source-law gate fits better, use the `add-guard` skill.
5. Run `ds_critique` on every UI file you touch, and check the vocabulary with `ds_vocabulary`.

## Acceptance

- On `:3050` (when the lane is up), on `/test` and Unbox:
  - the Label button is visible above the composer and opens the preview in every state listed in Ask 1.3;
  - X closes the preview;
  - an edit still pops the preview and it hides 4 s after the last edit;
  - Playwright screenshots in `/tmp/label-peek-v2/`.
- The Type picker, classify pill and menus read "Return" (not "RTR"), and the same for every platform and type. The printed / preview sticker still reads the short face word.
- `pnpm verify:fast` is green, except the Boundary gate's one known crossing from another session (`src/components/mobile/v2/MobileV2TopBar.tsx => src/components/sidebar/master-nav/StaffAccountFooter.tsx`). Don't fix that crossing.
- Update `docs/handoff/HANDOFF-qc-fnsku-pair-2026-10-08.md` with a ruling 7.

## Smoke scripts already written

- `/tmp/qc-fnsku-pair/probe-peek.mjs`. Needs the lane up and the migration applied. It checks:
  - the inline Label band is gone;
  - the condition row sits above the verdicts;
  - the peek opens on an edit and hides after the idle time;
  - key `5` re-grades the unit;
  - `K` opens the dropdown, then `K` again pairs and prints.

  It writes one re-grade, which must be restored, and one FNSKU pairing. Extend it for the Label button and the X.
