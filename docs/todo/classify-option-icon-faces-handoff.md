# Classify option icon faces — deferred handoff

**Status:** later · **WS-UNBOX** · **Shipped first:** carton banner identity faces only

## Done now (icon-first banner)

- Collapsed Urgency / Platform / Type on the **carton bookmark** (`CartonContextCard`) are **icon + name** identity pills (`collapsedFace="iconLabel"`) — platform `PlatformMark`, type `ReceivingTypeMark`, urgency flag + heat tone — not dimension glyphs (Flag/Globe/Tag).
- Classify tab accordion uses `grid-template-rows` (no AnimatePresence exit stack) so open→open row switches don't jump.
- Shared builders: `classify-pill-options.tsx` + SoT `receiving-type-meta.ts` (incl. **Repair**).
- Migration `2026-07-23_receiving_intake_type_catalog_vocab.sql` drops the carton `intake_type` CHECK so Repair / catalog types can persist.

## Deferred (Classify tab option grid)

`TriageClassifySection` expanded options stay a **names list** (tone-coded rows). Do **not** replace with icon-only circles in the tab body — operators need readable labels there.

### Later task

Promote the banner face language into the Classify tab **as an equal-width icon+name option pad** (not icon-only):

| Dimension | Expanded option anatomy |
|-----------|-------------------------|
| Platform | Equal face: `PlatformMark` + short label (or mark + tooltip), platform tones |
| Type | Equal face: type glyph + short label (PO / Return / Repair / Trade In), type tones |
| Urgency | Keep names + heat tones (or flag + label); avoid five identical flags |

Compose from existing `InlinePillOption.face` + `expandedFace` — do not fork a second pill language. Collapsed row value chip may keep the identity face (already shipped).

### Out of scope until then

- Changing Classify tab back to checkbox chrome
- Full-color trademark logos (keep monochrome marks + semantic tint)

### Verify when picking up

- Banner + tab share one option builder
- `npm run verify` green
- Apply migration if not yet applied on the dogfood DB
