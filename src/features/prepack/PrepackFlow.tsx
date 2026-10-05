'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Printer, RotateCcw } from '@/components/Icons';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ProgressBar,
} from '@/design-system/primitives';
import { useIsMobile } from '@/hooks/_ui';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { usePrintStations, type PrintStationEntry } from '@/hooks/usePrintStations';
import { useUnitPhotoRequestPublisher } from '@/hooks/useUnitPhotoRequestPublisher';
import { useUnitPhotosRealtimeRefresh } from '@/hooks/useUnitPhotosRealtimeRefresh';
import { qcLabelHandle, type QcLabelPrintUnit } from '@/lib/labels/qc-label-row';
import { prepackHref, type PrepackRouteState, type PrepackStepId, type PrepackSurface } from '@/lib/nav/route-tree';
import { unitPhotoCaptureHref } from '@/lib/photos/unit-photo-capture-href';
import {
  PREPACK_EVIDENCE_ASPECT,
  PREPACK_EVIDENCE_LABEL,
  PREPACK_PROVENANCE_LABEL,
  missingPackageEvidence,
  parsePrepackCondition,
  parsePrepackProvenance,
  type PrepackCatalogChoice,
  type PrepackCondition,
  type PrepackEvidenceKind,
  type PrepackKit,
  type PrepackKitPart,
  type PrepackProvenance,
  type PrepackUnit,
} from '@/lib/prepack/types';
import { printQcLabelStationJob, qcLabelFaceInput } from '@/lib/print/printQcLabel';
import { productLabelFace } from '@/lib/print/unitLabelCore';
import { qcLabelWireKey } from '@/lib/print/staff-print-bridge';
import { getStaffStationBridgeChannelName, getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import {
  PREPACK_SERIAL_SELECTED_EVENT,
  publishPrepackCatalogPhotoRequest,
  publishPrepackSerialRequest,
} from '@/lib/realtime/prepack-serial-request';
import { SKU_PHOTO_CHANGED_EVENT } from '@/lib/realtime/sku-photo-events';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  createPrepackUnit,
  fetchPrepackKit,
  fetchPrepackUnit,
  prepackCatalogMismatch,
  prepackErrorText,
  prepackUnitRefusal,
  readJson,
} from './prepack-client';
import { ProductCard, ProductPicker } from './PrepackProduct';
import { ContentsChecklist, PackageEvidenceList, PackageSerialList, unitKeyOf } from './PrepackPackageParts';
import { PrepackChoiceTiles, PrepackFact, type PrepackChoice } from './prepack-ui';
import type { PrepackSerialEntry } from './serial-entry';

type PrepackMode = 'single' | 'bulk';
type DockVerb = 'next' | 'print' | 'next-unit';
type DecisionMap = Record<number, boolean | undefined>;
type FinishResponse = {
  units: PrepackUnit[];
  catalog: PrepackCatalogChoice;
  printUnit: QcLabelPrintUnit;
};
/** The run as the latest admission saw it — queued serials (a phone sending several) read this, never a stale render. */
type RunSnapshot = {
  mode: PrepackMode | null;
  units: PrepackUnit[];
  catalog: PrepackCatalogChoice | null;
  kitParts: PrepackKitPart[];
  catalogPhotoCount: number;
};

/** Single: the serials are the key and their product follows. Bulk: the product, condition and provenance are fixed for the run. */
const STEPS: Record<PrepackMode, readonly PrepackStepId[]> = {
  single: ['unit', 'facts', 'evidence', 'contents', 'label'],
  bulk: ['product', 'unit', 'evidence', 'contents', 'label'],
};

const STEP_COPY: Record<PrepackStepId, { title: string; help: string }> = {
  product: {
    title: 'Product',
    help: 'Bulk run: choose the catalog product, condition, and provenance once. Every package in this run must belong to it.',
  },
  unit: {
    title: 'Serials',
    help: 'Add every serial in this package — a pair of speakers is one package with two serials. A serial never seen before is added as new.',
  },
  facts: {
    title: 'Product & condition',
    help: 'The catalog product comes from the serials or the product you chose. Grade what is in your hand, then say who refurbished it.',
  },
  evidence: {
    title: 'Evidence',
    help: 'Photograph each serial label and the package condition. Catalog photos belong to the SKU and never count as proof of a unit.',
  },
  contents: {
    title: 'Contents',
    help: 'Mark every expected piece Included or Missing.',
  },
  label: {
    title: 'Label',
    help: 'Check the label, choose a print station, and print. Packing puts the package away.',
  },
};

const CONDITION_CHOICES: readonly PrepackChoice<PrepackCondition>[] = [
  { id: 'BRAND_NEW', label: 'New', help: 'Unopened or unused' },
  { id: 'LIKE_NEW', label: 'Like new', help: 'Open box, no wear' },
  { id: 'REFURBISHED', label: 'Refurbished', help: 'Restored to full working order' },
  { id: 'USED_A', label: 'Used A', help: 'Very good' },
  { id: 'USED_B', label: 'Used B', help: 'Good' },
  { id: 'USED_C', label: 'Used C', help: 'Fair' },
  { id: 'PARTS', label: 'Parts', help: 'For repair or salvage' },
];

