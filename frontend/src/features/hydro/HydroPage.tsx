import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { Plus, ChevronLeft, Droplets, Gauge, Target, Trash2, Wind, Camera, Fan, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../context/OrgContext';
import { SubHeader } from '../../components/SubHeader';
import { SignaturePad } from '../../components/SignaturePad';
import { grainsPerPound, dewPointF, airMoversNeeded, dehumidifiersNeeded } from './psychrometrics';
import { DryingProgress } from './DryingProgress';

interface Chamber {
  id: string; name: string; length_ft: number | null; width_ft: number | null;
  height_ft: number | null; class_of_loss: number | null;
}
interface Reading {
  id: string; reading_type: string; location_label: string | null;
  temp_f: number | null; rh_pct: number | null; gpp: number | null;
  dew_point: number | null; material_mc: number | null; material: string | null; captured_at: string;
}
interface DryStd { id: string; material: string; goal_value: number | null; }
interface Equip { id: string; type: string; make_model: string | null; serial: string | null; placed_at: string | null; removed_at: string | null; actual_placed: number | null; }
const EQUIP_TYPES = [
  { value: 'air_mover', label: 'Air mover' },
  { value: 'dehumidifier', label: 'Dehumidifier' },
  { value: 'air_scrubber', label: 'Air scrubber' },
  { value: 'heater', label: 'Heater' }
];
const equipLabel = (t: string) => (EQUIP_TYPES.find(e => e.value === t)?.label || t);
const todayISO = () => new Date().toISOString().slice(0, 10);
function equipDays(e: Equip): number {
  if (!e.placed_at) return 0;
  const start = new Date(e.placed_at + 'T00:00:00').getTime();
  const end = (e.removed_at ? new Date(e.removed_at + 'T00:00:00') : new Date()).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + (e.removed_at ? 1 : 0));
}

const READING_TYPES = [
  { v: 'psychrometric', l: 'Affected (interior)' },
  { v: 'exterior', l: 'Exterior' },
  { v: 'dehu_outlet', l: 'Dehu outlet' },
  { v: 'material_mc', l: 'Material MC' }
];

// Structure-level Hydro (S500 drying). v1: chambers with live equipment sizing,
// a daily psychrometric readings log (GPP + dew point auto-computed), and dry
// standards. All deterministic; no backend needed.
export default function HydroPage() {
  const { structureId, claimId } = useParams();
  const { activeOrg } = useOrg();
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [sel, setSel] = useState<Chamber | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [structureName, setStructureName] = useState('');

  async function load() {
    if (!structureId) return;
    const { data } = await supabase.from('resto_drying_chambers').select('*')
      .eq('structure_id', structureId).order('created_at');
    setChambers((data as Chamber[]) ?? []);
  }
  useEffect(() => { void load(); }, [structureId]);
  // Show which structure this Hydro belongs to (a claim can have several).
  useEffect(() => {
    if (!structureId) return;
    supabase.from('resto_structures').select('name').eq('id', structureId).single()
      .then(({ data }) => setStructureName((data as { name: string } | null)?.name ?? ''));
  }, [structureId]);

  async function createChamber() {
    if (!activeOrg || !structureId || !newName || !newName.trim()) { setNewName(null); return; }
    const { data } = await supabase.from('resto_drying_chambers')
      .insert({ org_id: activeOrg.id, structure_id: structureId, name: newName.trim(), height_ft: 8, class_of_loss: 2 })
      .select('*').single();
    setNewName(null);
    await load();
    if (data) setSel(data as Chamber);
  }

  if (sel) return <ChamberDetail chamber={sel} orgId={activeOrg!.id} claimId={claimId} structureName={structureName} onBack={() => { setSel(null); void load(); }} />;

  return (
    <div>
      <SubHeader title="Hydro: Job Setup" subtitle={`${structureName || 'Structure'} · S500 structural drying`} />
      <div className="p-4 space-y-3">
        <button onClick={() => setNewName('')} className="btn-primary w-full py-3">
          <Plus size={16} /> Add drying chamber
        </button>
        {chambers.length === 0 && <p className="text-gray-400 text-sm px-1">No drying chambers yet.</p>}
        {chambers.map(c => (
          <button key={c.id} onClick={() => setSel(c)} className="card w-full text-left flex items-center gap-3 active:scale-[.99] transition">
            <div className="w-10 h-10 rounded-xl bg-aqua-soft text-aqua-deep flex items-center justify-center shrink-0">
              <Droplets size={18} />
            </div>
            <div>
              <div className="font-bold text-[15px]">{c.name}</div>
              <div className="text-xs text-gray-400 font-medium mt-0.5">
                {c.length_ft && c.width_ft ? `${c.length_ft}x${c.width_ft}x${c.height_ft ?? 8} ft` : 'No dimensions'} · Class {c.class_of_loss ?? '-'}
              </div>
            </div>
          </button>
        ))}
      </div>
      {newName !== null && <ChamberNameSheet value={newName} structureName={structureName} onChange={setNewName} onSave={createChamber} onClose={() => setNewName(null)} />}
    </div>
  );
}

