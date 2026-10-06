/**
 * Tool advertisement subsetting for self-hosted model runtimes (train
 * handoff §3). The dock advertises every permission-visible verb (~54 wire
 * tools, ~35 kB) on every round; a local 8B pays that whole block as prefill
 * every time — first_token_ms is prefill-bound, not decode-bound (measured
 * 11.8 s @ 54 tools vs 1.2 s @ 3 tools on the same hardware).
 *
 * This module picks the ~8–10 tools THIS turn needs:
 *   • an always-on core: `find_records`, the one record finder (the system
 *     core routes every find/which question to it), `render_artifact` (mandatory for
 *     data answers), and `propose_mutation` (the one write chokepoint);
 *   • keyword-driven UI tools (navigate/highlight/canvas/print/connection);
 *   • everything else by deterministic relevance: alias hits on house
 *     vocabulary first, then description-word overlap as the fallback signal.
 *
 * The same function must decide what production advertises and what the
 * training set embeds, so it lives in src/ with a test, not in a script.
 * Selection reads ONLY the turn text and page context — never the model, so
 * it is identical across seeds and replayable in evals.
 */

import type { OpenAiFunctionTool } from '@/lib/assistant/tools/openai-schema';
import { isCarrierUniqueTracking } from '@/lib/scan-resolver';

/** Total advertisement budget for a self-hosted turn (core + UI + ranked).
 * 8 not 10: measured on the 16 GB card, 10-tool rows push QLoRA training
 * activations past what is left after the OS desktop — and the wire budget
 * only improves (≈9.6 kB at 8). Still inside the handoff's "~8–10" target. */
export const SELF_HOSTED_TOOL_CAP_DEFAULT = 13;

/** A ranked tool at or above this score was named by an alias (a full hit scores 10). */
const STRONG_SCORE = 5;
/** How many tools with only description-word overlap may still ride. */
const WEAK_FILLERS = 2;

/** Server verbs every turn can reach for, whatever the question was: the one record finder. */
const ALWAYS_ON_CORE: Record<string, true> = {
  find_records: true,
};

/** The write chokepoint — subsetting it out would make write asks unanswerable. */
const ALWAYS_ON_WRITES: Record<string, true> = { propose_mutation: true };

/** Mandatory on every self-hosted turn: data answers land through it. */
const ALWAYS_ON_UI: Record<string, true> = { render_artifact: true };

/**
 * The five operator reports are ALWAYS advertised (angle 16): a self-hosted
 * wire only sees the subsetted list, so keyword-ranking them meant an owner
 * phrasing the ranker did not recognize — "how did the pack bench do today?" —
 * made the report not exist on the local box. The cap carries them: 4 core
 * slots + 5 reports + 4 ranked.
 */
const ALWAYS_ON_REPORTS: Record<string, true> = {
  get_packing_performance: true,
  get_unbox_backlog: true,
  get_order_value_rank: true,
  get_roi_rank: true,
  get_delegation_plan: true,
};

/** UI verbs that ride only when the turn names their trigger. */
const UI_KEYWORDS: Record<string, readonly string[]> = {
  navigate: ['open the', 'go to', 'take me to', 'navigate to', 'jump to'],
  highlight: ['highlight', 'point at', 'point me at', 'mark the row'],
  focus_node: ['focus on the node', 'focus node'],
  set_lens: ['lens'],
  set_zoom: ['zoom'],
  print_handling_unit_labels: ['print', 'label', 'sticker'],
  request_connection: ['connect'],
};

/**
 * House-vocabulary routing aliases per tool — the phrases an operator
 * actually types. Alias hits outweigh description overlap 10:1 so these win
 * when both fire. Keep aliases aligned with the tool descriptions in the
 * registry; when a golden shows a miss here, add the phrase, not a golden.
 */
