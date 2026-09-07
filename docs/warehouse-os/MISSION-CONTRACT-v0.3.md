# CycleForge mission contract v0.3

Date: 2026-09-06. Status: consolidated product proposal and release acceptance contract.

## 1. Authority and evidence

This combines the supplied “Mission Contract v0.2 (scouts merged),” its appended engineering, market, marketing and finance findings, the strategy developed in this conversation, and Michael’s addition of permission-controlled sourcing and purchasing. Only one attachment was supplied; the two document strands and scout appendices within it are consolidated here. The separately referenced `/workspace/cyc-mission-contract-endstate-pack.md` was not supplied or inspected.

This is a planning deliverable, not a declaration that the features below are deployed. It does not update Linear, arm an engineering host, publish ads, authorize purchases, or override executable repository laws. CYC-34 and CYC-82 are identifiers supplied by the contract; their live status has not been checked. Historical scout counts and deployment assertions remain historical evidence, not current release verification.

The new product direction deliberately differs from the August single-organization endgame: commercial SaaS, one person with multiple organization memberships, desktop business sessions, and mobile floor procedures. Use this contract as the commercial target; reconcile older architecture decisions explicitly when implementing affected work.

Private personal finance figures, internal agent names, and host machinery belong in private planning, not customer copy. Preserve the supplied constraint that launch spending requires a separate approved business budget. No spend amount or launch date is established here.

## 2. Mission and market promise

**Mission:** Help marketplace sellers turn inventory, staff time, and purchasing capital into more realized contribution profit by connecting every unit’s physical history to its commercial outcome—and turning that evidence into the next useful action.

**Product statement:** CycleForge is a warehouse and purchasing operating system for multi-brand sellers of refurbished and new products. Desktop sessions explain what happened, what deserves attention, and why. Mobile procedures guide the work. Sourcing connects unmet demand to reviewable buying opportunities. Staff feedback becomes tested, approved improvements that can be measured after release.

**Launch positioning:** The operating system for refurbished electronics sellers who need to know what to buy, where every unit is, and what their team should do next.

**Headline:** Know what to buy. Know where it is. Know what to do next.

**Supporting copy:** Connect your Amazon and eBay operations, guide receiving and packing from the phone, and turn blocked inventory into clear actions backed by the records behind them.

The long-term aspiration is a connected commerce operating system. The release boundary is a finite set of supported workflows and connectors. “Every platform” describes expansion potential, not launch coverage. “Number one” is an ambition, not a ranking guarantee.

## 3. Initial customer and jobs

Initial customer hypothesis: an owner-operated refurbished electronics business, approximately 5–30 operators, selling on Amazon and eBay, handling serial numbers, mixed condition, repair parts, returns and several storage locations. Employee count is a recruiting hypothesis, not an eligibility rule.

New products and accessories fit when they travel through the same receiving, inventory and fulfillment system. Expand into additional categories after the first customer cohort demonstrates repeatable value. Large 3PL billing operations and full manufacturing ERP are later markets.

| Person | Job they hire CycleForge to do | Value to prove |
|---|---|---|
| Owner / buyer | Show where cash is stuck and which purchase or action helps most | More contribution profit; less aging inventory and buying risk |
| Desk operator | Resolve order, inventory and supplier exceptions from one session | Less reconciliation and fewer missed promises |
| Floor operator | Scan an object and get a short, correct procedure | Less searching, retyping and uncertainty |
| Repair specialist | Find compatible parts, evidence and applicable instructions | More units economically returned to saleable condition |
| Multi-brand manager | Work across authorized organizations without repeated account administration | Reliable scope, permissions and consistent procedures |

Tenant priorities to validate, in order: trustworthy inventory/order state; simple floor execution; faster recovery of blocked money; useful sourcing recommendations; easy setup; traceable answers; controlled workflow customization. This ordering is a hypothesis, not completed customer research.

## 4. Competitive position and the blue-ocean hypothesis

