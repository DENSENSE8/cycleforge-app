'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Camera,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  GitBranch,
  PackageOpen,
  Search,
  ScanLine,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

type EntityType = 'serial' | 'order' | 'user';
type EventKind = 'inbound_scan' | 'unbox_event' | 'media_event' | 'split_event' | 'test_event' | 'outbound_event';

type Reference = { label: string; value: string; type: EntityType };
type LifecycleEvent = {
  id: string;
  kind: EventKind;
  stage: string;
  title: string;
  timestamp: string;
  location: string;
  description: string;
  references: Reference[];
  details: [string, string][];
};

type Investigation = { entity: Reference; events: LifecycleEvent[] };

const palettes: Record<EventKind, { eyebrow: string; icon: typeof Barcode; card: string; iconWrap: string; iconColor: string }> = {
  inbound_scan: { eyebrow: 'Receiving', icon: ScanLine, card: 'border-emerald-400/35 bg-emerald-400/[0.07]', iconWrap: 'bg-emerald-400/15', iconColor: 'text-emerald-300' },
  unbox_event: { eyebrow: 'Triage', icon: PackageOpen, card: 'border-sky-400/35 bg-sky-400/[0.07]', iconWrap: 'bg-sky-400/15', iconColor: 'text-sky-300' },
  media_event: { eyebrow: 'Evidence', icon: Camera, card: 'border-violet-400/35 bg-violet-400/[0.07]', iconWrap: 'bg-violet-400/15', iconColor: 'text-violet-300' },
  split_event: { eyebrow: 'Branch', icon: GitBranch, card: 'border-amber-400/35 bg-amber-400/[0.07]', iconWrap: 'bg-amber-400/15', iconColor: 'text-amber-300' },
  test_event: { eyebrow: 'Testing', icon: ClipboardCheck, card: 'border-rose-400/35 bg-rose-400/[0.07]', iconWrap: 'bg-rose-400/15', iconColor: 'text-rose-300' },
  outbound_event: { eyebrow: 'Outbound', icon: ArrowDownToLine, card: 'border-cyan-400/35 bg-cyan-400/[0.07]', iconWrap: 'bg-cyan-400/15', iconColor: 'text-cyan-300' },
};

