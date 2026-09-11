'use client';

/**
 * Silent-print host — listens on this staff ID's print channel and drives
 * USB/serial via printLabelRun when THIS device can actually silent-print.
 *
 * Mount on the desk frame and on `/m/*` (phone-frame SoT). A phone without a
 * paired printer must not ack — the computer with USB acks and prints.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  getStaffPrintBridgeChannelName,
  safeChannelName,
} from '@/lib/realtime/channels';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import {
  STAFF_PRINT_JOB_EVENT,
  STAFF_PRINT_OPTIONS_PATCH_EVENT,
  STAFF_PRINT_PROGRESS_EVENT,
  STAFF_PRINT_STATUS_EVENT,
  STAFF_PRINT_STATUS_REQUEST_EVENT,
  parseStaffPrintJob,
  parseStaffPrintOptionsPatch,
  thisDeviceCanFulfillPrintJob,
  type StaffPrintJob,
  type StaffPrintStatus,
} from '@/lib/print/staff-print-bridge';
import { getProfileForRole, listProfiles, setRoute } from '@/lib/print/browserPrint';
import { isSilentPrintEnabled, setSilentPrintEnabled, SILENT_PRINT_CHANGED_EVENT } from '@/lib/print/printMode';
import { printBinLabelRun, printRackLabelRun } from '@/lib/print/printLabelRun';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import { registerRackLocations } from '@/components/barcode/rack-printer/rack-printer-api';
import { triggerPackPrintBundle } from '@/components/packer/pack-print-bundle';
import type { RackSegments } from '@/lib/barcode-routing';

function snapshotStatus(): StaffPrintStatus {
  const label = getProfileForRole('label');
  const paper = getProfileForRole('paper');
  const silent = isSilentPrintEnabled();
  const labelUsb =
    !!label && label.kind !== 'os' && label.language !== 'none';
  return {
    type: 'staff.print_status',
    silent,
    label: {
      ready: silent && labelUsb,
      name: label?.name ?? null,
      kind: label?.kind ?? null,
      profileId: label?.id ?? null,
    },
    paper: {
      ready: silent && !!paper,
      name: paper?.name ?? null,
      kind: paper?.kind ?? null,
      profileId: paper?.id ?? null,
    },
    profiles: listProfiles().map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      kind: p.kind,
    })),
  };
}

export function useStaffPrintBridgeHost() {
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const channelName = safeChannelName(() =>
    getStaffPrintBridgeChannelName(orgId ?? '', staffId),
  );
  const busyRef = useRef(false);

  const publishStatus = async () => {
    if (!channelName) return;
    try {
      const client = await getClient();
      const channel = client?.channels.get(channelName);
      await channel?.publish(STAFF_PRINT_STATUS_EVENT, snapshotStatus());
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    void publishStatus();
    const onSilent = () => void publishStatus();
    window.addEventListener(SILENT_PRINT_CHANGED_EVENT, onSilent);
    return () => window.removeEventListener(SILENT_PRINT_CHANGED_EVENT, onSilent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);

  useAblyChannel(
    channelName,
    STAFF_PRINT_STATUS_REQUEST_EVENT,
    () => {
      void publishStatus();
    },
    !!channelName && staffId > 0,
  );

  useAblyChannel(
    channelName,
    STAFF_PRINT_OPTIONS_PATCH_EVENT,
    (message) => {
      const patch = parseStaffPrintOptionsPatch(message?.data);
      if (!patch) return;
      if (typeof patch.silent === 'boolean') setSilentPrintEnabled(patch.silent);
      if (patch.routing) {
        if ('label' in patch.routing) setRoute('label', patch.routing.label ?? null);
        if ('paper' in patch.routing) setRoute('paper', patch.routing.paper ?? null);
      }
      void publishStatus();
    },
    !!channelName && staffId > 0,
  );

  useAblyChannel(
    channelName,
    STAFF_PRINT_JOB_EVENT,
    (message) => {
      const job = parseStaffPrintJob(message?.data);
      if (!job || busyRef.current) return;
      void runJob(job);
    },
    !!channelName && staffId > 0,
  );

  async function runJob(job: StaffPrintJob) {
    const snap = snapshotStatus();
    if (!thisDeviceCanFulfillPrintJob(job, snap)) return;

    busyRef.current = true;
    try {
      const client = await getClient();
      const channel = client?.channels.get(channelName) ?? null;
      await publishDeviceAck(channel, job.request_id, 'print_job');

      if (job.grain === 'papers' && job.papers) {
        await triggerPackPrintBundle({
          orderRowId: job.papers.orderRowId,
          packerLogId: job.papers.packerLogId,
          reprint: job.papers.reprint,
        });
        return;
      }

      const loc = job.location;
      if (!loc) return;
      const onProgress = (done: number, total: number) => {
        void channel?.publish(STAFF_PRINT_PROGRESS_EVENT, {
          type: 'staff.print_progress',
          request_id: job.request_id,
          done,
          total,
        });
      };

      if (job.grain === 'rack') {
        const racks: RackSegments[] = loc.segments.map((s) => ({
          zone: String(s.zone),
          aisle: Number(s.aisle),
          bay: Number(s.bay),
          level: Number(s.level),
        }));
        await printRackLabelRun({
          roomName: loc.roomName,
          racks,
          gln: loc.gln,
          orgSlug: loc.orgSlug,
          register: registerRackLocations,
          onProgress,
        });
        return;
      }

      await printBinLabelRun({
        roomName: loc.roomName,
        segments: loc.segments,
        gln: loc.gln,
        orgSlug: loc.orgSlug,
        register: registerLocations,
        onProgress,
      });
    } finally {
      busyRef.current = false;
    }
  }
}

export function StaffPrintBridgeMount() {
  useStaffPrintBridgeHost();
  return null;
}
