'use client';

/**
 * New **Support item** (owner 2026-10-04, the closed loop). One inline form,
 * one operation (`POST /api/support/items`), in the order staff answer it:
 *
 *   (1) Customer | Internal                 — "Is this for a customer?"
 *   (2) Platform / account                  — the org's platforms (text labels) and their
 *                                             accounts; "Add platform" creates one and picks it.
 *                                             Internal records have no platform.
 *   (3) The customer's question / the internal record
 *   (4) Order, reference or link (optional) — resolved locally, shown for confirmation;
 *                                             ambiguous → staff pick; never a silent match.
 *       Photos (optional)                   — drop or paste anywhere on the form, or Add photos.
 *   (5) Who                                 — staff assignees (AssigneeComboboxPanel), me first
 *   (6) Urgent · Due (optional)
 *   (7) Create support item                 → the item's Support record
 *
 * The transport (eBay / Amazon / Ecwid / pasted / internal) is derived from the
 * platform on the server. Photos upload after create onto the item's primary task
 * (its Media tab — the composer's "This support item" library). Nothing here
 * talks to a customer.
 */

import { useCallback, useRef, useState } from 'react';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { captureTimeFromFile } from '@/lib/photos/capture-time';
import { TASK_MEDIA_ENTITY_TYPE } from '@/lib/tasks/task-links-shared';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { Button } from '@/design-system/primitives';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { TextField } from '@/design-system/primitives/TextField';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { supportHref } from '@/lib/nav/route-tree';
import { addDaysToDateKey, dateKeyToLocalDate, getCurrentPSTDateKey, localDateToDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import { PhotoDropVeil, StagedPhotosRow, SupportItemOwners, useStagedPhotoFiles } from './NewSupportItemFormParts';
import { OrderReferenceField, useOrderReference } from './SupportOrderReferenceField';
import { SupportPlatformField, type PlatformPick } from './SupportPlatformField';

type Purpose = 'customer_conversation' | 'internal_record';

const SUBJECT_MAX = 120;

export function NewSupportItemForm({
  initialBody,
  onCreated,
  onCancel,
}: {
  initialBody?: string;
  /** The created item's Support record href (`supportHref({ item })`) and whether I am one of its owners. */
  onCreated: (href: string, mine: boolean) => void;
  /** Inline on Support: the Cancel verb beside Create (Esc closes the host too). */
  onCancel?: () => void;
}) {
  const { user } = useAuth();
  const selfId = user?.staffId ?? null;

  const [purpose, setPurpose] = useState<Purpose>('customer_conversation');
  const [platform, setPlatform] = useState<PlatformPick | null>(null);
  const [body, setBody] = useState(initialBody ?? '');
  const order = useOrderReference();
  const [owners, setOwners] = useState<number[] | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [due, setDue] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  // One key per draft: a double-fire or a retry is the same create server-side.
  const clientEventId = useRef(safeRandomUUID());

  // (4) Photos: drop or paste anywhere on the form, or pick through Add photos.
  const staged = useStagedPhotoFiles();
  const dropzone = usePhotoDropzone(staged.stage);

  // Me first and preselected — a Support item I write is mine until I hand it on.
  const assignees = owners ?? (selfId != null ? [selfId] : []);

  const pickPurpose = (next: Purpose) => {
    setPurpose(next);
    // An internal record has no platform; a customer item picks its own.
    setPlatform(null);
  };

  const customer = purpose === 'customer_conversation';
  const pickedOrder = order.pickedOrder;
  const text = body.trim();
  const missing =
    customer && !platform
      ? 'Pick the platform'
      : !text
        ? customer
          ? 'Paste the customer’s question'
          : 'Write the internal record'
        : assignees.length === 0
          ? 'Pick who owns it'
          : order.pending
            ? 'Confirm the order'
            : null;

  const submit = useCallback(async () => {
    if (missing || saving) return;
    setSaving(true);
    try {
      const dueKey = localDateToDateKey(due);
      const res = await fetch('/api/support/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          ...(customer && platform
            ? { platformId: platform.platformId, ...(platform.accountId != null ? { platformAccountId: platform.accountId } : {}) }
            : {}),
          subject: (text.split('\n')[0] ?? '').slice(0, SUBJECT_MAX),
          body: text,
          ...(pickedOrder && customer && (pickedOrder.customerName || pickedOrder.customerEmail)
            ? { requester: { name: pickedOrder.customerName ?? undefined, email: pickedOrder.customerEmail ?? undefined } }
            : {}),
          ...(pickedOrder ? { orderLinks: [{ orderId: pickedOrder.orderId, primary: true, externalReference: order.reference.trim() || null }] } : {}),
          assigneeStaffIds: assignees,
          urgency: urgent ? 'urgent' : 'normal',
          deadlineAt: dueKey ? (warehouseCivilTimeToInstant(dueKey, '17:00')?.toISOString() ?? null) : null,
          clientEventId: clientEventId.current,
        }),
      });
      const data = (await res.json().catch(() => null)) as { itemId?: number; taskId?: number | null; href?: string; error?: string } | null;
      if (!res.ok || !data?.itemId) throw new Error(data?.error || `Could not create the Support item (${res.status}).`);
      const href = data.href ?? supportHref({ item: data.itemId });
      // Photos land on the item's primary task (`WORK_ASSIGNMENT`, primary) — its Media tab and the
      // composer's "This support item" library. A failed upload keeps the item.
      let failed = 0;
      if (data.taskId != null) {
        for (const file of staged.files) {
          try {
            await uploadPhotoClient({
              file,
              entityType: TASK_MEDIA_ENTITY_TYPE,
              entityId: data.taskId,
              linkRole: 'primary',
              clientCapturedAtMs: captureTimeFromFile(file),
            });
          } catch {
            failed += 1;
          }
        }
      } else failed = staged.files.length;
      if (failed > 0) toast.error(`${failed} of ${staged.files.length} photos could not be attached — add them from the record’s Media tab.`);
      toast.success(customer ? 'Support item created' : 'Internal record created');
      onCreated(href, selfId != null && assignees.includes(selfId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the Support item.');
    } finally {
      setSaving(false);
    }
  }, [assignees, customer, due, missing, onCreated, order.reference, pickedOrder, platform, purpose, saving, selfId, staged.files, text, urgent]);

  const today = getCurrentPSTDateKey();
  // The picker's days are local-midnight Dates of warehouse civil days (`dateKeyToLocalDate`).
  const duePresets = [
    { label: 'Today', key: today },
    { label: 'Tomorrow', key: addDaysToDateKey(today, 1) },
    { label: 'Next week', key: addDaysToDateKey(today, 7) },
  ].map(({ label, key }) => ({ label, day: () => dateKeyToLocalDate(key) ?? new Date() }));

  return (
    <div
      className="relative flex flex-col"
      data-testid="support-item-form"
      {...dropzone.rootProps}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
      }}
    >
      {/* gap-4: every floating label notches 8px above its field. */}
      <div className="mx-5 mt-5 flex flex-col gap-4">
        {/* (1) Is this for a customer? */}
        <TabSwitch
          tabs={[
            { id: 'customer_conversation', label: 'Customer' },
            { id: 'internal_record', label: 'Internal' },
          ]}
          activeTab={purpose}
          onTabChange={(id) => pickPurpose(id as Purpose)}
          size="sm"
          fit="hug"
        />

        {/* (2) Platform / account — customer items only. */}
        {customer ? <SupportPlatformField value={platform} onChange={setPlatform} /> : null}

        {/* (3) The question, or the record */}
        <TextField
          label={customer ? 'Customer question' : 'Internal record'}
          value={body}
          onChange={setBody}
          multiline
          rows={4}
          autoFocus
          data-testid="support-item-body"
        />

        {/* (4) Order, reference or link — and photos */}
        <OrderReferenceField state={order} />
        <StagedPhotosRow dropzone={dropzone} staged={staged} />

        {/* (5) Who */}
        <SupportItemOwners assignees={assignees} onChange={setOwners} />
        {/* (6) Urgent · Due */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-text-default">
          <label className="inline-flex items-center gap-1.5">
            <Checkbox checked={urgent} onCheckedChange={(next) => setUrgent(next === true)} aria-label="Urgent" />
            Urgent
          </label>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-text-muted">Due</span>
            <DateRangePickerField
              variant="compact"
              value={due}
              onChange={setDue}
              presets={duePresets}
              onClear={() => setDue(undefined)}
              ariaLabel="Due date"
            />
          </span>
        </div>
      </div>

      {/* (7) Create */}
      <div className="mt-5 flex items-center gap-3 border-t border-border-hairline bg-surface-sunken/50 px-5 py-3">
        <span className="text-xs text-text-muted">
          {missing ??
            `${assignees.length} ${assignees.length === 1 ? 'owner' : 'owners'}${staged.files.length > 0 ? ` · ${staged.files.length} ${staged.files.length === 1 ? 'photo' : 'photos'}` : ''}${urgent ? ' · urgent' : ''}`}
        </span>
        {onCancel ? (
          <Button variant="ghost" size="sm" radius="pill" onClick={onCancel} className="ml-auto" data-testid="support-item-cancel">
            Cancel
          </Button>
        ) : null}
        <HoverTooltip label="Create support item" shortcut="Cmd + Enter" placement="above" asChild>
          <Button
            variant="primary"
            size="sm"
            radius="pill"
            disabled={missing != null}
            loading={saving}
            onClick={() => void submit()}
            className={onCancel ? undefined : 'ml-auto'}
            data-testid="support-item-submit"
          >
            Create support item
          </Button>
        </HoverTooltip>
      </div>

      <PhotoDropVeil active={dropzone.isDragging} />
    </div>
  );
}
