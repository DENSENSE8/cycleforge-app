/**
 * Unbox right-edge chrome — the two 2026-08-02 rulings, as facts.
 *
 * `pattern-evolution.md` Always #6: a rules file cannot fail. Both rulings below
 * were prose plus a vocabulary unit test, which left every placement and gating
 * claim unenforced — the exact shape that let `source-of-truth.md` describe a
 * `useIsColumnHidden()` allowlist of two while four surfaces called it.
 *
 *  A. **Package Pairing is a DISPLAY, not a centre surface.** A control on the
 *     right edge must not open a surface in the centre. The pairing pencil in
 *     the Displays strip's `rightSlot` flipped a boolean whose consumer
 *     (`POUnboxingSection`) was off-screen on every step but `contents`.
 *     `CartonMatchHub`'s own guard already pins that the hub moved; this pins
 *     that the door it came through stayed shut.
 *
 *  B. **The pane cluster is CARTON-scoped; panel dismiss belongs to the panel.**
 *     Amended 2026-08-02, one day after the ruling it replaces. That ruling
 *     ("the cursor trio is rail-scoped") gated `close · up · down` on `railOpen`
 *     and was right about the `close` and wrong about the pair, because the
 *     three were never one thing: `→|` closed the whole CARTON while wearing a
 *     panel's glyph, sitting in the open panel's corner, and mounting only when
 *     that panel was up. An operator who reached for it lost their carton.
 *
 *     So `→|` moved to {@link UnboxPushColumn}'s header band — the column's own
 *     top-left — and closes the column. `↑ ↓` step the CARTON, which is on
 *     screen either way, so they lost the gate they only ever had by adjacency.
 *     The ring moved to the dock under-row (2026-08-03) and is still ungated: it
 *     is the toggle that OPENS the column, so gating it would make Displays
 *     unopenable.
 *
 *     The failure modes point in three directions now, so all three are pinned:
 *     re-adding a carton-close to the pane row, re-gating the cursor on
 *     `railOpen`, and letting the panel's dismiss drift back out of the shell.
 *
 * Law: `.claude/rules/source-of-truth.md` → Right-rail modality;
 * `.claude/rules/display/station-workbench.md` → Package Pairing is a DISPLAY.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Read the file as CODE, not as prose. Every one of these assertions is about
 * what the component does, and both files document at length what they must
 * NOT do — a naive `doesNotMatch` over the raw text passes or fails on the
 * docblock explaining the rule rather than on the rule.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const PANEL_PATH = 'src/components/receiving/workspace/LineEditPanel.tsx';
const DISPLAYS_PATH = 'src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx';
const PUSH_COLUMN_PATH = 'src/components/receiving/workspace/UnboxPushColumn.tsx';
const WORKSPACE_PATH = 'src/components/receiving/workspace/ReceivingLineWorkspace.tsx';

/**
 * The `showCartonCursor ? ( … ) : null` body — the carton cursor group. Sliced
 * rather than regexed so an assertion can ask "is X inside the gate?" and "is X
 * outside it?" as two different questions (the ring must be outside).
 *
 * Brace-matched, not `indexOf(') : null}')`: each control is its own
 * `onXCarton ? ( … ) : null` ternary, so the first close paren belongs to a
 * child and a naive slice cuts the gate off after one button.
 */
function cursorGateBody(panel: string): string {
  // Pane utility row is assigned as `const paneUtilityRow = showCartonCursor ? (`
  // (cursor-only since the ring moved under the dock).
  const open = panel.indexOf('paneUtilityRow = showCartonCursor ? (');
  assert.ok(open >= 0, 'the pane utility row must gate the cursor on showCartonCursor');
  let depth = 0;
  for (let i = open; i < panel.length; i += 1) {
    if (panel[i] === '(') depth += 1;
    else if (panel[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        // Include trailing ` : null` if present.
        const rest = panel.slice(i + 1);
        const nullTail = rest.match(/^\s*:\s*null/);
        return panel.slice(open, i + 1 + (nullTail?.[0].length ?? 0));
      }
    }
  }
  assert.fail('the showCartonCursor expression is unbalanced');
}