| Alternative | Existing offer supported by public sources | CycleForge’s proposed reason to choose it |
|---|---|---|
| Sellercloud | Multichannel inventory, warehouse operations, purchasing, automatic PO creation and PO approval [S1–S2] | Refurbishment evidence and part compatibility connected to buying decisions, floor actions and outcome measurement |
| Linnworks | Sales-history forecasting, replenishment targets and purchase orders, including automated replenishment [S3] | Explain a purchase using the tenant’s repair yield, blocked units and achievable unit contribution |
| ShipHero | Warehouse execution, mobile pick/pack and scanning [S4] | A business session connecting procurement, refurbishment and exceptions to those floor procedures |
| Inventory Source | Supplier order processing and optional automatic processing [S5] | Buy for specific inventory and repair needs with condition/compatibility evidence and explicit purchase permission |
| General AI research / spreadsheets | Flexible search and manual comparison; this is a workflow comparison, not a surveyed product claim | Persist the demand, purchase approval, receipt, unit history and measured result in one permissioned system |

No market scan establishes that nobody offers this combination. The defensible claim is a focused product hypothesis, not “first AI warehouse,” a feature monopoly, or a competitor incapability claim.

The strongest differentiation is the **closed connection between demand, sourcing, physical evidence and realized profit**. A attractive price alone is insufficient: a part may be valuable because it unlocks several profitable repairs; a cheap unit may be unattractive because testing capacity is full or returns are high.

Generative display is the access method. The durable advantage, if earned, is accurate product/part identity, tenant-specific costs and repair outcomes, supplier reliability, traceable movement history, and workflows that actually improve those outcomes. Cross-tenant reuse must respect consent and data boundaries.

## 5. Product structure

An organization is a tenant and authorization boundary. A brand is a business dimension within an organization; it is not automatically a separate tenant. A channel account belongs to its owning organization and can map to a brand. A person has explicit memberships in one or more organizations. Warehouses, roles and permitted actions are scoped accordingly.

The selected organization is visible on every session, recommendation, purchase and workflow. Cross-organization reports require permission for each included organization. Identical external item numbers across seller accounts must not collapse into one identity.

Desktop provides persistent sessions, natural-language questions, evidence displays, exceptions, purchase approvals, operating priorities and workflow authorship. A right-side artifact viewport renders the answer appropriate to the question: table, timeline, comparison, procedure or calculation. Existing repository rules still govern record editing and placement; this proposal does not authorize a second record-editing rail.

Mobile runs short procedures with scanner/camera input, explicit results and recoverable exceptions. The supplied contract’s launch rule is retained: no general composer on mobile. Staff can report friction through a short structured report with current step and object context.

Both surfaces use the same event and domain records. A model chooses among validated display and action schemas. It does not invent executable UI or write arbitrary SQL. The model adapter can change without changing identity, permissions, formulas, approval rules or workflow contracts. Model independence does not promise identical results from every model.

Every answer carries scope, time range, freshness, record links, calculation version, missing inputs and a distinction between observed facts and estimates. Empty or stale results must not imply that there are no operational problems.

## 6. Sourcing and purchasing contract

### 6.1 The complete loop

Demand signal → standing search → candidate comparison → economic assessment → draft PO → explicit approval → supported purchase/PO transmission → confirmed supplier order → receiving → discrepancy/claim → actual cost and outcome feedback.

Demand comes from unfulfilled orders, repair parts, warranty work, replenishment, known sell-through and manually specified opportunities. Start with parts that unblock existing work and replenishment of proven items. Speculative arbitrage comes later because demand and refurbishment yield are less certain.

The repository already has a sourcing search orchestrator and an eBay adapter, plus a historical plan describing demand collectors and standing searches. Extend and verify these capabilities rather than treating sourcing as a new system. Code existence and old “shipped” labels do not prove production readiness.

### 6.2 Exact item matching

Store internal SKU, manufacturer, model, manufacturer part number, revision, region/voltage, condition, required accessories and compatible parent models separately. Keep supplier SKU, ASIN, eBay listing ID and seller/account identity as external references with their namespace. An eBay listing ID is not a reusable manufacturer part number.

