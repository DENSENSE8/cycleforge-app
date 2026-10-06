'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { CollapseItem } from '@/design-system/components/Collapse';
import { AnimatePresence, LayoutGroup, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { usePrintStations } from '@/hooks/usePrintStations';
import { prepackHref, type PrepackRouteState, type PrepackSurface } from '@/lib/nav/route-tree';
import { printQcLabelStationJob } from '@/lib/print/printQcLabel';
import { qcLabelWireKey } from '@/lib/print/staff-print-bridge';
import { getStaffStationBridgeChannelName, safeChannelName } from '@/lib/realtime/channels';
import { PREPACK_SERIAL_SELECTED_EVENT, publishPrepackSerialRequest } from '@/lib/realtime/prepack-serial-request';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { PrepackHint, prepackHint } from './PrepackContext';
import { PrepackPrintSection, stationBlocked } from './PrepackPrintSection';
import { PrepackProductBrowser } from './PrepackProductBrowser';
import { PackagesGroup } from './PrepackPackages';
import { ContentsGroup, IdentifyGroup } from './PrepackSections';
import { DeskContext, PhoneContextCard } from './PrepackSurfaces';
import type { PrepackSerialEntry } from './serial-entry';
import { serialSettled, usePrepackForm } from './usePrepackForm';

/**
 * Prepack, one fast form: scan the serial, confirm the product, set how many
 * labels and each package's condition, confirm the contents (pairing what is
 * missing inline), print. Desk: form left, context column right. Phone: one
 * column under a sticky context card, the product browser in a bottom sheet.
 */
export function PrepackForm({
  surface,
  initial = {},
  serialEntry,
  onPrinted,
}: {
  /** Which URL the form keeps in sync: `/m/prepack` or the desk's QC labels task. */
  surface: PrepackSurface;
  /** Route state parsed from the URL (`parsePrepackRouteState`); the form restores from it once. */
  initial?: PrepackRouteState;
  /** The surface's own serial entry: camera scan on the phone, a typed field (+ phone handoff) on the desk. */
  serialEntry: PrepackSerialEntry;
  /** Lets a desk ledger refresh after a run prints. */
  onPrinted?: () => void;
}) {
  const form = usePrepackForm({ onPrinted });
  const { state } = form;
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId ?? '';
  const staffId = user?.staffId ?? 0;
  const bridgeChannel = safeChannelName(() => (orgId && staffId > 0 ? getStaffStationBridgeChannelName(orgId, staffId) : ''));
  const printStations = usePrintStations({ active: true });
  const [chosenStationId, setChosenStationId] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  /** One open phone serial request at a time, aimed at the form's serial or one package row. */
  const [phoneRequest, setPhoneRequest] = useState<{ requestId: string; target: 'serial' | number } | null>(null);
  const serialPhone = useSendToDevice('prepack_serial');
  useSendToDeviceToast(serialPhone.state, serialPhone.retry);
  const desk = surface === 'desktop';

  // The request stays open until Done: every serial the phone sends lands on the entry that asked.
  useAblyChannel(bridgeChannel, PREPACK_SERIAL_SELECTED_EVENT, (message: { data?: unknown }) => {
    const data = (message.data ?? {}) as Record<string, unknown>;
    if (!phoneRequest || String(data.request_id ?? '') !== phoneRequest.requestId) return;
    const serial = String(data.serial ?? '').trim();
    if (!serial) return;
    if (phoneRequest.target === 'serial') form.submitSerial(serial);
    else void form.addSerialToPackage(phoneRequest.target, serial);
  }, Boolean(bridgeChannel && phoneRequest));

  /** The phone icon's handoff for one serial entry; asking from another entry retargets the open request. */
  const phoneFor = (target: 'serial' | number) => ({
    send: () => {
      void serialPhone.send({
        channelName: bridgeChannel,
        publish: async (requestId) => {
          setPhoneRequest({ requestId, target });
          await publishPrepackSerialRequest(await getClient(), orgId, staffId, { requestId });
        },
      }).then((acked) => {
        if (!acked) setPhoneRequest((current) => (current?.target === target ? null : current));
      });
    },
    sending: serialPhone.pending && phoneRequest?.target === target,
    waiting: phoneRequest?.target === target && !serialPhone.pending,
    stop: () => setPhoneRequest(null),
    // On the phone surface the phone IS the scanner.
    available: desk && Boolean(bridgeChannel),
  });

  // Restore once from the URL: the scanned serial, else the chosen product.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (initial.unit) form.submitSerial(initial.unit);
    else if (initial.catalogId) void form.loadProduct(initial.catalogId);
    // The URL seed is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The URL restores the form: the scanned serial and the product.
  const urlSerial = 'serial' in state.verdict && state.verdict.kind !== 'refused' ? state.verdict.serial : null;
  useEffect(() => {
    const next = prepackHref(surface, { unit: urlSerial, catalogId: state.catalog?.id ?? null }, new URLSearchParams(window.location.search));
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [state.catalog?.id, surface, urlSerial]);

  // "Not in the system" (or No serial / Edit product) hands focus to the browser.
  const wantsBrowser = state.browsing && serialSettled(state.verdict);
  useEffect(() => {
    if (wantsBrowser) setFocusSignal((n) => n + 1);
  }, [wantsBrowser, state.verdictSeq]);

  const chosenStation =
    printStations.stations.find((entry) => entry.stationId === chosenStationId)
    ?? printStations.target.label
    ?? printStations.stations.find((entry) => stationBlocked(entry) == null)
    ?? null;
  const printBlocked = chosenStation ? stationBlocked(chosenStation) : 'No print station';

  const print = () => {
    if (!form.complete || !chosenStation || printBlocked || state.printing) return;
    void form.print({
      print: async (unit) => {
        const wireKey = qcLabelWireKey(unit);
        if (!wireKey) return 'this label has no printable id.';
        return chosenStation.thisComputer
          ? printQcLabelStationJob({ unitKey: wireKey }, safeRandomUUID())
          : printStations.sendQcLabel(chosenStation.stationId, wireKey);
      },
    });
  };
  /** Enter runs the freshest Print: a typed quantity commits on the same keypress, so the call waits one tick for that render. */
  const printRef = useRef(print);
  printRef.current = print;

  const runPresence = useMotionRole(motionRole.swap.scan);
  const sectionPresence = useMotionPresence(motionPresence.workbenchPane);
  const sectionTransition = useMotionTransition(motionTransition.workbenchPaneMount);
  const layoutTransition = useMotionTransition(motionTransition.cardExpansion);
  const settled = serialSettled(state.verdict);
  const status = useMotionPresence(motionPresence.statusMessage);

  const formColumn = (
    <motion.div layout transition={layoutTransition} className="flex flex-col gap-4 px-mode-page py-4">
      <IdentifyGroup form={form} SerialEntry={serialEntry} phone={phoneFor('serial')} entryKey={state.runKey} showProduct={desk} />
      <AnimatePresence initial={false}>
        {settled && state.kit && state.catalog ? (
          <CollapseItem key={`order-${state.kit.catalog.id}`} className="flex flex-col gap-4">
            <motion.div className="flex flex-col gap-4" initial={sectionPresence.initial} animate={sectionPresence.animate} transition={sectionTransition}>
              <PackagesGroup form={form} catalog={state.catalog} SerialEntry={serialEntry} phoneFor={phoneFor} />
              <ContentsGroup form={form} kit={state.kit} />
              <PrepackPrintSection
                form={form}
                stations={printStations.stations}
                chosenStation={chosenStation}
                printBlocked={printBlocked}
                onChooseStation={setChosenStationId}
                onPrint={print}
              />
            </motion.div>
          </CollapseItem>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {state.error ? (
          <motion.p key={state.error} role="alert" initial={status.initial} animate={status.animate} exit={status.exit} className="break-words rounded-mode-control bg-rose-50 px-3 py-2 text-role-caption font-semibold text-rose-700">
            {state.error}
          </motion.p>
        ) : null}
        {state.notice && !state.error ? (
          <motion.p key={state.notice} role="status" initial={status.initial} animate={status.animate} exit={status.exit} className="break-words rounded-mode-control bg-emerald-50 px-3 py-2 text-role-caption font-semibold text-emerald-800">
            {state.notice}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );

  return (
    <main
      className="flex min-h-full flex-1 flex-col bg-mode-panel outline-none"
      tabIndex={-1}
      data-testid="prepack-form"
      data-prepack-surface={surface}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target;
        if (target instanceof HTMLButtonElement || target instanceof HTMLTextAreaElement) return;
        // A field inside its own form (Add serial, pairing) or the product combobox owns its Enter.
        if (target instanceof Element && target.closest('form, [role="combobox"]')) return;
        if (state.printing) return;
        event.preventDefault();
        window.setTimeout(() => printRef.current(), 0);
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.runKey}
          className="flex min-h-0 flex-1 flex-col"
          initial={runPresence.presence.initial}
          animate={runPresence.presence.animate}
          exit={runPresence.presence.exit}
          transition={runPresence.transition}
        >
          {desk ? (
            <LayoutGroup>
              <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-mode-rule">
                <div className="min-h-0 min-w-0 overflow-y-auto" data-testid="prepack-form-column">{formColumn}</div>
                <aside className="min-h-0 min-w-0 overflow-y-auto" aria-label="Prepack context" data-testid="prepack-context-column">
                  <DeskContext form={form} focusSignal={focusSignal} staffId={staffId} />
                </aside>
              </div>
            </LayoutGroup>
          ) : (
            <>
              <PhoneContextCard form={form} />
              {formColumn}
              <Sheet open={wantsBrowser || (state.browsing && Boolean(state.catalog))} onOpenChange={(open) => form.setBrowsing(open)}>
                <SheetContent side="bottom" size="full">
                  <SheetHeader>
                    <SheetTitle>Pick the product</SheetTitle>
                  </SheetHeader>
                  <SheetBody>
                    <PrepackHint text={prepackHint(state.verdict, Boolean(state.catalog))} />
                    <PrepackProductBrowser
                      selectedId={state.catalog?.id ?? null}
                      onChoose={form.chooseProduct}
                      focusSignal={focusSignal}
                      staffId={staffId}
                    />
                  </SheetBody>
                </SheetContent>
              </Sheet>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
