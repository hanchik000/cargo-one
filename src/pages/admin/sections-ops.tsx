import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { Link } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { cargoService } from '@/services/cargoService';
import { vehicleService, inspectionService } from '@/services/vehicleService';
import { vipService, promotionService } from '@/services/vipService';
import { groupBuyService } from '@/services/groupBuyService';
import { userService } from '@/services/accountServices';
import { db } from '@/services/db';
import { STAGES, INSPECTION_KEYS } from '@/data/seed';
import type { Car, CarInspection, GroupBuy, InspectionItemKey, Lang, Promotion, PromotionKind, PromotionText, Shipment, ShipmentStage } from '@/lib/types';
import { LANGS } from '@/i18n';
import { Badge, Button, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, MiniSelect, Modal, Notice, Select, SkeletonRows, StatusBadge, Switch, Tabs, Textarea, UploadBox, useToast } from '@/components/ui';
import { InspectionReport, statusKey } from '@/components/commerce';
import { CarVisual } from '@/components/visuals';
import { Toolbar } from './sections-commerce';
import { IconEdit, IconEye, IconInspect, IconPlus, IconTrash, IconUpload, IconCheck, IconX, IconCargo } from '@/components/icons';

// ---------------- CARGO ----------------
function ShipmentAdmin({ sh, onClose }: { sh: Shipment; onClose: () => void }) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<'status' | 'event' | 'assign' | 'docs'>('status');
  const [stage, setStage] = useState<ShipmentStage>(sh.stage);
  const [note, setNote] = useState('');
  const [loc, setLoc] = useState('');
  const [carrier, setCarrier] = useState(sh.carrier);
  const [wh, setWh] = useState(sh.warehouseId);
  const [eta, setEta] = useState(sh.eta.slice(0, 10));
  const setS = useAction(cargoService.adminSetStage);
  const addE = useAction(cargoService.adminAddEvent);
  const upd = useAction(cargoService.adminUpdate);
  const doc = useAction(cargoService.adminAddDocument);
  return (
    <Modal open onClose={onClose} title={sh.trackingNumber} description={`${tk(`stage.${sh.stage}`)} · ${sh.carrier}`} size="lg">
      <Tabs value={tab} onChange={setTab} className="mb-5" label={t('admin.s.cargo')} items={[{ value: 'status', label: t('admin.update_status') }, { value: 'event', label: t('admin.add_event') }, { value: 'assign', label: t('admin.assign') }, { value: 'docs', label: t('orders.documents') }]} />
      {tab === 'status' ? (
        <div className="space-y-4">
          <Select label={t('admin.stage')} value={stage} onChange={setStage} options={STAGES.map((s) => ({ value: s, label: tk(`stage.${s}`) }))} />
          <Input label={t('admin.location')} value={loc} onChange={setLoc} optional placeholder={t('admin.location_ph')} />
          <Textarea label={t('admin.note')} value={note} onChange={setNote} rows={2} optional />
          <div className="flex gap-2">
            <Button loading={setS.pending} onClick={async () => { await setS.run(sh.id, stage, note, loc || undefined); toast(t('admin.saved')); onClose(); }}>{t('common.save')}</Button>
            <Button variant="secondary" icon={IconCheck} loading={setS.pending} onClick={async () => { await setS.run(sh.id, 'delivered', note, loc || undefined); toast(t('admin.marked_delivered')); onClose(); }}>{t('admin.mark_delivered')}</Button>
          </div>
        </div>
      ) : tab === 'event' ? (
        <div className="space-y-4">
          <Input label={t('admin.location')} value={loc} onChange={setLoc} />
          <Textarea label={t('admin.note')} value={note} onChange={setNote} rows={3} error={note && note.trim().length < 3 ? t('form.required') : null} />
          <Button loading={addE.pending} disabled={note.trim().length < 3} onClick={async () => { await addE.run(sh.id, note, loc); toast(t('admin.event_added')); setNote(''); }}>{t('admin.add_event')}</Button>
          <ul className="mt-2 space-y-1 text-[12px] text-muted">{[...sh.events].reverse().slice(0, 6).map((e) => <li key={e.id}>{tk(`stage.${e.stage}`)} · {e.location}{e.note ? ` — ${e.note}` : ''}</li>)}</ul>
        </div>
      ) : tab === 'assign' ? (
        <div className="space-y-4">
          <Input label={t('admin.carrier')} value={carrier} onChange={setCarrier} />
          <Select label={t('cargo.warehouse')} value={wh} onChange={setWh} options={db().warehouses.map((w) => ({ value: w.id, label: w.name }))} />
          <Input label={t('cargo.eta')} type="date" value={eta} onChange={setEta} />
          <Button loading={upd.pending} disabled={carrier.trim().length < 2 || !eta} onClick={async () => { await upd.run(sh.id, { carrier: carrier.trim(), warehouseId: wh, eta: new Date(eta).toISOString() }); toast(t('admin.saved')); }}>{t('common.save')}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sh.documents.map((d) => <div key={d} className="rounded-[10px] bg-mist px-3 py-2 text-sm">{d}</div>)}
          <UploadBox compact accept=".pdf,image/*" busy={doc.pending} onFile={async (f) => { await doc.run(sh.id, f.name); toast(t('admin.doc_uploaded')); }} label={t('admin.upload_doc')} />
        </div>
      )}
    </Modal>
  );
}

