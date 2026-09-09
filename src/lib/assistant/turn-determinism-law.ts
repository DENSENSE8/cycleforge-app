/**
 * TURN DETERMINISM — the invariants that keep the graded prompt a pure
 * function, so a model regression stays distinguishable from a moved input.
 *
 * Written 2026-09-07, out of two measured failures rather than theory.
 *
 * ## Failure one: the instrument, four iterations wasted
 *
 * Iterations 1-4 of the tool-router fine-tune moved nothing (tool selection
 * 0.853 → 0.882 → 0.871 → 0.866) while four rounds of data work were poured in.
 * The data was not the problem. The instrument had three defects: half the
 * dataset was silently dropped past a mis-set context ceiling, the logged loss
 * was ~8× the truth, and there was no validation split at all. Every conclusion
 * drawn in that window was unfalsifiable, and the cost was four iterations.
 *
 * The lesson generalises past training: **if an input to the graded path can
 * move on its own, no measurement over that path means anything.** A live web
 * search inside a turn is exactly that kind of input — the same golden replayed
 * tomorrow gets a different prompt, and a score change no longer has one
 * possible cause. That is why external data enters by ingest and not by turn.
 *
 * ## Failure two: the advertisement evicted its own subject
 *
 * Iteration 5 finally converged (artifact validity 0.286 → 1.000, refusals
 * 0.70 → 1.00) and still failed three gates. The cause was not the model.
 * `subsetAdvertisedTools` had dropped the golden's own expected tool from the
 * prompt on 6 of 133 rows, so the model was scored for not calling a tool it
 * was never shown — and scored a second time for `unadvertised_call` when it
 * called the right tool from memory anyway. On the 127 rows it was fairly
 * shown, all eight gates passed.
 *
 * The mechanism: cap 13 minus 8 always-on leaves ~5 ranked slots for ~45 tools.
 * Alias matching is whole-phrase (`aliasRegex` joins on `\s+`), so one absent
 * stopword takes a hit from 10 to 0 — "tracking 1Z58…" misses `'tracking
 * number'`, "Open document doc_1A2B3C" misses `'open the doc'`. The fallback
 * then scores +1 per query word found in a description via `includes`, a
 * SUBSTRING test, so "bench procedures" scored `get_benchmarks` and beat the
 * document search the operator actually asked for.
 *
 * This class was seen once before, in iteration 1's post-mortem
 * (`read_staff_document` goldens "lost because its own phrasings never ranked
 * the tool into the subset"), patched for that one tool, and never fixed at the
 * mechanism. It came back and cost three gates. Hence a ratchet, not a memory.
 *
 * ## The ratchet idiom
 *
 * `SUBSET_RECALL_DEBT` follows the same convention as `HAND_HTML_TABLE_DEBT`
 * and `VERB_DECLARATION_DEBT`: the set may never GROW, and an id leaves it when
 * the recall is fixed. A tripwire that fails on day one gets suppressed instead
 * of obeyed, so today's six known misses are named and frozen rather than
 * asserted away.
 *
 * Adding an invariant here means adding its check in
 * `turn-determinism-law.test.ts`. An invariant with no check is a comment.
 */

export const TURN_DETERMINISM_LAW = {
  promptIsReproducible:
    'Everything in the graded prompt path is a pure function of (turn text, page context, tool registry, database). Replaying a golden must rebuild the same prompt byte for byte, forever. The advertisement selector in particular takes no clock, no randomness, no network and no model — it is replayable in an eval by construction, which is the only reason a score means anything.',
  externalDataEntersByIngest:
    'External facts — industry benchmarks, competitor figures, market prices — land in a table with a source and an as_of, written by a scheduled ingest. Tools READ that table. No turn fetches the outside world mid-answer: it costs seconds against an 8 s first-token budget, it cannot be cited or audited by a tenant making a decision, and it makes the graded prompt non-reproducible, which is the defect that wasted iterations 1-4.',
  advertisementChangeRegeneratesTheDataset:
    'The advertisement IS the training distribution. If the cap, the always-on set, or the system core changes, the dataset is regenerated and the token lengths re-measured BEFORE training resumes. Iteration 5 was killed at step 26 of 354 rather than spend 4.3 h fitting an adapter to an 8-tool prompt that was no longer served.',
  subsetNeverEvictsTheSubject:
    'The advertisement may narrow, but it may never drop the tool the turn is explicitly about. A prompt naming a tracking number, a serial, a document id or an order id must carry the tool that resolves it — recall before rank. An operator whose question cannot be answered because the ranker mis-scored a phrase experiences a broken product, and a golden scored against a tool it was never shown measures nothing.',
} as const;

export type TurnDeterminismLawId = keyof typeof TURN_DETERMINISM_LAW;

/**
 * The advertisement selector, and the guarantee that makes it gradeable: it is
 * a leaf. It resolves the turn's tools from the turn's TEXT and nothing else.
 */
export const PROMPT_PATH_PURE_MODULES = ['src/lib/assistant/tool-subsetting.ts'] as const;

/**
 * Web-search / external-retrieval SDK names that must never appear in the
 * assistant TOOL path.
 *
 * Not a ban on web search — a ban on web search *inside a turn*. The same
 * provider is welcome under `src/app/api/cron/**`, writing rows into
 * `insight_links` with a source and an as_of, which is where a benchmark
 * belongs: cited, dated, tenant-scoped, and identical on replay.
 */
export const FORBIDDEN_IN_TOOL_PATH = [
  'tavily',
  'serpapi',
  'serper',
  'exa-js',
  'bing/v7',
  'customsearch',
  'perplexity',
] as const;

/**
 * Goldens whose expected tool `subsetAdvertisedTools` does not advertise.
 *
 * **CLOSED 2026-09-07, same day it was opened.** Six rows went in; the fix
 * landed and all six came out, so the list is empty and the tripwire now
 * asserts ZERO — recall is a standing guarantee, not a shrinking debt.
 *
 * The fix was a mechanism, not six alias strings, which is the whole reason it
 * is expected to hold (patching one tool at a time is what let this class recur
 * from iteration 1 to iteration 5). Three changes in `tool-subsetting.ts`:
 *
 * 1. `hasWord` replaced `haystack.includes(word)` in the description fallback,
 *    so "bench procedures" stopped scoring `get_benchmarks` on a substring.
 * 2. `aliasContentTokens` gives an alias partial credit by content-token
 *    coverage, so a missing connective degrades 10 → 5 instead of 10 → 0
 *    ("tracking [number]", "is [this] a return").
 * 3. `RECALL_FLOOR` — an identifier SHAPE in the turn text (tracking number,
 *    `ORD-`, serial, `doc_`, `SKU-`, document vocabulary, "what tools exist")
 *    guarantees its resolver a slot at a score no alias can outvote.
 *
 * The contract stays: this set may never GROW. A new eviction fails
 * `turn-determinism-law.test.ts` rather than surfacing as three lost gates in a
 * graded run four hours later.
 */
export const SUBSET_RECALL_DEBT: readonly { golden: string; tool: string; missedPhrase: string }[] = [];

export const TURN_DETERMINISM_ACCEPTANCE =
  'Replaying golden.jsonl a year from now rebuilds byte-identical prompts, so any score change is the model and nothing else — and no turn is answered with a tool the operator\'s own words could not reach.' as const;