// Downscale a photo to a base64 JPEG small enough to POST for OCR.
function ChamberNameSheet({ value, structureName, onChange, onSave, onClose }:
  { value: string; structureName?: string; onChange: (v: string) => void; onSave: () => void; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-5">
        <div className="font-display font-bold text-lg text-navy">New drying chamber</div>
        {structureName && <div className="text-[11px] font-bold uppercase tracking-wide text-sky-deep mt-0.5">in {structureName}</div>}
        <p className="text-xs text-gray-400 mt-0.5">Group the rooms that dry together (e.g. Basement, Main Level).</p>
        <input autoFocus placeholder="Chamber name" value={value} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-3 text-[16px] outline-none focus:border-sky" />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
          <button onClick={onSave} disabled={!value.trim()} className="flex-1 btn-primary py-3 justify-center disabled:opacity-40">Create</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

async function fileToScaledBase64(file: File, max = 1400): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}

function ChamberDetail({ chamber, orgId, claimId, structureName, onBack }:
  { chamber: Chamber; orgId: string; claimId?: string; structureName?: string; onBack: () => void }) {
  const [c, setC] = useState<Chamber>(chamber);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [stds, setStds] = useState<DryStd[]>([]);
  const [form, setForm] = useState({ reading_type: 'psychrometric', location_label: '', temp_f: '', rh_pct: '', mc_value: '', material: '', tech: '' });
  const [stdDraft, setStdDraft] = useState<{ material: string; goal: string } | null>(null);
  const [equipment, setEquipment] = useState<Equip[]>([]);
  const [eqDraft, setEqDraft] = useState<{ type: string; count: string; make_model: string; placed_at: string; removed_at: string } | null>(null);
  const [signoff, setSignoff] = useState<{ name: string; acceptable: boolean; sig: string | null } | null>(null);
  const [signoffDone, setSignoffDone] = useState(false);
  const [ocr, setOcr] = useState(false);
  const meterRef = useRef<HTMLInputElement>(null);

  // Snap a thermo-hygrometer photo -> Claude vision OCR -> auto-fill temp + RH.
  async function onMeterPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const api = import.meta.env.VITE_API_URL;
    if (!api) { alert('Meter OCR is not configured (missing VITE_API_URL).'); return; }
    if (!claimId) return;
    setOcr(true);
    try {
      const imageBase64 = await fileToScaledBase64(file);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${api}/api/resto/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ claimId, imageBase64, mediaType: 'image/jpeg' })
      });
      const json = await res.json();
      if (!res.ok) { alert('Could not read meter: ' + (json.error || res.status)); return; }
      const r = json.reading || {};
      if (r.temp_f == null && r.rh_pct == null) { alert('No temp/RH detected. The meter showed: ' + (r.raw || 'nothing readable')); return; }
      setForm(f => ({ ...f, temp_f: r.temp_f != null ? String(r.temp_f) : f.temp_f, rh_pct: r.rh_pct != null ? String(r.rh_pct) : f.rh_pct }));
    } catch (err: any) {
      alert('Meter read failed: ' + (err?.message ?? 'error'));
    } finally {
      setOcr(false); if (meterRef.current) meterRef.current.value = '';
    }
  }

  async function loadAll() {
    const [{ data: r }, { data: s }, { data: eq }] = await Promise.all([
      supabase.from('resto_readings').select('*').eq('chamber_id', c.id).order('captured_at', { ascending: false }),
      supabase.from('resto_dry_standards').select('*').eq('chamber_id', c.id).order('captured_at'),
      supabase.from('resto_equipment').select('*').eq('chamber_id', c.id).order('placed_at')
    ]);
    setReadings((r as Reading[]) ?? []);
    setStds((s as DryStd[]) ?? []);
    setEquipment((eq as Equip[]) ?? []);
    const { data: so } = await supabase.from('resto_claim_signatures').select('id, doc_snapshot').eq('claim_id', claimId).eq('doc_type', 'chamber_signoff');
    setSignoffDone(((so as { doc_snapshot: any }[]) ?? []).some(x => x.doc_snapshot && x.doc_snapshot.chamber_id === c.id));
  }
  useEffect(() => { void loadAll(); }, [c.id]);

  async function saveDims(patch: Partial<Chamber>) {
    const next = { ...c, ...patch };
    setC(next);
    await supabase.from('resto_drying_chambers').update(patch).eq('id', c.id);
  }

  async function addReading() {
    if (form.reading_type === 'material_mc') {
      const mc = parseFloat(form.mc_value);
      if (Number.isNaN(mc)) { alert('Enter the moisture content %.'); return; }
      await supabase.from('resto_readings').insert({
        org_id: orgId, chamber_id: c.id, reading_type: 'material_mc',
        location_label: form.location_label || null, material_mc: mc, material: form.material || null,
        tech_initials: form.tech.trim() || null, captured_at: new Date().toISOString()
      });
      setForm({ ...form, location_label: '', mc_value: '' });
      await loadAll();
      return;
    }
    const temp = parseFloat(form.temp_f), rh = parseFloat(form.rh_pct);
    if (Number.isNaN(temp) || Number.isNaN(rh)) { alert('Enter temperature and RH.'); return; }
    const gpp = grainsPerPound(temp, rh);
    const dew = dewPointF(temp, rh);
    await supabase.from('resto_readings').insert({
      org_id: orgId, chamber_id: c.id, reading_type: form.reading_type,
      location_label: form.location_label || null, temp_f: temp, rh_pct: rh,
      gpp, dew_point: dew, tech_initials: form.tech.trim() || null, captured_at: new Date().toISOString()
    });
    setForm({ ...form, location_label: '', temp_f: '', rh_pct: '' });
    await loadAll();
  }

  async function saveSignoff() {
    if (!signoff || !signoff.sig || !signoff.name.trim()) return;
    const { error } = await supabase.from('resto_claim_signatures').insert({
      org_id: orgId, claim_id: claimId, doc_type: 'chamber_signoff',
      signer_name: signoff.name.trim(), signer_role: 'supervisor', signature_data: signoff.sig,
      doc_snapshot: { chamber_id: c.id, chamber_name: c.name, acceptable: signoff.acceptable }
    });
    if (error) { alert('Could not save sign-off: ' + error.message); return; }
    setSignoff(null);
    await loadAll();
  }
  async function saveEquip() {
    if (!eqDraft) return;
    await supabase.from('resto_equipment').insert({
      org_id: orgId, chamber_id: c.id, type: eqDraft.type,
      make_model: eqDraft.make_model.trim() || null,
      actual_placed: parseInt(eqDraft.count) || 1,
      placed_at: eqDraft.placed_at || null,
      removed_at: eqDraft.removed_at || null
    });
    setEqDraft(null);
    await loadAll();
  }
  async function markRemoved(id: string) {
    await supabase.from('resto_equipment').update({ removed_at: todayISO() }).eq('id', id);
    await loadAll();
  }
  async function deleteEquip(id: string) {
    await supabase.from('resto_equipment').delete().eq('id', id);
    await loadAll();
  }
  async function saveStd() {
    if (!stdDraft || !stdDraft.material.trim()) { setStdDraft(null); return; }
    await supabase.from('resto_dry_standards').insert({
      org_id: orgId, chamber_id: c.id, material: stdDraft.material.trim(),
      goal_value: stdDraft.goal ? parseFloat(stdDraft.goal) : null
    });
    setStdDraft(null);
    await loadAll();
  }

  async function delReading(id: string) {
    await supabase.from('resto_readings').delete().eq('id', id);
    await loadAll();
  }

  const L = Number(c.length_ft) || 0, W = Number(c.width_ft) || 0, H = Number(c.height_ft) || 0;
  const cls = c.class_of_loss || 2;
  const am = airMoversNeeded(L, W);
  const dh = dehumidifiersNeeded(L, W, H, cls);

  // group readings by day for the drying log feel
  const grouped: Record<string, Reading[]> = {};
  readings.forEach(r => {
    const d = new Date(r.captured_at).toLocaleDateString();
    (grouped[d] ??= []).push(r);
  });

  // Inline function call ({dimField(...)}) instead of <DimInput/> so the field
  // is not remounted on each keystroke (saveDims re-renders) and keeps focus.
  const dimField = (label: string, k: keyof Chamber) => (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <input type="number" inputMode="decimal"
             className="w-full bg-white border border-gray-200 rounded-xl px-2 py-2 mt-0.5 text-sm outline-none focus:border-sky"
             value={(c[k] as any) ?? ''}
             onChange={e => saveDims({ [k]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Chamber>)} />
    </label>
  );

  return (
    <div>
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-4 rounded-b-3xl flex items-center gap-2">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center active:scale-95 transition"><ChevronLeft size={20} /></button>
        <div className="min-w-0">
          {structureName && <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60 leading-none mb-0.5 truncate">{structureName}</div>}
          <div className="font-display font-bold text-lg leading-tight truncate">{c.name}</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Dimensions + class */}
        <div className="card">
          <div className="text-sm font-bold mb-2">Chamber</div>
          <div className="grid grid-cols-4 gap-2">
            {dimField('Length', 'length_ft')}
            {dimField('Width', 'width_ft')}
            {dimField('Height', 'height_ft')}
            <label className="block">
              <span className="text-[11px] font-medium text-gray-500">Class</span>
              <select className="w-full bg-white border border-gray-200 rounded-xl px-1 py-2 mt-0.5 text-sm outline-none focus:border-sky"
                      value={cls} onChange={e => saveDims({ class_of_loss: Number(e.target.value) })}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* S500 equipment sizing */}
        <div className="card">
          <div className="text-sm font-bold mb-2 flex items-center gap-1"><Gauge size={15} className="text-brand" /> S500 Equipment Sizing</div>
          {L && W && H ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-aqua-soft rounded-xl p-2.5 flex items-center gap-2">
                <Wind size={16} className="text-gray-500" />
                <div><div className="font-semibold">{am} air movers</div><div className="text-[11px] text-gray-400">~1 / 14 lin ft wall</div></div>
              </div>
              <div className="bg-aqua-soft rounded-xl p-2.5 flex items-center gap-2">
                <Droplets size={16} className="text-gray-500" />
                <div><div className="font-semibold">{dh.units} dehu{dh.units > 1 ? 's' : ''}</div><div className="text-[11px] text-gray-400">{dh.ppdNeeded} PPD needed</div></div>
              </div>
            </div>
          ) : <p className="text-xs text-gray-400">Enter dimensions for a recommendation.</p>}
        </div>

        {/* Equipment on site — the billable equipment-days record */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold flex items-center gap-1"><Fan size={15} className="text-brand" /> Equipment on site</div>
            <button onClick={() => setEqDraft({ type: 'air_mover', count: '1', make_model: '', placed_at: todayISO(), removed_at: '' })} className="text-brand text-sm font-medium">+ Add</button>
          </div>
          {equipment.length === 0 && <p className="text-xs text-gray-400">Log air movers, dehus, and scrubbers with dates to justify equipment days on the invoice.</p>}
          {equipment.map(e => {
            const days = equipDays(e);
            return (
              <div key={e.id} className="flex items-center gap-2 py-2 border-t first:border-0 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{e.actual_placed ?? 1} × {equipLabel(e.type)}{e.make_model ? ` · ${e.make_model}` : ''}</div>
                  <div className="text-[11px] text-gray-400">
                    {e.placed_at ? new Date(e.placed_at + 'T00:00:00').toLocaleDateString() : '—'} → {e.removed_at ? new Date(e.removed_at + 'T00:00:00').toLocaleDateString() : 'running'} · {days} day{days === 1 ? '' : 's'} · {(e.actual_placed ?? 1) * days} unit-days
                  </div>
                </div>
                {!e.removed_at && <button onClick={() => markRemoved(e.id)} className="text-[11px] font-semibold text-sky px-2 py-1 bg-sky-soft rounded-lg shrink-0">Mark removed</button>}
                <button onClick={() => deleteEquip(e.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={15} /></button>
              </div>
            );
          })}
          {equipment.length > 0 && (() => {
            const totals: Record<string, number> = {};
            equipment.forEach(e => { totals[e.type] = (totals[e.type] || 0) + (e.actual_placed ?? 1) * equipDays(e); });
            return <div className="mt-2 pt-2 border-t text-[11px] text-gray-600 font-bold">{Object.entries(totals).map(([t, ud]) => `${ud} ${equipLabel(t).toLowerCase()}-days`).join('  ·  ')}</div>;
          })()}
        </div>

        {/* Dry standards */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold flex items-center gap-1"><Target size={15} className="text-brand" /> Dry Standards</div>
            <button onClick={() => setStdDraft({ material: '', goal: '' })} className="text-brand text-sm font-medium">+ Add</button>
          </div>
          {stds.length === 0 && <p className="text-xs text-gray-400">No dry standards set.</p>}
          {stds.map(s => (
            <div key={s.id} className="flex justify-between text-sm py-1 border-t first:border-0">
              <span>{s.material}</span><span className="text-gray-500">{s.goal_value ?? '-'}</span>
            </div>
          ))}
        </div>

        {/* Add reading */}
        <div className="card space-y-2">
          <div className="text-sm font-bold">Add reading</div>
          <select className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                  value={form.reading_type} onChange={e => setForm({ ...form, reading_type: e.target.value })}>
            {READING_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input className="col-span-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" placeholder="Location label (e.g. NW corner)"
                   value={form.location_label} onChange={e => setForm({ ...form, location_label: e.target.value })} />
            <input className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" placeholder="Tech" maxLength={6}
                   value={form.tech} onChange={e => setForm({ ...form, tech: e.target.value })} />
          </div>
          {form.reading_type === 'material_mc' ? (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" placeholder="Moisture %"
                     value={form.mc_value} onChange={e => setForm({ ...form, mc_value: e.target.value })} />
              <input className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" placeholder="Material (drywall, wood)"
                     value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" placeholder="Temp F"
                       value={form.temp_f} onChange={e => setForm({ ...form, temp_f: e.target.value })} />
                <input type="number" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" placeholder="RH %"
                       value={form.rh_pct} onChange={e => setForm({ ...form, rh_pct: e.target.value })} />
              </div>
              {form.temp_f && form.rh_pct && !Number.isNaN(parseFloat(form.temp_f)) && !Number.isNaN(parseFloat(form.rh_pct)) && (
                <div className="text-xs text-gray-500">
                  = {grainsPerPound(parseFloat(form.temp_f), parseFloat(form.rh_pct))} GPP · dew {dewPointF(parseFloat(form.temp_f), parseFloat(form.rh_pct))}F
                </div>
              )}
              <input ref={meterRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onMeterPhoto} />
              <button onClick={() => meterRef.current?.click()} disabled={ocr} className="btn-soft w-full py-2.5 text-sm disabled:opacity-50">
                <Camera size={15} /> {ocr ? 'Reading meter...' : 'Snap meter photo'}
              </button>
            </>
          )}
          <button onClick={addReading} className="btn-primary w-full py-2.5 text-sm">Log reading</button>
        </div>

        {/* Dry map: analysis, trend, goal comparison */}
        <DryingProgress readings={readings} stds={stds} />

        <div className="card flex items-center gap-3">
          <div className="flex-1">
            <div className="font-bold text-sm">Supervisor sign-off</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{signoffDone ? 'This chamber has been signed off.' : 'Sign when drying is verified complete for this chamber.'}</div>
          </div>
          <button onClick={() => setSignoff({ name: '', acceptable: true, sig: null })}
            className={signoffDone ? 'btn-soft px-3 py-2 text-sm' : 'btn-primary px-3 py-2 text-sm'}>
            {signoffDone ? 'Re-sign' : 'Sign off'}
          </button>
        </div>

        {/* Drying log */}
        <div>
          <div className="text-sm font-bold mb-2">Drying log</div>
          {readings.length === 0 && <p className="text-xs text-gray-400">No readings yet.</p>}
          {Object.entries(grouped).map(([day, rs]) => (
            <div key={day} className="mb-3">
              <div className="text-xs text-gray-400 mb-1">{day}</div>
              {rs.map(r => (
                <div key={r.id} className="bg-white border rounded p-2 mb-1 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{READING_TYPES.find(t => t.v === r.reading_type)?.l ?? r.reading_type}{r.location_label ? ` · ${r.location_label}` : ''}</div>
                    <div className="text-xs text-gray-500">
                      {r.temp_f}F / {r.rh_pct}% RH · {r.gpp} GPP · dew {r.dew_point}F
                    </div>
                  </div>
                  <button onClick={() => delReading(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {signoff && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-[1px]" onClick={() => setSignoff(null)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-5">
            <div className="font-display font-bold text-lg text-navy">Chamber sign-off</div>
            <p className="text-xs text-gray-400 mt-0.5">{c.name || 'This chamber'} · supervisor verification of drying completion.</p>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Supervisor name</label>
            <input autoFocus value={signoff.name} onChange={e => setSignoff({ ...signoff, name: e.target.value })} placeholder="Full name"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] outline-none focus:border-sky" />
            <label className="flex items-center justify-between mt-3">
              <span className="text-sm font-semibold text-gray-600">Final moisture readings acceptable?</span>
              <button onClick={() => setSignoff({ ...signoff, acceptable: !signoff.acceptable })} role="switch" aria-checked={signoff.acceptable}
                className={`w-12 h-7 rounded-full shrink-0 transition relative ${signoff.acceptable ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${signoff.acceptable ? 'left-6' : 'left-1'}`} />
              </button>
            </label>
            <div className="mt-3"><SignaturePad onChange={sig => setSignoff(s => s ? { ...s, sig } : s)} /></div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setSignoff(null)} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
              <button onClick={saveSignoff} disabled={!signoff.sig || !signoff.name.trim()} className="flex-1 btn-primary py-3 justify-center disabled:opacity-40">Save sign-off</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {eqDraft && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-navy/30" onClick={() => setEqDraft(null)} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
            <div className="font-display font-bold text-lg text-navy">Add equipment</div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Type</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {EQUIP_TYPES.map(t => (
                <button key={t.value} onClick={() => setEqDraft({ ...eqDraft, type: t.value })} className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${eqDraft.type === t.value ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'}`}>{t.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div><label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Count</label><input type="number" inputMode="numeric" value={eqDraft.count} onChange={e => setEqDraft({ ...eqDraft, count: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky" /></div>
              <div><label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Make / model</label><input value={eqDraft.make_model} onChange={e => setEqDraft({ ...eqDraft, make_model: e.target.value })} placeholder="optional" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div><label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Placed</label><input type="date" value={eqDraft.placed_at} onChange={e => setEqDraft({ ...eqDraft, placed_at: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[15px] outline-none focus:border-sky" /></div>
              <div><label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Removed</label><input type="date" value={eqDraft.removed_at} onChange={e => setEqDraft({ ...eqDraft, removed_at: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[15px] outline-none focus:border-sky" /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEqDraft(null)} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
              <button onClick={saveEquip} className="flex-1 btn-primary py-3 justify-center">Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {stdDraft && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-navy/30" onClick={() => setStdDraft(null)} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
            <div className="font-display font-bold text-lg text-navy">Dry standard</div>
            <p className="text-xs text-gray-400 mt-0.5">Target moisture content for a material (e.g. drywall 1%, wood 15%).</p>
            <input autoFocus placeholder="Material (drywall, subfloor, wood)" value={stdDraft.material}
              onChange={e => setStdDraft({ ...stdDraft, material: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-3 text-[16px] outline-none focus:border-sky" />
            <input inputMode="decimal" placeholder="Dry goal (% or GPP)" value={stdDraft.goal}
              onChange={e => setStdDraft({ ...stdDraft, goal: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-2 text-[16px] outline-none focus:border-sky" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStdDraft(null)} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
              <button onClick={saveStd} disabled={!stdDraft.material.trim()} className="flex-1 btn-primary py-3 justify-center disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}