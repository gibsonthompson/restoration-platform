import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, AlertTriangle, ShieldQuestion } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim, TypeOfLoss, LossOnset, PolicyType, Coverage, CoverageType } from '../types/models';

// Hoisted out of the page component on purpose: defining it inline would remount
// the input on every keystroke and drop focus.
function TextField({ label, value, onChange, type = 'text', placeholder, hint }:
  { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input type={type} placeholder={placeholder}
             className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] text-left outline-none focus:border-sky [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:text-left"
             value={value} onChange={e => onChange(e.target.value)} />
      {hint && <span className="block text-[11px] text-gray-400 mt-1 leading-snug">{hint}</span>}
    </label>
  );
}

// Cause of loss, narrowed by the type of loss (this is how Xactimate does it: the
// cause list is populated from the type). The cause photo plus this field is what
// answers "was this sudden or gradual", which decides whether the claim is covered.
const CAUSES: Record<TypeOfLoss, string[]> = {
  water: [
    'Supply line failure', 'Burst / frozen pipe', 'Drain or waste line backup', 'Sewer backup',
    'Appliance failure (washer, dishwasher, fridge)', 'Water heater failure', 'Toilet overflow',
    'HVAC or condensate line', 'Roof leak', 'Storm or wind-driven rain', 'Flood or surface water',
    'Foundation seepage', 'Sprinkler or fire suppression discharge', 'Sump pump failure', 'Unknown'
  ],
  fire: [
    'Cooking / kitchen', 'Electrical', 'Heating equipment', 'Chimney or fireplace', 'Candle',
    'Smoking materials', 'Lightning', 'Wildfire', 'Appliance malfunction', 'Arson', 'Unknown'
  ],
  mold: [
    'Prior unrepaired water loss', 'Long-term water intrusion', 'Hidden plumbing leak',
    'High humidity or condensation', 'HVAC contamination', 'Roof or envelope leak', 'Flood', 'Unknown'
  ],
  other: ['Unknown']
};

const ONSET: { v: LossOnset; label: string; blurb: string }[] = [
  { v: 'sudden', label: 'Sudden', blurb: 'Happened at once, from a specific event. This is what a policy covers.' },
  { v: 'gradual', label: 'Gradual', blurb: 'Developed over time. Carriers commonly exclude this, so document the cause hard.' },
  { v: 'unknown', label: 'Unknown', blurb: 'Not yet determined. Resolve this before the package goes out.' }
];

const COVERAGE_DEFAULTS: { type: CoverageType; name: string }[] = [
  { type: 'dwelling', name: 'Dwelling' },
  { type: 'other_structures', name: 'Other Structures' },
  { type: 'contents', name: 'Contents' },
  { type: 'loss_of_use', name: 'Loss of Use' }
];

// Local YYYY-MM-DD (not toISOString, which is UTC and can shift the day).
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const empty: Partial<Claim> = { type_of_loss: 'water', status: 'open', coverages: [] };

const daysBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const d1 = new Date(a + 'T00:00:00').getTime(), d2 = new Date(b + 'T00:00:00').getTime();
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
};