const TOOL_ALIASES: Record<string, readonly string[]> = {
  get_signals_by_node: ['signals', 'why failing', 'node signals', 'problem cluster'],
  get_top_reasons: ['top reasons', 'reasons for', 'why are', 'fail reasons', 'return reasons', 'why did'],
  get_unit_journey: ['unit story', 'unit journey', 'story of this unit', 'lifecycle of the serial'],
  get_feed_state: ['feed', 'working set', 'queue state'],
  get_graph: ['workflow graph', 'operations graph', 'the graph', 'nodes and edges', 'whole workflow'],
  get_node_detail: ['node detail', 'station detail', 'occupancy', 'one station', 'this node'],
  get_benchmarks: ['benchmark', 'industry', 'typical values', 'how do we compare', 'vertical'],
  get_kpis: ['kpi', 'kpis', 'throughput', 'event counts', 'how many received', 'how many shipped', 'weekly throughput', 'received this week', 'kpi rollup'],
  search_notes: ['notes', 'buyer note', 'reason code', 'search reasons', 'tech notes'],
  get_mutation_history: ['what did you change', 'mutation history', 'your changes', 'what have you changed'],
  get_chat_history: ['chat history', 'previous conversations', 'past sessions', 'as we discussed', 'yesterday we'],
  resolve_support_ticket: ['support ticket', 'ticket scan', 'ticket number', 'the ticket'],
  get_operations_journey: ['what happened to', 'journey', 'full history', 'trace', 'timeline', 'cross-station'],
  get_order_lookup: ['order id', 'tracking number', 'look up order', 'specific order'],
  get_order_documents: ['shipping label', 'packing slip', 'paperwork', 'invoice', 'order documents', 'label for order', 'slip for order', 'show me the label', 'pull up the label'],
  lookup_serial: ['serial return', 'shipped this serial', 'is this a return', 'return-intake', 'which order'],
  lookup_warranty_coverage: ['warranty', 'coverage', 'under warranty', 'when does the warranty'],
  list_warranty_claims: ['warranty claims', 'claims', 'claim status', 'open claims'],
  get_assignments: ['who is assigned', 'assignments', 'work orders', 'assigned to', 'test queue', 'repair queue'],
  get_my_tech_queue: ['my queue', 'my tech', 'my inbox', 'my cartons', 'my returns'],
  list_support_followups: ['follow-up', 'followups', 'follow-ups', 'support inbox'],
  search_photos: ['photos', 'photo', 'pictures', 'damage', 'media library'],
  get_receiving_by_tracking: ['which carton', 'receiving carton', 'carton for', 'receiving for this'],
  get_ticket_entities: ['zendesk', 'ticket entities', 'ticket link'],
  get_packing_kpi: ['packing pace', 'packer', 'packed most', 'packing kpi', 'are we on capacity', 'pack rate', 'packing performance', 'packer counts', 'last shift'],
  resolve_receiving_line_for_order: ['line for order', 'photos from order', 'move the photos', 'lines on'],
  list_receiving_line_photos: ['photos on the line', 'line photos', 'photos on this carton'],
  locate_product: ['where is', 'which bin', 'what bin', 'locate', 'find sku', 'how many do we have', 'in stock', 'on hand', 'fnsku', 'asin', 'upc'],
  list_location_contents: ['in bin', 'bin contents', 'what is in', "what's in", 'contents of', 'on the shelf', 'in location'],
  resolve_item_number: ['item number', 'create a rule', 'resolve product', 'asin', 'listing rule'],
  list_staff: ['staff', 'who works', 'teammate', 'staff id', 'staffers', 'named'],
  draft_ticket_reply: ['draft a reply', 'reply to the ticket', 'ticket reply', 'draft reply'],
  get_daily_checks: ['daily checks', 'checklist', 'checked in today', 'checks for'],
  get_my_day: ['my day', 'what should i work on', 'waiting on me', 'do next', 'anything for me'],
  get_project_tasks: ['project tasks', 'ops plan', 'plan tasks', 'project inbox', 'still open on'],
  triage_orders_csv: ['csv', 'import orders', 'pasted orders', 'triage this', 'pending orders spreadsheet'],
  list_connected_apps: ['connected apps', 'my apps', 'integrations', 'which apps'],
  connect_app: ['connect', 'sign in to', 'hook up'],
  search_staff_documents: ['google docs', 'my docs', 'search documents', 'handbook', 'document search', 'ops handbook', 'sop', 'find the doc'],
  read_staff_document: ['read the document', 'read the doc', 'document text', 'open the doc', 'read the handbook', 'read the ops handbook', 'what does the sop say', 'show me the text of'],
  get_roi_gaps: ['roi', 'gaps', 'leaking', 'losing money', 'fix first', 'biggest gaps', 'where are we losing'],
  get_station_catalog: ['station catalog', 'parts list', 'blocks', 'composition', 'station builder'],
  // The five operator reports. These aliases are the OWNER'S OWN SENTENCES —
  // the phrases he types, not the tool's vocabulary. A self-hosted runtime only
  // sees a subsetted advertisement, so a report the keywords cannot reach is a
  // report that does not exist on the local box.
  get_packing_performance: [
    'packing performance',
    'how many boxes did',
    'packer efficiency',
    'wait minutes',
    'minutes per box',
    'packed today',
    'pack floor',
  ],
  get_unbox_backlog: [
    'left to be unboxed',
    'unbox backlog',
    'boxes to open',
    'waiting at receiving',
    'packages to open',
    'not unboxed',
  ],
  get_order_value_rank: [
    'most expensive order',
    'highest value order',
    'biggest order',
    'value in the building',
    'expensive order in the warehouse',
  ],
  get_roi_rank: [
    'highest roi',
    'highest rois',
    'biggest gaps',
    'clear the backlog',
    'fix first',
    'where are we leaking',
  ],
  get_delegation_plan: [
    'delegate',
    'who should attack',
    'who is free',
    'pending tasks',
    'roster load',
    'who can i send',
  ],
  search_tool_registry: ['tool forge', 'registry of tools', 'search the tool registry'],
  submit_approval_decision: ['approval', 'approve the request', 'decision on the request'],
  execute_build_sandbox: ['build sandbox', 'run the build', 'sandbox'],
  commit_to_git: ['commit', 'git', 'branch'],
  revert_mutation: ['undo', 'revert', 'undo that', 'revert it'],
  // The operator's own sentences for pairing a dropped file, plus the replies
  // that confirm or cancel a pending link on the next turn.
  link_manual_to_sku: [
    'link this manual',
    'link the manual',
    'attach this manual',
    'manual to sku',
    'manual',
    'link',
    'attach',
    'print outs',
    'confirm',
    'yes',
    'go ahead',
    'cancel the link',
  ],
  request_payment: [
    'take payment',
    'payment link',
    'collect payment',
    'charge the customer',
    'send an invoice',
    'invoice the order',
    'checkout link',
    'square',
  ],
  print_order_paperwork: [
    'print the packing slip',
    'print the shipping label',
    'print the label and slip',
    'print the papers',
    'print the paperwork',
    'print paperwork',
    'reprint',
    'print again',
    'packing slip',
    'shipping label',
  ],
  // A caller ordering by phone, or an order sold on a channel (eBay, Amazon…),
  // in the operator's words — and the follow-ups that fill the card in
  // (address, ZIP, ship-by, prices, listing link, tracking).
  draft_manual_order: [
    'phone order',
    'new order',
    'enter an order',
    'add an order',
    'ebay order',
    'amazon order',
    'walmart order',
    'marketplace order',
    'listing',
    'buyer',
    'tracking is',
    'buy a label',
    'called in',
    'on the phone',
    'wants to order',
    'wants to buy',
    'order for',
    'ship to',
    'ship by',
    'zip',
    'address',
    'each',
    'customer',
  ],
  create_manual_order: ['create this order', 'create the order', 'create it', 'place the order', 'confirm', 'yes'],
  link_po_to_order: ['link po', 'link the po', 'link this po', 'unlink', 'po is for order', 'bought for order', 'link it to order', 'confirm', 'yes'],
  set_order_flag: ['flag', 'priority', 'on hold', 'put on hold', 'damaged', 'discrepancy', 'awaiting customer', 'mark ready', 'unflag'],
  mark_out_of_stock: ['out of stock', 'oos', 'mark out of stock', 'no stock'],
  clear_out_of_stock: ['back in stock', 'clear out of stock', 'in stock', 'clear oos'],
  bulk_scan_out: ['scan out', 'scanned out', 'packed orders', 'ship confirm'],
  create_task: ['task', 'assign', 'remind', 'reminder', 'to do', 'follow up'],
  reconcile_refs: ['reconcile', 'which of these', 'check this list', 'did we receive', 'not received', 'vendor list', 'pasted list'],
  get_customer: ['customer', 'who is', 'calls back', 'caller', 'customer phone', 'customer email', 'find customer'],
  get_worklist: ['what should i do first', 'do first', 'worklist', 'exceptions queue', 'out of stock orders', 'need to order', 'late orders', 'past ship by', 'pending orders'],
  get_staff_report: ['staff report', 'performance', 'time spent', 'task time', 'how much time', 'per staff', 'per day', 'packing pace'],
  get_tracking_status: ['carrier status', 'tracking status', 'delivered', 'in transit', 'out for delivery', 'where is my package', 'package'],
  watch_tracking: ['watch', 'tell me when', 'notify me', 'let me know when', 'stop watching', 'unwatch', 'arrives'],
  quote_label_rates: ['label rates', 'shipping rates', 'rate shop', 'rates for order', 'how much to ship', 'quote a label', 'shipping cost', 'cheapest shipping', 'return label', 'replacement label'],
  buy_label: ['buy a label', 'buy the label', 'buy label', 'purchase a label', 'buy the cheapest', 'buy the fastest', 'buy shipping', 'buy postage', 'return label', 'replacement label'],
  void_label: ['void the label', 'void label', 'void a label', 'cancel the label', 'refund the label'],
  // SIMPLE-FIRST: the workspace tells the chat what it needs.
  list_capabilities: ['what can you do', 'what can i turn on', 'capabilities', 'features', 'what is set up', 'what is turned on'],
  // No 'yes' / 'confirm': a bare yes is settled by the route's pending-confirmation path, never re-advertised here.
  enable_capability: ['i need to record', 'we need to record', 'i need a', 'we need a', 'turn on', 'enable', 'unlock', 'set up', 'activate', 'intake counter'],
  import_products_from_ebay: ['ebay', 'import products', 'import my products', 'my listings', 'connect ebay', 'ebay listings'],
};

