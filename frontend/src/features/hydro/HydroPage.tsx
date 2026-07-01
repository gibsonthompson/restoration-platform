import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, ChevronLeft, Droplets, Gauge, Target, Trash2, Wind } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../context/OrgContext';
import { SubHeader } from '../../components/SubHeader';
import { grainsPerPound, dewPointF, airMoversNeeded, dehumidifiersNeeded } from './psychrometrics';

interface Chamber {
  id: string; name: string; length_ft: number | null; width_ft: number | null;
  height_ft: number | null; class_of_loss: number | null;
}
interface Reading {
  id: string; reading_type: string; location_label: string | null;
  temp_f: number | null; rh_pct: number | null; gpp: number | null;
  dew_point: number | null; captured_at: string;
}
interface DryStd { id: string; material: string; goal_value: number | null; }

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
  const { structureId } = useParams();
  const { activeOrg } = useOrg();
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [sel, setSel] = useState<Chamber | null>(null);

  async function load() {
    if (!structureId) return;
    const { data } = await supabase.from('resto_drying_chambers').select('*')
      .eq('structure_id', structureId).order('created_at');
    setChambers((data as Chamber[]) ?? []);
  }
  useEffect(() => { void load(); }, [structureId]);

  async function addChamber() {
    if (!activeOrg || !structureId) return;
    const name = prompt('Chamber name (e.g. Basement, Main Level)');
    if (!name) return;
    const { data } = await supabase.from('resto_drying_chambers')
      .insert({ org_id: activeOrg.id, structure_id: structureId, name, height_ft: 8, class_of_loss: 2 })
      .select('*').single();
    await load();
    if (data) setSel(data as Chamber);
  }

  if (sel) return <ChamberDetail chamber={sel} orgId={activeOrg!.id} onBack={() => { setSel(null); void load(); }} />;

  return (
    <div>
      <SubHeader title="Hydro: Job Setup" subtitle="S500 structural drying" />
      <div className="p-4 space-y-3">
        <button onClick={addChamber} className="btn-primary w-full py-3">
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
    </div>
  );
}

function ChamberDetail({ chamber, orgId, onBack }:
  { chamber: Chamber; orgId: string; onBack: () => void }) {
  const [c, setC] = useState<Chamber>(chamber);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [stds, setStds] = useState<DryStd[]>([]);
  const [form, setForm] = useState({ reading_type: 'psychrometric', location_label: '', temp_f: '', rh_pct: '' });

  async function loadAll() {
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('resto_readings').select('*').eq('chamber_id', c.id).order('captured_at', { ascending: false }),
      supabase.from('resto_dry_standards').select('*').eq('chamber_id', c.id).order('captured_at')
    ]);
    setReadings((r as Reading[]) ?? []);
    setStds((s as DryStd[]) ?? []);
  }
  useEffect(() => { void loadAll(); }, [c.id]);

  async function saveDims(patch: Partial<Chamber>) {
    const next = { ...c, ...patch };
    setC(next);
    await supabase.from('resto_drying_chambers').update(patch).eq('id', c.id);
  }

  async function addReading() {
    const temp = parseFloat(form.temp_f), rh = parseFloat(form.rh_pct);
    if (Number.isNaN(temp) || Number.isNaN(rh)) { alert('Enter temperature and RH.'); return; }
    const gpp = grainsPerPound(temp, rh);
    const dew = dewPointF(temp, rh);
    await supabase.from('resto_readings').insert({
      org_id: orgId, chamber_id: c.id, reading_type: form.reading_type,
      location_label: form.location_label || null, temp_f: temp, rh_pct: rh,
      gpp, dew_point: dew, captured_at: new Date().toISOString()
    });
    setForm({ ...form, location_label: '', temp_f: '', rh_pct: '' });
    await loadAll();
  }

  async function addStd() {
    const material = prompt('Material (e.g. drywall, subfloor)');
    if (!material) return;
    const g = prompt('Dry standard goal (e.g. moisture % or GPP)');
    await supabase.from('resto_dry_standards').insert({
      org_id: orgId, chamber_id: c.id, material, goal_value: g ? parseFloat(g) : null
    });
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
        <div className="font-display font-bold text-lg">{c.name}</div>
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

        {/* Dry standards */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold flex items-center gap-1"><Target size={15} className="text-brand" /> Dry Standards</div>
            <button onClick={addStd} className="text-brand text-sm font-medium">+ Add</button>
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
          <input className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" placeholder="Location label (e.g. NW corner)"
                 value={form.location_label} onChange={e => setForm({ ...form, location_label: e.target.value })} />
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
          <button onClick={addReading} className="btn-primary w-full py-2.5 text-sm">Log reading</button>
        </div>

        {/* Drying log */}
        <div>
          <div className="text-sm font-bold mb-2">Drying log</div>
          {readings.length === 0 && <p className="text-xs text-gray-400">No readings yet.</p>}
          {Object.entries(grouped).map(([day, rs]) => (
            <div key={day} className="mb-3">
              <div className="text-xs text-gray-400 mb-1">{day}</div>
              {rs.map(r => (
                <div key={r.id} className="card !p-3 mb-1.5 flex items-center justify-between text-sm">
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
    </div>
  );
}