export default function EditClaim() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const nav = useNavigate();
  async function deleteClaim() {
    if (!claimId) return;
    if (!confirm('Delete this entire claim? All its structures, rooms, photos, readings, contents, and reports will be permanently removed. This cannot be undone.')) return;
    const { error } = await supabase.from('resto_claims').delete().eq('id', claimId);
    if (error) { alert('Could not delete claim: ' + error.message); return; }
    nav('/');
  }
  const [f, setF] = useState<Partial<Claim>>(() => ({ ...empty, date_of_loss: todayLocal() }));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(claimId);

  useEffect(() => {
    if (!claimId) return;
    supabase.from('resto_claims').select('*').eq('id', claimId).single()
      .then(({ data }) => data && setF(data as Claim));
  }, [claimId]);

  const val = (k: keyof Claim) => (f[k] as string) ?? '';
  const set = (k: keyof Claim) => (v: string) => setF(p => ({ ...p, [k]: v }));
  const setNum = (k: keyof Claim) => (v: string) =>
    setF(p => ({ ...p, [k]: v === '' ? null : Number(v) }));

  // Coverages live in a jsonb array. Seed the four standard Xactimate rows lazily,
  // only when the user actually opens the section, so we never write noise to a
  // claim nobody touched.
  const coverages: Coverage[] = (f.coverages as Coverage[]) ?? [];
  const seedCoverages = () =>
    setF(p => ({
      ...p,
      coverages: COVERAGE_DEFAULTS.map(d => ({ type: d.type, name: d.name, limit: null, deductible: null, apply_to: 'both' as const }))
    }));
  const setCoverage = (i: number, patch: Partial<Coverage>) =>
    setF(p => ({ ...p, coverages: ((p.coverages as Coverage[]) ?? []).map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const causeList = CAUSES[(f.type_of_loss as TypeOfLoss) ?? 'water'] ?? CAUSES.other;
  const discoveryGap = daysBetween(f.date_of_loss, f.date_discovered);
  // A wide gap between when the loss happened and when it was found is precisely the
  // evidence a carrier uses to call the damage gradual and deny it. Warn the tech
  // while they are still on site and can photograph the cause.
  const gradualRisk = (discoveryGap != null && discoveryGap > 14) || f.loss_onset === 'gradual';

  async function save() {
    if (!activeOrg || saving) return;
    setSaving(true);
    // Strip read-only/joined fields so update/insert payloads stay clean.
    const { created_at, ...rest } = f as any;
    // Empty strings are not valid input for date or numeric columns ("invalid input
    // syntax for type date"). Clearing any date field used to send '' and fail the
    // save. Normalize every blank to null.
    const row: any = { ...rest, org_id: activeOrg.id };
    for (const k of Object.keys(row)) if (row[k] === '') row[k] = null;
    try {
      if (editing) {
        const { error } = await supabase.from('resto_claims').update(row).eq('id', claimId!);
        if (error) { alert('Could not save claim: ' + error.message); return; }
        return nav(`/claims/${claimId}`);
      }
      const { data, error } = await supabase.from('resto_claims').insert(row).select('id').single();
      if (error) { alert('Could not create claim: ' + error.message); return; }
      nav(data ? `/claims/${(data as { id: string }).id}` : '/');
    } finally {
      setSaving(false);
    }
  }

  const selectCls = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky';

  return (
    <div>
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-4 rounded-b-3xl sticky top-0 z-20">
        <button onClick={() => nav(-1)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-xl">{editing ? 'Edit claim' : 'New claim'}</div>
      </div>

      <div className="p-4 space-y-3 pb-28">
        <TextField label="Carrier identifier / Job #" value={val('carrier_identifier')} onChange={set('carrier_identifier')} hint="This is the claim number in Xactimate." />
        <TextField label="Contractor identifier" value={val('contractor_identifier')} onChange={set('contractor_identifier')} />
        <TextField label="Assignment identifier" value={val('assignment_identifier')} onChange={set('assignment_identifier')} />
        <TextField label="Address" value={val('address')} onChange={set('address')} />

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Type of loss</span>
          <select className={selectCls}
                  value={f.type_of_loss ?? 'water'}
                  onChange={e => setF(p => ({ ...p, type_of_loss: e.target.value as TypeOfLoss, cause_of_loss: null }))}>
            <option value="water">Water</option>
            <option value="fire">Fire</option>
            <option value="mold">Mold</option>
            <option value="other">Other</option>
          </select>
        </label>

        {/* ---- Cause & Origin: the coverage decision lives here ---- */}
        <div className="pt-2 font-bold text-sm flex items-center gap-1.5">
          <ShieldQuestion size={15} className="text-sky-deep" /> Cause &amp; origin
        </div>
        <p className="text-[11px] text-gray-400 -mt-1 leading-relaxed">
          A policy covers damage that is sudden and accidental, and excludes damage that developed over time. This section is what answers that question, and it is the most common reason a water claim is denied outright.
        </p>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Cause of loss</span>
          <select className={selectCls} value={val('cause_of_loss')}
                  onChange={e => setF(p => ({ ...p, cause_of_loss: e.target.value || null }))}>
            <option value="">Select a cause</option>
            {causeList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <div>
          <span className="text-xs font-medium text-gray-500">How did it start?</span>
          <div className="flex bg-gray-100 rounded-full p-0.5 mt-1">
            {ONSET.map(o => (
              <button key={o.v} type="button" onClick={() => setF(p => ({ ...p, loss_onset: o.v }))}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold ${f.loss_onset === o.v ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>
                {o.label}
              </button>
            ))}
          </div>
          {f.loss_onset && (
            <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">{ONSET.find(o => o.v === f.loss_onset)?.blurb}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TextField label="Date of loss" type="date" value={val('date_of_loss')} onChange={set('date_of_loss')} />
          <TextField label="Date discovered" type="date" value={val('date_discovered')} onChange={set('date_discovered')} />
        </div>

        {gradualRisk && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-3.5 py-3">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[12px] text-amber-800 leading-relaxed">
              {discoveryGap != null && discoveryGap > 14 ? (
                <><span className="font-bold">{discoveryGap} days</span> between the loss and its discovery. </>
              ) : null}
              A carrier will argue this damage was gradual and therefore excluded. Photograph the cause of loss up close, write down what the homeowner reported, and note anything that shows the failure was sudden.
            </div>
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-gray-500">What happened (cause notes)</span>
          <textarea rows={3} value={val('cause_notes')} onChange={e => set('cause_notes')(e.target.value)}
            placeholder="e.g. Homeowner heard the washer hose let go at 6am and shut the valve within 10 minutes. Braided hose failed at the crimp."
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky resize-none" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Category of water</span>
            <select className={selectCls}
                    value={(f.category_of_water as number | null) ?? ''} onChange={e => setNum('category_of_water')(e.target.value)}>
              <option value="">Select</option>
              {[1, 2, 3].map(n => <option key={n} value={n}>Cat {n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Class of water</span>
            <select className={selectCls}
                    value={(f.class_of_water as number | null) ?? ''} onChange={e => setNum('class_of_water')(e.target.value)}>
              <option value="">Select</option>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>Class {n}</option>)}
            </select>
          </label>
        </div>

        {/* ---- Claim dates: Xactimate needs these to complete an estimate ---- */}
        <div className="pt-2 font-bold text-sm">Claim dates</div>
        <p className="text-[11px] text-gray-400 -mt-1">Xactimate requires these to complete an estimate.</p>
        <div className="grid grid-cols-3 gap-2">
          <TextField label="Received" type="date" value={val('date_received')} onChange={set('date_received')} />
          <TextField label="Contacted" type="date" value={val('date_contacted')} onChange={set('date_contacted')} />
          <TextField label="Inspected" type="date" value={val('date_inspected')} onChange={set('date_inspected')} />
        </div>

        <div className="pt-2 font-bold text-sm">Policyholder</div>
        <TextField label="Name" value={val('policyholder_name')} onChange={set('policyholder_name')} />
        <TextField label="Email" type="email" value={val('policyholder_email')} onChange={set('policyholder_email')} />
        <TextField label="Phone" type="tel" value={val('policyholder_phone')} onChange={set('policyholder_phone')} />

        <div className="pt-2 font-bold text-sm">Insurance</div>
        <TextField label="Insurance company" value={val('insurance_company')} onChange={set('insurance_company')} />
        <TextField label="Broker / agent" value={val('broker_agent')} onChange={set('broker_agent')} />
        <TextField label="Project manager" value={val('project_manager')} onChange={set('project_manager')} />
        <TextField label="Adjuster / claim rep" value={val('adjuster')} onChange={set('adjuster')} />
        <TextField label="Estimator" value={val('estimator')} onChange={set('estimator')} hint="Required by Xactimate alongside the claim rep." />
        <TextField label="Policy number" value={val('policy_number')} onChange={set('policy_number')} />
        <TextField label="CAT code" value={val('cat_code')} onChange={set('cat_code')} />

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Policy type</span>
          <select className={selectCls} value={val('policy_type')}
                  onChange={e => setF(p => ({ ...p, policy_type: (e.target.value || null) as PolicyType | null }))}>
            <option value="">Select</option>
            <option value="homeowner">Homeowner</option>
            <option value="commercial">Commercial</option>
            <option value="renter">Renter</option>
            <option value="condo">Condo</option>
            <option value="other">Other</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <TextField label="Policy effective" type="date" value={val('policy_effective_date')} onChange={set('policy_effective_date')} />
          <TextField label="Policy expires" type="date" value={val('policy_expiration_date')} onChange={set('policy_expiration_date')} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TextField label="Deductible ($)" type="number" value={(f.deductible as number | null) != null ? String(f.deductible) : ''} onChange={setNum('deductible')} />
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Deductible applies</span>
            <select className={selectCls} value={val('deductible_applies')}
                    onChange={e => setF(p => ({ ...p, deductible_applies: (e.target.value || null) as any }))}>
              <option value="">Select</option>
              <option value="all_coverages">Across all coverages</option>
              <option value="coverage_specific">Coverage specific</option>
            </select>
          </label>
        </div>

        {/* ---- Coverages (Xactimate Coverages & Loss) ---- */}
        <div className="pt-2 font-bold text-sm">Coverages</div>
        {coverages.length === 0 ? (
          <button type="button" onClick={seedCoverages}
            className="w-full border border-dashed border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-500 active:bg-gray-50">
            Add policy limits (Dwelling, Other Structures, Contents, Loss of Use)
          </button>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Coverage</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 w-24 text-center">Limit</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 w-24 text-center">Deductible</span>
            </div>
            {coverages.map((c, i) => (
              <div key={c.type + i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <span className="text-sm font-semibold text-navy truncate">{c.name}</span>
                <input type="number" inputMode="decimal" placeholder="0" value={c.limit ?? ''}
                  onChange={e => setCoverage(i, { limit: e.target.value === '' ? null : Number(e.target.value) })}
                  className="w-24 bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-[15px] outline-none focus:border-sky" />
                <input type="number" inputMode="decimal" placeholder="0" value={c.deductible ?? ''}
                  onChange={e => setCoverage(i, { deductible: e.target.value === '' ? null : Number(e.target.value) })}
                  className="w-24 bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-[15px] outline-none focus:border-sky" />
              </div>
            ))}
            <p className="text-[11px] text-gray-400 px-1">Leave a limit blank if the policy does not carry that coverage.</p>
          </div>
        )}

        <button onClick={save} disabled={saving} className="btn-primary w-full py-3.5 mt-2 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save claim'}
        </button>
        {claimId && (
          <button onClick={deleteClaim} className="w-full py-3 mt-1 text-sm font-semibold text-red-600 border border-red-200 rounded-xl active:bg-red-50">
            Delete claim
          </button>
        )}
      </div>
    </div>
  );
}