Exact identifier matches and verified compatibility can qualify automatically for review. Title similarity or an AI guess must remain an unverified candidate. Substitutions require separate approval. Separate used, refurbished, parts-only and new inventory in both matching and economics.

### 6.3 Candidate display

Each result shows source URL and observation time; seller; identifiers and match explanation; condition/accessories; available quantity; item price; freight; nonrecoverable tax/duty; total landed cost; delivery estimate; applicable return terms; affected demand; current stock and incoming commitments; expected contribution range; and why it is ranked.

Unknown freight, taxes, compatibility or condition must remain unknown and prevent unattended purchase. Search results and asking prices are observations, not verified inventory or realized resale prices. Revalidate the actual purchasable offer at execution time.

### 6.4 Explicit purchase permission

Search and draft creation never imply permission to spend. The default is approval of each purchase or PO by an authorized person.

Optional unattended buying is permitted only after the tenant explicitly creates a standing authorization naming the exact allowed item numbers and conditions, approved sellers, quantity limits, maximum landed price, per-order and aggregate budget, destination, buying account, expiry, and who granted it. The action must validate that permission every time. A general instruction to “source products” cannot enable it.

Permissions are separate: search, draft, approve, transmit PO and execute purchase. Store the approved quote or bounded rule version, approving identity, timestamp and execution outcome. Changed identity, substitution, excess total, expired permission or unavailable payment route requires renewed approval.

Reserve budget and demand quantity atomically before execution so parallel jobs cannot double-buy. Reconcile ambiguous timeouts against the supplier order before retrying. Provide pause/revoke controls and an audit history. A confirmed purchase may not be reversible; rollback means halting future actions and pursuing the supplier’s cancellation process.

### 6.5 PO versus purchase

A draft PO is an internal proposal. A transmitted PO is an external instruction that may create a commitment under supplier terms. Neither is automatically proof of payment, supplier acceptance or physical receipt. Keep those states separate and reconcile them.

At launch, support reviewable PO export and a permitted purchasing handoff. Claim automated checkout only for explicitly supported and tested channels. eBay’s buying and checkout APIs require access approval and acceptance is not guaranteed [S6]. General web discovery is feasible; reliable purchasing across arbitrary websites is not a trivial extension of search.

## 7. Economic formulas and attention ranking

The earlier response’s confidence/reversibility coefficients were illustrative prioritization choices, not industry standards. Do not ship them as universal constants or call them financial ROI. Actual ranking requires tenant costs, observed outcomes and a stated time horizon.

Use one currency and a consistent tax basis. Exclude collected sales tax from revenue, and exclude recoverable tax from cost. Define cost allocation once. Report estimates separately from settled results.

**Unit contribution:** net product and shipping revenue − landed acquisition cost − incremental parts − direct labor − marketplace/payment fees − outbound shipping/packaging − attributable advertising − return/warranty allowance. Net revenue excludes discounts and refunds. The allowance covers expected costs not already recognized; reconcile it as actual returns arrive to avoid double counting. Contribution is not accounting net profit: fixed overhead remains separate.

**Expected net recovery before acquisition:** Σ(probability of outcome × net proceeds for that outcome after selling, repair, fulfillment and return costs), across mutually exclusive outcomes such as successful refurb resale, parts recovery and scrap. Probabilities sum to one. Include the no-sale/remaining-stock outcome over the chosen horizon.

**Maximum landed acquisition cost:** expected net recovery before acquisition − required contribution dollars − uncertainty reserve. Compare that threshold with the all-in landed quote, not the listing price alone.

Example, illustrative only: 80% chance of $140 net recovery and 20% chance of $20 salvage gives $116 expected recovery. A $30 contribution requirement and $10 uncertainty reserve produce a $76 maximum landed buy cost. An $80 landed offer fails even if its headline item price is $60.