/** Words too common to carry routing signal. */
const STOPWORDS: Record<string, true> = {
  the: true, a: true, an: true, this: true, that: true, these: true, those: true, what: true,
  which: true, when: true, where: true, how: true, why: true, who: true, is: true, are: true,
  was: true, were: true, be: true, been: true, being: true, do: true, does: true, did: true,
  for: true, from: true, with: true, without: true, and: true, or: true, but: true, not: true,
  no: true, yes: true, to: true, of: true, in: true, on: true, at: true, by: true, as: true,
  it: true, its: true, we: true, our: true, us: true, you: true, your: true, i: true, me: true,
  my: true, can: true, could: true, should: true, would: true, will: true, shall: true,
  may: true, might: true, have: true, has: true, had: true, there: true, their: true,
  them: true, they: true, about: true, into: true, over: true, please: true, just: true,
  any: true, all: true, some: true, more: true, most: true, much: true, many: true,
  show: true, tell: true, give: true, want: true, need: true, know: true, get: true,
  got: true, today: true, now: true, up: true, out: true,
};

/** UI verb names — the flat keyword table above keys off these. */
const UI_NAMES: Record<string, true> = {
  navigate: true,
  highlight: true,
  focus_node: true,
  set_lens: true,
  set_zoom: true,
  render_artifact: true,
  print_handling_unit_labels: true,
  request_connection: true,
};