export function CargoSection() {
  const { t, tk, date } = useI18n();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [wh, setWh] = useState('');
  const [carrier, setCarrier] = useState('');
  const [from, setFrom] = useState('');
  const list = useQuery(() => cargoService.listAll(), []);
  const [sel, setSel] = useState<string | null>(null);
  const carriers = [...new Set((list.data || []).map((s) => s.carrier))];
  const rows = (list.data || []).filter((s) => (!stage || s.stage === stage) && (!wh || s.warehouseId === wh) && (!carrier || s.carrier === carrier) && (!from || s.createdAt.slice(0, 10) >= from) && (!q || `${s.trackingNumber} ${s.destination}`.toLowerCase().includes(q.toLowerCase())));
  const sh = list.data?.find((s) => s.id === sel);
  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder={t('admin.search_tracking')}>
        <MiniSelect label={t('admin.stage')} value={stage} onChange={setStage} options={[{ value: '', label: `${t('admin.stage')}: ${t('common.all')}` }, ...STAGES.map((s) => ({ value: s, label: tk(`stage.${s}`) }))]} />
        <MiniSelect label={t('cargo.warehouse')} value={wh} onChange={setWh} options={[{ value: '', label: `${t('cargo.warehouse')}: ${t('common.all')}` }, ...db().warehouses.map((w) => ({ value: w.id, label: w.city }))]} />
        <MiniSelect label={t('admin.carrier')} value={carrier} onChange={setCarrier} options={[{ value: '', label: `${t('admin.carrier')}: ${t('common.all')}` }, ...carriers.map((c) => ({ value: c, label: c }))]} />
        <label className="flex items-center gap-2 text-[12px] text-muted">{t('admin.from_date')}<input type="date" value={from} onChange={(e: { target: HTMLInputElement }) => setFrom(e.target.value)} className="h-9 rounded-[10px] bg-paper px-2 text-[13px] hairline" /></label>
      </Toolbar>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={rows} rowKey={(s) => s.id} onRowClick={(s) => setSel(s.id)} mobileTitle={(s) => <span className="num">{s.trackingNumber}</span>} empty={<EmptyState icon={IconCargo} title={t('admin.no_results')} />}
          columns={[
            { key: 'n', header: t('cargo.tracking'), cell: (s) => <span className="num font-medium">{s.trackingNumber}</span>, mobile: false },
            { key: 'c', header: t('admin.customer'), cell: (s) => db().users.find((u) => u.id === s.userId)?.name || s.userId },
            { key: 'st', header: t('admin.stage'), cell: (s) => <Badge tone={s.stage === 'delivered' ? 'ok' : s.stage === 'customs' ? 'warn' : 'neutral'}>{tk(`stage.${s.stage}`)}</Badge> },
            { key: 'w', header: t('cargo.warehouse'), cell: (s) => db().warehouses.find((w) => w.id === s.warehouseId)?.city },
            { key: 'cr', header: t('admin.carrier'), cell: (s) => <span className="text-[12px]">{s.carrier}</span> },
            { key: 'd', header: t('admin.destination'), cell: (s) => <span className="line-clamp-1 max-w-[180px] text-[12px]">{s.destination}</span> },
            { key: 'e', header: t('cargo.eta'), cell: (s) => <span className="text-[12px]">{date(s.eta)}</span> },
          ]} />
      )}
      {sh ? <ShipmentAdmin sh={sh} onClose={() => setSel(null)} /> : null}
    </div>
  );
}