const investigations: Record<string, Investigation> = {
  'SN-AX14-8842': {
    entity: { label: 'Serial number', value: 'SN-AX14-8842', type: 'serial' },
    events: [
      { id: 'receiving', kind: 'inbound_scan', stage: 'receiving', title: 'Inbound scan accepted', timestamp: 'Sep 09, 2026 · 08:42', location: 'Dock 04 · Bay C', description: 'Container received against purchase order. Barcode and carton seal passed intake checks.', references: [{ label: 'Order', value: 'PO-48217', type: 'order' }, { label: 'User', value: 'u_jenna_k', type: 'user' }], details: [['Condition', 'Sealed'], ['Scanner', 'Zebra TC58'], ['Confidence', '0.98']] },
      { id: 'triage', kind: 'unbox_event', stage: 'triage', title: 'Unbox completed', timestamp: 'Sep 09, 2026 · 09:16', location: 'Triage bench 02', description: 'Unit removed from carton and matched to expected contents. One serial was found inside.', references: [{ label: 'Serial', value: 'SN-AX14-8842', type: 'serial' }, { label: 'Order', value: 'PO-48217', type: 'order' }], details: [['Contents', '4 of 4 verified'], ['Seal', 'Intact'], ['Operator', 'M. Alvarez']] },
      { id: 'evidence', kind: 'media_event', stage: 'evidence', title: 'Condition evidence attached', timestamp: 'Sep 09, 2026 · 09:24', location: 'Triage bench 02', description: 'Three condition photographs were captured before the unit entered testing.', references: [{ label: 'Evidence set', value: 'MED-9014', type: 'order' }, { label: 'User', value: 'u_m_alvarez', type: 'user' }], details: [['Photos', '3 attached'], ['Lighting', 'Pass'], ['Reviewer', 'Pending']] },
      { id: 'branch', kind: 'split_event', stage: 'branch', title: 'Bundle split into unit flow', timestamp: 'Sep 09, 2026 · 09:31', location: 'Routing desk', description: 'The carton-level record was separated into an individual fulfillment path for this serial.', references: [{ label: 'Order', value: 'SO-77304', type: 'order' }, { label: 'Serial', value: 'SN-AX14-8842', type: 'serial' }], details: [['Parent', 'PO-48217'], ['Child flow', 'SO-77304'], ['Reason', 'Unit routing']] },
      { id: 'testing', kind: 'test_event', stage: 'testing', title: 'Functional test passed', timestamp: 'Sep 09, 2026 · 10:08', location: 'Test cell 07', description: 'Battery, display, ports, and reset cycle passed the outbound test profile.', references: [{ label: 'Order', value: 'SO-77304', type: 'order' }, { label: 'User', value: 'u_omar_s', type: 'user' }], details: [['Profile', 'Refurb A'], ['Result', 'Pass'], ['Cycle', '04:18']] },
      { id: 'outbound', kind: 'outbound_event', stage: 'outbound', title: 'Handoff to outbound queue', timestamp: 'Sep 09, 2026 · 10:26', location: 'Pack lane 12', description: 'Unit is ready for packing. The outbound order is now the active record for this trail.', references: [{ label: 'Order', value: 'SO-77304', type: 'order' }, { label: 'Shipment', value: '1Z84A03', type: 'order' }], details: [['Queue', 'Priority'], ['Carrier', 'UPS Ground'], ['State', 'Awaiting pack']] },
    ],
  },
  'SO-77304': {
    entity: { label: 'Sales order', value: 'SO-77304', type: 'order' },
    events: [
      { id: 'order-created', kind: 'inbound_scan', stage: 'receiving', title: 'Order linked to unit flow', timestamp: 'Sep 09, 2026 · 09:31', location: 'Routing desk', description: 'Sales order became the active fulfillment record after a bundle split.', references: [{ label: 'Serial', value: 'SN-AX14-8842', type: 'serial' }, { label: 'User', value: 'u_jenna_k', type: 'user' }], details: [['Channel', 'Direct'], ['Priority', 'Priority'], ['Items', '1 unit']] },
      { id: 'order-test', kind: 'test_event', stage: 'testing', title: 'Unit cleared for order', timestamp: 'Sep 09, 2026 · 10:08', location: 'Test cell 07', description: 'The serial attached to this order passed the functional test profile.', references: [{ label: 'Serial', value: 'SN-AX14-8842', type: 'serial' }], details: [['Profile', 'Refurb A'], ['Result', 'Pass'], ['Owner', 'u_omar_s']] },
      { id: 'order-outbound', kind: 'outbound_event', stage: 'outbound', title: 'Awaiting pack', timestamp: 'Sep 09, 2026 · 10:26', location: 'Pack lane 12', description: 'Outbound handoff is complete and the order is waiting for its pack scan.', references: [{ label: 'Shipment', value: '1Z84A03', type: 'order' }, { label: 'Serial', value: 'SN-AX14-8842', type: 'serial' }], details: [['Queue', 'Priority'], ['Carrier', 'UPS Ground'], ['State', 'Awaiting pack']] },
    ],
  },
};

const stageLabels = ['receiving', 'triage', 'evidence', 'branch', 'testing', 'outbound'];

