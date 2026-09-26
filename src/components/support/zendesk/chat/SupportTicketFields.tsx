'use client';

/** The ticket's editable FIELDS — status, priority, helpdesk assignee, our staff assignment — extracted from `SupportChatHeader`'s field… */

import { useEffect, useState } from 'react';
import type { ZendeskTicket } from '@/lib/zendesk';
import {
  useAssignTicket,
  useTicketAssignment,
  useUpdateTicket,
  useZendeskAgents,
} from '@/hooks/useZendeskQueries';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import { ZendeskSelect, type SelectOption } from '../ZendeskSelect';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../badges';

const UNASSIGNED = 'unassigned';

type FieldSize = 'compact' | 'field' | 'dense' | 'rail';

export function TicketStatusSelect({
  ticket,
  size = 'dense',
}: {
  ticket: ZendeskTicket;
  size?: FieldSize;
}) {
  const update = useUpdateTicket();
  return (
    <ZendeskSelect
      value={String(ticket.status)}
      options={STATUS_OPTIONS}
      size={size}
      disabled={update.isPending}
      onChange={(status) =>
        update.mutate({ id: ticket.id, patch: { status: status as ZendeskTicket['status'] } })
      }
    />
  );
}

export function TicketPrioritySelect({
  ticket,
  size = 'dense',
}: {
  ticket: ZendeskTicket;
  size?: FieldSize;
}) {
  const update = useUpdateTicket();
  return (
    <ZendeskSelect
      value={ticket.priority ? String(ticket.priority) : null}
      options={PRIORITY_OPTIONS}
      placeholder="Priority"
      size={size}
      disabled={update.isPending}
      onChange={(priority) =>
        update.mutate({ id: ticket.id, patch: { priority: priority as ZendeskTicket['priority'] } })
      }
    />
  );
}

/** The two assignment controls, which answer two different questions and must not be collapsed into one: */
export function TicketAssignmentFields({
  ticket,
  size = 'dense',
}: {
  /** The live provider ticket — `assignee_id` is read off it. */
  ticket: ZendeskTicket;
  size?: FieldSize;
}) {
  const ticketId = ticket.id;
  const update = useUpdateTicket();
  const assign = useAssignTicket();
  const { data: agents = [] } = useZendeskAgents();
  const { data: assignment } = useTicketAssignment(ticketId);

  const assigneeOptions: SelectOption[] = [
    { value: UNASSIGNED, label: 'Unassigned' },
    ...agents.map((a) => ({
      value: String(a.id),
      label: a.name,
      sublabel: a.email ?? undefined,
    })),
  ];

  const [staff, setStaff] = useState<StaffMember[]>([]);
  useEffect(() => {
    let alive = true;
    getActiveStaff()
      .then((list) => alive && setStaff(list))
      .catch(() => {
        /* staffCache swallows; leave empty */
      });
    return () => {
      alive = false;
    };
  }, []);

  const staffOptions: SelectOption[] = [
    // Distinct from the helpdesk "Unassigned" so the two never read identically.
    { value: UNASSIGNED, label: 'Staff' },
    ...staff.map((s) => ({ value: String(s.id), label: s.name })),
  ];

  const currentAssignee = assignment?.assignedStaffId;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ZendeskSelect
        value={ticket.assignee_id ? String(ticket.assignee_id) : UNASSIGNED}
        options={assigneeOptions}
        placeholder="Agent"
        size={size}
        disabled={update.isPending}
        onChange={(v) =>
          update.mutate({
            id: ticketId,
            patch: { assignee_id: v === UNASSIGNED ? null : Number(v) },
          })
        }
      />
      <ZendeskSelect
        value={currentAssignee != null ? String(currentAssignee) : UNASSIGNED}
        options={staffOptions}
        placeholder="Assign staff"
        size={size}
        disabled={assign.isPending}
        onChange={(v) => {
          const staffId = v === UNASSIGNED ? null : Number(v);
          const staffName = staffId == null ? undefined : staff.find((s) => s.id === staffId)?.name;
          assign.mutate({ id: ticketId, staffId, staffName });
        }}
      />
    </div>
  );
}