// ---------------- CARS ----------------
function CarEditor({ car, open, onClose }: { car: Car | null; open: boolean; onClose: () => void }) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const blank = { brand: '', model: '', year: String(new Date().getFullYear() - 1), condition: 'used' as Car['condition'], fuel: 'ev' as Car['fuel'], body: 'sedan' as Car['body'], mileageKm: '0', priceUSD: '', color: 'White', drive: 'fwd' as Car['drive'], accident: 'none' as Car['accident'], location: 'Guangzhou', vin: '', batteryKwh: '', commercial: false, owners: '1' };
  const [f, setF] = useState(blank);
  const save = useAction(vehicleService.save);
  useEffect(() => { if (open) setF(car ? { brand: car.brand, model: car.model, year: String(car.year), condition: car.condition, fuel: car.fuel, body: car.body, mileageKm: String(car.mileageKm), priceUSD: String(car.priceUSD), color: car.color, drive: car.drive, accident: car.accident, location: car.location, vin: car.vin, batteryKwh: car.batteryKwh ? String(car.batteryKwh) : '', commercial: car.commercial, owners: String(car.owners) } : blank); }, [open, car]); // eslint-disable-line react-hooks/exhaustive-deps
  const errs = { brand: !f.brand.trim() ? t('form.required') : null, model: !f.model.trim() ? t('form.required') : null, year: !(Number(f.year) >= 2000 && Number(f.year) <= new Date().getFullYear() + 1) ? t('form.invalid_year') : null, priceUSD: !(Number(f.priceUSD) > 0) ? t('form.invalid_amount') : null, vin: f.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(f.vin.toUpperCase()) ? t('admin.vin_err') : null };
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Modal open={open} onClose={onClose} title={car ? t('admin.edit_car') : t('admin.new_car')} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.pending} disabled={Object.values(errs).some(Boolean)} onClick={async () => {
        const r = await save.run({ id: car?.id, brand: f.brand.trim(), model: f.model.trim(), year: Number(f.year), condition: f.condition, fuel: f.fuel, body: f.body, mileageKm: Number(f.mileageKm) || 0, priceUSD: Number(f.priceUSD), color: f.color, drive: f.drive, accident: f.accident, location: f.location, vin: f.vin.toUpperCase(), batteryKwh: f.batteryKwh ? Number(f.batteryKwh) : undefined, commercial: f.commercial, owners: Number(f.owners) || 0 });
        if (r) { toast(t('admin.saved')); onClose(); }
      }}>{t('common.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label={t('auto.brand')} value={f.brand} onChange={set('brand')} error={errs.brand} />
        <Input label={t('auto.model')} value={f.model} onChange={set('model')} error={errs.model} />
        <Input label={t('auto.year')} value={f.year} onChange={set('year')} inputMode="numeric" error={errs.year} />
        <Select label={t('admin.condition')} value={f.condition} onChange={(v) => setF({ ...f, condition: v })} options={[{ value: 'used', label: t('auto.cat.used') }, { value: 'new', label: t('auto.cat.new') }]} />
        <Select label={t('auto.fuel')} value={f.fuel} onChange={(v) => setF({ ...f, fuel: v })} options={(['ev', 'hybrid', 'petrol', 'diesel'] as const).map((x) => ({ value: x, label: tk(`fuel.${x}`) }))} />
        <Select label={t('auto.body')} value={f.body} onChange={(v) => setF({ ...f, body: v })} options={(['sedan', 'suv', 'hatch', 'van', 'pickup'] as const).map((x) => ({ value: x, label: tk(`body.${x}`) }))} />
        <Input label={t('auto.mileage')} value={f.mileageKm} onChange={set('mileageKm')} inputMode="numeric" />
        <Input label={t('auto.cost.vehicle')} value={f.priceUSD} onChange={set('priceUSD')} inputMode="numeric" prefix="$" error={errs.priceUSD} />
        <Input label={t('auto.battery')} value={f.batteryKwh} onChange={set('batteryKwh')} inputMode="decimal" optional />
        <Select label={t('auto.drive')} value={f.drive} onChange={(v) => setF({ ...f, drive: v })} options={(['fwd', 'rwd', 'awd'] as const).map((x) => ({ value: x, label: x.toUpperCase() }))} />
        <Select label={t('auto.accident')} value={f.accident} onChange={(v) => setF({ ...f, accident: v })} options={(['none', 'minor', 'major'] as const).map((x) => ({ value: x, label: tk(`accident.${x}`) }))} />
        <Input label={t('auto.color')} value={f.color} onChange={set('color')} />
        <Input label={t('auto.location')} value={f.location} onChange={set('location')} />
        <Input label={t('auto.owners')} value={f.owners} onChange={set('owners')} inputMode="numeric" />
        <Input label="VIN" value={f.vin} onChange={set('vin')} error={errs.vin} />
        <div className="sm:col-span-3"><Checkbox label={t('auto.cat.commercial')} checked={f.commercial} onChange={(v) => setF({ ...f, commercial: v })} /></div>
        <div className="sm:col-span-3"><Notice tone="neutral">{t('admin.verification_note')}</Notice></div>
      </div>
    </Modal>
  );
}

