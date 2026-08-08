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
 *     So `→|` closes the column from the Displays **footer** search trailing
 *     track (left-rail filter-collapse twin); `←|` Open displays seats in the
 *     utility-rail **bottom** footer (left-dock expand twin). `↑ ↓` step the
 *     CARTON. The procedure ring lives under the Unbox dock Panel
 *     (`UnboxDockHost` progress slot) — not Displays `headerRightSlot`.
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
const DISPLAYS_PATH = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const PUSH_COLUMN_PATH = 'src/components/station/displays/StationDisplaysPushColumn.tsx';
const EDGE_TOGGLE_PATH = 'src/components/station/displays/StationDisplaysEdgeToggle.tsx';
const WORKSPACE_PATH = 'src/components/receiving/workspace/ReceivingLineWorkspace.tsx';

/**
 * The `showCartonCursor ? ( … ) : null` body — the carton cursor group inside
 * the always-mounted utility rail body. Sliced rather than regexed so an
 * assertion can ask "is X inside the gate?" and "is X outside it?" as two
 * different questions (Displays toggle + ring must be outside).
 *
 * Brace-matched, not `indexOf(') : null}')`: each control is its own
 * `onXCarton ? ( … ) : null` ternary, so the first close paren belongs to a
 * child and a naive slice cuts the gate off after one button.
 */