**Part-buy benefit:** expected net proceeds from completing the repair − expected net proceeds from the best alternative without the part − incremental part/repair/fulfillment costs not already included. Historical acquisition cost is sunk for this immediate repair decision but remains in total unit profitability. Do not assign the full value of the same repaired unit to several alternative part candidates.

**Inventory position:** eligible saleable on-hand + confirmed usable incoming − committed demand. Repair holds and unknown-condition stock are not saleable stock.

**Reorder quantity:** max(0, target stock over lead time plus review period and buffer − inventory position), rounded for pack size and constrained by minimum order, cash and storage limits. Estimate demand with stockout days and sparse data disclosed. Unique refurbished units need condition-specific treatment.

**Initiative net benefit over H days:** incremental contribution + realized cost reductions − implementation cost − incremental operating cost. Time saved is a capacity metric unless labor expense falls or that capacity produces incremental contribution; do not count both.

**Initiative ROI:** initiative net benefit ÷ total incremental initiative cost. If cost is zero or unknown, show no ratio. Show expected benefit, investment, assumptions and downside separately. Cash released from inventory is a cash-flow result, not automatically profit.

**Break-even advertising ROAS:** 1 ÷ pre-ad contribution margin fraction, only when contribution and attributed revenue use the same basis. Also assess incremental contribution versus incremental ad spend; attributed ROAS alone does not prove causation.

Attention order: hard deadlines and policy obligations first; then feasible actions ranked by expected incremental contribution per constrained labor hour, with cash required, confidence and downside visible. Distinguish a heuristically urgent queue from financially valued opportunities. Bundle dependent tasks and eliminate overlapping benefits before ranking.

Every opportunity must have a record set, baseline, formula, horizon, estimate range, owner, action, resource requirement, verification method and outcome date. When value cannot be estimated, recommend the smallest measurement step.

## 8. Deliverables in attack order

The following is a dependency-based ranking of likely value, not a measured ranking of this tenant’s financial ROI. CYC-82 stays the first operational closure, while inventory truth is required to make purchasing and financial recommendations credible.

| Priority / deliverable | Exact scope | Acceptance evidence | Value |
|---|---|---|---|
| P0: Reproducible candidate and baseline | Identify candidate SHA and migrations; inspect receipts; capture current order, inventory and sourcing baseline | Versioned release evidence, known issues and rollback path; no claim that a clean SHA alone proves quality | Makes pilot results attributable and supportable |
| P1: Canonical order-to-pack closure | Amazon/eBay import, multi-line orders, partial shipments, allocation, exceptions, packing handoff and tracking reconciliation | Real authorized order traverses the entire flow; duplicate and out-of-order event replay produces no duplicate commitment or shipment | Protects promised revenue; removes reconciliation |
| P2: Receive and location truth | Ordered/received/short/damaged facts; serial/condition/evidence; item-and-bin movements; compatible part provenance | Trace one received unit through test, bin, pick and pack; shortage and mismatch remain visible; a physical audit reconciles sample records | Recovers missing inventory and prevents false availability |
| P3: Sourcing to approved PO | Reuse demand collectors and search; exact identities; landed-price thresholds; comparable candidates; dedupe; draft PO and permissioned handoff | Source a real blocked part; show calculation; rejection causes no spend; approval links to supplier confirmation and receipt | Unlocks existing repairs; saves buying time |
| P4: Grounded desktop session | Persistent questions, trusted queries, right-side displays, citations, freshness and opportunity explanation; repair/support retrieval | Fixed question suite matches record truth and respects tenant access; unavailable evidence is stated; session survives reload | Reduces investigation and improves trust |
| P5: Mobile procedure release | Complete receive and pack procedures; necessary move/pick steps; scan validation; exception routing; explicit disconnect/retry behavior | Operator completes defined flow without a desktop rescue; repeat scans/retries do not duplicate facts | Less floor friction and fewer errors |
| P6: Tenant packaging | Explicit memberships across at least two real test organizations; separate brands/accounts; role controls; onboarding; entitlement/billing; export and recovery | Positive/negative scope tests plus an external tenant completing onboarding and first workflow | Converts dogfood into a sellable SaaS |
| P7: Staff request to measured workflow | Structured request; linked engineering work; versioned definition; preview; approval; pilot; rollback and outcome evaluation | One real staff request becomes a released improvement with before/after evidence and a successful rollback rehearsal | Adapts to tenants without uncontrolled custom forks |
| P8: Bounded automatic procurement | Exact-item standing permission, budgets, expiry, concurrency control, revalidation and supplier reconciliation on a supported adapter | Permission absent/expired/revoked or quote over cap always blocks; timeout replay cannot double-buy | Speeds repeat proven purchases |
| P9: Growth decisions | Supplier quality/yield, partner proposals, profitable assortment and ad experiments | Each recommendation cites demand, margin, capacity and an experiment budget; post-experiment outcome recorded | Expands only where unit economics support it |