const PROVENANCE_CHOICES: readonly PrepackChoice<PrepackProvenance>[] = [
  { id: 'NONE', label: PREPACK_PROVENANCE_LABEL.NONE, help: 'Never refurbished' },
  { id: 'MANUFACTURER', label: PREPACK_PROVENANCE_LABEL.MANUFACTURER, help: 'Restored by the brand' },
  { id: 'SELLER', label: PREPACK_PROVENANCE_LABEL.SELLER, help: 'Restored by a seller or by us' },
  { id: 'AMAZON_RENEWED', label: PREPACK_PROVENANCE_LABEL.AMAZON_RENEWED, help: 'Amazon Renewed program' },
];

const ERROR_CLASS = 'break-words border-y border-rose-200 bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700';
const NOTICE_CLASS = 'break-words border-y border-emerald-200 bg-emerald-50 px-mode-page py-3 text-role-caption font-semibold text-emerald-800';
const SECTION_CLASS = 'space-y-4 px-mode-page py-4';
const CARD_CLASS = 'rounded-mode-control border border-mode-rule bg-surface-card px-3';
const DECISIONS_KEY = 'cf:prepack-decisions:';

function stationBlocked(station: PrintStationEntry): string | null {
  if (station.thisComputer) return null;
  if (station.paused) return 'Paused';
  if (!station.live) return 'Offline';
  if (!station.label.ready) return 'No label printer';
  return null;
}

/** Contents decisions survive the phone's round trip to the camera (sessionStorage, keyed by the package's first serial). */
function readStoredDecisions(unitId: number): DecisionMap {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(`${DECISIONS_KEY}${unitId}`) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as DecisionMap) : {};
  } catch {
    return {};
  }
}

function initialDecisions(parts: readonly PrepackKitPart[], lead: PrepackUnit | null): DecisionMap {
  const saved = new Map((lead?.contents ?? []).map((row) => [row.id, row.included]));
  const stored = lead ? readStoredDecisions(lead.id) : {};
  return Object.fromEntries(
    parts.map((part) => [part.id, typeof stored[part.id] === 'boolean' ? stored[part.id] : saved.get(part.id)]),
  );
}

/** One realtime subscription per serial: a photo landing on any member repaints the package's evidence counts. */
function UnitEvidenceWatcher({ unitId, staffId, onChange }: { unitId: number; staffId: number; onChange: () => void }) {
  useUnitPhotosRealtimeRefresh(unitId, staffId, onChange, true);
  return null;
}