function cursorGateBody(panel: string): string {
  // Cursor group is nested: `showCartonCursor ? (` as cartonCursor= prop
  // (was `{showCartonCursor ? (` when the toggle stacked above the cursor).
  const open = panel.indexOf('showCartonCursor ? (');
  assert.ok(open >= 0, 'the utility rail must gate the cursor on showCartonCursor');
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

    it('the push column footer owns a VISIBLE dismiss (left-rail twin)', () => {
      const column = read(PUSH_COLUMN_PATH);
      const displays = read(DISPLAYS_PATH);
      const edge = read(EDGE_TOGGLE_PATH);
      assert.match(
        column,
        /footer/,
        'column accepts a footer slot for filter + →|',
      );
      assert.match(
        displays,
        /StationDisplaysEdgeToggle/,
        'column dismiss is the shared edge-toggle host (layoutId handoff with the pane)',
      );
      assert.match(
        displays,
        /variant="column-close"/,
        'open Displays lands the flipped →| on the footer search trailing track',
      );
      assert.match(
        displays,
        /TechRailSearchBar/,
        'Displays footer mounts TechRailSearchBar (recent-rail twin)',
      );
      assert.match(
        displays,
        /trailingAction=\{/,
        '→| seats as TechRailSearchBar trailingAction (filter-collapse twin)',
      );
      assert.match(
        edge,
        /unbox-push-close/,
        'column-close variant keeps the unbox-push-close test id',
      );
      assert.match(
        column,
        /headerTrailing/,
        'column band accepts carton ↑↓ as top-right headerTrailing',
      );
      assert.match(
        column,
        /ml-auto flex shrink-0 items-center/,
        'carton cursor seats on the same header row, top-right',
      );
      assert.match(
        column,
        /items-center gap-0\.5/,
        'top band is one horizontal row (items-center)',
      );
      // The edge grip's chevron is `opacity-0 group-hover:opacity-100`, so it
      // does not exist until the pointer is already on the 8px sash. A
      // non-modal push column has no scrim to click off — an invisible dismiss
      // is not a dismiss. The band must therefore be a REAL row, not an
      // absolute float that three of the four occupants' headers sit under.
      const band =
        column.match(/const STATION_DISPLAYS_PUSH_TOP_BAND\s*=\s*'[^']*'/)?.[0] ??
        column.match(/const UNBOX_PUSH_TOP_BAND\s*=\s*'[^']*'/)?.[0] ??
        '';
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
      const edge = read(EDGE_TOGGLE_PATH);
      const handle =
        column.match(/<HorizontalEdgeResizeHandle[\s\S]*?\/>/)?.[0] ?? '';
      assert.ok(handle, 'the push column must still mount a resize grip');
      assert.match(
        handle,
        /placement="inset"/,
        'grip paints on the column border-l seam (display hairline), not an outset overhang into the work surface',
      );
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
        edge,
        /STATION_DISPLAYS_CLOSE_LABEL = 'Hide displays'/,
        'one control closes the Displays REGION across stations — names the region, not an occupant',
      );
      // Operator nouns: Station ←| opens Displays — never Desk "inspector" /
      // "details editor" (those are History Band 3 / LineEdit itself).
      assert.match(
        edge,
        /Open displays/,
        'pane-open tooltip/aria must stay Open displays (Station Displays column)',
      );
      assert.doesNotMatch(
        edge,
        /Open inspector|details editor|Open details editor/i,
        'Station Displays edge must not borrow Desk inspector / details-editor copy',
      );
    });

    it('the Displays strip no longer reserves that band itself', () => {
      const displays = read(DISPLAYS_PATH);
      assert.match(
        displays,
        /DISPLAYS_FLUSH_HOST/,
        'Displays body uses the flush host SoT (edge-to-edge plate; no -mx-4 cancel)',
      );
      assert.doesNotMatch(
        displays,
        /pt-9/,
        'the band is a real row in the shell now — keeping pt-9 reserves it twice and drops the strip 36px',
      );
    });

    it('strip-mounted ring does not need a panel-level railOpen derivation', () => {
      // Ring only mounts while Displays is open (`rightSlot` on the push stack),
      // so hover peek is suppressed with a literal `railOpen` prop — no
      // `const railOpen = showDisplays` that could drift from another consumer.
      assert.doesNotMatch(
        panel,
        /const railOpen\s*=/,
        'panel-level railOpen was only for dock-ring peek; strip mount hardcodes true',
      );
      assert.match(
        panel,
        /<UnboxScanProgressControl[\s\S]{0,240}railOpen/,
        'ring still receives railOpen for ScanStationProgressControl peek gate',
      );
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
        'ticket reopen lives on carton identity Reply; Displays opens from the pane ←| toggle / progress ring — no right-edge chevron strip',
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
        'honest absence: a host that passes no cursor mounts no ↑↓ (Displays toggle still mounts)',
      );
    });

    it('Displays toggle mounts in the utility-rail bottom footer, outside the cursor gate', () => {
      const edge = read(EDGE_TOGGLE_PATH);
      assert.match(
        panel,
        /UnboxDisplaysUtilityRailBody/,
        'carton pane must compose the bottom-seated Open displays host',
      );
      assert.match(
        panel,
        /!showDisplays \? \(/,
        'pane host is exclusive — only when Displays is closed',
      );
      assert.match(
        panel,
        /onOpenDisplays=\{openDisplaysIndex\}/,
        'closed → opens Displays on Root Index (drill-down)',
      );
      assert.match(
        panel,
        /utilityRail=\{utilityRailBody\}/,
        'utility mounts on ScanStationUtilityRail via StationScanPaneHost when Displays closed',
      );
      assert.match(
        panel,
        /headerTrailing=\{displaysCartonCursor\}/,
        'carton ↑↓ mounts top-right on the details panel when Displays is open',
      );
      assert.doesNotMatch(
        panel,
        /trailingUtility=\{/,
        'must not live inside CartonContextCard / carton identity',
      );
      const utilitySlice = panel.slice(
        panel.indexOf('const utilityRailBody'),
        panel.indexOf('const stationContextBar'),
      );
      assert.ok(
        !utilitySlice.includes('closeDisplays'),
        'open → close lives on the column footer only — never a second pane dismiss',
      );
      assert.match(
        edge,
        /STATION_DISPLAYS_EDGE_TOGGLE_LAYOUT_ID/,
        'shared layoutId SoT for the pane ↔ column morph (station-neutral)',
      );
      assert.match(
        edge,
        /motionRole\.push\.rail/,
        'edge morph uses the push.rail tween (same job as the column width)',
      );
      assert.match(
        edge,
        /ArrowLeftToLine/,
        'pane-open uses ←|',
      );
      assert.match(
        edge,
        /ArrowRightToLine/,
        'column-close uses →| (park to the right edge)',
      );
      const gated = cursorGateBody(panel);
      assert.ok(
        !gated.includes('StationDisplaysEdgeToggle') &&
          !gated.includes('UnboxDisplaysUtilityRailBody'),
        'Displays toggle is a peer of the cursor group, not gated behind ↑↓ availability',
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
        'pane utility has no hairline divider',
      );
      assert.doesNotMatch(
        gated,
        /scanProgressControl|UnboxScanProgressControl/,
        'the progress ring lives on Displays column chrome (rightSlot), not the pane utility row',
      );
      // Pane utility assignment ends at `);` before stationContextBar — ring
      // must stay out of that whole JSX tree (Displays toggle + cursor).
      const rowOpen = panel.indexOf('const utilityRailBody = ');
      const rowClose = panel.indexOf('const stationContextBar');
      assert.ok(rowOpen >= 0 && rowClose > rowOpen, 'utilityRailBody precedes stationContextBar');
      assert.doesNotMatch(
        panel.slice(rowOpen, rowClose),
        /scanProgressControl|UnboxScanProgressControl/,
        'ring must not re-enter the pane utility row',
      );
    });

    it('↑ is PREVIOUS and ↓ is NEXT — same as left sidebar / DeskRailChromeRow', () => {
      // ArrowUp / ChevronUp = prev; ArrowDown / ChevronDown = next. The
      // 2026-08-02 station invert (↑ = next) fought the rail + Desk chrome.
      assert.match(panel, /ScanStationCartonCursor/);
      assert.match(panel, /onPrev=\{onPrevCarton\}/);
      assert.match(panel, /onNext=\{onNextCarton\}/);
      assert.match(panel, /prevTestId="unbox-carton-prev"/);
      assert.match(panel, /nextTestId="unbox-carton-next"/);
      const cursor = read(
        'src/components/station/workbench/ScanStationCartonCursor.tsx',
      );
      assert.match(cursor, /ChevronUp[\s\S]{0,200}onClick=\{onPrev\}/, '↑ must be PREV');
      assert.match(cursor, /label="Previous carton"/);
      assert.match(cursor, /ariaLabel="Previous carton"/);
      assert.match(cursor, /ChevronDown[\s\S]{0,200}onClick=\{onNext\}/, '↓ must be NEXT');
      assert.match(cursor, /label="Next carton"/);
      assert.match(cursor, /ariaLabel="Next carton"/);
      // Desk twin keeps the same glyph→direction contract.
      const desk = read('src/components/right-rail/DeskRailChromeRow.tsx');
      assert.match(desk, /ChevronUp[\s\S]{0,200}onClick=\{onPrev\}/);
      assert.match(desk, /ChevronDown[\s\S]{0,200}onClick=\{onNext\}/);
    });

    it('the RING mounts under the Unbox dock — not Displays rightSlot', () => {
      assert.match(
        panel,
        /progress=\{scanProgressControl\}/,
        'the ring must mount on UnboxDockHost progress (under the Panel)',
      );
      assert.match(
        panel,
        /UnboxDockHost/,
        'main Unbox dock is UnboxDockHost (step CTA · notes · Print · Receive)',
      );
      assert.doesNotMatch(
        panel,
        /rightSlot=\{scanProgressControl\}/,
        'do not mount the ring on Displays rightSlot',
      );
      const gated = cursorGateBody(panel);
      assert.doesNotMatch(
        gated,
        /scanProgressControl/,
        'ring must not live in the pane utility / cursor gate',
      );
    });

    it('under-dock ring peeks when Displays closed; suppresses peek when open', () => {
      assert.match(
        panel,
        /railOpen=\{showDisplays\}/,
        'under-dock mount passes showDisplays so peek works while Displays is closed',
      );
      const control = read('src/components/receiving/workspace/UnboxScanProgressControl.tsx');
      assert.doesNotMatch(
        control,
        /if \(railOpen\) return null|railOpen \?\s*null/,
        'the ring must not unmount itself when railOpen',
      );
      assert.doesNotMatch(
        control,
        /previewMode=["']rail["']/,
        'hover peek must NOT be a right-edge Displays preview — Cursor-style top-end overlap only',
      );
      assert.match(
        control,
        /variant=["']strip["']/,
        'Unbox mounts the ring as strip chrome under the dock',
      );
      assert.match(
        control,
        /previewPlacement=["']top-end["']/,
        'peek placement kept for closed-state call sites',
      );
      assert.match(
        control,
        /previewRailActionLabel=["']Open displays["']/,
        'peek must offer a footer action that opens the checklist in the right-edge Displays rail',
      );
    });

    it('the shared progress ring CLOSE names the REGION, not the tab', () => {
      // The ring toggles the whole Station push column, so its close label must
      // name the region ("Hide displays") — same reason STATION_DISPLAYS_CLOSE_LABEL
      // is region-scoped. Law: source-of-truth.md → Displays vs inspector.
      const ring = read('src/components/station/ScanStationProgressControl.tsx');
      const dflt = ring.match(/ariaLabelClose = '[^']*'/)?.[0] ?? '';
      assert.ok(dflt, 'ScanStationProgressControl must keep a default ariaLabelClose');
      assert.match(
        dflt,
        /Hide displays/,
        'the Station push close names the region: "Hide displays"',
      );
    });
  });

  describe('A — Package Pairing is a DISPLAY, not a centre surface', () => {
    const panel = read(PANEL_PATH);
    const displays = read(DISPLAYS_PATH);

    it('the Displays column does not host the procedure ring or a pairing pencil', () => {
      assert.match(
        displays,
        /headerRightSlot=\{rightSlot\}/,
        'StationDisplaysPushStack still threads optional rightSlot onto headerRightSlot',
      );
      assert.doesNotMatch(
        displays,
        /PairingTogglePill/,
        'PairingTogglePill is still Triage/Testing chrome; Unbox must not mount it on Displays',
      );
      assert.doesNotMatch(
        panel,
        /rightSlot=\{scanProgressControl\}/,
        'Unbox procedure ring is under the dock, not Displays rightSlot',
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
        /activeSideTab === 'linkage'/,
        'Linkage (Pairing + Zoho note) reads its open state from the active tab, never a sibling flag',
      );
    });

    it('the carton # ---- chip opens Linkage and hands the PO avenue over as DATA', () => {
      const openPairing =
        panel.match(/const openPoPairing = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0] ?? '';
      assert.ok(openPairing, 'openPoPairing must exist — it is the chip’s only path to the display');
      assert.match(openPairing, /openDisplays\('linkage'/);
      assert.match(
        openPairing,
        /setPairingFocus\(/,
        'the PO-tab intent travels as a prop, read at mount',
      );
      // Durable open is still `router.replace`, but paint is optimistic in
      // `useUnboxDisplayView` (pending snapshot). A dispatched focus event —
      // even one deferred a frame, which is what shipped until 2026-08-02 —
      // races the hub mount and lands on the default tab. Intent travels as
      // the `focusTab` prop handoff instead. Verified in a browser on the QA
      // org, which is the only way this was ever going to be caught.
      assert.doesNotMatch(
        openPairing,
        /requestAnimationFrame|dispatchReceivingOpenPairingPo/,
        'a timed event cannot outrun the hub mount — do not reintroduce the rAF dispatch here',
      );
    });

    it('the hub honours focusTab on mount, and Triage now uses that same prop handoff', () => {
      const hub = read('src/components/receiving/workspace/line-edit/CartonMatchHub.tsx');
      assert.match(
        hub,
        /if \(!focusTab\) return;\s*\n\s*openPairingTab\(focusTab\)/,
        'the prop handoff must run on mount — that is what removes the race',
      );
      // The hub keeps its RECEIVING_OPEN_PAIRING_PO_EVENT listener: it is still
      // dispatched by surfaces whose hub mounts in the SAME commit — the row
      // context menu, the incoming-details PoTab, and the history triage panel.
      assert.match(hub, /RECEIVING_OPEN_PAIRING_PO_EVENT/);
      // Arrival moved onto the Displays push (2026-08-05, scan-station Displays
      // SoT): its hub mounts when the Linkage display opens, so — like Unbox — it
      // hands the PO avenue over as DATA (setPairingFocus), read on mount, never a
      // timed dispatch the mount races. TriagePanel no longer dispatches the event.
      const triage = read('src/components/receiving/triage/TriagePanel.tsx');
      assert.match(triage, /setPairingFocus\(/);
      assert.doesNotMatch(triage, /dispatchReceivingOpenPairingPo/);
    });
  });
});
