import type { NextRequest } from 'next/server';
import type { AnonymousAuthContext, AuthContext } from '@/lib/auth/auth-context';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export interface CreateAuditLogParams {
  actorStaffId?: number | null;
  actorRole?: string | null;
  /** Tenant owner of this audit row. Nullable: system/no-actor rows stay NULL. */
  organizationId?: string | null;
  source: string;
  action: string;
  entityType: string;
  entityId: string | number;
  stationActivityLogId?: number | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/** Internal insert — callers use {@link recordAudit}. */
async function createAuditLog(
  db: Queryable,
  params: CreateAuditLogParams,
): Promise<number | null> {
  const result = await db.query(
    `INSERT INTO audit_logs (
      actor_staff_id,
      actor_role,
      organization_id,
      source,
      action,
      entity_type,
      entity_id,
      station_activity_log_id,
      request_id,
      ip_address,
      user_agent,
      before_data,
      after_data,
      metadata
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb
    )
    RETURNING id`,
    [
      params.actorStaffId ?? null,
      params.actorRole ?? null,
      params.organizationId ?? null,
      params.source,
      params.action,
      params.entityType,
      String(params.entityId),
      params.stationActivityLogId ?? null,
      params.requestId ?? null,
      params.ipAddress ?? null,
      params.userAgent ?? null,
      params.beforeData ? JSON.stringify(params.beforeData) : null,
      params.afterData ? JSON.stringify(params.afterData) : null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

// ── Canonical vocabulary ───────────────────────────────────────────────────
//
// Industry-standard audit reads filter on `action` and `entity_type`. Both
// must be stable strings — never rename them. New verbs go here; downstream
// dashboards key off these constants.

export const AUDIT_ENTITY = {
  COUNTER_SESSION: 'counter_session',
  PO: 'purchase_order',
  RECEIVING: 'receiving',
  RECEIVING_LINE: 'receiving_line',
  // Incoming email worklist row (email_missing_purchase_orders to-do pile)
  EMAIL_MISSING_PO: 'email_missing_purchase_order',
  SERIAL_UNIT: 'serial_unit',
  HANDLING_UNIT: 'handling_unit',
  LABEL_MANIFEST: 'label_manifest',
  TECH_SERIAL: 'tech_serial_number',
  SKU: 'sku',
  SKU_RELATIONSHIP: 'sku_relationship',
  PART_LINK: 'part_link',
  // Fulfillment substitution / order-line amendment (ordered vs fulfilled unit)
  ORDER_AMENDMENT: 'order_amendment',
  SKU_STOCK: 'sku_stock',
  BIN: 'bin',
  SHIPMENT: 'shipment',
  ORDER: 'order',
  /** Hold-bucket row for unmatched outbound tracking (`orders_exceptions`). */
  ORDERS_EXCEPTION: 'orders_exception',
  PACKER_LOG: 'PACKER_LOG',
  STAFF: 'staff',
  // Enrolled customer-facing kiosk tablet (device principal — kiosk_devices).
  KIOSK_DEVICE: 'kiosk_device',
  PHOTO: 'photo',
  PHOTO_FOLDER: 'photo_folder',
  PHOTO_IMAGE_TYPE: 'photo_image_type',
  PHOTO_LABEL: 'photo_label',
  LISTING_PHOTO: 'listing_photo',
  // External platform connection (organization_integrations vault row).
  INTEGRATION: 'integration',
  // One row of the fixed daily checklist (daily_check_items). The per-day
  // TICKS are not audited — daily_check_marks already carries staff + instant.
  DAILY_CHECK_ITEM: 'daily_check_item',
  STAFF_TODO: 'staff_todo',
  STAFF_MESSAGE: 'staff_message',
  // Entity-anchored conversation thread (entity_threads)
  ENTITY_THREAD: 'entity_thread',
  // Platform-agnostic support ticket registry row (support_tickets)
  SUPPORT_TICKET: 'support_ticket',
  STAFF_PREFERENCE: 'staff_preference',
  // Settings Registry — per-page org/staff configurable behavior (docs/settings-registry.md)
  SETTINGS: 'settings',
  /** Org-owned listing→staff automation rule (automation_rules). */
  AUTOMATION_RULE: 'automation_rule',
  /** Org-defined custom grid column (custom_field_defs). */
  CUSTOM_FIELD_DEF: 'custom_field_def',
  REASON_CODE: 'reason_code',
  /** A tenant-authored scan string that resolves to a built-in command. */
  STATION_COMMAND_ALIAS: 'station_command_alias',
  RMA: 'rma',
  REPAIR_SERVICE: 'repair_service',
  QC_CHECK_TEMPLATE: 'qc_check_template',
  CHECKLIST_TEMPLATE: 'checklist_template',
  KIT_PART_TEMPLATE: 'kit_part_template',
  FAILURE_MODE: 'failure_mode',
  UNIT_FAILURE_TAG: 'unit_failure_tag',
  UNIT_REPAIR: 'unit_repair',
  // Bose Sourcing Engine
  BOSE_MODEL: 'bose_model',
  PART_COMPATIBILITY: 'part_compatibility',
  SUPPLIER: 'supplier',
  SOURCING_ALERT: 'sourcing_alert',
  SOURCING_CANDIDATE: 'sourcing_candidate',
  SOURCING_SAVED_SEARCH: 'sourcing_saved_search',
  PART_ACQUISITION: 'part_acquisition',
  // Station builder (Operations Studio layer 2)
  STATION_DEFINITION: 'station_definition',
  // Navigation as data (operator-surfaces refactor Phase 4)
  NAV_DEFINITION: 'nav_definition',
  // Workflow graphs (Operations Studio layer 1)
  WORKFLOW_DEFINITION: 'workflow_definition',
  // Curated template catalog (Template Platform Phase 4) — submitted/reviewed rows
  WORKFLOW_TEMPLATE: 'workflow_template',
  // AI write path (universal-feed plan §2.6) — agent-proposed mutations
  AGENT_MUTATION: 'agent_mutation',
  // Per-staff rail dismiss (universal-feed plan Phase 4) — staff_rail_exclusions
  RAIL_EXCLUSION: 'rail_exclusion',
  // Operations ▸ History — server-backed Master Journey saved views
  OPERATIONS_SAVED_VIEW: 'operations_saved_view',
  // Media library (/ops/photos) — server-backed filter/view presets
  MEDIA_SAVED_VIEW: 'media_saved_view',
  // Polymorphic saved_views — dashboard/station generic API
  SAVED_VIEW: 'saved_view',
  /** One sheet's per-column formatting (org-shared marks / colour / align). */
  TABLE_COLUMN_FORMAT: 'table_column_format',
  /** The org's sheet catalog — which tables this organization runs. */
  ORG_TABLE_CATALOG: 'org_table_catalog',
  // Voice (Nextiva) — Support ▸ Voicemail / Calls
  VOICEMAIL: 'voicemail',
  CALL_EVENT: 'call_event',
  // Tenant / identity (Phase F signup → org provisioning)
  ORGANIZATION: 'organization',
  // AI search (docs/ai-search-modernization-plan.md) — the Ask-AI invocation
  AI_SEARCH: 'ai_search',
  OPS_PLAN: 'ops_plan',
  OPS_PLAN_TASK: 'ops_plan_task',
  // Agentic-loop master plan (master-plan.mdx ↔ Yjs ↔ /forge)
  MASTER_PLAN: 'master_plan',
  // In-app reported issue (FeedbackWidget → user_reported_issues)
  USER_ISSUE: 'user_issue',
  // Pick-face (bin-to-bin) replenishment task (replenishment_tasks)
  REPLENISHMENT_TASK: 'replenishment_task',
  // A work_assignments row. Covers both bench assignments and the ad-hoc
  // FOLLOW_UP task one operator throws at another (WS-TASKS, 2026-08-08).
  WORK_ASSIGNMENT: 'work_assignment',
} as const;

export const AUDIT_ACTION = {
  // Kiosk device principal (/kiosk — FOH/BOH surface split doc 06)
  KIOSK_ENROLLED: 'kiosk.enrolled',   // manager minted a pairing code for a new tablet
  KIOSK_PAIRED:   'kiosk.paired',     // a tablet exchanged its code for a device token
  KIOSK_REVOKED:  'kiosk.revoked',    // a device was revoked (token dies server-side)
  KIOSK_TERMINAL_PAIRED: 'kiosk.terminal_paired', // a Square Terminal was paired to / cleared from a lane
  KIOSK_INTAKE:   'kiosk.intake',     // an intake was created from the kiosk device principal
  KIOSK_PICKUP_COLLECT: 'kiosk.pickup_collect', // customer collected a ready repair via order pickup
  // Counter session (the shared desk↔tablet cart). Only the MONEY-moving edits
  // are audited: a serial correction is not an audit event, a price override is.
  COUNTER_LINE_PRICE_OVERRIDE: 'counter_session.line.price_override',
  COUNTER_LINE_VOID:           'counter_session.line.void',
  COUNTER_SESSION_SUBMIT:      'counter_session.submit',
  COUNTER_TERMINAL_CHECKOUT:   'counter_session.terminal_checkout',
  // PO / receiving
  PO_RECEIVE:                'po.receive',
  PO_RECEIVE_REVERSE:        'po.receive.reverse',
  RECEIVING_UNBOX:           'receiving.unbox',
  RECEIVING_DISPOSITION_SET: 'receiving.disposition.set',
  RECEIVING_LINE_QTY_UPDATE: 'receiving_line.qty.update',
  RECEIVING_HEADER_UPDATE:   'receiving.header.update',
  /**
   * An operator consciously received a carton that the `receiving.photoPolicy`
   * evidence gate had blocked (WS-PHOTO §4 soft block). `reason_code` carries a
   * `PHOTO_WAIVED_*` code from the receiving-exception system registry — never
   * free text — and the same act writes a `receiving_exceptions` row per line.
   * Distinct from PO_RECEIVE: that says the line was received; this says the
   * completion-insurance gate was waived to do it.
   */
  RECEIVING_PHOTO_POLICY_OVERRIDE: 'receiving.photo_policy.override',
  /**
   * An operator declared a carrier-delivered carton's goods LOST — written off
   * rather than received. `reason_code` carries a `LOST_IN_TRANSIT` / `EMPTY_BOX` /
   * `MISDELIVERED` / `STOLEN` code from the receiving-exception system registry
   * (never free text), and the same act writes an OPEN `receiving_exceptions` row.
   * Distinct from PO_RECEIVE (the goods arrived) and from the OS&D SHORT/DAMAGED
   * codes (the goods arrived, imperfectly).
   */
  RECEIVING_LOSS_WRITE_OFF:  'receiving.loss.write_off',
  /**
   * The written-off carton turned up — the loss exception is resolved and the line
   * returns to the delivered-not-unboxed lane. The append-only exception row keeps
   * the original write-off in history; this is not a delete.
   */
  RECEIVING_LOSS_REOPEN:     'receiving.loss.reopen',
  /**
   * Operator-driven PO relink — make the website authoritative over Zoho. Writes
   * the chosen PO (and optional SKU correction) onto the line + carton, even when
   * Zoho already had a different (wrong) link. Distinct from RECEIVING_MATCH
   * (adopt expected lines) and the upgrade-only header update.
   */
  RECEIVING_RELINK:          'receiving.relink',
  /** A marketplace purchase (eBay buyer account, …) was imported onto the Incoming
   *  spine via the bridge/sync (Universal Incoming Phase 2). */
  RECEIVING_INBOUND_IMPORT:  'receiving.inbound.import',
  /** An operator manually linked one Incoming spine row to a second purchase
   *  identity (e.g. an eBay line → its Zoho PO), writing the secondary link +
   *  cross-source equivalence and optionally collapsing a duplicate spine row
   *  (Universal Incoming Phase 4, §7.2). Distinct from RECEIVING_RELINK, which
   *  re-points a carton at a different Zoho PO. */
  RECEIVING_INBOUND_LINKED:  'receiving.inbound.linked',
  /** An operator created / edited / reordered / deleted a durable carton listing
   *  link (`receiving_listing_links`), or bound one to a line. One action for the
   *  whole CRUD surface — the row payload says which. */
  RECEIVING_LISTING_LINK_WRITE: 'receiving.listing_link.write',
  /** Manual n8n-style lifecycle advance through transitionReceivingLine(). */
  RECEIVING_LINE_ADVANCE:    'receiving_line.advance',
  /** Real "Save for unbox" transition — stamps receiving.triage_complete. */
  RECEIVING_TRIAGE_COMPLETE: 'receiving.triage.complete',
  /**
   * An operator confirmed this carton's contents against its line list — the
   * `contents` step of the Unbox procedure
   * (`receiving_unbox.contents_confirmed_at`).
   *
   * Paired with its retraction rather than folded into one toggle action,
   * because the two are different claims and a dashboard counting
   * "confirmations" must not be able to count a reopen as one. The stamp is
   * clearable, so the audit trail is the only place the original claim survives
   * a reopen.
   */
  RECEIVING_CONTENTS_CONFIRMED: 'receiving.contents.confirmed',
  RECEIVING_CONTENTS_REOPENED:  'receiving.contents.reopened',
  /**
   * An operator confirmed they read this LINE's printed label face — the
   * `label` step of the Unbox procedure
   * (`receiving_line_testing.label_previewed_at`).
   *
   * Paired with its retraction for the same reason as the contents pair above,
   * and a LINE fact rather than a carton one because a multi-line PO prints one
   * face per line.
   */
  RECEIVING_LABEL_PREVIEWED: 'receiving.label.previewed',
  RECEIVING_LABEL_REOPENED:  'receiving.label.reopened',
  /**
   * Unbox commit `stage` — operator scanned an intended putaway location
   * (`receiving_line_putaway.staged_at` / `staged_location_id`).
   */
  RECEIVING_STAGE_CONFIRMED: 'receiving.stage.confirmed',
  RECEIVING_STAGE_REOPENED:  'receiving.stage.reopened',
  /** Incoming email to-do check-off / restore — a reversible pile move on an
   *  email_missing_purchase_orders row, never a delete. */
  RECEIVING_TODO_CHECKED:    'receiving.todo.checked',
  RECEIVING_TODO_UNCHECKED:  'receiving.todo.unchecked',
  /** Receiving-scoped match of an unmatched shipping email to an existing
   *  Zoho PO (incoming-todo Phase 4a) — records the PO# onto the
   *  email_missing_purchase_orders row and moves it to pile='done'. */
  RECEIVING_EMAIL_MATCHED:   'receiving.email.matched',
  /** Per-staff rail dismiss / restore (universal-feed Phase 4) — writes/removes
   *  a staff_rail_exclusions row; hides an entity from THIS staffer's rail only
   *  (reversible, never a shared delete). */
  RAIL_EXCLUSION_ADD:        'rail_exclusion.add',
  RAIL_EXCLUSION_REMOVE:     'rail_exclusion.remove',
  /**
   * A scanned serial was auto-resolved to a previously-shipped order during
   * receiving (the shipped↔returned loop), flipping the carton to a return and
   * its open allocation SHIPPED→RETURNED. Distinct from a manual returns-dock
   * intake — this fires on the normal unbox serial scan.
   */
  RETURN_LINK:               'return.link',
  // Bin / location
  BIN_CREATE: 'bin.create',
  BIN_UPDATE: 'bin.update',
  BIN_RENAME: 'bin.rename',
  BIN_MOVE:   'bin.move',
  BIN_SWAP:   'bin.swap',
  BIN_DELETE: 'bin.delete',
  // Serial unit (scanner verbs)
  SERIAL_SCAN:   'serial.scan',
  SERIAL_CREATE: 'serial.create',
  SERIAL_DELETE: 'serial.delete',
  SERIAL_MOVE:   'serial.move',
  // Per-unit listing on a sales channel (engine Phase 1.4 'listed' fact)
  SERIAL_LIST:   'serial.list',
  // Handling units (LPN) — license-plated boxes/trays
  HANDLING_UNIT_CREATE:   'handling_unit.create',
  HANDLING_UNIT_ASSIGN:   'handling_unit.assign',
  HANDLING_UNIT_UNASSIGN: 'handling_unit.unassign',
  // Label manifests (preboxed kit — one label, many serials)
  MANIFEST_CREATE:        'label_manifest.create',
  MANIFEST_ADD_ITEM:      'label_manifest.add_item',
  MANIFEST_REMOVE_ITEM:   'label_manifest.remove_item',
  MANIFEST_SEAL:          'label_manifest.seal',
  MANIFEST_DISSOLVE:      'label_manifest.dissolve',
  // Tech / QC verdicts (per-unit testing outcomes)
  TECH_QC_PASS:   'tech.qc.pass',
  TECH_QC_RETEST: 'tech.qc.retest',
  TECH_QC_FAIL:   'tech.qc.fail',
  TECH_DATA_WIPE: 'tech.data_wipe',   // secure erase / factory reset (electronics)
  // QC checklist templates (authoring CRUD) + per-unit results (execution)
  QC_CHECK_CREATE:  'qc_check.create',
  QC_CHECK_UPDATE:  'qc_check.update',
  QC_CHECK_DELETE:  'qc_check.delete',
  QC_CHECK_PUBLISH: 'qc_check.publish',
  CHECKLIST_CREATE:  'checklist.create',
  CHECKLIST_UPDATE:  'checklist.update',
  CHECKLIST_DELETE:  'checklist.delete',
  CHECKLIST_PUBLISH: 'checklist.publish',
  // Daily checklist STRUCTURE. Distinct from CHECKLIST_* above, which belong
  // to the deleted checklist_templates surface — dashboards key off those
  // values, so a new surface takes new ones rather than borrowing them.
  DAILY_CHECK_ITEM_CREATE: 'daily_check_item.create',
  DAILY_CHECK_ITEM_RETIRE: 'daily_check_item.retire',
  QC_RESULT_RECORD: 'qc_result.record',
  // Kit-parts / BOM templates ("what's in the box" authoring CRUD)
  KIT_PART_CREATE: 'kit_part.create',
  KIT_PART_UPDATE: 'kit_part.update',
  KIT_PART_DELETE: 'kit_part.delete',
  // Failure-mode taxonomy (CRUD) + per-unit failure tags
  FAILURE_MODE_CREATE: 'failure_mode.create',
  FAILURE_MODE_UPDATE: 'failure_mode.update',
  FAILURE_MODE_DELETE: 'failure_mode.delete',
  FAILURE_TAG_ADD:     'failure_tag.add',
  FAILURE_TAG_RESOLVE: 'failure_tag.resolve',
  // Personal header to-do lists (general + recurring)
  STAFF_TODO_CREATE:       'staff_todo.create',
  STAFF_TODO_SET_INTERVAL: 'staff_todo.set_interval',
  STAFF_TODO_ARCHIVE:      'staff_todo.archive',
  STAFF_TODO_RENAME:       'staff_todo.rename',
  STAFF_TODO_UNARCHIVE:    'staff_todo.unarchive',
  // Strategic ops plans (Operations Plan Mode)
  OPS_PLAN_CREATE:         'ops_plan.create',
  OPS_PLAN_UPDATE:         'ops_plan.update',
  OPS_PLAN_ARCHIVE:        'ops_plan.archive',
  OPS_PLAN_TASK_CREATE:    'ops_plan_task.create',
  OPS_PLAN_TASK_ASSIGN:    'ops_plan_task.assign',
  OPS_PLAN_TASK_COMPLETE:  'ops_plan_task.complete',
  OPS_PLAN_TASK_CANCEL:    'ops_plan_task.cancel',
  OPS_PLAN_TASK_LINK:      'ops_plan_task.link',
  // Throwable task — one operator hands a record to another (WS-TASKS).
  // Distinct from OPS_PLAN_TASK_* (planning) and from the bench assignment
  // paths: this is the ad-hoc FOLLOW_UP handoff that replaced paper + texts.
  WORK_TASK_THROW:         'work_task.throw',
  // Agentic-loop master plan (plan-agent mutations via /api/forge/chat)
  MASTER_PLAN_TICKET_STATUS: 'master_plan.ticket_status',
  // In-app issue → fix → toast loop
  USER_ISSUE_REPORT:       'user_issue.report',
  USER_ISSUE_RESOLVE:      'user_issue.resolve',
  USER_ISSUE_UPDATE:       'user_issue.update',
  USER_ISSUE_STATUS:       'user_issue.status',
  USER_ISSUE_DELETE:       'user_issue.delete',
  // Staff-to-staff messages (clipboard "send to staff")
  STAFF_MESSAGE_SEND:      'staff_message.send',
  // Entity-anchored conversation threads (entity_threads / thread_messages)
  THREAD_CREATE:           'thread.create',
  THREAD_MESSAGE_POST:     'thread.message.post',
  THREAD_MESSAGE_EDIT:     'thread.message.edit',
  THREAD_MESSAGE_DELETE:   'thread.message.delete',
  THREAD_TICKET_ATTACH:    'thread.ticket.attach',
  THREAD_STATUS_UPDATE:    'thread.status.update',
  THREAD_DELETE:           'thread.delete',
  THREAD_ASSIGN:           'thread.assign',
  THREAD_UNASSIGN:         'thread.unassign',
  THREAD_LINK:             'thread.link',
  THREAD_UNLINK:           'thread.unlink',
  // Support ticket ↔ entity linkage (the /api/support/tickets/link waist).
  // The operator-facing timeline reads ops_events TICKET_LINKED/TICKET_UNLINKED,
  // not these — audit_logs is the admin field-diff spine and is gated on
  // admin.view_logs. These exist so the mutation is auditable, per the house
  // route skeleton (backend-patterns.md step 5), which this waist never had.
  SUPPORT_TICKET_LINKED:   'support.ticket.linked',
  SUPPORT_TICKET_UNLINKED: 'support.ticket.unlinked',
  // Station-generic ticket create (POST /api/support/tickets) via the helpdesk facade.
  SUPPORT_TICKET_CREATE:   'support.ticket.create',
  // Photo library — minted N temporary signed share links for selected photos
  PHOTO_SHARE_LINK:        'photo.share_link',
  PHOTO_REASSIGN:          'photo.reassign',
  // Photo ASPECT — *what this shot shows*, claimed after the fact. Two actions,
  // not one with a null `after`: `photos.photo_aspect` is overwritable, so
  // audit_logs is the only place the original claim survives, and a rollup that
  // counted a retraction as a classification would read the trail backwards.
  // Same pairing as RECEIVING_LABEL_PREVIEWED / …_REOPENED.
  PHOTO_ASPECT_SET:        'photo.aspect_set',
  PHOTO_ASPECT_CLEARED:    'photo.aspect_cleared',
  // Same-carton stage claim (bench → door): remaps photo_type + sets a legal
  // door aspect in one write. Distinct from PHOTO_REASSIGN (entity hop) and
  // PHOTO_ASPECT_* (within-stage name-only).
  PHOTO_STAGE_CLAIM:       'photo.stage_claim',
  // Photo library master folders (operator-created, persistent) + assignments
  PHOTO_FOLDER_CREATE:     'photo_folder.create',
  PHOTO_FOLDER_RENAME:     'photo_folder.rename',
  PHOTO_FOLDER_MOVE:       'photo_folder.move',
  PHOTO_FOLDER_DELETE:     'photo_folder.delete',
  PHOTO_FOLDER_ASSIGN:     'photo_folder.assign',
  PHOTO_FOLDER_UNASSIGN:   'photo_folder.unassign',
  PHOTO_IMAGE_TYPE_CREATE: 'photo_image_type.create',
  // Photo labels — org vocabulary CRUD + per-photo / bulk assignment
  PHOTO_LABEL_CREATE:      'photo_label.create',
  PHOTO_LABEL_UPDATE:      'photo_label.update',
  PHOTO_LABEL_DELETE:      'photo_label.delete',
  PHOTO_LABELS_SET:        'photo_label.set',
  PHOTO_LABELS_BULK_APPLY: 'photo_label.bulk_apply',
  // Listing gallery composition (marketplace photo set)
  LISTING_PHOTO_ADD:       'listing_photo.add',
  LISTING_PHOTO_REORDER:   'listing_photo.reorder',
  LISTING_PHOTO_SET_COVER: 'listing_photo.set_cover',
  LISTING_PHOTO_REMOVE:    'listing_photo.remove',
  // Photo backup — copied photo originals into a tenant's connected Google Drive
  PHOTO_DRIVE_EXPORT:      'photo.drive_export',
  // External integration connection lifecycle (OAuth connect / disconnect)
  INTEGRATION_CONNECT:     'integration.connect',
  INTEGRATION_DISCONNECT:  'integration.disconnect',
  // AI search — the explicit Ask-AI tool-calling invocation only (plain
  // keystroke retrieval is deliberately NOT audited — see /api/ai/retrieve)
  AI_SEARCH_ASK: 'ai_search.ask',
  // Personal UI preferences (e.g. configurable focus-scan hotkey)
  STAFF_PREFERENCE_UPDATE: 'staff_preference.update',
  /**
   * Staff profile photo set / replaced / cleared (`staff.avatar_photo_id`).
   * Audited even for a self-change because the avatar is how every timeline,
   * journey and schedule pill ATTRIBUTES work to a face — a silently swapped
   * face is an attribution change, and `actor_staff_id ≠ entity_id` is what
   * distinguishes an admin acting on behalf from the staffer themselves.
   */
  STAFF_AVATAR_SET:   'staff.avatar.set',
  STAFF_AVATAR_CLEAR: 'staff.avatar.clear',
  /**
   * Staff identity colour change (`staff.color_hex`). Same attribution rationale
   * as the avatar verbs — a recoloured mark is how work is attributed when
   * there is no photo. Self OR admin; `extra.self` distinguishes the actor.
   */
  STAFF_COLOR_SET: 'staff.color.set',
  /**
   * Staff display-name change (`staff.name`). Audited for the same reason as the
   * avatar and colour verbs, and more sharply: the name is the PRIMARY thing a
   * timeline, journey or schedule pill attributes work to, so renaming is the
   * cheapest way to make past work read as someone else's. Self OR admin;
   * `extra.self` distinguishes which.
   */
  STAFF_NAME_SET: 'staff.name.set',
  // Home Inbox — personal follow/mute on an entity, and inbox triage.
  SUBSCRIPTION_TOGGLE: 'subscription.toggle',
  INBOX_TRIAGE: 'inbox.triage',
  // Settings Registry — org/staff per-page setting change (docs/settings-registry.md)
  SETTINGS_UPDATE: 'settings.update',
  CUSTOM_FIELD_DEF_CREATE: 'custom_field_def.create',
  CUSTOM_FIELD_DEF_ARCHIVE: 'custom_field_def.archive',
  CUSTOM_FIELD_VALUE_UPSERT: 'custom_field_value.upsert',
  // Per-unit repair records
  REPAIR_OPEN:     'unit_repair.open',
  REPAIR_UPDATE:   'unit_repair.update',
  REPAIR_COMPLETE: 'unit_repair.complete',
  // Receiving (scanner-driven matching)
  PO_LOOKUP:        'po.lookup',
  RECEIVING_MATCH:  'receiving.match',
  /** Manual "Retry pair" from the Unfound strip — re-runs the same tracking search reconcileUnmatchedReceiving does on its cron sweep. */
  RECEIVING_RETRY_PAIR: 'receiving.retry_pair',
  /** Operator-initiated "Look up Amazon return" on an unfound carton — SP-API External Fulfillment Returns lookup by reverse tracking. */
  RECEIVING_AMAZON_RETURN_LOOKUP: 'receiving.amazon_return_lookup',
  // GS1 Digital Link resolver (single QR → contextual internal page)
  GS1_RESOLVE:      'gs1.resolve',
  // SKU stock
  SKU_STOCK_ADJUST:       'sku_stock.adjust',
  SKU_STOCK_BIN_ASSIGN:   'sku_stock.bin.assign',
  SKU_STOCK_BIN_UNASSIGN: 'sku_stock.bin.unassign',
  SKU_STOCK_LOCATION_SET: 'sku_stock.location.set',
  // SKU catalog (CRUD)
  SKU_CATALOG_CREATE: 'sku_catalog.create',
  SKU_CATALOG_UPDATE: 'sku_catalog.update',
  SKU_CATALOG_DELETE: 'sku_catalog.delete',
  // OCR local-pickup: item read off a label that isn't in the system yet was
  // flagged into the pending_skus "needs creating in Zoho" queue (P2-AI-01).
  SKU_CATALOG_FLAG_MISSING: 'sku_catalog.flag_missing',
  // Review · Catalog link: pair an unmatched import listing to a catalog SoT.
  SKU_CATALOG_LINK_REVIEW: 'sku_catalog.link_review',
  SKU_CATALOG_LINK_IGNORE: 'sku_catalog.link_ignore',
  // Review · Missing item number: resolve/ignore a durable import exception.
  ORDER_IMPORT_EXCEPTION_RESOLVE: 'order_import_exception.resolve',
  ORDER_IMPORT_EXCEPTION_IGNORE: 'order_import_exception.ignore',
  // SKU relationship graph (parent→child edges)
  SKU_RELATIONSHIP_CREATE: 'sku_relationship.create',
  SKU_RELATIONSHIP_UPDATE: 'sku_relationship.update',
  SKU_RELATIONSHIP_DELETE: 'sku_relationship.delete',
  PART_LINK_CREATE: 'part_link.create',
  PART_LINK_DELETE: 'part_link.delete',
  PART_LINK_MARK_NOT_PART: 'part_link.mark_not_a_part',
  // Reason codes (CRUD)
  REASON_CODE_CREATE: 'reason_code.create',
  // Station command aliases (2026-08-20c). Retire, not delete: a printed
  // sticker outlives its row, so the row is what lets an operator be told the
  // code was retired instead of getting the generic unknown-command nack.
  STATION_COMMAND_ALIAS_CREATE: 'station_command_alias.create',
  STATION_COMMAND_ALIAS_UPDATE: 'station_command_alias.update',
  STATION_COMMAND_ALIAS_RETIRE: 'station_command_alias.retire',
  REASON_CODE_UPDATE: 'reason_code.update',
  REASON_CODE_DELETE: 'reason_code.delete',
  // RMA (record-level CRUD; lifecycle transitions live in verb routes)
  RMA_UPDATE: 'rma.update',
  RMA_CANCEL: 'rma.cancel',
  RMA_DISPOSITION: 'rma.disposition',
  // Order record edit (delete uses the legacy 'orders.delete' literal)
  ORDER_UPDATE: 'orders.update',
  // Fulfillment substitution — the unit that ships deviates from what was
  // ordered/listed. Re-allocation event recorded in order_unit_amendments;
  // approve/reject gate the block_until_approved enforcement path.
  ORDER_SUBSTITUTE_UNIT:   'order.substitute_unit',
  ORDER_AMENDMENT_APPROVE: 'order.amendment.approve',
  ORDER_AMENDMENT_REJECT:  'order.amendment.reject',
  /**
   * Caged → released (To-ship intake gate, 2026-08-30c). RELEASE is the moment
   * an order becomes floor work, so it records WHO opened the cage and the
   * G1/G2/G3 snapshot that was green when they did.
   */
  ORDER_CAGE: 'order.cage',
  ORDER_RELEASE: 'order.release',
  /** Ready-to-pack packing-station place / move / clear (order_pack_placements). */
  ORDER_PACK_PLACE: 'order.pack_place',
  ORDER_PACK_MOVE: 'order.pack_move',
  ORDER_PACK_CLEAR: 'order.pack_clear',
  /** Ready-to-pack loose-unit place / move / clear (unit_pack_placements). */
  UNIT_PACK_PLACE: 'unit.pack_place',
  UNIT_PACK_MOVE: 'unit.pack_move',
  UNIT_PACK_CLEAR: 'unit.pack_clear',
  // Unshipped governing events — first time a carrier tracking number is added to
  // an order, and when its shipping label is printed/attached. Feed the order
  // timeline (EventTimeline) on the dashboard details panel.
  TRACKING_ADDED: 'orders.tracking.added',
  LABEL_PRINTED: 'orders.label.printed',
  // Carrier-API label lifecycle (ShipStation outbound station): buying a
  // rate-shopped label and voiding/refunding it. LABEL_PRINTED still fires on
  // the first stored label for the order timeline.
  LABEL_PURCHASED: 'orders.label.purchased',
  LABEL_VOIDED: 'orders.label.voided',
  // Outbound documents (docs/outbound-documents-plan.md) — packing slips +
  // shipping labels stored on `documents` + linked via `document_entity_links`.
  // LABEL_PRINTED (above) is preserved for the timeline on an order's FIRST
  // label attach; these cover the general CRUD lifecycle for both doc types.
  ORDER_DOCUMENT_ATTACH: 'order.document.attach',
  ORDER_DOCUMENT_FETCH:  'order.document.fetch',
  ORDER_DOCUMENT_DELETE: 'order.document.delete',
  /** JIT pack Phase 1 — print bundle at pack-confirm (PrintNode or browser fallback). */
  ORDER_DOCUMENT_BUNDLE_PRINT: 'order.document.bundle_print',
  /** Explicit reprint of an already-printed pack bundle (never re-buys postage). */
  ORDER_DOCUMENT_BUNDLE_REPRINT: 'order.document.bundle_reprint',
  // Orders-exceptions reconciliation sweep (writes orders + orders_exceptions)
  ORDERS_EXCEPTIONS_SYNC: 'orders_exceptions.sync',
  /** Manual tracking edit on a single open `orders_exceptions` row. */
  ORDERS_EXCEPTION_UPDATE: 'orders_exceptions.update',
  // Repair service soft-cancel + its reverse (reopen → restore prior status)
  REPAIR_CANCEL: 'repair_service.cancel',
  REPAIR_REOPEN: 'repair_service.reopen',
  // Repair service ticket CRUD + linkage (manual entry / manual pairing)
  REPAIR_SERVICE_CREATE: 'repair_service.create',
  REPAIR_SERVICE_UPDATE: 'repair_service.update',
  REPAIR_SERVICE_LINK:   'repair_service.link',
  REPAIR_SERVICE_UNLINK: 'repair_service.unlink',
  // Pack / order (existing callers — keep their literals stable)
  PACK_COMPLETED: 'PACK_COMPLETED',
  // Packer Review Station — verification capture + manager review decision
  PACK_VERIFICATION: 'packing.verification',
  PACK_REVIEW_DECISION: 'packing.review_decision',
  ORDER_ASSIGNMENT_UPDATED: 'ORDER_ASSIGNMENT_UPDATED',
  AUTOMATION_RULE_CREATE: 'automation_rule.create',
  AUTOMATION_RULE_UPDATE: 'automation_rule.update',
  AUTOMATION_RULE_DELETE: 'automation_rule.delete',
  // Dock scan-out: the package physically left the warehouse (SHIP_CONFIRM event)
  SHIP_CONFIRM_SCAN: 'shipment.scan_out',
  // Bose Sourcing Engine — compatibility DB + alternative sourcing
  BOSE_MODEL_CREATE: 'bose_model.create',
  BOSE_MODEL_UPDATE: 'bose_model.update',
  BOSE_MODEL_DELETE: 'bose_model.delete',
  PART_COMPATIBILITY_CREATE: 'part_compatibility.create',
  PART_COMPATIBILITY_UPDATE: 'part_compatibility.update',
  PART_COMPATIBILITY_DELETE: 'part_compatibility.delete',
  SUPPLIER_CREATE: 'supplier.create',
  SUPPLIER_UPDATE: 'supplier.update',
  SUPPLIER_DELETE: 'supplier.delete',
  SOURCING_ALERT_CREATE: 'sourcing.alert.create',
  SOURCING_ALERT_RESOLVE: 'sourcing.alert.resolve',
  SOURCING_SEARCH: 'sourcing.search',
  SOURCING_SAVED_SEARCH_CREATE: 'sourcing.saved_search.create',
  SOURCING_SAVED_SEARCH_UPDATE: 'sourcing.saved_search.update',
  SOURCING_SAVED_SEARCH_DELETE: 'sourcing.saved_search.delete',
  SOURCING_SAVED_SEARCH_RUN: 'sourcing.saved_search.run',
  SOURCING_CANDIDATE_SAVE: 'sourcing.candidate.save',
  SOURCING_CANDIDATE_UPDATE: 'sourcing.candidate.update',
  SOURCING_CANDIDATE_IMPORT: 'sourcing.candidate.import',
  // Station builder (Operations Studio layer 2) — draft/publish lifecycle
  STATION_DRAFT_SAVE: 'station.draft.save',
  STATION_PUBLISH:    'station.publish',
  // Navigation as data (operator-surfaces refactor Phase 4)
  NAV_PUBLISH:        'nav.publish',
  NAV_TAB_REORDER:    'nav.tab_reorder',
  // Workflow graphs (Operations Studio layer 1) — draft/publish lifecycle
  WORKFLOW_DRAFT_CREATE: 'workflow.draft.create',
  WORKFLOW_DRAFT_SAVE:   'workflow.draft.save',
  WORKFLOW_PUBLISH:      'workflow.publish',
  // Cloning a system template into the org's definitions as a draft (Phase E4).
  WORKFLOW_TEMPLATE_IMPORT: 'workflow.template.import',
  // Template Platform Phase 4 curation: an org submits its definition for the
  // public catalog; a curator approves/rejects the submission.
  WORKFLOW_TEMPLATE_SUBMIT: 'workflow.template.submit',
  WORKFLOW_TEMPLATE_REVIEW: 'workflow.template.review',
  // AI write path (universal-feed plan §2.6) — apply / propose / revert.
  AGENT_MUTATION_APPLY:   'agent_mutation.apply',
  AGENT_MUTATION_PROPOSE: 'agent_mutation.propose',
  AGENT_MUTATION_REVERT:  'agent_mutation.revert',
  // Operations ▸ History — Master Journey saved views (personal/shared presets)
  OPERATIONS_SAVED_VIEW_CREATE: 'operations.saved_view.create',
  OPERATIONS_SAVED_VIEW_UPDATE: 'operations.saved_view.update',
  OPERATIONS_SAVED_VIEW_DELETE: 'operations.saved_view.delete',
  // Media library (/ops/photos) — saved filter/view presets (personal/shared)
  MEDIA_SAVED_VIEW_CREATE: 'media.saved_view.create',
  MEDIA_SAVED_VIEW_UPDATE: 'media.saved_view.update',
  MEDIA_SAVED_VIEW_DELETE: 'media.saved_view.delete',
  // Polymorphic saved_views — dashboard/station generic API
  ORG_TABLE_CATALOG_SET: 'org_table_catalog.set',
  TABLE_COLUMN_FORMAT_SET: 'table_column_format.set',
  TABLE_COLUMN_FORMAT_CLEAR: 'table_column_format.clear',
  SAVED_VIEW_CREATE: 'saved_view.create',
  SAVED_VIEW_UPDATE: 'saved_view.update',
  SAVED_VIEW_DELETE: 'saved_view.delete',
  // Voice (Nextiva) — Support ▸ Voicemail / Calls
  VOICEMAIL_FOLLOWUP_RESOLVED: 'voicemail.followup.resolved',
  VOICEMAIL_LINKED:            'voicemail.linked',
  VOICE_CALL_ORIGINATED:       'voice.call.originated',
  // Tenant lifecycle — self-service signup provisions a new org (Phase F).
  ORG_CREATE: 'organization.create',
  // Pick-face replenishment task — reversibility 5.7: undo a claim
  // (IN_PROGRESS → REQUESTED, clears assigned_staff_id).
  REPLENISH_TASK_RELEASE: 'replenish_task.release',
} as const;

export type AuditEntity = (typeof AUDIT_ENTITY)[keyof typeof AUDIT_ENTITY];
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/**
 * Reason codes — required on operations that break expected state (qty
 * adjust, scrap, override, cancel, manual receive reverse).
 */
export const AUDIT_REASON_REQUIRED: ReadonlySet<string> = new Set([
  AUDIT_ACTION.SKU_STOCK_ADJUST,
  AUDIT_ACTION.PO_RECEIVE_REVERSE,
  AUDIT_ACTION.BIN_DELETE,
  // Sourcing: resolving an alert and importing a candidate both need a "why".
  AUDIT_ACTION.SOURCING_ALERT_RESOLVE,
  AUDIT_ACTION.SOURCING_CANDIDATE_IMPORT,
  // A substitution deviates from the order — it must justify itself.
  AUDIT_ACTION.ORDER_SUBSTITUTE_UNIT,
  // Voiding a purchased label reverses a paid carrier action — require a reason.
  AUDIT_ACTION.LABEL_VOIDED,
  AUDIT_ACTION.OPS_PLAN_TASK_CANCEL,
  // Waiving the photo-evidence gate IS the override — it is meaningless
  // without the PHOTO_WAIVED_* code that says why.
  AUDIT_ACTION.RECEIVING_PHOTO_POLICY_OVERRIDE,
  // Writing goods off as lost is the one receiving act that ends with no
  // inventory — "which kind of lost" is the whole record.
  AUDIT_ACTION.RECEIVING_LOSS_WRITE_OFF,
]);

// ── Server-trusted wrapper ─────────────────────────────────────────────────
//
// Prefer this over calling createAuditLog directly. Pulls actor from the
// auth context and ip/ua/request-id from the request headers so call sites
// can't accidentally trust the request body for attribution.

export interface RecordAuditArgs {
  source: string;       // e.g. 'sku-stock-page', 'mobile-scanner', 'receiving-station'
  action: AuditAction | string;
  entityType: AuditEntity | string;
  entityId: string | number;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  stationActivityLogId?: number | null;
  /** Logical location for fast filter (e.g. 'A-12-03'). */
  binCode?: string | null;
  locationCode?: string | null;
  /** Raw barcode value if a scanner triggered this. */
  scanRef?: string | null;
  /** Why — required for AUDIT_REASON_REQUIRED actions. */
  reasonCode?: string | null;
  note?: string | null;
  method?: 'scan' | 'manual' | 'system';
  /** Allow legacy routes that still extract staff from body to override. */
  actorStaffIdOverride?: number | null;
  /** Org for cron/transitional callers that pass ctx=null (no request org). */
  organizationIdOverride?: string | null;
  /** Free-form extension; merged into metadata. */
  extra?: Record<string, unknown>;
}

export async function recordAudit(
  db: Queryable,
  ctx: AuthContext | AnonymousAuthContext | null,
  req: Pick<NextRequest, 'headers'> | null,
  args: RecordAuditArgs,
): Promise<number | null> {
  const actorStaffId = ctx?.staffId ?? args.actorStaffIdOverride ?? null;
  const actorRole = ctx?.role ?? null;
  // Stamp the tenant so audit reads are org-filterable (was always NULL before).
  // ctx.organizationId covers every request route automatically; cron/transitional
  // callers (ctx=null) pass organizationIdOverride. System rows stay NULL.
  const organizationId = ctx?.organizationId ?? args.organizationIdOverride ?? null;

  const headers = req?.headers;
  const requestId = headers?.get('x-request-id') ?? null;
  const xff = headers?.get('x-forwarded-for') ?? null;
  const ipAddress = xff ? xff.split(',')[0]?.trim() ?? null : headers?.get('x-real-ip') ?? null;
  const userAgent = headers?.get('user-agent') ?? null;

  if (
    AUDIT_REASON_REQUIRED.has(args.action) &&
    !(args.reasonCode && args.reasonCode.trim().length > 0)
  ) {
    // Don't throw — audit must never break the request. Surface in metadata
    // so the row still lands and ops can spot the gap.
    console.warn(`[audit] action=${args.action} missing required reason_code`);
  }

  const metadata: Record<string, unknown> = {
    method: args.method ?? 'manual',
    ...(args.binCode ? { bin_code: args.binCode } : {}),
    ...(args.locationCode ? { location_code: args.locationCode } : {}),
    ...(args.scanRef ? { scan_ref: args.scanRef } : {}),
    ...(args.reasonCode ? { reason_code: args.reasonCode } : {}),
    ...(args.note ? { note: args.note } : {}),
    ...(args.extra ?? {}),
  };

  try {
    return await createAuditLog(db, {
      actorStaffId,
      actorRole,
      organizationId,
      source: args.source,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      stationActivityLogId: args.stationActivityLogId ?? null,
      requestId,
      ipAddress,
      userAgent,
      beforeData: args.before ?? null,
      afterData: args.after ?? null,
      metadata,
    });
  } catch (err) {
    // Audit must never break the request. Log + drop.
    console.warn('[audit_logs] write failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