Tenancy and permissions apply to every preceding deliverable; P6 is commercial onboarding closure, not permission to defer isolation. Sourcing discovery can progress alongside order closure, but purchase recommendations depend on trustworthy demand and cost inputs. Verify existing functionality before rebuilding it.

## 9. Finite release end-state

Sell the launch edition as complete only after P0–P6 pass for the explicitly advertised scope. If the pitch promises staff-driven workflow improvement, P7 also becomes required. Automatic buying is an optional later capability unless P8 has passed on named suppliers/channels.

Required demo: one staff identity switches safely between two organizations; Amazon and eBay orders reach the common desk; one multi-line order resolves and reaches scan-verified pack; a received unit has a traceable bin and condition history; a query opens the correct evidence; a sourcing demand yields a priced, permissioned PO; a mobile exception returns to desktop triage; interrupted/repeated actions reconcile correctly.

Before general availability, at least one independent tenant must complete onboarding and the supported workflow. Dogfood alone cannot prove repeatable customer setup. Publish supported devices, connectivity requirements, connector capabilities, support process, export and recovery behavior. Do not market ordinary online sync as offline support.

Proposed pilot targets, explicitly product targets rather than industry benchmarks: at least 20% reduction in median time to resolve the selected exception or prepare a PO; no material regression in shipment correctness; and at least 99% verified location correctness in the audited pilot scope. Record denominators and sample size; use a predeclared comparison period and case mix. Small samples establish pilot evidence, not a universal performance guarantee.

Release security tests must show no unauthorized cross-organization access in the defined test suite and no purchase without valid permission. This is bounded test evidence, not an assertion that no vulnerability exists.

## 10. Staff improvement and model independence

Staff report: current object and procedure version, what blocked the work, frequency, time/errors incurred, desired behavior and “done means.” The desktop groups repeated reports and links them to observed events. Authorized operators review the proposed rule or procedure change.

Versioned configuration is the default tenant customization. Engineering changes use the repository’s normal graph, design and CI requirements. A staff complaint is input to prioritization, not authorization for a production rewrite. Active mobile work stays pinned to a procedure version until a safe transition; new sessions receive the approved version.

Measure the released change against its original hypothesis and retain or revert it. Ticket systems and engineering hosts are implementation choices, not tenant-facing requirements to buy another internal tool. The commercially relevant outcome is that a request can become a verified improvement.

## 11. Launch offer and message

Start with a bounded paid design-partner offer after its supported flow works: a 45-day operational pilot covering a named warehouse area, agreed order scope, receive/pack flow and one sourcing use case. Specify onboarding, data cleanup, training, support and success measurements in the offer. Forty-five days is a proposed offer duration, not a proven implementation estimate.

Demo sequence: blocked order or repair → ask why → open cited records → compare a matching part against the landed-cost ceiling → approve the PO → receive/scan → complete the floor procedure → show outcome. Demonstrate a staff-request improvement only once that loop works.