function InspectionRecorder({ car, onClose }: { car: Car; onClose: () => void }) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const [inspector, setInspector] = useState('');
  const [inspectorId, setInspectorId] = useState('INS-');
  const [d, setD] = useState(new Date().toISOString().slice(0, 10));
  const [photos, setPhotos] = useState('60');
  const [video, setVideo] = useState('6');
  const [paint, setPaint] = useState<[string, string]>(['90', '130']);
  const [summary, setSummary] = useState('');
  const keys = INSPECTION_KEYS.filter((k) => car.fuel === 'ev' || (k !== 'ev_battery' && k !== 'charging'));
  const [items, setItems] = useState<Record<string, { status: 'ok' | 'note' | 'fail'; note: string }>>(() => Object.fromEntries(keys.map((k) => [k, { status: 'ok', note: '' }])));
  const rec = useAction(inspectionService.record);
  const missingNotes = Object.entries(items).some(([, v]) => v.status !== 'ok' && v.note.trim().length < 3);
  const errs = { inspector: inspector.trim().length < 3 ? t('form.required') : null, photos: !(Number(photos) >= 20) ? t('admin.photos_min') : null };
  return (
    <Modal open onClose={onClose} title={t('admin.record_inspection')} description={`${car.brand} ${car.model} · ${car.vin}`} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button icon={IconInspect} loading={rec.pending} disabled={!!errs.inspector || !!errs.photos || missingNotes} onClick={async () => {
        const notes: Partial<Record<InspectionItemKey, string>> = {}; const fails: Partial<Record<InspectionItemKey, string>> = {};
        Object.entries(items).forEach(([k, v]) => { if (v.status === 'note') notes[k as InspectionItemKey] = v.note; if (v.status === 'fail') fails[k as InspectionItemKey] = v.note; });
        const r = await rec.run({ carId: car.id, inspector, inspectorId, date: d, notes, fails, photos: Number(photos), videoMinutes: Number(video) || 0, paintMicrons: [Number(paint[0]) || 0, Number(paint[1]) || 0], summary: summary || t('admin.default_summary') });
        if (r) { toast(t('admin.inspection_recorded', { score: r.score, result: tk(`insp.result.${r.result}`) })); onClose(); }
      }}>{t('admin.save_inspection')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Input label={t('insp.inspector')} value={inspector} onChange={setInspector} error={errs.inspector} />
        <Input label={t('admin.inspector_id')} value={inspectorId} onChange={setInspectorId} />
        <Input label={t('insp.date')} type="date" value={d} onChange={setD} />
        <Input label={t('admin.photos')} value={photos} onChange={(v) => setPhotos(v.replace(/\D/g, ''))} inputMode="numeric" error={errs.photos} />
        <Input label={t('admin.video_min')} value={video} onChange={(v) => setVideo(v.replace(/\D/g, ''))} inputMode="numeric" />
        <Input label={t('admin.paint_min')} value={paint[0]} onChange={(v) => setPaint([v.replace(/\D/g, ''), paint[1]])} inputMode="numeric" />
        <Input label={t('admin.paint_max')} value={paint[1]} onChange={(v) => setPaint([paint[0], v.replace(/\D/g, '')])} inputMode="numeric" />
        <div className="sm:col-span-4"><UploadBox compact accept="image/*,video/*" onFile={(f) => toast(t('admin.media_uploaded', { name: f.name }))} label={t('admin.upload_media')} hint={t('admin.upload_media_hint')} icon={IconUpload} /></div>
      </div>
      <div className="mt-6 eyebrow mb-2">{t('insp.checklist')}</div>
      <ul className="divide-y divide-line rounded-[12px] hairline">
        {keys.map((k) => (
          <li key={k} className="grid items-center gap-2 p-3 sm:grid-cols-[180px_auto_1fr]">
            <span className="text-sm font-medium">{tk(`insp.item.${k}`)}</span>
            <div className="flex gap-1">{(['ok', 'note', 'fail'] as const).map((s) => <button key={s} type="button" aria-pressed={items[k].status === s} onClick={() => setItems({ ...items, [k]: { ...items[k], status: s } })} className={`rounded-[8px] px-2.5 py-1 text-[12px] font-medium ${items[k].status === s ? (s === 'ok' ? 'bg-ok text-white' : s === 'note' ? 'bg-warn text-white' : 'bg-bad text-white') : 'bg-mist text-muted'}`}>{tk(`insp.status.${s}`)}</button>)}</div>
            {items[k].status !== 'ok' ? <input aria-label={t('admin.note')} value={items[k].note} onChange={(e: { target: HTMLInputElement }) => setItems({ ...items, [k]: { ...items[k], note: e.target.value } })} placeholder={t('admin.note_required')} className="h-9 rounded-[8px] bg-mist px-3 text-[13px] outline-none focus:ring-1 focus:ring-ink" /> : <span />}
          </li>
        ))}
      </ul>
      <div className="mt-4"><Textarea label={t('admin.summary')} value={summary} onChange={setSummary} rows={2} optional /></div>
      <div className="mt-3"><Notice tone="neutral">{t('admin.score_computed')}</Notice></div>
    </Modal>
  );
}