export function InvestigationDashboard() {
  const reduceMotion = useReducedMotion();
  const [currentKey, setCurrentKey] = useState('SN-AX14-8842');
  const [history, setHistory] = useState(['SN-AX14-8842']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [activeStage, setActiveStage] = useState('receiving');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const current = investigations[currentKey] ?? investigations['SN-AX14-8842'];

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveStage(visible.target.id.replace('stage-', ''));
    }, { rootMargin: '-15% 0px -60% 0px', threshold: [0.1, 0.35, 0.7] });
    Object.values(sectionRefs.current).forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, [currentKey]);

  const canBack = historyIndex > 0;
  const canForward = historyIndex < history.length - 1;
  const breadcrumb = useMemo(() => current.entity.type === 'serial' ? 'Warehouse trail / Unit history' : 'Warehouse trail / Related record', [current.entity.type]);

  function openInvestigation(value: string, type: EntityType) {
    if (!investigations[value]) return;
    const nextHistory = [...history.slice(0, historyIndex + 1), value];
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setCurrentKey(value);
    setActiveStage('receiving');
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    void type;
  }

  function navigateHistory(direction: 'back' | 'forward') {
    const nextIndex = direction === 'back' ? historyIndex - 1 : historyIndex + 1;
    if (nextIndex < 0 || nextIndex >= history.length) return;
    setHistoryIndex(nextIndex);
    setCurrentKey(history[nextIndex]);
    setActiveStage('receiving');
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function scrollToStage(stage: string) {
    sectionRefs.current[stage]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <main className="min-h-[100dvh] bg-[#111416] text-slate-100 selection:bg-amber-300 selection:text-slate-950">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#111416]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4 px-5 py-4 lg:px-10">
          <div className="flex items-center gap-2">
            <button aria-label="Back in investigation history" disabled={!canBack} onClick={() => navigateHistory('back')} className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><ArrowLeft size={17} /></button>
            <button aria-label="Forward in investigation history" disabled={!canForward} onClick={() => navigateHistory('forward')} className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><ArrowRight size={17} /></button>
          </div>
          <div className="hidden h-6 w-px bg-white/10 sm:block" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{breadcrumb}</p>
            <div className="mt-1 flex items-center gap-2"><ShieldCheck size={15} className="text-amber-300" /><span className="font-mono text-sm font-semibold tracking-wide text-amber-100">{current.entity.value}</span><span className="text-xs text-slate-500">{current.events.length} events</span></div>
          </div>
          <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 md:flex"><Search size={15} className="text-slate-500" /><span className="font-mono text-xs text-slate-500">Trace any identifier</span><kbd className="ml-4 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">⌘K</kbd></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-5 py-10 lg:grid-cols-[minmax(0,3fr)_minmax(220px,1fr)] lg:px-10 lg:py-14">
        <section aria-labelledby="investigation-title">
          <div className="mb-10 max-w-3xl">
            <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300"><Wrench size={14} /> Detective view</div>
            <h1 id="investigation-title" className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Follow the unit through fulfillment.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">A connected evidence trail across receiving, triage, testing, and outbound handoff. Select any related identifier to keep digging.</p>
          </div>

          <div className="relative pl-7 sm:pl-12">
            <div className="absolute bottom-4 left-[13px] top-4 w-px bg-gradient-to-b from-emerald-400/60 via-violet-400/40 to-cyan-400/60 sm:left-[22px]" />
            <motion.div key={currentKey} layout transition={{ duration: reduceMotion ? 0 : 0.35 }} className="space-y-6">
              {current.events.map((event, index) => {
                const palette = palettes[event.kind];
                const Icon = palette.icon;
                return (
                  <motion.article key={event.id} id={`stage-${event.stage}`} ref={(element) => { sectionRefs.current[event.stage] = element; }} initial={reduceMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.42, delay: index * 0.045 }} className="relative scroll-mt-28">
                    <div className={`absolute -left-7 top-6 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-[#111416] ${palette.iconWrap} ${palette.iconColor} sm:-left-12`}><Icon size={14} /></div>
                    <div className={`rounded-2xl border p-5 shadow-[0_16px_50px_rgba(0,0,0,0.12)] ${palette.card}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className={`font-mono text-[10px] uppercase tracking-[0.2em] ${palette.iconColor}`}>{palette.eyebrow}</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{event.title}</h2></div><time className="font-mono text-[11px] text-slate-500">{event.timestamp}</time></div>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{event.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2">{event.references.map((reference) => <button key={`${reference.label}-${reference.value}`} onClick={() => openInvestigation(reference.value, reference.type)} className="group inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-black/15 px-2.5 py-1.5 text-left transition hover:border-amber-300/60 hover:bg-amber-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><span className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{reference.label}</span><span className="font-mono text-xs font-semibold text-slate-200 group-hover:text-amber-200">{reference.value}</span><ExternalLink size={12} className="text-slate-600 group-hover:text-amber-300" /></button>)}</div>
                      <div className="mt-5 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">{event.details.map(([label, value]) => <div key={label}><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-1 text-xs font-medium text-slate-200">{value}</p></div>)}</div>
                      <p className="mt-4 flex items-center gap-1 text-xs text-slate-500"><Barcode size={13} /> {event.location}</p>
                    </div>
                  </motion.article>
                );
              })}
            </motion.div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Lifecycle index</p><span className="font-mono text-[10px] text-slate-600">{current.events.length} checkpoints</span></div>
            <nav aria-label="Lifecycle stages" className="mt-5 space-y-1">{stageLabels.map((stage, index) => { const available = current.events.some((event) => event.stage === stage); return <button key={stage} disabled={!available} onClick={() => scrollToStage(stage)} className={`group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${activeStage === stage && available ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:bg-white/10 hover:text-white'} disabled:cursor-default disabled:opacity-30`}><span className={`font-mono text-[10px] ${activeStage === stage && available ? 'text-slate-700' : 'text-slate-600'}`}>{String(index + 1).padStart(2, '0')}</span><span className="flex-1 text-sm font-medium capitalize">{stage}</span><ChevronRight size={14} /></button>; })}</nav>
            <div className="mt-6 border-t border-white/10 pt-5"><p className="text-xs leading-5 text-slate-500">Click an identifier to open its related trail. Back and Forward preserve your investigation path.</p></div>
          </div>
        </aside>
      </div>
    </main>
  );
}