function aliasRegex(alias: string): RegExp {
  const body = alias.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${body}(?:[^a-z0-9]|$)`, 'i');
}

/**
 * Alias content tokens — the alias words that actually carry routing signal.
 *
 * `aliasRegex` is whole-phrase: one absent stopword takes a hit from 10 to 0.
 * Measured on the goldens, that is how "status of tracking 1Z58104A9021123456"
 * missed `'tracking number'` and "Is serial 35678904561 a return" missed
 * `'is this a return'`. An operator does not type the connective words, so a
 * phrase match is scored by COVERAGE of its content tokens instead of all-or
 * -nothing. A partial hit still outranks the +1 description noise that used to
 * win those slots.
 */
function aliasContentTokens(alias: string): string[] {
  return alias
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS[w]);
}

/** Whole-word test. `includes` matched "bench" inside "benchmarks". */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i').test(haystack);
}

/**
 * RECALL FLOOR — the advertisement may narrow, but it may never drop the tool
 * the turn is explicitly ABOUT.
 *
 * An operator who types an identifier has named the tool implicitly, and no
 * keyword ranker should be able to outvote that. Each entry is a SHAPE in the
 * turn text and the verb that resolves it; a hit scores far above any alias so
 * the tool is guaranteed a slot. This is
 * `TURN_DETERMINISM_LAW.subsetNeverEvictsTheSubject` made mechanical — the
 * alternative (one more alias string per miss) is what let this recur from
 * iteration 1 to iteration 5.
 *
 * Order matters: the first matching shape wins for a given tool, and a turn may
 * float several tools (a prompt naming an order AND a serial wants both).
 */
const RECALL_FLOOR: readonly { shape: RegExp; tool: string; why: string }[] = [
  { shape: /\btracking\b|\b1z[0-9a-z]{10,}\b/i, tool: 'get_order_lookup', why: 'a tracking number is an order question' },
  { shape: /\bord-\s?\d+\b/i, tool: 'get_order_lookup', why: 'ORD- is the order id shape' },
  {
    shape: /\b(shipping\s+labels?|packing\s+slips?|paperwork|invoices?)\b|\border\b[^.?!]*\b(labels?|slips?|documents?|docs?)\b|\b(labels?|slips?|documents?|docs?)\b[^.?!]*\border\b/i,
    tool: 'get_order_documents',
    why: 'an order\'s label / slip / paperwork is the order document reader, not document search or label printing',
  },
  { shape: /\bserial\b|\bsn-\s?\w+\b/i, tool: 'lookup_serial', why: 'a serial is a unit question' },
  { shape: /\bdoc_\w+\b/i, tool: 'read_staff_document', why: 'doc_ is a document id — read it, do not search' },
  { shape: /\b(document|doc|docs|handbook|sop)\b/i, tool: 'search_staff_documents', why: 'document vocabulary must reach document search' },
  { shape: /\btools?\b.*\b(exist|available|registry|forge)\b|\b(what|which)\s+tools?\b/i, tool: 'search_tool_registry', why: 'asking what tools exist is the registry, not the media library' },
  { shape: /\bsku-\w+\b|\bitem\s*(number|#)\b/i, tool: 'resolve_item_number', why: 'an item number is a resolution question' },
  { shape: /\bwhere\s+(is|are|do)\b|\bwhich\s+bins?\b|\b(sku|fnsku|asin|upc|gtin)\b|\bx00[a-z0-9]{7}\b|\bb0[a-z0-9]{8}\b/i, tool: 'locate_product', why: 'a where-is / identifier question is a location lookup' },
  { shape: /\b(bin|location|shelf|slot)\b/i, tool: 'list_location_contents', why: 'bin vocabulary must reach the bin reader' },
  {
    shape: /\b(link|attach|pair)\w*\b[^.?!]*\bmanuals?\b|\bmanuals?\b[^.?!]*\b(link|attach|pair|sku)\w*\b/i,
    tool: 'link_manual_to_sku',
    why: 'pairing a manual with a SKU is the manual link write, not a location lookup',
  },
  {
    shape: /\b(take|collect|request|send)\s+(a\s+)?payment\b|\bpayment\s+link\b|\bcheckout\s+link\b|\binvoice\s+(for\s+)?(the\s+)?(order|ph-)/i,
    tool: 'request_payment',
    why: 'taking payment for an order is the Square payment request, not a document or order read',
  },
  {
    shape: /\bphone\s+order\b|\bnew\s+(\w+\s+){0,2}order\b|\b(enter|add|log|record)\s+(an?\s+|this\s+)?(\w+\s+)?order\b|\blisting\s+(link\s+)?(is|:)|\/itm\/\d|\btracking\s+(number\s+)?(is|:)|\b(buyer|buyer's\s+name)\s+(is|:)|\bbuy\s+a\s+label\b|\bcalled\s+in\b|\b(wants?|would\s+like)\s+to\s+(order|buy)\b|\bship\s+(it\s+|them\s+)?to\b|\bship[-\s]by\b|\b(zip|zip\s+code|address)\s+is\b/i,
    tool: 'draft_manual_order',
    why: 'a caller ordering by phone or a new channel order (and the details that fill it in) is the order draft, not a record search',
  },
  {
    shape: /\bcreate\s+(this|the|that)?\s*(phone\s+)?order\b|\bplace\s+(this|the)\s+order\b/i,
    tool: 'create_manual_order',
    why: 'creating the drafted order is the confirm-before-write order tool',
  },
  {
    shape: /\b(un)?link\w*\b[^.?!]*\b(po|purchase\s+order)\b|\b(po|purchase\s+order)\b[^.?!]*\b(is|was)\s+(bought\s+)?for\s+(customer\s+)?orders?\b/i,
    tool: 'link_po_to_order',
    why: 'tying a purchase order to the outbound order it was bought for is the confirm-before-write link tool',
  },
  {
    shape: /\b(re)?print\w*\b(?![^.?!]*\b(totes?|handling\s+units?|h-\d+|stickers?)\b)[^.?!]*\b(labels?|slips?|paperwork|papers|orders?|receipts?|manuals?)\b/i,
    tool: 'print_order_paperwork',
    why: 'printing an order\'s label / slip / paperwork is the station paperwork print, not the document viewer or tote labels',
  },
  {
    shape: /\b(flag|flagged)\b|\b(priority|on\s+hold|put\s+on\s+hold|awaiting\s+customer|discrepancy)\b[^.?!]*\border|\border[^.?!]*\b(priority|hold|damaged|discrepancy|ready)\b/i,
    tool: 'set_order_flag',
    why: 'flagging orders is the confirm-before-write flag tool, not an order read',
  },
  {
    shape: /\bback\s+in\s+stock\b|\bclear\w*\s+(the\s+)?(out[\s-]+of[\s-]+stock|oos)\b|\b(un-?mark|remove)\b[^.?!]*\b(out[\s-]+of[\s-]+stock|oos)\b/i,
    tool: 'clear_out_of_stock',
    why: 'clearing out of stock is the confirm-before-write shortage clear',
  },
  {
    shape: /\b(out[\s-]+of[\s-]+stock|oos)\b/i,
    tool: 'mark_out_of_stock',
    why: 'marking lines out of stock is the confirm-before-write shortage write',
  },
  {
    shape: /\bscan(ned)?[\s-]+out\b/i,
    tool: 'bulk_scan_out',
    why: 'scanning out packed orders is the confirm-before-write scan-out',
  },
  {
    shape: /\b(create|add|make|new)\s+(a\s+)?task\b|\bassign\s+\w+[^.?!]*:|\bremind\s+(me|him|her|them)\b/i,
    tool: 'create_task',
    why: 'a task for staff (with a reminder) is the confirm-before-write task tool',
  },
  {
    // Two consecutive lines that are each nothing but an identifier — a pasted list.
    shape: /\b(reconcile|which\s+of\s+these|did\s+we\s+(receive|get))\b|(?:^|\n)[ \t]*[a-z0-9#-]*\d[a-z0-9#.-]{4,}[ \t]*\n[ \t]*[a-z0-9#-]*\d[a-z0-9#.-]{4,}[ \t]*(?:\n|$)/i,
    tool: 'reconcile_refs',
    why: 'a pasted list of numbers is the reconcile check, not one record lookup',
  },
  {
    shape: /\bcustomers?\b|\bcall(s|ed)?\s+back\b|\bcaller\b|\bwho\s+is\s+\+?[\d(]/i,
    tool: 'get_customer',
    why: 'a caller / customer by name, phone or email is the customer dossier',
  },
  {
    shape: /\bwhat\s+should\s+i\s+do\s+first\b|\bdo\s+first\b|\bworklist\b|\bexceptions?\s+(queue|list)\b|\bout\s+of\s+stock\s+(orders|list)\b|\bneed\s+to\s+order\b|\bpast\s+(the\s+)?ship[-\s]?by\b|\blate\s+orders?\b|\borders?\s+(are\s+|that\s+are\s+)?late\b|\bpending\s+(orders|list)\b/i,
    tool: 'get_worklist',
    why: 'a work-queue / what-first question is the ranked worklist',
  },
  {
    shape: /\b(staff|packer|employee)\s+(report|performance)\b|\bperformance\b|\btime\s+(spent|report)\b|\bhow\s+much\s+time\b|\btask\s+time\b/i,
    tool: 'get_staff_report',
    why: 'per-staff pace / time / goals is the staff report',
  },
  {
    shape: /\b(carrier|tracking)\s+status\b|\b(package|parcel)\b|\bdelivered\b|\bin\s+transit\b|\bout\s+for\s+delivery\b/i,
    tool: 'get_tracking_status',
    why: 'live carrier status is the carrier tracking read',
  },
  {
    shape: /\b(watch|notify\s+me|tell\s+me\s+when|let\s+me\s+know\s+when)\b[^.?!]*\b(tracking|package|parcel|arrives?|lands?|delivered|1z\w+|\d{12,})\b|\b(stop\s+watching|unwatch)\b/i,
    tool: 'watch_tracking',
    why: 'watching a tracking number is the self-scoped watch',
  },
  {
    shape: /\bvoid\w*\b[^.?!]*\blabels?\b|\b(cancel|refund)\b[^.?!]*\bshipping\s+label\b/i,
    tool: 'void_label',
    why: 'voiding a bought label is the confirm-before-write void',
  },
  {
    shape: /\b(buy|purchase)\b[^.?!]*\b(labels?|postage|cheapest|fastest|priority|ground|express|overnight)\b/i,
    tool: 'buy_label',
    why: 'buying a label is the confirm-before-write purchase on a server quote',
  },
  {
    shape: /\b(label|shipping)\s+(rates?|costs?|quotes?)\b|\brates?\s+(for|on)\s+(order|#|\d)|\bhow\s+much\b[^.?!]*\bto\s+ship\b|\bquote\b[^.?!]*\blabel\b|\b(return|replacement)\s+label\b/i,
    tool: 'quote_label_rates',
    why: 'label rates are the live ShipStation quote',
  },
  {
    // The answer to its "Still needed": a parcel weight with a unit, or L×W×H.
    shape: /^\s*(it'?s\s+|weighs\s+)?\d+(\.\d+)?\s*(lbs?|pounds?|oz|ounces?|kg)\b|\b\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?\s*[x×]\s*\d+/i,
    tool: 'quote_label_rates',
    why: 'a parcel weight / box size answers the label quote\'s Still needed',
  },
  {
    shape: /\bebay\b[^.?!]*\b(products?|listings?|import|connect|catalog)\b|\b(import|pull|connect|sync)\b[^.?!]*\bebay\b/i,
    tool: 'import_products_from_ebay',
    why: 'bringing eBay products in is the eBay product import, not a record search',
  },
  {
    // A general "what my business needs" ask carries no identifiers; a
    // specific PO / order with numbers stays with its draft tool.
    shape: /^(?![\s\S]*\d)[\s\S]*(\b(i|we)\s+(need|want|would\s+like)\s+(to\s+(record|track|manage|start|run|handle|set\s*up|use)\b|an?\s+\w+)|\b(turn\s+on|enable|unlock|activate)\b)/i,
    tool: 'enable_capability',
    why: 'what the workspace needs is a capability to switch on',
  },
  {
    shape: /\bwhat\s+can\s+(you|i|we)\s+(do|turn\s+on|set\s*up|unlock)\b|\bcapabilit(y|ies)\b/i,
    tool: 'list_capabilities',
    why: 'what the workspace can switch on is the capability list',
  },
];

/** Score awarded by a recall-floor hit — above any achievable alias total. */
const RECALL_FLOOR_SCORE = 1000;

/**
 * A recall-floor hit on the key tool takes these tools OUT of the turn: the
 * ask is unambiguous, and a look-alike tool the model was trained on steals
 * it. "Print the packing slip for order N" is a print, never the viewer.
 */
const FLOOR_SUPERSEDES: Record<string, readonly string[]> = {
  print_order_paperwork: ['get_order_documents'],
};

/**
 * A carrier-unique tracking number in the turn (1Z…, 9400…, TBA…) takes these
 * tools out unless their own recall floor hit: "which order shipped with
 * tracking 1Z…" is an order read, and the serial resolver's "which order"
 * alias handed it a tracking number it can never match.
 */
const TRACKING_SUPERSEDES: readonly string[] = ['lookup_serial'];

/** True when the text carries a carrier-unique tracking token. */
function mentionsCarrierTracking(text: string): boolean {
  return (text.match(/[a-z0-9]{12,}/gi) ?? []).some(isCarrierUniqueTracking);
}

/**
 * An `@` mention is an exact entity the operator picked, so its reader rides
 * the advertisement like a recall-floor hit — the id is already resolved and
 * the tool that consumes it must be callable.
 */
const MENTION_TOOLS: Record<'order' | 'sku' | 'bin', readonly string[]> = {
  order: ['get_order_lookup'],
  sku: ['locate_product'],
  bin: ['list_location_contents', 'locate_product'],
};

export interface ToolSubsetQueryContext {
  page?: string | null;
  mode?: string | null;
  station?: string | null;
  mentions?: ReadonlyArray<{ kind: 'order' | 'sku' | 'bin' }> | null;
  /** Files uploaded with this message — their consumer must be callable. */
  attachments?: ReadonlyArray<unknown> | null;
}

export interface ToolSubsetResult {
  /** The advertisement to send, core first then ranked by score. */
  tools: OpenAiFunctionTool[];
  /** Names always advertised regardless of the turn text. */
  mandatoryNames: string[];
  /** Relevance-picked names, best first. Empty when nothing matched. */
  rankedNames: string[];
}

/**
 * Deterministic per-turn advertisement. `tools` arrives in production order
 * (registry, writes, UI); the result keeps that order within each tier so the
 * wire bytes are stable for identical inputs.
 */
export function subsetAdvertisedTools(
  userMessage: string,
  context: ToolSubsetQueryContext | null | undefined,
  tools: readonly OpenAiFunctionTool[],
  cap: number = SELF_HOSTED_TOOL_CAP_DEFAULT,
): ToolSubsetResult {
  const queryText = [
    userMessage,
    context?.page ?? '',
    context?.mode ?? '',
    context?.station ?? '',
  ]
    .join('\n')
    .toLowerCase();
  const queryWords = new Set(
    queryText
      .split(/[^a-z0-9#]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS[w]),
  );

  const mentioned = new Set((context?.mentions ?? []).flatMap((m) => MENTION_TOOLS[m.kind] ?? []));
  if ((context?.attachments ?? []).length > 0) mentioned.add('link_manual_to_sku');
  const mandatory: OpenAiFunctionTool[] = [];
  const ranked: Array<{ tool: OpenAiFunctionTool; score: number }> = [];
  const floorHits: string[] = [];

  for (const tool of tools) {
    const name = tool.function.name;
    const isUi = !ALWAYS_ON_CORE[name] && !ALWAYS_ON_WRITES[name] && UI_NAMES[name] === true;
    if (ALWAYS_ON_CORE[name] || ALWAYS_ON_WRITES[name] || ALWAYS_ON_UI[name] || ALWAYS_ON_REPORTS[name]) {
      mandatory.push(tool);
      continue;
    }
    let score = 0;
    if (isUi) {
      const keywords = UI_KEYWORDS[name] ?? [];
      if (keywords.some((k) => aliasRegex(k).test(queryText))) score += 10;
    } else {
      for (const alias of TOOL_ALIASES[name] ?? []) {
        if (aliasRegex(alias).test(queryText)) {
          score += 10;
          continue;
        }
        // Partial credit by content-token coverage, so a missing connective
        // ("tracking [number]", "is [this] a return") degrades instead of
        // vanishing. Single-token aliases are already covered by the exact test.
        const tokens = aliasContentTokens(alias);
        if (tokens.length < 2) continue;
        const hit = tokens.filter((t) => hasWord(queryText, t)).length;
        if (hit > 0) score += Math.round((10 * hit) / tokens.length);
      }
      // Fallback signal: rare query words that appear in the description.
      // WHOLE WORD — `includes` scored "bench procedures" onto get_benchmarks
      // and beat the document search the operator actually asked for.
      const haystack = `${name.replace(/_/g, ' ')} ${tool.function.description}`.toLowerCase();
      for (const word of queryWords) if (hasWord(haystack, word)) score += 1;
    }
    // Recall before rank: an identifier in the turn text guarantees its
    // resolver a slot, whatever the keyword ranking said.
    for (const floor of RECALL_FLOOR) {
      if (floor.tool === name && floor.shape.test(queryText)) {
        score += RECALL_FLOOR_SCORE;
        floorHits.push(name);
        break;
      }
    }
    if (mentioned.has(name)) score += RECALL_FLOOR_SCORE;
    if (score > 0) ranked.push({ tool, score });
  }
  const superseded = new Set(floorHits.flatMap((name) => FLOOR_SUPERSEDES[name] ?? []));
  if (mentionsCarrierTracking(userMessage)) {
    for (const name of TRACKING_SUPERSEDES) if (!floorHits.includes(name)) superseded.add(name);
  }
  if (superseded.size > 0) ranked.splice(0, ranked.length, ...ranked.filter((r) => !superseded.has(r.tool.function.name)));

  ranked.sort((a, b) => b.score - a.score || a.tool.function.name.localeCompare(b.tool.function.name));

  // A description-word overlap alone (a score under one alias hit) is weak
  // evidence: at most WEAK_FILLERS such tools ride. Every extra schema is
  // prefill on every round of a self-hosted turn (measured ~1.5k tok/s on the
  // local box), so noise tools cost the operator real seconds.
  const budget = Math.max(0, cap - mandatory.length);
  let weak = 0;
  const picked = ranked.filter((r) => r.score >= STRONG_SCORE || weak++ < WEAK_FILLERS).slice(0, budget);
  const subset = [...mandatory, ...picked.map((r) => r.tool)];
  return {
    tools: subset,
    mandatoryNames: mandatory.map((t) => t.function.name),
    rankedNames: picked.map((r) => r.tool.function.name),
  };
}