export function PrepackFlow({
  surface,
  initial = {},
  serialEntry: SerialEntry,
  productRequest = null,
  onExit,
  onPrinted,
}: {
  /** Which URL the form keeps in sync: `/m/prepack` or the desk's QC labels task. */
  surface: PrepackSurface;
  /** Route state parsed from the URL (`parsePrepackRouteState`); the form restores from it once. */
  initial?: PrepackRouteState;
  /** The surface's own serial entry: camera scan on the phone, a typed field (+ phone handoff) on the desk. */
  serialEntry: PrepackSerialEntry;
  /** Desk side columns: load this catalog product into the form; `seq` changes on every click. */
  productRequest?: { catalogId: number; seq: number } | null;
  /** A desktop frame closes back to its ledger instead of leaving the route. */
  onExit?: () => void;
  /** Lets a desktop ledger refresh after this shared flow prints. */
  onPrinted?: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const onPhone = useIsMobile();
  const orgId = user?.organizationId ?? '';
  const staffId = user?.staffId ?? 0;
  const bridgeChannel = safeChannelName(() =>
    orgId && staffId > 0 ? getStaffStationBridgeChannelName(orgId, staffId) : '',
  );
  const stationChannel = safeChannelName(() => (orgId ? getStationChannelName(orgId) : ''));
  const publishPhotoRequest = useUnitPhotoRequestPublisher({
    staffIdNum: staffId,
    getAblyClient: getClient,
    stationChannelName: bridgeChannel,
  });
  const printStations = usePrintStations({ active: true });

  const serialPhone = useSendToDevice('prepack_serial');
  const photoPhone = useSendToDevice('unit_photo');
  const catalogPhone = useSendToDevice('catalog_photo');
  useSendToDeviceToast(serialPhone.state, serialPhone.retry);
  useSendToDeviceToast(photoPhone.state, photoPhone.retry);
  useSendToDeviceToast(catalogPhone.state, catalogPhone.retry);

  const [mode, setMode] = useState<PrepackMode | null>(initial.mode ?? null);
  const steps = STEPS[mode ?? 'single'];
  const [step, setStep] = useState<PrepackStepId>(steps[0]!);
  const [restored, setRestored] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [catalog, setCatalog] = useState<PrepackCatalogChoice | null>(null);
  const [kitParts, setKitParts] = useState<PrepackKitPart[]>([]);
  const [catalogPhotoCount, setCatalogPhotoCount] = useState(0);
  const [condition, setCondition] = useState<PrepackCondition | null>(null);
  const [provenance, setProvenance] = useState<PrepackProvenance | null>(null);
  const [units, setUnits] = useState<PrepackUnit[]>([]);
  const [decisions, setDecisions] = useState<DecisionMap>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [finished, setFinished] = useState<FinishResponse | null>(null);
  const [chosenStationId, setChosenStationId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [pendingSerialRequest, setPendingSerialRequest] = useState<string | null>(null);

  const runRef = useRef<RunSnapshot>({ mode, units, catalog, kitParts, catalogPhotoCount });
  runRef.current = { mode, units, catalog, kitParts, catalogPhotoCount };
  const serialQueue = useRef<Promise<void>>(Promise.resolve());

  const lead = units[0] ?? null;
  const unitKeys = useMemo(() => units.map(unitKeyOf), [units]);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const allDecided = kitParts.every((part) => typeof decisions[part.id] === 'boolean');
  const evidenceGaps = missingPackageEvidence(units, kitParts.length);

  const ready: Record<PrepackStepId, boolean> = {
    product: Boolean(catalog && condition && provenance),
    unit: units.length > 0,
    facts: units.length > 0 && Boolean(catalog && condition && provenance),
    evidence: units.length > 0 && evidenceGaps.length === 0,
    contents: units.length > 0 && allDecided,
    label: true,
  };
  const firstIncomplete = steps.findIndex((id) => !ready[id]);

  /** A package's facts changed after Finish: the next Print saves again. */
  const reopen = () => {
    if (!finished) return;
    setFinished(null);
    setPrinted(false);
  };

  const applyKit = useCallback((kit: PrepackKit | null, forLead: PrepackUnit | null) => {
    runRef.current = {
      ...runRef.current,
      catalog: kit?.catalog ?? null,
      kitParts: kit?.parts ?? [],
      catalogPhotoCount: kit?.catalogPhotoCount ?? 0,
    };
    setCatalog(kit?.catalog ?? null);
    setKitParts(kit?.parts ?? []);
    setCatalogPhotoCount(kit?.catalogPhotoCount ?? 0);
    setDecisions(initialDecisions(kit?.parts ?? [], forLead));
  }, []);

  /**
   * Validate one typed / scanned serial against the package and add it. A
   * serial never seen before is created (find-or-create). Scanning any serial
   * of an existing package loads all of its serials. Throws the refusal.
   */
  const admitSerial = useCallback(async (raw: string) => {
    const run = runRef.current;
    if (!run.mode) return;
    const lookup = await fetchPrepackUnit(raw);
    const found = lookup.unit ?? await createPrepackUnit(lookup.newSerial, run.catalog?.id ?? null);
    const key = unitKeyOf(found);
    if (run.units.some((unit) => unit.id === found.id)) {
      setNotice(`${key} is already in this package.`);
      return;
    }
    const refusal = prepackUnitRefusal(found);
    if (refusal) throw new Error(refusal);
    const runPackage = run.units.find((unit) => unit.packageUid)?.packageUid ?? null;
    if (found.packageUid && run.units.length > 0 && found.packageUid !== runPackage) {
      throw new Error(`${key} is already packed in ${found.packageUid} — print this package first, then scan ${key} on its own.`);
    }
    if (!found.packageUid && runPackage) {
      throw new Error(`${key} is not in ${runPackage} — print ${runPackage} first, then start a new package.`);
    }
    let kit: PrepackKit | null = run.catalog
      ? { catalog: run.catalog, parts: run.kitParts, catalogPhotoCount: run.catalogPhotoCount }
      : null;
    if (run.mode === 'bulk' && !kit) throw new Error('Choose the product for this run first.');
    if (kit) {
      const mismatch = prepackCatalogMismatch(found, kit.catalog);
      if (mismatch) throw new Error(mismatch);
    } else if (found.skuCatalogId) {
      kit = await fetchPrepackKit(found.skuCatalogId);
    }
    const siblings = found.packageUid && run.units.length === 0
      ? await Promise.all(
          found.packageSerials
            .filter((serial) => serial.toUpperCase() !== found.serialNumber.toUpperCase())
            .map(async (serial) => {
              const sibling = await fetchPrepackUnit(serial);
              if (!sibling.unit) throw new Error(`${serial} from ${found.packageUid} is no longer in CycleForge — dissolve ${found.packageUid} under Label manifests.`);
              return sibling.unit;
            }),
        )
      : [];
    const next = [...run.units, found, ...siblings];
    runRef.current = { ...runRef.current, units: next };
    setUnits(next);
    if (kit && kit.catalog.id !== run.catalog?.id) applyKit(kit, next[0]!);
    if (run.units.length === 0 && run.mode === 'single') {
      setCondition((current) => current ?? parsePrepackCondition(found.conditionGrade));
      setProvenance((current) => current ?? found.refurbProvenance);
    }
    setFinished(null);
    setPrinted(false);
    setNotice(
      siblings.length > 0
        ? `${key} is packed in ${found.packageUid}; its ${next.length} serials are loaded.`
        : `${key} added — ${next.length === 1 ? '1 serial' : `${next.length} serials`} in this package.`,
    );
  }, [applyKit]);

  /** Serials are admitted one at a time, in arrival order (a phone can send several back to back). */
  const addSerial = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setError(null);
    serialQueue.current = serialQueue.current.then(async () => {
      setBusy(true);
      try {
        await admitSerial(value);
      } catch (cause) {
        setError(prepackErrorText(cause, `Could not add ${value}`));
      } finally {
        setBusy(false);
      }
    });
  };

  const removeSerial = (unitId: number) => {
    const next = units.filter((unit) => unit.id !== unitId);
    runRef.current = { ...runRef.current, units: next };
    setUnits(next);
    setError(null);
    setNotice(null);
    reopen();
  };

  /** Load a catalog product into the run. A serial already in the package that belongs elsewhere refuses it — never a silent change. */
  const loadCatalog = async (catalogId: number) => {
    setBusy(true);
    setError(null);
    try {
      const kit = await fetchPrepackKit(catalogId);
      for (const unit of runRef.current.units) {
        const mismatch = prepackCatalogMismatch(unit, kit.catalog);
        if (mismatch) throw new Error(mismatch);
      }
      applyKit(kit, runRef.current.units[0] ?? null);
      reopen();
      return kit;
    } catch (cause) {
      setError(prepackErrorText(cause, 'Could not load that product'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const lastProductSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!productRequest || productRequest.seq === lastProductSeq.current) return;
    lastProductSeq.current = productRequest.seq;
    void loadCatalog(productRequest.catalogId).then((kit) => {
      if (kit) setNotice(`${kit.catalog.sku} loaded — ${runRef.current.mode === 'bulk' ? 'every package in this run' : 'every serial in this package'} must be this product.`);
    });
    // Each request (seq) is consumed once; loadCatalog reads the run through runRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRequest]);

  /** Fresh evidence counts after a photo lands on a serial; the operator's unsaved grading stays. */
  const refreshEvidence = useCallback((key: string) => {
    void fetchPrepackUnit(key)
      .then(({ unit: fresh }) => {
        if (!fresh) return;
        setUnits((current) => current.map((unit) => (unit.id === fresh.id ? { ...unit, evidence: fresh.evidence } : unit)));
      })
      .catch(() => {});
  }, []);

  // Restore once from the URL — the phone returns here from the camera with the whole package in the query.
  const restoreRef = useRef(false);
  useEffect(() => {
    if (restoreRef.current) return;
    restoreRef.current = true;
    const runMode = initial.mode;
    if (!runMode) {
      setRestored(true);
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        if (initial.catalogId) applyKit(await fetchPrepackKit(initial.catalogId), null);
        for (const key of initial.units ?? []) {
          try {
            await admitSerial(key);
          } catch (cause) {
            setError(prepackErrorText(cause, `Could not restore ${key}`));
          }
        }
        const restoredCondition = parsePrepackCondition(initial.condition);
        if (restoredCondition) setCondition(restoredCondition);
        const restoredProvenance = parsePrepackProvenance(initial.provenance);
        if (restoredProvenance) setProvenance(restoredProvenance);
        if (initial.step && STEPS[runMode].includes(initial.step)) setStep(initial.step);
        setNotice(null);
      } catch (cause) {
        setError(prepackErrorText(cause, 'Could not restore this prepack'));
      } finally {
        setBusy(false);
        setRestored(true);
      }
    })();
    // The URL seed is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A step is never shown ahead of the first unfinished one.
  useEffect(() => {
    if (!restored || firstIncomplete < 0 || stepIndex <= firstIncomplete) return;
    setStep(steps[firstIncomplete]!);
  }, [firstIncomplete, restored, stepIndex, steps]);

  const routeState = useMemo<PrepackRouteState>(() => ({
    mode,
    step: mode ? step : null,
    units: unitKeys,
    catalogId: catalog?.id ?? null,
    condition,
    provenance,
  }), [catalog?.id, condition, mode, provenance, step, unitKeys]);

  // The URL is the run: reload, Back from the camera, or a copied link all land on the same package and step.
  // `liveQuery` re-runs this after a router commit that landed a stale URL (a navigation started before the write).
  const liveQuery = useSearchParams().toString();
  useEffect(() => {
    if (!restored) return;
    const next = prepackHref(surface, routeState, new URLSearchParams(window.location.search));
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [liveQuery, restored, routeState, surface]);

  useEffect(() => {
    if (!lead) return;
    try {
      sessionStorage.setItem(`${DECISIONS_KEY}${lead.id}`, JSON.stringify(decisions));
    } catch {
      // Private mode: decisions simply do not survive a reload.
    }
  }, [decisions, lead]);

  // The phone keeps scanning until the desk says Done: every serial it sends joins this package.
  useAblyChannel(bridgeChannel, PREPACK_SERIAL_SELECTED_EVENT, (message: { data?: unknown }) => {
    const data = (message.data ?? {}) as Record<string, unknown>;
    if (!pendingSerialRequest || String(data.request_id ?? '') !== pendingSerialRequest) return;
    const serial = String(data.serial ?? '').trim();
    if (serial) addSerial(serial);
  }, Boolean(bridgeChannel && pendingSerialRequest));

  useAblyChannel(stationChannel, SKU_PHOTO_CHANGED_EVENT, (message: { data?: unknown }) => {
    const data = (message.data ?? {}) as Record<string, unknown>;
    if (!catalog || Number(data.sku_catalog_id) !== catalog.id) return;
    void fetchPrepackKit(catalog.id)
      .then((kit) => {
        setCatalog(kit.catalog);
        setCatalogPhotoCount(kit.catalogPhotoCount);
        setNotice(`Catalog photo saved to ${kit.catalog.sku}.`);
      })
      .catch(() => {});
  }, Boolean(stationChannel && catalog));

  const sendSerialToPhone = () => {
    if (!mode || pendingSerialRequest) return;
    setError(null);
    setNotice(null);
    void serialPhone.send({
      channelName: bridgeChannel,
      publish: async (requestId) => {
        setPendingSerialRequest(requestId);
        await publishPrepackSerialRequest(await getClient(), orgId, staffId, {
          requestId,
          skuCatalogId: catalog?.id ?? null,
          mode,
        });
      },
    }).then((acked) => {
      if (!acked) setPendingSerialRequest(null);
    });
  };

  /** Serial photos land on their own serial; condition and contents are package facts captured on the first serial. */
  const captureEvidence = (kind: PrepackEvidenceKind, target: PrepackUnit) => {
    const key = unitKeyOf(target);
    const aspect = PREPACK_EVIDENCE_ASPECT[kind];
    if (onPhone) {
      router.push(unitPhotoCaptureHref(target.id, {
        stage: 'prepack',
        aspect,
        unit: key,
        title: `${PREPACK_EVIDENCE_LABEL[kind]} · ${key}`,
        back: prepackHref(surface, { ...routeState, step: 'evidence' }),
      }));
      return;
    }
    void photoPhone.send({
      channelName: bridgeChannel,
      publish: (requestId) => publishPhotoRequest({ serialUnitId: target.id, unitKey: key, stage: 'prepack', aspect, requestId }),
    });
  };

  const captureCatalogPhoto = () => {
    if (!catalog) return;
    if (onPhone) {
      router.push(`/m/products/${encodeURIComponent(catalog.sku)}`);
      return;
    }
    void catalogPhone.send({
      channelName: bridgeChannel,
      publish: async (requestId) => {
        await publishPrepackCatalogPhotoRequest(await getClient(), orgId, staffId, {
          requestId,
          skuCatalogId: catalog.id,
          sku: catalog.sku,
        });
      },
    });
  };

  const chosenStation =
    printStations.stations.find((entry) => entry.stationId === chosenStationId)
    ?? printStations.target.label
    ?? printStations.stations.find((entry) => stationBlocked(entry) == null)
    ?? null;
  const printBlocked = chosenStation ? stationBlocked(chosenStation) : 'No print station';
  /** The label face: the saved package after Finish; before it, a one-serial package previews its unit label (a package's KIT code is minted at Print). */
  const previewUnit = useMemo<QcLabelPrintUnit | null>(() => {
    if (finished) return finished.printUnit;
    if (units.length !== 1 || !lead || !catalog) return null;
    return {
      serial_unit_id: lead.id,
      unit_uid: lead.unitUid,
      serial_number: lead.serialNumber,
      sku: catalog.sku,
      title: catalog.title,
      condition_grade: condition ?? lead.conditionGrade,
      printed: false,
      package: null,
    };
  }, [catalog, condition, finished, lead, units.length]);
  const labelFace = useMemo(
    () => (previewUnit ? productLabelFace(qcLabelFaceInput(previewUnit))?.face ?? null : null),
    [previewUnit],
  );

  const savePrepack = async (): Promise<FinishResponse | null> => {
    if (units.length === 0 || !catalog || !condition || !provenance) return null;
    try {
      const result = await readJson<FinishResponse>(
        await fetch('/api/prepack/package', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serialUnitIds: units.map((unit) => unit.id),
            skuCatalogId: catalog.id,
            conditionGrade: condition,
            refurbProvenance: provenance,
            contents: kitParts.map((part) => ({ kitPartId: part.id, included: decisions[part.id] })),
            clientEventId: safeRandomUUID(),
          }),
        }),
      );
      runRef.current = { ...runRef.current, units: result.units };
      setUnits(result.units);
      setFinished(result);
      setPrinted(result.printUnit.printed);
      return result;
    } catch (cause) {
      setError(prepackErrorText(cause, 'Could not finish prepack'));
      return null;
    }
  };

  const resetForNextPackage = (runMode: PrepackMode) => {
    if (lead) {
      try {
        sessionStorage.removeItem(`${DECISIONS_KEY}${lead.id}`);
      } catch {
        // Nothing stored.
      }
    }
    runRef.current = { ...runRef.current, units: [] };
    setUnits([]);
    setFinished(null);
    setPrinted(false);
    setPendingSerialRequest(null);
    if (runMode === 'bulk') {
      setDecisions(Object.fromEntries(kitParts.map((part) => [part.id, undefined])));
    } else {
      applyKit(null, null);
      setCondition(null);
      setProvenance(null);
    }
    setStep('unit');
  };

  const printLabel = async () => {
    if (!mode || !chosenStation || printBlocked || printing) return;
    setPrinting(true);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // The explicit Print verb is the commit: persist the package first,
      // then put paper out; printQcLabel records the one product-template job.
      const firstPrint = !finished;
      const committed = finished ?? await savePrepack();
      if (!committed) return;
      const wireKey = qcLabelWireKey(committed.printUnit);
      if (!wireKey) throw new Error('This package has no serial or label id that can be printed — remove the serial and type it again.');
      if (chosenStation.thisComputer) {
        const failure = await printQcLabelStationJob({ unitKey: wireKey }, safeRandomUUID());
        if (failure) throw new Error(failure);
      } else {
        const failure = await printStations.sendQcLabel(chosenStation.stationId, wireKey);
        if (failure) throw new Error(failure);
      }
      setPrinted(true);
      onPrinted?.();
      const stationName = chosenStation.thisComputer ? 'This device' : chosenStation.stationName;
      const count = firstPrint ? completedCount + 1 : completedCount;
      setCompletedCount(count);
      const what = committed.printUnit.package
        ? `the package label ${committed.printUnit.package.uid} (${committed.units.length} serials)`
        : `the unit label for ${qcLabelHandle(committed.printUnit)}`;
      if (mode === 'bulk') {
        resetForNextPackage('bulk');
        setNotice(`${stationName} printed ${what}. ${count} done — add the next package's serials.`);
      } else {
        setNotice(`${stationName} printed ${what}.`);
      }
    } catch (cause) {
      setError(prepackErrorText(cause, 'The label did not print'));
    } finally {
      setPrinting(false);
      setBusy(false);
    }
  };

  const back = () => {
    setError(null);
    setNotice(null);
    if (stepIndex === 0) {
      if (onExit) onExit();
      else router.back();
      return;
    }
    setStep(steps[stepIndex - 1]!);
  };

  const nextStep = steps[stepIndex + 1];
  const dockVerbs: DetailDockVerb<DockVerb>[] = step !== 'label'
    ? [{
        id: 'next',
        label: nextStep ? STEP_COPY[nextStep].title : 'Next',
        icon: <ArrowRight />,
        iconPosition: 'trailing',
        primary: true,
        disabled: !ready[step] || busy,
        testId: `prepack-${step}-next`,
      }]
    : [
        ...(mode === 'single' && printed
          ? [{ id: 'next-unit' as const, label: 'Next package', icon: <RotateCcw />, testId: 'prepack-next-unit' }]
          : []),
        {
          id: 'print' as const,
          label: printed ? 'Print again' : 'Print',
          icon: <Printer />,
          primary: true,
          disabled: Boolean(printBlocked) || !chosenStation || firstIncomplete !== -1,
          loading: printing,
          testId: 'prepack-print',
        },
      ];

  const runVerb = (verb: DockVerb) => {
    if (verb === 'print') return printLabel();
    if (verb === 'next-unit') {
      resetForNextPackage('single');
      return;
    }
    if (nextStep) setStep(nextStep);
  };

  if (!mode) {
    return (
      <main className="flex min-h-full flex-col bg-mode-panel px-mode-page pb-5 pt-4" data-testid="prepack-mode-choice">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div>
            <h1 className="text-role-title font-semibold text-mode-ink" data-testid="prepack-mode-title">How many units are you labeling?</h1>
            <p className="mt-1 text-role-caption text-text-muted">This choice stays fixed for the run.</p>
          </div>
          {error ? <p role="alert" className={ERROR_CLASS}>{error}</p> : null}
          {catalog ? (
            <dl className={CARD_CLASS} data-testid="prepack-mode-product">
              <PrepackFact label="Product" value={`${catalog.sku} · ${catalog.title}`} />
            </dl>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="primarySoft"
              size="xl"
              className="h-auto min-h-40 flex-col items-start justify-start gap-2 whitespace-normal p-5 text-left"
              onClick={() => setMode('single')}
              data-testid="prepack-mode-single"
            >
              <span className="text-lg font-semibold">Single</span>
              <span className="text-sm font-normal">Add the serials of one package. Its product loads from them; you grade, photograph, and label it.</span>
            </Button>
            <Button
              variant="secondary"
              size="xl"
              className="h-auto min-h-40 flex-col items-start justify-start gap-2 whitespace-normal p-5 text-left"
              onClick={() => {
                setMode('bulk');
                setStep('product');
              }}
              data-testid="prepack-mode-bulk"
            >
              <span className="text-lg font-semibold">Bulk</span>
              <span className="text-sm font-normal">Choose one product, condition, and provenance, then label identical packages one after another.</span>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const copy = STEP_COPY[step];
  const headingId = `prepack-${step}-step`;
  const finishedHandle = finished
    ? finished.printUnit.package?.uid ?? qcLabelHandle(finished.printUnit)
    : null;

  return (
    <main
      className="flex min-h-full flex-col bg-mode-panel outline-none"
      // Clicking blank space keeps the keyboard path (Enter / 1–7 / A) inside the form.
      tabIndex={-1}
      data-testid="prepack-flow"
      data-prepack-mode={mode}
      data-prepack-step={step}
      onKeyDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        // A shell-wide capture listener pre-empts bare Enter; on the form itself (no inner control took it) Enter is ours.
        if (event.defaultPrevented && target !== event.currentTarget) return;
        if (event.key === 'Enter' && !(target instanceof HTMLButtonElement)) {
          const primary = dockVerbs.find((verb) => verb.primary);
          if (primary && !primary.disabled && !primary.loading) {
            event.preventDefault();
            void runVerb(primary.id);
          }
          return;
        }
        if ((step === 'facts' || step === 'product') && /^[1-7]$/.test(event.key)) {
          const choice = CONDITION_CHOICES[Number(event.key) - 1];
          if (choice) {
            event.preventDefault();
            setCondition(choice.id);
            reopen();
          }
          return;
        }
        if (step === 'contents' && event.key.toLowerCase() === 'a' && kitParts.length > 0) {
          event.preventDefault();
          setDecisions(Object.fromEntries(kitParts.map((part) => [part.id, true])));
          reopen();
        }
      }}
    >
      {units.map((unit) => (
        <UnitEvidenceWatcher key={unit.id} unitId={unit.id} staffId={staffId} onChange={() => refreshEvidence(unitKeyOf(unit))} />
      ))}
      <div className="w-full px-mode-page pt-4">
        <ProgressBar
          current={stepIndex + 1}
          goal={steps.length}
          segments={steps.length}
          activeSegment={stepIndex}
          ariaLabel={`${stepIndex + 1} of ${steps.length}`}
          showPercentage={false}
          showRemaining={false}
        />
      </div>
      <header className="space-y-1 px-mode-page pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="lg"
            icon={<ArrowLeft />}
            ariaLabel="Back"
            className="min-h-11 w-11 shrink-0 px-0"
            onClick={back}
            data-testid="prepack-back"
          />
          <h1 id={headingId} className="min-w-0 flex-1 break-words text-role-title font-semibold text-mode-ink">{copy.title}</h1>
          <span className="rounded-mode-control bg-surface-sunken px-2 py-1 text-role-caption font-semibold text-text-muted" data-testid="prepack-mode-chip">
            {mode === 'single' ? 'Single' : 'Bulk'}
            {completedCount > 0 ? ` · ${completedCount} done` : ''}
          </span>
        </div>
        <p className="break-words pl-12 text-role-caption text-text-muted">{copy.help}</p>
      </header>

      {error ? <p role="alert" className={ERROR_CLASS}>{error}</p> : null}
      {notice ? <p role="status" className={NOTICE_CLASS}>{notice}</p> : null}

      <div className="flex-1">
        {units.length > 0 && step !== 'unit' ? (
          <div className="px-mode-page pt-3">
            <dl className={CARD_CLASS} data-testid="prepack-unit-card">
              <PrepackFact label={units.length === 1 ? 'Serial' : `${units.length} serials`} value={unitKeys.join(', ')} mono />
              <PrepackFact label="Product" value={catalog ? `${catalog.sku} · ${catalog.title}` : 'Not chosen'} />
              {condition ? (
                <PrepackFact
                  label="Condition"
                  value={`${CONDITION_CHOICES.find((choice) => choice.id === condition)?.label ?? condition}${provenance ? ` · ${PREPACK_PROVENANCE_LABEL[provenance]}` : ''}`}
                />
              ) : null}
            </dl>
          </div>
        ) : null}

        {step === 'product' || (step === 'facts' && !catalog) ? (
          <section className={SECTION_CLASS} aria-labelledby={headingId}>
            {catalog ? null : (
              <>
                {step === 'facts' ? (
                  <p className="text-role-caption font-semibold text-text-muted">
                    These serials have no catalog product yet. Choose the one they are.
                  </p>
                ) : null}
                <ProductPicker onChoose={(choice) => void loadCatalog(choice.id)} onPhone={onPhone} staffId={staffId} busy={busy} />
              </>
            )}
          </section>
        ) : null}

        {(step === 'product' || step === 'facts') && catalog ? (
          <section className={SECTION_CLASS} aria-labelledby={headingId}>
            <ProductCard
              catalog={catalog}
              catalogPhotoCount={catalogPhotoCount}
              onCatalogPhoto={captureCatalogPhoto}
              catalogPhotoLabel={onPhone ? 'Catalog photo' : 'Catalog photo on phone'}
              catalogPhotoBusy={catalogPhone.pending}
              onSaved={(kit) => {
                setCatalog(kit.catalog);
                setCatalogPhotoCount(kit.catalogPhotoCount);
              }}
              onChange={step === 'product' || units.every((unit) => !unit.skuCatalogId) ? () => {
                applyKit(null, lead);
                reopen();
              } : undefined}
            />
            <PrepackChoiceTiles
              legend="Physical condition"
              choices={CONDITION_CHOICES}
              value={condition}
              onChange={(id) => {
                setCondition(id);
                reopen();
              }}
              hotkeys={!onPhone}
              testIdPrefix="prepack-condition"
            />
            <PrepackChoiceTiles
              legend="Refurbishment provenance"
              choices={PROVENANCE_CHOICES}
              value={provenance}
              onChange={(id) => {
                setProvenance(id);
                reopen();
              }}
              testIdPrefix="prepack-provenance"
            />
          </section>
        ) : null}

        {step === 'unit' ? (
          <section className={SECTION_CLASS} aria-labelledby={headingId}>
            {catalog ? (
              <dl className={CARD_CLASS} data-testid="prepack-run-product">
                <PrepackFact label={mode === 'bulk' ? 'Run product' : 'Product'} value={`${catalog.sku} · ${catalog.title}`} />
                {mode === 'bulk' ? (
                  <PrepackFact
                    label="Run grade"
                    value={`${CONDITION_CHOICES.find((choice) => choice.id === condition)?.label ?? '—'} · ${provenance ? PREPACK_PROVENANCE_LABEL[provenance] : '—'}`}
                  />
                ) : null}
              </dl>
            ) : null}
            <SerialEntry
              onSerial={addSerial}
              busy={busy}
              phone={{
                send: sendSerialToPhone,
                sending: serialPhone.pending,
                waiting: Boolean(pendingSerialRequest) && !serialPhone.pending,
                stop: () => setPendingSerialRequest(null),
                available: Boolean(bridgeChannel),
              }}
            />
            <PackageSerialList units={units} onRemove={removeSerial} />
          </section>
        ) : null}

        {step === 'evidence' && lead ? (
          <section className={SECTION_CLASS} aria-labelledby={headingId}>
            <PackageEvidenceList
              units={units}
              kitPartCount={kitParts.length}
              onPhone={onPhone}
              sending={photoPhone.pending}
              onCapture={captureEvidence}
            />
          </section>
        ) : null}

        {step === 'contents' ? (
          <section className={SECTION_CLASS} aria-labelledby={headingId}>
            <ContentsChecklist
              parts={kitParts}
              decisions={decisions}
              onPhone={onPhone}
              onDecide={(partId, included) => {
                setDecisions((current) => (partId == null
                  ? Object.fromEntries(kitParts.map((part) => [part.id, included]))
                  : { ...current, [partId]: included }));
                reopen();
              }}
            />
          </section>
        ) : null}

        {step === 'label' ? (
          <section className={SECTION_CLASS} aria-labelledby={headingId}>
            {finished && finishedHandle ? (
              <dl className={CARD_CLASS} data-testid="prepack-label-stage">
                <PrepackFact label="Prepacked" value={new Date(finished.units[0]?.prepackedAt || Date.now()).toLocaleString()} />
                <PrepackFact label="Label" value={finishedHandle} mono />
                {finished.units.length > 1 ? (
                  <PrepackFact label="Serials" value={finished.units.map(unitKeyOf).join(', ')} mono />
                ) : null}
              </dl>
            ) : null}
            <div className="space-y-2">
              <h2 className="text-role-data font-semibold text-mode-ink">{units.length > 1 ? '2 × 1 package label' : '2 × 1 unit label'}</h2>
              {labelFace ? <LabelFacePreview model={labelFace} embedded fit="host" /> : (
                <p className="text-role-caption text-text-muted" data-testid="prepack-label-pending">
                  {units.length > 1
                    ? `One label for all ${units.length} serials — its package code is minted when you print.`
                    : 'Add a serial to preview its label.'}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="lg" icon={<Printer />} className="w-full justify-start" data-testid="prepack-print-station">
                  <span className="truncate">
                    {chosenStation ? (chosenStation.thisComputer ? 'This device' : chosenStation.stationName) : 'Choose a print station'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[14rem]">
                {printStations.stations.map((station) => {
                  const blocked = stationBlocked(station);
                  return (
                    <DropdownMenuItem key={station.stationId} disabled={Boolean(blocked)} onSelect={() => setChosenStationId(station.stationId)}>
                      {station.thisComputer ? 'This device' : station.stationName}
                      {blocked ? ` · ${blocked}` : ''}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            {printBlocked ? (
              <p className="break-words text-role-caption font-semibold text-text-danger">
                {printBlocked} — choose another print station, or This device.
              </p>
            ) : null}
            {firstIncomplete !== -1 ? (
              <p className="text-role-caption text-text-muted">Finish {STEP_COPY[steps[firstIncomplete]!].title.toLowerCase()} before printing.</p>
            ) : null}
          </section>
        ) : null}
      </div>

      <DetailDock<DockVerb> label="Prepack step actions" verbs={dockVerbs} onVerb={runVerb} />
    </main>
  );
}
