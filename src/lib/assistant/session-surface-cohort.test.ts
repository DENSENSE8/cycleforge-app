/**
 * Tripwire — session-surface cohort (artifact contract: data-only, read-only,
 * verbs are tools, keyboard-reachable).
 *
 * Run: node --import tsx --test src/lib/assistant/session-surface-cohort.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARTIFACT_PLANE_FILES,
  SESSION_SURFACE_CONTRACT,
  SESSION_SURFACE_ENGINE,
  SESSION_SURFACE_FORBIDDEN,
  sessionSurfaceSource,
} from './session-surface-cohort';
import { extractGfmTables, sanitizeSessionArtifact, sessionArtifactSchema } from './ui-artifacts';

/** Contract markers are literal source, not patterns — match them literally. */
const lit = (marker: string) => new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

describe('session-surface cohort (SoT = artifact contract)', () => {
  it('engine files exist', () => {
    for (const rel of Object.values(SESSION_SURFACE_ENGINE)) {
      sessionSurfaceSource(rel);
    }
  });

  it('contract: artifacts carry DATA, never behavior', () => {
    const src = sessionSurfaceSource(SESSION_SURFACE_ENGINE.contract);
    assert.match(src, new RegExp(SESSION_SURFACE_CONTRACT.zodValidatedPayload));
    assert.match(src, new RegExp(SESSION_SURFACE_CONTRACT.discriminatedKinds));
    assert.doesNotMatch(src, SESSION_SURFACE_FORBIDDEN.htmlInjection);
  });

  it('artifact plane never imports mutation/write machinery', () => {
    for (const rel of ARTIFACT_PLANE_FILES) {
      const src = sessionSurfaceSource(rel);
      assert.doesNotMatch(src, SESSION_SURFACE_FORBIDDEN.mutationImport, `${rel}`);
      assert.doesNotMatch(src, SESSION_SURFACE_FORBIDDEN.writeToolImport, `${rel}`);
      assert.doesNotMatch(src, SESSION_SURFACE_FORBIDDEN.rawMutationFetch, `${rel}`);
      assert.doesNotMatch(src, SESSION_SURFACE_FORBIDDEN.htmlInjection, `${rel}`);
    }
  });

  it('the one sanctioned write is the human-sent reply draft through the shared chokepoint', () => {
    const src = sessionSurfaceSource(SESSION_SURFACE_ENGINE.renderers);
    assert.match(src, new RegExp(SESSION_SURFACE_CONTRACT.rendererReplyDraft));
    assert.match(src, /postTicketComment/);
    // The reply is public:false by default and the draft carries its own flag —
    // never an auto-send on mount.
    assert.match(src, /'idle' \| 'sending' \| 'sent' \| 'failed'/);
  });

  it('agent loop advertises render_artifact + device print, client forwards both', () => {
    const loop = sessionSurfaceSource(SESSION_SURFACE_ENGINE.agentLoop);
    assert.match(loop, /render_artifact/);
    assert.match(loop, /print_handling_unit_labels/);
    const hook = sessionSurfaceSource(SESSION_SURFACE_ENGINE.chatHook);
    assert.match(hook, lit(SESSION_SURFACE_CONTRACT.uiToolForward));
    assert.match(hook, lit(SESSION_SURFACE_CONTRACT.deviceToolForward));
  });

  it('both loops validate render_artifact at the chokepoint and let the model repair in-turn', () => {
    for (const rel of [SESSION_SURFACE_ENGINE.agentLoop, SESSION_SURFACE_ENGINE.grokLoop]) {
      const src = sessionSurfaceSource(rel);
      assert.match(
        src,
        lit(SESSION_SURFACE_CONTRACT.artifactChokepoint),
        `${rel} must zod-validate render_artifact through the shared chokepoint`,
      );
      assert.match(
        src,
        lit(SESSION_SURFACE_CONTRACT.artifactEmitShape),
        `${rel} must emit the declared { artifact } shape the client reads`,
      );
      assert.match(src, /render_artifact rejected/, `${rel} must return the zod issues as an error tool result`);
      assert.match(src, /Rendered on the session view panel\./, `${rel} must ack the validated emit`);
    }
  });

  it('law 5: the panel paints on ANNOUNCEMENT — both loops emit ui_tool_start, the client holds one pending slot', () => {
    for (const rel of [SESSION_SURFACE_ENGINE.agentLoop, SESSION_SURFACE_ENGINE.grokLoop]) {
      const src = sessionSurfaceSource(rel);
      assert.match(src, lit(SESSION_SURFACE_CONTRACT.uiToolStartEmit), `${rel} must emit ui_tool_start`);
      assert.match(
        src,
        lit(SESSION_SURFACE_CONTRACT.toolStartHook),
        `${rel} must take the onToolStart seam so the emit fires on the OPENED block`,
      );
    }
    const events = sessionSurfaceSource(SESSION_SURFACE_ENGINE.appEvents);
    assert.match(events, lit(SESSION_SURFACE_CONTRACT.pendingEventExport));
    const hook = sessionSurfaceSource(SESSION_SURFACE_ENGINE.chatHook);
    assert.match(hook, lit(SESSION_SURFACE_CONTRACT.pendingStartForward), 'chat hook must handle ui_tool_start');
    assert.match(hook, lit(SESSION_SURFACE_CONTRACT.pendingEventName));
    const store = sessionSurfaceSource(SESSION_SURFACE_ENGINE.artifactStore);
    assert.match(store, lit(SESSION_SURFACE_CONTRACT.pendingEventName));
    assert.match(
      store,
      lit(SESSION_SURFACE_CONTRACT.pendingSlotReplaced),
      'the arriving artifact must REPLACE the pending slot, never stack beside it',
    );
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.artifactPanel);
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.pendingSkeletonMarker));
  });

  it('every verb the session UI offers is a registered tool (registry, not components)', () => {
    const registry = sessionSurfaceSource(SESSION_SURFACE_ENGINE.toolRegistry);
    assert.match(registry, /draftTicketReplyTool/);
    const draft = sessionSurfaceSource(SESSION_SURFACE_ENGINE.draftTool);
    assert.match(draft, /draft_ticket_reply/);
    // Drafting writes nothing: the tool description says so, and it returns a draft.
    assert.match(draft, /does NOT send/);
    assert.doesNotMatch(draft, /postTicketComment|fetch\(/);
  });

  it('view panel is keyboard-reachable (j/k move, Enter attach/send)', () => {
    const src = sessionSurfaceSource(SESSION_SURFACE_ENGINE.renderers);
    assert.match(src, new RegExp(SESSION_SURFACE_CONTRACT.keyboardMove));
    assert.match(src, new RegExp(SESSION_SURFACE_CONTRACT.keyboardAttach));
  });

  it('schema rejects payloads with function/behavior values', () => {
    const bad = {
      kind: 'table',
      title: 't',
      columns: ['a'],
      rows: [{ a: () => 'x' }],
    };
    assert.equal(sessionArtifactSchema.safeParse(bad).success, false);
    const good = {
      kind: 'table',
      title: 't',
      columns: ['a'],
      rows: [{ a: 'x', id: 1 }],
    };
    assert.equal(sessionArtifactSchema.safeParse(good).success, true);
  });

  it('boundary sanitizer coerces model formatting sloppiness into valid artifacts', () => {
    // Object cells, stringy numbers/booleans — the shapes models actually
    // emit — must SANITIZE into a valid artifact, not bounce to a notice.
    const sloppy = sanitizeSessionArtifact({
      kind: 'table',
      title: 'Packing',
      columns: ['day', 'boxes', 'flag'],
      rows: [
        { day: { label: '2026-09-01 Tue' }, boxes: '41', flag: { value: true, note: 'peak' } },
        { day: '2026-09-02 Wed', boxes: 24, flag: null },
      ],
      idColumn: 'day',
    });
    const parsed = sessionArtifactSchema.safeParse(sloppy);
    assert.equal(parsed.success, true, JSON.stringify(parsed.success ? [] : parsed.error.issues));
    if (parsed.success && parsed.data.kind === 'table') {
      const row = parsed.data.rows[0];
      assert.equal(row.day, '2026-09-01 Tue');
      assert.equal(row.boxes, '41');
      assert.equal(row.flag, 'true');
    }
    // A chart with stringy values coerces to numbers; unparseable entries drop.
    const chart = sanitizeSessionArtifact({
      kind: 'chart',
      title: 'c',
      chartType: 'bar',
      series: [
        { label: { text: 'Mon' }, value: '5' },
        { label: 'Tue', value: 'nope' },
      ],
    });
    const chartParsed = sessionArtifactSchema.safeParse(chart);
    assert.equal(chartParsed.success, true);
    if (chartParsed.success && chartParsed.data.kind === 'chart') {
      assert.deepEqual(chartParsed.data.series, [{ label: 'Mon', value: 5 }]);
    }
    // Behavior still rejected AFTER sanitizing: functions never become strings.
    const hostile = sanitizeSessionArtifact({
      kind: 'table',
      title: 't',
      columns: ['a'],
      rows: [{ a: () => 'x' }],
    });
    assert.equal(sessionArtifactSchema.safeParse(hostile).success, false);
  });

  it('chat text is prose-only: leaked markdown tables are MOVED to the panel', () => {
    const reply = [
      'Tuan packed 148 boxes last week; the day breakdown is below.',
      '',
      '| Day | Boxes |',
      '| --- | --- |',
      '| 2026-09-01 | 41 |',
      '| 2026-09-02 | 24 |',
      '',
      'Peak day was 2026-09-01.',
    ].join('\n');
    const { tables, text } = extractGfmTables(reply);
    assert.equal(tables.length, 1);
    assert.deepEqual(tables[0].columns, ['Day', 'Boxes']);
    assert.deepEqual(tables[0].rows[0], { Day: '2026-09-01', Boxes: '41' });
    assert.equal(tables[0].title, 'Tuan packed 148 boxes last week; the day breakdown is below.'.slice(0, 120));
    // The table is GONE from the chat text; the prose stays.
    assert.ok(!text.includes('|'));
    assert.ok(text.includes('148 boxes'));
    assert.ok(text.includes('Peak day was 2026-09-01.'));
    // Extracted payloads are valid artifacts under the contract.
    tables.forEach((t) => {
      assert.equal(
        sessionArtifactSchema.safeParse({ kind: 'table', ...t }).success,
        true,
      );
    });
    // Prose without tables passes through untouched.
    assert.equal(extractGfmTables('Just a sentence.').text, 'Just a sentence.');
    assert.equal(extractGfmTables('Just a sentence.').tables.length, 0);
  });

  it('session chrome lives in the GLOBAL HEADER (panel is chat only)', () => {
    // The surface publishes the switcher into the header's context zone.
    const surface = sessionSurfaceSource(SESSION_SURFACE_ENGINE.surface);
    assert.match(surface, /setPanelContent\(<SessionSwitcher \/>\)/);
    // The panel itself carries no session chrome: no switcher, no New button.
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionPanel);
    assert.doesNotMatch(panel, /data-session-switcher/);
    assert.doesNotMatch(panel, /ariaLabel="New conversation"/);
  });

  it('New conversation is a ROUTED verb: ⌘N/Ctrl+N + sidebar entry, no screen button', () => {
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionPanel);
    assert.match(panel, /AI_CHAT_NEW_EVENT/);
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.newVerbChord));
    const nav = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sidebarNav);
    assert.match(nav, lit(SESSION_SURFACE_CONTRACT.newVerbSidebar));
    assert.match(nav, /'new-conversation'/);
  });

  it('order-import triage: house lane parses, the human imports from the panel', () => {
    const tool = sessionSurfaceSource(SESSION_SURFACE_ENGINE.importTriageTool);
    assert.match(tool, /triage_orders_csv/);
    // Triage runs the HOUSE import lane — parser + classifier — never a fork.
    assert.match(tool, /parseCsv/);
    assert.match(tool, /classifyCsvOrderStagingRow/);
    assert.match(tool, /autoMapCsvOrderHeaders/);
    // The tool writes nothing — no network calls, no SQL inserts (docblock
    // prose mentions the endpoint; the CODE may not call it).
    assert.doesNotMatch(tool, /\bfetch\(/);
    assert.doesNotMatch(tool, /INSERT INTO/i);
    // The renderer's ONLY write is the human's Import, through the same
    // chokepoint the import desk uses — never a loop-side or agent-side POST.
    const renderers = sessionSurfaceSource(SESSION_SURFACE_ENGINE.renderers);
    assert.match(renderers, lit(SESSION_SURFACE_CONTRACT.triageRenderer));
    assert.match(renderers, lit(SESSION_SURFACE_CONTRACT.triageImportEndpoint));
    // The helper strip above the composer offers the verb on CSV paste.
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionPanel);
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.triagePasteStrip));
    assert.match(panel, /triage_orders_csv|Triage this pasted CSV/);
    // The contract admits the kind, and the sanitizer coerces object cells.
    assert.match(
      sessionSurfaceSource(SESSION_SURFACE_ENGINE.contract),
      /import_triage/,
    );
  });

  it('law 9: the home composer is ONE display — one mode, one field, one commit', () => {
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionPanel);
    const host = sessionSurfaceSource('src/components/composer/StationComposerHost.tsx');
    // The surface declares its mode set and owns the field it displays.
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.composerOneMode));
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.composerOneField));
    // The host honors a declared set instead of the station's shared session
    // mode, and names a single honored mode instead of faking a picker.
    assert.match(host, lit(SESSION_SURFACE_CONTRACT.composerModeSet));
    assert.match(host, lit(SESSION_SURFACE_CONTRACT.composerModeNamed));
    // The row's commit control reads the VISIBLE field: empty → microphone.
    assert.match(host, lit(SESSION_SURFACE_CONTRACT.composerVisibleFieldCommit));
    // The panel no longer reads the seed bus itself — one seed reader, the host.
    assert.doesNotMatch(panel, /getLatestComposerSeed/);
    // The three faces stay gone from the action row.
    assert.doesNotMatch(host, /<ModeFace/);
    // + trigger leftmost: the host passes leadingPlus as leadingStart, so the
    // + always renders left of the mode name.
    assert.match(host, /leadingStart={leadingPlus}/);
  });

  it('the + menu is the surface-owned verb menu', () => {
    const host = sessionSurfaceSource('src/components/composer/StationComposerHost.tsx');
    assert.match(host, lit(SESSION_SURFACE_CONTRACT.plusMenuContent));
    // The session's + menu: files, photos, # order, log, @ staff task.
    const plus = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionSwitcher.replace('SessionSwitcher', 'SessionPlusMenu'));
    assert.match(plus, /Add file/);
    assert.match(plus, /Add photo/);
    assert.match(plus, /Search existing photos/);
    assert.match(plus, /# Order number/);
    assert.match(plus, /Assign a task/);
    // Task creation routes through the desk-task endpoint — never forked SQL.
    assert.match(plus, lit(SESSION_SURFACE_CONTRACT.plusTaskApi));
    assert.doesNotMatch(plus, /INSERT INTO/i);
    // Created tasks display as artifacts through the validated pipeline.
    assert.match(plus, /SESSION_ARTIFACT_EVENT/);
  });

  it('law 10: the context ring reflects the model’s real context, at the row’s right end', () => {
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionPanel);
    // The ring is surface-owned and lists real context items (page, thread,
    // staged attachments) — never a static zero.
    assert.match(panel, /inlineRing=/);
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.ringList));
    assert.match(panel, /Thread/, 'the thread length is part of the reflected context');
  });

  it('law 15: the first plane is the OPERATION — board tools in, seeded questions out, no second query', () => {
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionPanel);
    const ledger = sessionSurfaceSource(SESSION_SURFACE_ENGINE.triageLedger);
    const feed = sessionSurfaceSource('src/components/session/useOperatorPulse.ts');
    const rank = sessionSurfaceSource('src/lib/assistant/operator-pulse.ts');
    const pane = sessionSurfaceSource(SESSION_SURFACE_ENGINE.missionPane);
    // The panel mounts the ledger and hands its picks to the composer draft.
    assert.match(panel, /<TriageLedger/);
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.pulseRowOnPick));
    assert.match(ledger, lit(SESSION_SURFACE_CONTRACT.pulseLedgerMarker));
    // The telemetry strip sums the SAME ranked items — one query feeds the
    // ledger, the strip and the model's answers.
    assert.match(pane, lit(SESSION_SURFACE_CONTRACT.pulseTelemetryTotals));
    // Numbers come from the board route (registered tools), never a bespoke
    // first-plane endpoint and never raw SQL on the client.
    assert.match(feed, lit(SESSION_SURFACE_CONTRACT.pulseBoardFeed));
    assert.doesNotMatch(feed, /fetch\((['"`])\/api\/(?!home-board)/);
    // Ranking is lane-first and lives in the pure module, with the lanes in
    // business order: promised before blocked before latent.
    assert.match(rank, lit(SESSION_SURFACE_CONTRACT.pulseLanes));
    assert.match(rank, /promised: 0, blocked: 1, latent: 2/);
    // Every item is a verb: the ledger seeds a question and never auto-sends
    // or mutates from the first plane.
    assert.match(rank, /question: string/);
    assert.doesNotMatch(ledger, /autoSend/);
    assert.doesNotMatch(ledger, /method:\s*'POST'/);
    // The FULL ranked set renders — no cap hiding work the operator asked to see.
    assert.doesNotMatch(ledger, /MAX_ITEMS/);
  });

  it('law 17: the ledger is an INSTRUMENT — one voice, fixed columns, mono tabular figures', () => {
    const ledger = sessionSurfaceSource(SESSION_SURFACE_ENGINE.triageLedger);
    // Every row (and the skeleton) shares ONE grid — columns cannot drift.
    assert.match(ledger, lit(SESSION_SURFACE_CONTRACT.ledgerRowGrid));
    assert.match(ledger, lit(SESSION_SURFACE_CONTRACT.ledgerMonoNumerals));
    // Rank by position + one accent, never font size: no display-serif, no
    // size jump between rows.
    assert.doesNotMatch(ledger, /font-serif/);
    assert.doesNotMatch(ledger, /text-(2xl|3xl)/);
    // The WHY rides the house tooltip, never a native title attribute.
    assert.match(ledger, lit(SESSION_SURFACE_CONTRACT.ledgerWhy));
    assert.doesNotMatch(ledger, /\ntitle=\{/, 'native title tooltips are the regression');
  });

  it('law 16: the power-up — greeting kept, one composer node, wake by activity', () => {
    const panel = sessionSurfaceSource(SESSION_SURFACE_ENGINE.sessionPanel);
    const surface = sessionSurfaceSource(SESSION_SURFACE_ENGINE.surface);
    const wake = sessionSurfaceSource(SESSION_SURFACE_ENGINE.focusWake);
    // The greeting component SURVIVES as the resting face — never deleted.
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.wakeGreetingKept));
    // The mouth is ONE node across both faces, so the wake never remounts
    // the field.
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.wakeOneComposer));
    // Activity wakes; a live thread pins; stillness with an empty thread
    // settles back.
    assert.match(surface, lit(SESSION_SURFACE_CONTRACT.wakeHook));
    assert.match(surface, lit(SESSION_SURFACE_CONTRACT.wakePinnedThread));
    assert.match(wake, /IDLE_MS/);
    // Reduced motion collapses the choreography to a hard swap.
    assert.match(panel, lit(SESSION_SURFACE_CONTRACT.wakeReducedHardSwap));
  });

  it('law 11: the right pane has ONE occupant, and the mission pane is its resting face', () => {
    const occupant = sessionSurfaceSource(SESSION_SURFACE_ENGINE.boardOccupant);
    assert.match(occupant, lit(SESSION_SURFACE_CONTRACT.paneOccupantType));
    // The board (mission) is the DEFAULT, artifacts push it aside.
    assert.match(occupant, /= 'board';/);
    // A fresh object from getSnapshot would spin useSyncExternalStore forever.
    assert.match(occupant, /function getSnapshot\(\): SessionPanelOccupant \{\s*return occupant;/);

    const surface = sessionSurfaceSource(SESSION_SURFACE_ENGINE.surface);
    assert.match(surface, lit(SESSION_SURFACE_CONTRACT.paneOccupantSwitch));
    assert.match(surface, lit(SESSION_SURFACE_CONTRACT.boardVerbChord));
    // The pane is NOT a route: no navigation on open, or the live thread dies.
    assert.doesNotMatch(surface, /router\.push\(['"`]\/board/);
    // After the wake settles, width is still the only thing that moves.
    assert.match(surface, /springConcierge/, 'the wake itself is the one choreography');
  });

  it('law 11: the mission pane is telemetry over a live floor feed', () => {
    const pane = sessionSurfaceSource(SESSION_SURFACE_ENGINE.missionPane);
    assert.match(pane, lit(SESSION_SURFACE_CONTRACT.missionPaneMarker));
    assert.match(pane, lit(SESSION_SURFACE_CONTRACT.missionTelemetryMarker));
    assert.match(pane, lit(SESSION_SURFACE_CONTRACT.missionFeedMarker));
    // The strip's ONLY behavior is seeding the composer draft.
    assert.match(pane, lit(SESSION_SURFACE_CONTRACT.missionSeedVerb));
    assert.match(pane, /autoSend: false/);
    // The floor feed is ambient: it renders, it never acts.
    const feed = sessionSurfaceSource(SESSION_SURFACE_ENGINE.floorFeed);
    assert.match(feed, /\/api\/activity\/feed/);
    assert.doesNotMatch(feed, /method:\s*['"`]POST/);
  });

  it('law 11: the mission plane is READ-only, like the artifact plane', () => {
    for (const rel of [
      SESSION_SURFACE_ENGINE.missionPane,
      SESSION_SURFACE_ENGINE.triageLedger,
      SESSION_SURFACE_ENGINE.floorFeed,
      SESSION_SURFACE_ENGINE.boardRows,
    ]) {
      const src = sessionSurfaceSource(rel);
      for (const [law, pattern] of Object.entries(SESSION_SURFACE_FORBIDDEN)) {
        assert.doesNotMatch(src, pattern, `${rel} violates ${law}`);
      }
      // The plane's only outbound action is seeding the composer — no POSTs.
      assert.doesNotMatch(src, /method:\s*['"`]POST/, `${rel} must not write`);
    }
  });

  it('law 12: the board reads the SAME registered tools the agent calls', () => {
    const route = sessionSurfaceSource(SESSION_SURFACE_ENGINE.boardRoute);
    // One implementation, two faces: no board-only SQL, no second query.
    assert.match(route, lit(SESSION_SURFACE_CONTRACT.boardDispatch));
    assert.doesNotMatch(route, /SELECT /i, 'a board tile must not carry its own SQL');
    // A tool the caller cannot read degrades to one denied tile, not a 403 board.
    assert.match(route, /state: result\.code === 'forbidden' \? 'denied'/);

    // The gap tool is registered, and its ranking is deterministic SQL — the
    // board's headline tile must never be a model opinion about the business.
    const registry = sessionSurfaceSource(SESSION_SURFACE_ENGINE.toolRegistry);
    assert.match(registry, /getRoiGaps/);
    const gapTool = sessionSurfaceSource(SESSION_SURFACE_ENGINE.gapTool);
    assert.match(gapTool, lit(SESSION_SURFACE_CONTRACT.boardGapTool));
    assert.match(gapTool, /organization_id = \$1/, 'every gap query leads with the org predicate');
  });

  it('law 13: an app connection is handed over in chat, with a server-minted link', () => {
    // The UI tool is declared ONCE in the Anthropic loop; the Grok loop imports
    // that array, which is what keeps the two loops in lockstep.
    const loop = sessionSurfaceSource(SESSION_SURFACE_ENGINE.agentLoop);
    assert.match(loop, lit(SESSION_SURFACE_CONTRACT.connectUiTool));
    const grok = sessionSurfaceSource(SESSION_SURFACE_ENGINE.grokLoop);
    assert.match(grok, /UI_TOOLS/, 'the Grok loop must inherit UI_TOOLS, never re-declare them');

    const hook = sessionSurfaceSource(SESSION_SURFACE_ENGINE.chatHook);
    assert.match(hook, /name === 'request_connection'/);
    // Only an https link the server minted may become a clickable button.
    assert.match(hook, lit(SESSION_SURFACE_CONTRACT.connectHttpsOnly));

    // Provenance, not just scheme: both loops gate the pill on a URL a connect
    // tool returned in the SAME turn, so a prompt-injected document cannot
    // dress its own https host in the app's chrome.
    for (const [rel, src] of [
      [SESSION_SURFACE_ENGINE.agentLoop, loop],
      [SESSION_SURFACE_ENGINE.grokLoop, grok],
    ] as const) {
      assert.match(
        src,
        lit(SESSION_SURFACE_CONTRACT.connectProvenanceChokepoint),
        `${rel} must validate request_connection at the shared chokepoint`,
      );
      assert.match(
        src,
        lit(SESSION_SURFACE_CONTRACT.connectProvenanceLedger),
        `${rel} must record the connect links its tools minted`,
      );
    }

    const pill = sessionSurfaceSource(SESSION_SURFACE_ENGINE.connectPill);
    assert.match(pill, lit(SESSION_SURFACE_CONTRACT.connectPillMarker));
    assert.match(pill, /<Button/, 'the CTA is a real button, keyboard-reachable');
    // The chat surface never collects a secret and never builds an OAuth URL.
    assert.doesNotMatch(pill, /type="password"|client_secret|code_verifier/);
    assert.doesNotMatch(pill, /accounts\.google\.com|oauth2\/v2\/auth/);
  });

  it('law 14: the local brain speaks Harmony, and the loop bridges it in one place', () => {
    const grok = sessionSurfaceSource(SESSION_SURFACE_ENGINE.grokLoop);
    // Extraction: a Harmony `to=functions.NAME` becomes a dispatched call.
    assert.match(grok, lit(SESSION_SURFACE_CONTRACT.harmonyToolBridge));
    // Suppression: the private `analysis` channel never streams to the bubble.
    assert.match(grok, lit(SESSION_SURFACE_CONTRACT.harmonyTextFilter));
    // One grammar, in the shared module — never re-inlined in the loop.
    assert.doesNotMatch(
      grok,
      /to=functions\\?\./,
      'the Harmony grammar lives in src/lib/ai/harmony.ts, not in the loop',
    );
  });
});