Ad angles to test separately: “Stop buying parts that do not fit”; “Find the part that gets your stalled inventory selling”; “One question to see what is holding up today’s orders”; “Your floor scans. Your desk explains.” Each ad must land on the demonstrated use case and a clear invitation to a pilot.

Choose pricing after measuring support effort, connector costs, AI usage and willingness to pay. A workspace subscription with included operators/volume and bounded AI usage is a hypothesis to test. Avoid unlimited lifetime usage commitments without cost evidence.

Kickstarter is an optional rewards campaign for a defined new edition with finite deliverables. It cannot offer equity, financial returns or loans [S7]. Keep demonstrable present capabilities distinct from funded roadmap work. Actual investment requires a separate fundraising route. Launch budget, campaign goal, price, ship date and second tenant remain decisions to establish with evidence.

## 12. How to stop feature drift

Require every proposed feature to name the tenant problem, affected workflow, measurable benefit, required evidence, implementation/maintenance cost, owner and acceptance test. It must close a P0–P7 release condition or outperform the next queued opportunity on the same resource assumptions. Cap concurrent delivery at one primary workflow closure and one independent research/measurement task.

Defer additional themes, broad connector catalogs, general agent farms, full 3PL billing, arbitrary generated mobile apps and speculative automatic arbitrage until the launch flow and customer outcomes are proven. Add a connector only when a customer’s otherwise viable workflow is blocked by its absence.

First execution package: verify CYC-82’s actual remaining work; inventory existing sourcing/demand and PO paths; select one blocked repair or missing-part order as the pilot scenario; record baseline time and economics; close the smallest complete receive/order/sourcing loop; then record the customer demo from a verified release candidate.

## 13. Repository evidence and research references

Repository observations: `src/lib/sourcing/search.ts` already orchestrates enabled adapters and candidate persistence; `src/lib/sourcing/adapters/ebay.ts` implements eBay discovery. `docs/todo/sourcing-hub-integration-plan.md` describes standing searches, demand collectors and acquisition history, but its deployment percentages need fresh verification. `src/lib/assistant/operator-pulse.ts` ranks by obligation lane, age and count; it is not yet proof of dollar ROI. `src/app/api/automations/route.ts` describes an observe-only installed-workflow feed. The earlier chat’s dirty-file counts are snapshots, not a current completion score.

Current primary-source product research supports market comparisons, not tested competitor evaluations:

- S1: [Sellercloud platform](https://sellercloud.com/) — multichannel inventory, orders and warehouse operations.
- S2: [Sellercloud purchasing](https://sellercloud.com/features/purchasing/) — automated PO creation, approval, costs and predictive purchasing.
- S3: [Linnworks stock forecasting](https://www.linnworks.com/features/stock-forecasting/) — demand-based replenishment and purchasing.
- S4: [ShipHero supported warehouse hardware](https://software-help.shiphero.com/hc/en-us/articles/4419328395533-Overview-Supported-Hardware-Devices) — mobile warehouse execution and scanning.
- S5: [Inventory Source order automation](https://help.inventorysource.com/article/122-order-automation-overview) — supplier order processing and auto-processing.
- S6: [eBay Buy API requirements](https://developer.ebay.com/api-docs/buy/buy-requirements.html) — production and checkout access limitations.
- S7: [Kickstarter backer returns](https://help.kickstarter.com/hc/en-us/articles/115005047953-What-do-backers-get-in-return) — rewards and prohibition on equity/financial returns.
- S8: [Amazon Renewed](https://sell.amazon.com/programs/renewed) — refurbishment qualification and quality requirements.
- S9: [eBay Top Rated program](https://www.ebay.com/sellercenter/protections/top-rated-program) — marketplace service-performance conditions.
- S10: [GS1 General Specifications](https://ref.gs1.org/standards/genspecs/) — identification and scan-based transaction evidence.

Marketplace policies vary by geography, product and API version; operational rules must cite the applicable source and review date. The original pasted document’s competitor ownership/pricing claims and categorical “open market” assertions have not been adopted as verified facts.