describe('Unbox right-edge chrome (2026-08-02 rulings)', () => {
  describe('B — the pane cluster is carton-scoped, the panel closes itself', () => {
    const panel = read(PANEL_PATH);

    it('the pane utility row carries NO carton dismiss', () => {
      assert.ok(
        !panel.includes('onCloseCarton'),
        'a carton-close in the pane cluster is the defect this ruling removed — it sat in the open panel’s corner wearing the panel’s glyph, and closing it lost the operator their carton',
      );
      assert.ok(
        !panel.includes('unbox-carton-close'),
        'unbox-carton-close is retired; the panel’s dismiss is unbox-push-close, and it belongs to UnboxPushColumn',
      );
      assert.ok(
        !panel.includes('ArrowRightToLine'),
        '`→|` means "park this back against the right edge" — it is the push column’s glyph, so it must not be reachable from the carton pane’s own chrome',
      );
    });

    it('the carton exit stays on the identity bar, pointing the other way', () => {
      // The surviving carton-close. It is permanent, it is the leftmost control
      // on the pane, and `◁` says "back to the list" rather than "park right".
      // If this ever stops being wired, the carton has NO visible dismiss.
      const section = read(
        'src/components/receiving/workspace/line-edit/LineCartonContextSection.tsx',
      );
      assert.match(
        section,
        /onExitToList=\{\(\) => dispatchReceivingWorkspaceClose\(\)\}/,
        'the identity bar’s ◁ is the carton’s only dismiss now — it must stay wired',
      );
      const workspace = read(WORKSPACE_PATH);
      const unboxMount = workspace.match(/<LineEditPanel[\s\S]*?\/>/)?.[0] ?? '';
      assert.ok(unboxMount, 'ReceivingLineWorkspace must still mount LineEditPanel');
      assert.ok(
        !unboxMount.includes('onCloseCarton'),
        're-threading onClose into LineEditPanel is how the second carton-close got there',
      );
    });

    it('the push column owns a VISIBLE dismiss at its own top-left', () => {
      const column = read(PUSH_COLUMN_PATH);
      assert.match(
        column,
        /data-testid="unbox-push-close"/,
        'every push column (Displays · Ticket · Claim · tool) closes from the shared shell — one implementation, four surfaces',
      );
      assert.match(
        column,
        /onClick=\{onClose\}/,
        'the band’s dismiss must call the occupant’s own onClose, so it closes whichever column is up',
      );
      // The edge grip's chevron is `opacity-0 group-hover:opacity-100`, so it
      // does not exist until the pointer is already on the 8px sash. A
      // non-modal push column has no scrim to click off — an invisible dismiss
      // is not a dismiss. The band must therefore be a REAL row, not an
      // absolute float that three of the four occupants' headers sit under.
      const band = column.match(/const UNBOX_PUSH_TOP_BAND\s*=\s*'[^']*'/)?.[0] ?? '';
      assert.ok(band, 'the header band must stay a named constant');
      assert.doesNotMatch(
        band,
        /absolute/,
        'an absolute band overlaps SupportTicketDetail / ReceivingClaimPanel / the tool bodies, which all start their chrome at y 0',
      );
      assert.match(band, /shrink-0/, 'the band must not collapse when the body scrolls');
    });

    it('the leading edge is DRAG-ONLY — one dismiss per column', () => {
      const column = read(PUSH_COLUMN_PATH);
      const handle =
        column.match(/<HorizontalEdgeResizeHandle[\s\S]*?\/>/)?.[0] ?? '';
      assert.ok(handle, 'the push column must still mount a resize grip');
      assert.doesNotMatch(
        handle,
        /onCollapse|collapseLabel/,
        'the sash grew a hover-revealed collapse chevron that did the SAME job as the band’s →|, 40px away and outside the card — two dismisses for one column. Escape still closes it; the band is the visible one',
      );
      // The prop went with it rather than lingering inert: a `collapseLabel`
      // nothing renders is a per-occupant string four call sites keep in sync
      // for no reader.
      assert.ok(
        !column.includes('collapseLabel'),
        'collapseLabel is retired — the band names the REGION, not the occupant',
      );
      assert.match(
        column,
        /const UNBOX_PUSH_CLOSE_LABEL = 'Hide right panel'/,
        'one control closes all four push surfaces, so "Hide displays" would be false on three of them',
      );
    });

    it('the Displays strip no longer reserves that band itself', () => {
      const displays = read(DISPLAYS_PATH);
      const strip =
        displays.match(/const DISPLAYS_STRIP_HEADER_CLASS\s*=\s*'[^']*'/)?.[0] ?? '';
      assert.ok(strip, 'the strip header class must stay a named constant');
      assert.doesNotMatch(
        strip,
        /pt-9/,
        'the band is a real row in the shell now — keeping pt-9 reserves it twice and drops the strip 36px',
      );
    });

    it('railOpen is derived ONCE, from the four push surfaces', () => {
      const decls = panel.match(/const railOpen\s*=/g) ?? [];
      assert.equal(
        decls.length,
        1,
        'two derivations of "is a push column open" is how the ring and the cursor trio drift apart',
      );
      const line = panel.match(/const railOpen\s*=[^;]+;/)?.[0] ?? '';
      for (const surface of [
        'showClaimStack',
        'showTicketStack',
        'showToolPush',
        'showDisplays',
      ]) {
        assert.match(line, new RegExp(surface), `railOpen must include ${surface}`);
      }
    });

    it('railOpen excludes any parked expand-strip vocabulary', () => {
      const line = panel.match(/const railOpen\s*=[^;]+;/)?.[0] ?? '';
      assert.doesNotMatch(
        line,
        /showExpandStrip|showTicketExpand|showRightPushChrome/,
        'no parked ticket strip — reopen from carton identity; including a restore flag would mount the cursor trio over a closed edge',
      );
    });

    it('Unbox does not mount a parked ticket expand strip', () => {
      assert.doesNotMatch(
        panel,
        /ReceivingPushExpandStrip|ReceivingTicketExpandControl|showExpandStrip/,
        'ticket reopen lives on carton identity Reply; Displays opens from the progress ring — no right-edge chevron strip',
      );
    });

    it('the carton cursor is NOT gated on railOpen', () => {
      const decl = panel.match(/const showCartonCursor\s*=[^;]+;/)?.[0] ?? '';
      assert.ok(decl, 'the pane utility row must still gate on showCartonCursor');
      assert.doesNotMatch(
        decl,
        /railOpen/,
        '↑ ↓ step the CARTON, which is on screen whether or not a column is. They were gated only because they shared a component with the panel-shaped →|, which has left — re-adding the gate hides prev/next behind "open a display first" for no reason an operator could infer',
      );
      assert.match(
        decl,
        /onPrevCarton \|\| onNextCarton/,
        'honest absence: a host that passes no cursor mounts nothing in the pane utility row',
      );
    });

    it('both cursor controls live inside that gate', () => {
      const gated = cursorGateBody(panel);
      for (const testId of ['unbox-carton-prev', 'unbox-carton-next']) {
        assert.ok(
          gated.includes(testId),
          `${testId} must render inside the showCartonCursor gate`,
        );
      }
    });

    it('the pane utility row carries no hairline and no progress ring', () => {
      const gated = cursorGateBody(panel);
      assert.doesNotMatch(
        gated,
        /bg-border-hairline/,
        'pane utility is cursor-only — no hairline divider',
      );
      assert.doesNotMatch(
        gated,
        /scanProgressControl|UnboxScanProgressControl/,
        'the progress ring lives under the dock terminal, not beside ↑↓',
      );
    });

    it('↑ is NEXT and ↓ is PREVIOUS, on every layer of the control', () => {
      // Inverted 2026-08-02: the queue reads newest-at-top, so advancing moves
      // the cursor UP. The glyph is positional; the label, the aria name, the
      // testid and the HANDLER must agree with the action, or the tooltip
      // promises one carton and the click delivers the other.
      const gated = cursorGateBody(panel);
      const up =
        gated.match(/\{onNextCarton \?[\s\S]*?\) : null\}/)?.[0] ?? '';
      const down =
        gated.match(/\{onPrevCarton \?[\s\S]*?\) : null\}/)?.[0] ?? '';
      assert.ok(up && down, 'both cursor ternaries must be present');

      assert.match(up, /ChevronUp/, '↑ must be the NEXT control');
      assert.match(up, /label="Next carton"/);
      assert.match(up, /ariaLabel="Next carton"/);
      assert.match(up, /data-testid="unbox-carton-next"/);

      assert.match(down, /ChevronDown/, '↓ must be the PREVIOUS control');
      assert.match(down, /label="Previous carton"/);
      assert.match(down, /ariaLabel="Previous carton"/);
      assert.match(down, /data-testid="unbox-carton-prev"/);
    });

    it('the RING mounts beside the notes+print dock — it is the toggle that opens the column', () => {
      assert.match(
        panel,
        /scanProgressControl/,
        'the ring must mount near the carton-terminal dock, not the pane utility row',
      );
      assert.match(
        panel,
        /WorkspaceNotesCard/,
        'main Unbox dock is notes + Print · Receive (WorkspaceNotesCard)',
      );
      const gated = cursorGateBody(panel);
      assert.doesNotMatch(
        gated,
        /scanProgressControl/,
        'gating the ring on the cursor (or railOpen) makes Displays unopenable / mis-placed',
      );
    });

    it('railOpen reaches the ring as hover-peek suppression only', () => {
      // The ring TAKES railOpen (to stand its hover peek down while a column is
      // up) — that is not the same as being gated on it, and the two are easy
      // to confuse when reading the prop list.
      assert.match(panel, /<UnboxScanProgressControl[\s\S]{0,240}railOpen=\{railOpen\}/);
      const control = read('src/components/receiving/workspace/UnboxScanProgressControl.tsx');
      assert.doesNotMatch(
        control,
        /if \(railOpen\) return null|railOpen \?\s*null/,
        'the ring must render in both states — same dock place open or closed',
      );
      assert.doesNotMatch(
        control,
        /previewMode=["']rail["']/,
        'hover peek must NOT be a right-edge Displays preview — Cursor-style top-end overlap only',
      );
      assert.match(
        control,
        /previewPlacement=["']top-end["']/,
        'hover peek must be Cursor-style top-end overlap just above the dock ring',
      );
      assert.match(
        control,
        /previewRailActionLabel=["']Open in Displays["']/,
        'peek must offer a footer action that opens the checklist in the right-edge Displays rail',
      );
    });
  });

  describe('A — Package Pairing is a DISPLAY, not a centre surface', () => {
    const panel = read(PANEL_PATH);
    const displays = read(DISPLAYS_PATH);

    it('the Displays strip takes no rightSlot', () => {
      assert.doesNotMatch(
        displays,
        /rightSlot/,
        'a control on the right edge must not open a surface in the centre — the pencil that lived here is what the ruling removed',
      );
      assert.doesNotMatch(
        displays,
        /PairingTogglePill/,
        'PairingTogglePill is still Triage/Testing chrome; Unbox must not mount it beside the strip',
      );
    });

    it('the panel holds no second open-state flag beside the selected tab', () => {
      for (const dead of ['pairingOpen', 'togglePairing', 'editPoControl', 'focusContentsStep']) {
        assert.ok(
          !panel.includes(dead),
          `${dead} is deleted — a boolean beside \`activeSideTab === 'pairing'\` re-creates the drift the move removed`,
        );
      }
    });

    it("the tab's selected-ness IS the open state", () => {
      assert.match(
        panel,
        /activeSideTab === 'pairing'/,
        'the pairing display reads its open state from the active tab, never a sibling flag',
      );
    });

    it('the carton # ---- chip opens the display and hands the PO tab over as DATA', () => {
      const openPairing =
        panel.match(/const openPoPairing = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0] ?? '';
      assert.ok(openPairing, 'openPoPairing must exist — it is the chip’s only path to the display');
      assert.match(openPairing, /openDisplays\('pairing'\)/);
      assert.match(
        openPairing,
        /setPairingFocus\(/,
        'the PO-tab intent travels as a prop, read at mount',
      );
      // Opening the display is a `router.replace`, so `CartonMatchHub` mounts a
      // navigation later. A dispatch — even one deferred a frame, which is what
      // shipped until 2026-08-02 — always fires before anything is listening,
      // and the display opens on its default tab. Verified in a browser on the
      // QA org, which is the only way this was ever going to be caught.
      assert.doesNotMatch(
        openPairing,
        /requestAnimationFrame|dispatchReceivingOpenPairingPo/,
        'a timed event cannot outrun a navigation — do not reintroduce the rAF dispatch here',
      );
    });

    it('the hub honours focusTab on mount, and Triage keeps its in-place event', () => {
      const hub = read('src/components/receiving/workspace/line-edit/CartonMatchHub.tsx');
      assert.match(
        hub,
        /if \(!focusTab\) return;\s*\n\s*openPairingTab\(focusTab\)/,
        'the prop handoff must run on mount — that is what removes the race',
      );
      // Triage toggles a local `pairingOpen`, so its hub is mounted in the same
      // commit and the event genuinely does reach it. Two hosts, two mechanisms,
      // both correct — deleting the listener would break the Triage pencil.
      assert.match(hub, /RECEIVING_OPEN_PAIRING_PO_EVENT/);
      const triage = read('src/components/receiving/triage/TriagePanel.tsx');
      assert.match(triage, /dispatchReceivingOpenPairingPo/);
    });
  });
});