export function CarsSection() {
  const { t, tk, money, num } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [verif, setVerif] = useState('');
  const list = useQuery(() => vehicleService.list({ includeUnpublished: true, q, sort: 'year' }), [q]);
  const [editor, setEditor] = useState<{ open: boolean; car: Car | null }>({ open: false, car: null });
  const [record, setRecord] = useState<Car | null>(null);
  const [assign, setAssign] = useState<Car | null>(null);
  const [insp, setInsp] = useState('');
  const [del, setDel] = useState<Car | null>(null);
  const upd = useAction(vehicleService.update);
  const setV = useAction(inspectionService.setVerification);
  const assignA = useAction(inspectionService.assignInspector);
  const remove = useAction(vehicleService.remove);
  const rows = (list.data?.cars || []).filter((c) => !verif || c.verification === verif);
  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder={t('admin.search_cars')}>
        <MiniSelect label={t('admin.verification')} value={verif} onChange={setVerif} options={[{ value: '', label: `${t('admin.verification')}: ${t('common.all')}` }, ...(['verified', 'pending', 'rejected', 'not_inspected'] as const).map((v) => ({ value: v, label: tk(`verif.${v}`) }))]} />
        <Button size="sm" icon={IconPlus} onClick={() => setEditor({ open: true, car: null })}>{t('admin.new_car')}</Button>
      </Toolbar>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={rows} rowKey={(c) => c.id} mobileTitle={(c) => `${c.brand} ${c.model}`}
          columns={[
            { key: 'c', header: t('admin.vehicle'), cell: (c) => <div className="flex items-center gap-3"><CarVisual car={c} image={c.images[1]} className="aspect-[16/10] w-16" /><div><Link to={`/auto/${c.id}`} className="font-medium hover:underline">{c.brand} {c.model}</Link><div className="num text-[11px] text-muted">{c.year} · {num(c.mileageKm)} km</div></div></div>, mobile: false },
            { key: 'p', header: t('auto.cost.vehicle'), cell: (c) => <span className="num">{money(c.priceUSD, 'USD')}</span> },
            { key: 'v', header: t('admin.verification'), cell: (c) => <StatusBadge status={c.verification} label={tk(`verif.${c.verification}`)} /> },
            { key: 's', header: t('insp.score'), cell: (c) => <span className="num">{list.data!.inspections.find((i) => i.id === c.inspectionId)?.score ?? '—'}</span> },
            { key: 'pub', header: t('admin.published'), cell: (c) => <Switch hideLabel label={t('admin.published')} checked={c.published} onChange={async (v) => { await upd.run(c.id, { published: v }); toast(v ? t('admin.published_toast') : t('admin.unpublished_toast')); }} /> },
            { key: 'x', header: t('common.actions'), cell: (c) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEditor({ open: true, car: c })} aria-label={t('common.edit')} />
                <Button size="sm" variant="ghost" onClick={() => { setAssign(c); setInsp(''); }}>{t('admin.assign_inspector')}</Button>
                <Button size="sm" variant="ghost" icon={IconInspect} onClick={() => setRecord(c)}>{t('admin.upload_inspection')}</Button>
                {c.verification !== 'verified' ? <Button size="sm" variant="ghost" icon={IconCheck} onClick={async () => { const ok = await setV.run(c.id, 'verified'); if (ok) toast(t('admin.verified_toast')); }}>{t('admin.verify')}</Button> : null}
                {c.verification !== 'rejected' ? <Button size="sm" variant="ghost" icon={IconX} onClick={async () => { await setV.run(c.id, 'rejected'); toast(t('admin.car_rejected')); }}>{t('sp.reject')}</Button> : null}
                <Button size="sm" variant="ghost" icon={IconTrash} onClick={() => setDel(c)} aria-label={t('common.delete')} />
              </div>
            ) },
          ]} />
      )}
      {setV.error ? <div className="mt-3"><Notice tone="bad">{t('admin.verify_requires_inspection')}</Notice></div> : null}
      <CarEditor open={editor.open} car={editor.car} onClose={() => setEditor({ open: false, car: null })} />
      {record ? <InspectionRecorder car={record} onClose={() => setRecord(null)} /> : null}
      <Modal open={!!assign} onClose={() => setAssign(null)} title={t('admin.assign_inspector')} description={assign ? `${assign.brand} ${assign.model}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAssign(null)}>{t('common.cancel')}</Button><Button loading={assignA.pending} disabled={insp.trim().length < 3} onClick={async () => { if (assign) { await assignA.run(assign.id, insp); toast(t('admin.inspector_assigned', { name: insp })); } setAssign(null); }}>{t('common.save')}</Button></>}>
        <Select label={t('insp.inspector')} value={insp} onChange={setInsp} options={[{ value: '', label: '—' }, { value: 'Arslan Myradov (INS-014)', label: 'Arslan Myradov · INS-014' }, { value: 'Zhang Hao (INS-021)', label: 'Zhang Hao · INS-021' }, { value: 'Wang Jie (INS-009)', label: 'Wang Jie · INS-009' }]} />
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={t('admin.delete_car')} body={del ? `${del.brand} ${del.model}` : ''} confirmLabel={t('common.delete')} danger loading={remove.pending} onConfirm={async () => { if (del) await remove.run(del.id); setDel(null); toast(t('admin.deleted')); }} />
    </div>
  );
}

export function InspectionsSection() {
  const { t, tk, date } = useI18n();
  const list = useQuery(() => inspectionService.listAll(), []);
  const [view, setView] = useState<{ inspection: CarInspection; car: Car } | null>(null);
  return (
    <div>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={list.data!} rowKey={(r) => r.inspection.id} onRowClick={(r) => r.car && setView({ inspection: r.inspection, car: r.car })} mobileTitle={(r) => (r.car ? `${r.car.brand} ${r.car.model}` : r.inspection.id)}
          columns={[
            { key: 'c', header: t('admin.vehicle'), cell: (r) => (r.car ? `${r.car.brand} ${r.car.model} ${r.car.year}` : '—'), mobile: false },
            { key: 'v', header: 'VIN', cell: (r) => <span className="num text-[12px]">{r.inspection.vin}</span> },
            { key: 's', header: t('insp.score'), cell: (r) => <span className="num font-semibold">{r.inspection.score}</span> },
            { key: 'r', header: t('admin.result'), cell: (r) => <StatusBadge status={r.inspection.result} label={tk(`insp.result.${r.inspection.result}`)} /> },
            { key: 'i', header: t('insp.inspector'), cell: (r) => r.inspection.inspector },
            { key: 'd', header: t('insp.date'), cell: (r) => date(r.inspection.date) },
            { key: 'x', header: '', cell: () => <IconEye className="size-4 text-muted" aria-hidden /> },
          ]} />
      )}
      {view ? <Modal open onClose={() => setView(null)} title={`${view.car.brand} ${view.car.model}`} size="xl"><InspectionReport inspection={view.inspection} car={view.car} /></Modal> : null}
    </div>
  );
}

// ---------------- VIP ----------------
export function VipSection() {
  const { t, tk, date } = useI18n();
  const toast = useToast();
  const list = useQuery(() => vipService.listAll(), []);
  const setVip = useAction(userService.setVip);
  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {(['active', 'cancelled', 'expired'] as const).map((s) => <div key={s} className="card p-4"><div className="text-[12px] text-muted">{tk(`status.vip.${s}`)}</div><div className="num text-2xl font-semibold">{(list.data || []).filter((v) => v.status === s).length}</div></div>)}
      </div>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={list.data!} rowKey={(v) => v.userId} mobileTitle={(v) => db().users.find((u) => u.id === v.userId)?.name} empty={<EmptyState title={t('admin.no_results')} />}
          columns={[
            { key: 'u', header: t('admin.customer'), cell: (v) => db().users.find((u) => u.id === v.userId)?.name || v.userId, mobile: false },
            { key: 's', header: t('common.status'), cell: (v) => <StatusBadge status={v.status} label={tk(`status.vip.${v.status}`)} /> },
            { key: 'st', header: t('admin.started'), cell: (v) => date(v.startedAt) },
            { key: 'r', header: t('vip.renews'), cell: (v) => date(v.renewsAt) },
            { key: 'a', header: t('admin.auto_renew'), cell: (v) => (v.autoRenew ? t('common.yes') : t('common.no')) },
            { key: 'x', header: t('common.actions'), cell: (v) => <Button size="sm" variant="ghost" onClick={async () => { await setVip.run(v.userId, v.status === 'expired'); toast(t('admin.saved')); }}>{v.status === 'expired' ? t('admin.grant_vip') : t('admin.revoke_vip')}</Button> },
          ]} />
      )}
    </div>
  );
}

// ---------------- PROMOTIONS & GROUP BUYS ----------------
function PromoEditor({ promo, open, onClose }: { promo: Promotion | null; open: boolean; onClose: () => void }) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const blank = { kind: 'vip_campaign' as PromotionKind, name: '', headline: '', prize: '', prizeCount: '1', startsAt: new Date().toISOString().slice(0, 10), endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), eligibility: '', rules: '', status: 'draft' as Promotion['status'], discountPct: '', productIds: '' };
  const [f, setF] = useState(blank);
  const [lang, setLang] = useState<Lang>('en');
  const [tr, setTr] = useState<Partial<Record<Lang, PromotionText>>>({});
  const save = useAction(promotionService.save);
  useEffect(() => { if (open) { setLang('en'); setTr(promo?.i18n ? structuredClone(promo.i18n) : {}); } }, [open, promo]);
  const txt = (k: keyof PromotionText) => (lang === 'en' ? String(f[k] ?? '') : tr[lang]?.[k] ?? '');
  const setTxt = (k: keyof PromotionText) => (v: string) => (lang === 'en' ? setF({ ...f, [k]: v }) : setTr({ ...tr, [lang]: { ...(tr[lang] || {}), [k]: v } }));
  useEffect(() => { if (open) setF(promo ? { kind: promo.kind, name: promo.name, headline: promo.headline || '', prize: promo.prize || '', prizeCount: String(promo.prizeCount || 1), startsAt: promo.startsAt.slice(0, 10), endsAt: promo.endsAt.slice(0, 10), eligibility: promo.eligibility, rules: promo.rules, status: promo.status, discountPct: promo.discountPct ? String(promo.discountPct) : '', productIds: (promo.productIds || []).join(', ') } : blank); }, [open, promo]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const errs = { name: f.name.trim().length < 3 ? t('form.required') : null, dates: f.startsAt > f.endsAt ? t('admin.dates_err') : null, prize: f.kind === 'vip_campaign' && !f.prize.trim() ? t('form.required') : null, pct: ['discount', 'price_drop'].includes(f.kind) && !(Number(f.discountPct) > 0 && Number(f.discountPct) < 90) ? t('form.invalid_amount') : null };
  return (
    <Modal open={open} onClose={onClose} title={promo ? t('admin.edit_promo') : t('admin.new_promo')} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.pending} disabled={Object.values(errs).some(Boolean)} onClick={async () => {
        const r = await save.run({ id: promo?.id, kind: f.kind, name: f.name.trim(), headline: f.headline, prize: f.prize || undefined, prizeCount: Number(f.prizeCount) || undefined, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt + 'T23:59:00').toISOString(), eligibility: f.eligibility, rules: f.rules, i18n: tr, status: f.status, discountPct: f.discountPct ? Number(f.discountPct) : undefined, productIds: f.productIds ? f.productIds.split(/[\s,]+/).filter(Boolean) : undefined });
        if (r) { toast(t('admin.saved')); onClose(); }
      }}>{t('common.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t('admin.kind')} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={(['vip_campaign', 'discount', 'price_drop', 'featured', 'banner', 'group_buy'] as const).map((k) => ({ value: k, label: tk(`admin.promo_kind.${k}`) }))} />
        <Select label={t('common.status')} value={f.status} onChange={(v) => setF({ ...f, status: v })} options={(['draft', 'active', 'ended'] as const).map((s) => ({ value: s, label: tk(statusKey('promo', s)) }))} />
        <div className="sm:col-span-2"><Tabs variant="pill" value={lang} onChange={setLang} items={LANGS.map((l) => ({ value: l.code, label: l.label }))} label={t('common.language')} /></div>
        <div className="sm:col-span-2"><Input label={t('admin.campaign_name')} value={txt('name')} onChange={setTxt('name')} error={lang === 'en' ? errs.name : null} hint={lang !== 'en' ? t('admin.fallback_en') : undefined} /></div>
        <div className="sm:col-span-2"><Input label={t('admin.headline')} value={txt('headline')} onChange={setTxt('headline')} optional /></div>
        {f.kind === 'vip_campaign' ? <><Input label={t('promo.prize')} value={f.prize} onChange={set('prize')} error={errs.prize} /><Input label={t('promo.prizes_n')} value={f.prizeCount} onChange={(v) => setF({ ...f, prizeCount: v.replace(/\D/g, '') })} inputMode="numeric" /></> : null}
        {['discount', 'price_drop'].includes(f.kind) ? <><Input label={t('admin.discount_pct')} value={f.discountPct} onChange={(v) => setF({ ...f, discountPct: v.replace(/\D/g, '') })} inputMode="numeric" error={errs.pct} /><Input label={t('admin.product_ids')} value={f.productIds} onChange={set('productIds')} optional hint="p1, p4" /></> : null}
        {f.kind === 'featured' ? <div className="sm:col-span-2"><Input label={t('admin.product_ids')} value={f.productIds} onChange={set('productIds')} hint="p1, p4" /></div> : null}
        <Input label={t('admin.start')} type="date" value={f.startsAt} onChange={set('startsAt')} />
        <Input label={t('admin.end')} type="date" value={f.endsAt} onChange={set('endsAt')} error={errs.dates} />
        <div className="sm:col-span-2"><Textarea label={t('promo.eligibility')} value={txt('eligibility')} onChange={setTxt('eligibility')} rows={2} /></div>
        <div className="sm:col-span-2"><Textarea label={t('promo.rules')} value={txt('rules')} onChange={setTxt('rules')} rows={5} /></div>
        {f.kind === 'vip_campaign' ? <div className="sm:col-span-2"><Notice tone="neutral">{t('admin.campaign_note')}</Notice></div> : null}
      </div>
    </Modal>
  );
}

function GroupBuyAdmin() {
  const { t, tk, money, date } = useI18n();
  const toast = useToast();
  const list = useQuery(() => groupBuyService.list(), []);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('p1');
  const [target, setTarget] = useState('50');
  const [days, setDays] = useState('10');
  const save = useAction(groupBuyService.save);
  const setS = useAction(groupBuyService.setStatus);
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button size="sm" icon={IconPlus} onClick={() => setOpen(true)}>{t('admin.new_group_buy')}</Button></div>
      {list.loading ? <SkeletonRows /> : (
        <DataTable rows={list.data || []} rowKey={(x) => x.gb.id} mobileTitle={(x) => x.gb.title}
          columns={[
            { key: 't', header: t('admin.f.title'), cell: (x) => <Link to={`/group-buy/${x.gb.id}`} className="font-medium hover:underline">{x.gb.title}</Link>, mobile: false },
            { key: 'q', header: t('gb.current_qty'), cell: (x) => <span className="num">{x.gb.currentQty}/{x.gb.targetQty}</span> },
            { key: 'p', header: t('gb.current_price'), cell: (x) => <span className="num">{money(x.gb.tiers[0].priceCNY, 'CNY')} → {money(x.gb.tiers[x.gb.tiers.length - 1].priceCNY, 'CNY')}</span> },
            { key: 'e', header: t('admin.end'), cell: (x) => date(x.gb.endsAt) },
            { key: 's', header: t('common.status'), cell: (x) => <MiniSelect label={t('common.status')} value={x.gb.status} onChange={async (v: GroupBuy['status']) => { await setS.run(x.gb.id, v); toast(t('admin.saved')); }} options={(['open', 'completed', 'cancelled'] as const).map((s) => ({ value: s, label: tk(statusKey('gb', s)) }))} /> },
          ]} />
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('admin.new_group_buy')}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button loading={save.pending} disabled={!(Number(target) >= 2) || !(Number(days) >= 1)} onClick={async () => { const r = await save.run({ productId, targetQty: Number(target), endsAt: new Date(Date.now() + Number(days) * 86_400_000).toISOString() }); if (r) { toast(t('admin.saved')); setOpen(false); } }}>{t('common.save')}</Button></>}>
        <div className="space-y-4">
          <Select label={t('admin.product')} value={productId} onChange={setProductId} options={db().products.filter((p) => p.published).map((p) => ({ value: p.id, label: p.title }))} />
          <div className="grid grid-cols-2 gap-3"><Input label={t('admin.target_qty')} value={target} onChange={(v) => setTarget(v.replace(/\D/g, ''))} inputMode="numeric" /><Input label={t('admin.duration_days')} value={days} onChange={(v) => setDays(v.replace(/\D/g, ''))} inputMode="numeric" /></div>
          <p className="text-[12px] text-muted">{t('admin.tiers_auto')}</p>
        </div>
      </Modal>
    </div>
  );
}

export function PromotionsSection() {
  const { t, tk, date } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<'campaigns' | 'group_buys'>('campaigns');
  const list = useQuery(() => promotionService.listAll(), []);
  const [editor, setEditor] = useState<{ open: boolean; promo: Promotion | null }>({ open: false, promo: null });
  const [del, setDel] = useState<Promotion | null>(null);
  const [entries, setEntries] = useState<Promotion | null>(null);
  const entryQ = useQuery(() => (entries ? promotionService.entriesFor(entries.id) : Promise.resolve([])), [entries?.id]);
  const remove = useAction(promotionService.remove);
  return (
    <div>
      <Tabs value={tab} onChange={setTab} className="mb-4" label={t('admin.s.promotions')} items={[{ value: 'campaigns', label: t('admin.campaigns') }, { value: 'group_buys', label: t('nav.group_buy') }]} />
      {tab === 'group_buys' ? <GroupBuyAdmin /> : (
        <>
          <div className="mb-3 flex justify-end"><Button size="sm" icon={IconPlus} onClick={() => setEditor({ open: true, promo: null })}>{t('admin.new_promo')}</Button></div>
          {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
            <DataTable rows={list.data!} rowKey={(p) => p.id} mobileTitle={(p) => p.name}
              columns={[
                { key: 'n', header: t('admin.campaign_name'), cell: (p) => <div><div className="font-medium">{p.name}</div>{p.prize ? <div className="text-[11px] text-muted">{p.prize} × {p.prizeCount}</div> : null}</div>, mobile: false },
                { key: 'k', header: t('admin.kind'), cell: (p) => <Badge>{tk(`admin.promo_kind.${p.kind}`)}</Badge> },
                { key: 'per', header: t('promo.period'), cell: (p) => <span className="text-[12px]">{date(p.startsAt)} — {date(p.endsAt)}</span> },
                { key: 's', header: t('common.status'), cell: (p) => <StatusBadge status={p.status} label={tk(statusKey('promo', p.status))} /> },
                { key: 'x', header: t('common.actions'), cell: (p) => <div className="flex gap-1"><Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEditor({ open: true, promo: p })} aria-label={t('common.edit')} />{p.kind === 'vip_campaign' ? <Button size="sm" variant="ghost" onClick={() => setEntries(p)}>{t('admin.entries')}</Button> : null}<Button size="sm" variant="ghost" icon={IconTrash} onClick={() => setDel(p)} aria-label={t('common.delete')} /></div> },
              ]} />
          )}
        </>
      )}
      <PromoEditor open={editor.open} promo={editor.promo} onClose={() => setEditor({ open: false, promo: null })} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={t('admin.delete_promo')} body={del?.name} confirmLabel={t('common.delete')} danger loading={remove.pending} onConfirm={async () => { if (del) await remove.run(del.id); setDel(null); toast(t('admin.deleted')); }} />
      <Modal open={!!entries} onClose={() => setEntries(null)} title={t('admin.entries')} description={entries?.name}>
        {entryQ.loading ? <SkeletonRows count={2} /> : !entryQ.data?.length ? <p className="text-sm text-muted">{t('admin.no_entries')}</p> : <ul className="space-y-2">{entryQ.data.map((e) => <li key={e.id} className="flex justify-between rounded-[10px] bg-mist px-3 py-2 text-sm"><span>{db().users.find((u) => u.id === e.userId)?.name || e.userId}</span><span className="num">{e.entries}</span></li>)}</ul>}
      </Modal>
    </div>
  );
}
