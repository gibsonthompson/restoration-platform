import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, AlertTriangle, ShieldQuestion } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SelectField, ChoiceCards, DateField, todayISO, type Option } from '../components/Pickers';
import type { Claim, TypeOfLoss, LossOnset, PolicyType, Coverage, CoverageType } from '../types/models';

// Hoisted out of the page component on purpose: defining it inline would remount
// the input on every keystroke and drop focus.
function TextField({ label, value, onChange, type = 'text', placeholder, hint }:
  { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input type={type} placeholder={placeholder}
             className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] text-left outline-none focus:border-sky"
             value={value} onChange={e => onChange(e.target.value)} />
      {hint && <span className="block text-[11px] text-gray-400 mt-1 leading-snug">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// TYPE OF LOSS
// Xactimate carries a CODE and a DESCRIPTION:  <TOL desc="Water" code="WATER">
// WATER and FLOOD are the only codes attested by the reference estimate we have.
// The rest are marked here so nobody downstream mistakes them for verified.
// ---------------------------------------------------------------------------
const TOL_OPTIONS: Option[] = [
  { value: 'water', label: 'Water', code: 'WATER', desc: 'Escaping water from a plumbing, appliance or envelope failure.' },
  { value: 'fire',  label: 'Fire',  code: 'FIRE',  desc: 'Fire, smoke and heat damage.' },
  { value: 'mold',  label: 'Mold',  code: 'MOLD',  desc: 'Fungal growth, usually secondary to an earlier water event.' },
  { value: 'other', label: 'Other', code: 'OTHER', desc: 'Anything else. Record what it actually was in the cause notes.' }
];

// ---------------------------------------------------------------------------
// CAUSE OF LOSS, scoped by the type of loss. This mirrors Xactimate, where the
// COL element is a CHILD of TOL and its list is populated from the type:
//   <TOL desc="Water" code="WATER">
//     <COL desc="Broken Pipe" otherCause="High Water Pressure"/>
//   </TOL>
// The named cause and the free-text otherCause coexist: one names it, the other
// says what made it happen. Both fields exist below for that reason.
//
// The descriptions are not decoration. Whether a cause reads as SUDDEN or as
// GRADUAL is the single biggest determinant of whether the claim is paid, and a
// tech should be told that while they are still standing in front of the failure
// with a camera.
// ---------------------------------------------------------------------------
const CAUSES: Record<TypeOfLoss, Option[]> = {
  water: [
    { value: 'Supply line failure', label: 'Supply line failure', desc: 'Sudden by nature. Photograph the failed line and the shutoff.' },
    { value: 'Burst / frozen pipe', label: 'Burst / frozen pipe', desc: 'Sudden. Carriers ask whether heat was maintained, so note it.' },
    { value: 'Drain or waste line backup', label: 'Drain or waste line backup' },
    { value: 'Sewer backup', label: 'Sewer backup', desc: 'Category 3 water. Often needs a sewer backup endorsement to be covered.' },
    { value: 'Appliance failure (washer, dishwasher, fridge)', label: 'Appliance failure', desc: 'Washer, dishwasher, fridge line. Photograph the appliance and the hose.' },
    { value: 'Water heater failure', label: 'Water heater failure', desc: 'The tank itself is often excluded, the water damage it caused is not.' },
    { value: 'Toilet overflow', label: 'Toilet overflow' },
    { value: 'HVAC or condensate line', label: 'HVAC or condensate line', desc: 'A blocked condensate line drips for weeks. Expect a gradual argument.' },
    { value: 'Roof leak', label: 'Roof leak', desc: 'Carriers look hard at roof age and prior wear here.' },
    { value: 'Storm or wind-driven rain', label: 'Storm or wind-driven rain', desc: 'Usually needs an opening created by the storm to be covered.' },
    { value: 'Flood or surface water', label: 'Flood or surface water', desc: 'Excluded from a standard homeowner policy. This is a flood policy claim.' },
    { value: 'Foundation seepage', label: 'Foundation seepage', desc: 'Commonly excluded as long-term seepage. Document any sudden trigger.' },
    { value: 'Sprinkler or fire suppression discharge', label: 'Sprinkler / fire suppression discharge' },
    { value: 'Sump pump failure', label: 'Sump pump failure', desc: 'Often needs a sump overflow endorsement.' },
    { value: 'Unknown', label: 'Unknown', desc: 'Do not leave this on the claim. Unknown reads as gradual to an adjuster.' }
  ],
  fire: [
    { value: 'Cooking / kitchen', label: 'Cooking / kitchen' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Heating equipment', label: 'Heating equipment' },
    { value: 'Chimney or fireplace', label: 'Chimney or fireplace' },
    { value: 'Candle', label: 'Candle' },
    { value: 'Smoking materials', label: 'Smoking materials' },
    { value: 'Lightning', label: 'Lightning' },
    { value: 'Wildfire', label: 'Wildfire' },
    { value: 'Appliance malfunction', label: 'Appliance malfunction' },
    { value: 'Arson', label: 'Arson', desc: 'The carrier will run its own investigation. Document, do not speculate.' },
    { value: 'Unknown', label: 'Unknown' }
  ],
  mold: [
    { value: 'Prior unrepaired water loss', label: 'Prior unrepaired water loss', desc: 'Coverage usually turns on whether the original water event was covered.' },
    { value: 'Long-term water intrusion', label: 'Long-term water intrusion', desc: 'Gradual by definition. Expect a fight, so document the source hard.' },
    { value: 'Hidden plumbing leak', label: 'Hidden plumbing leak', desc: 'Many policies cover hidden leaks that could not reasonably be found.' },
    { value: 'High humidity or condensation', label: 'High humidity or condensation', desc: 'Almost always excluded as maintenance.' },
    { value: 'HVAC contamination', label: 'HVAC contamination' },
    { value: 'Roof or envelope leak', label: 'Roof or envelope leak' },
    { value: 'Flood', label: 'Flood' },
    { value: 'Unknown', label: 'Unknown' }
  ],
  other: [{ value: 'Unknown', label: 'Unknown' }]
};

const ONSET: { v: LossOnset; label: string; blurb: string }[] = [
  { v: 'sudden', label: 'Sudden', blurb: 'Happened at once, from a specific event. This is what a policy covers.' },
  { v: 'gradual', label: 'Gradual', blurb: 'Developed over time. Carriers commonly exclude this, so document the cause hard.' },
  { v: 'unknown', label: 'Unknown', blurb: 'Not yet determined. Resolve this before the package goes out.' }
];

// ---------------------------------------------------------------------------
// IICRC S500. Category is CONTAMINATION. Class is EVAPORATION LOAD. They are
// independent: a Category 1 loss can be any Class.
// ---------------------------------------------------------------------------
const CATEGORY: Option[] = [
  { value: '1', label: 'Category 1', desc: 'Sanitary source. Supply line, tub overflow, ice maker. No substantial health risk at the source.' },
  { value: '2', label: 'Category 2', desc: 'Significantly contaminated. Dishwasher or washing machine discharge, toilet with urine. Can cause illness.' },
  { value: '3', label: 'Category 3', desc: 'Grossly contaminated. Sewage, flood water, storm surge. Porous materials come out, they do not get dried.' }
];

const CLASS: Option[] = [
  { value: '1', label: 'Class 1', desc: 'Least evaporation load. Roughly 5% or less of the combined floor, wall and ceiling area is wet.' },
  { value: '2', label: 'Class 2', desc: 'About 5 to 40% of the combined floor, wall and ceiling area is wet porous material.' },
  { value: '3', label: 'Class 3', desc: 'More than 40% wet, and usually from overhead, so ceilings and walls are saturated.' },
  { value: '4', label: 'Class 4', desc: 'Specialty drying. Water bound into hardwood, plaster, brick, stone or concrete. Longer times, special methods.' }
];

const POLICY_TYPE: Option[] = [
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'renter', label: 'Renter' },
  { value: 'condo', label: 'Condo' },
  { value: 'other', label: 'Other' }
];

const DEDUCTIBLE_APPLIES: Option[] = [
  { value: 'all_coverages', label: 'Across all coverages', desc: 'One deductible for the whole claim.' },
  { value: 'coverage_specific', label: 'Coverage specific', desc: 'Each coverage carries its own deductible.' }
];

const COVERAGE_DEFAULTS: { type: CoverageType; name: string }[] = [
  { type: 'dwelling', name: 'Dwelling' },
  { type: 'other_structures', name: 'Other Structures' },
  { type: 'contents', name: 'Contents' },
  { type: 'loss_of_use', name: 'Loss of Use' }
];

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
  const [f, setF] = useState<Partial<Claim>>(() => ({ ...empty, date_of_loss: todayISO() }));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(claimId);

  useEffect(() => {
    if (!claimId) return;
    supabase.from('resto_claims').select('*').eq('id', claimId).single()
      .then(({ data }) => data && setF(data as Claim));
  }, [claimId]);

  async function deleteClaim() {
    if (!claimId) return;
    if (!confirm('Delete this entire claim? All its structures, rooms, photos, readings, contents, and reports will be permanently removed. This cannot be undone.')) return;
    const { error } = await supabase.from('resto_claims').delete().eq('id', claimId);
    if (error) { alert('Could not delete claim: ' + error.message); return; }
    nav('/');
  }

  const val = (k: keyof Claim) => (f[k] as string) ?? '';
  const set = (k: keyof Claim) => (v: string) => setF(p => ({ ...p, [k]: v }));
  const setOrNull = (k: keyof Claim) => (v: string) => setF(p => ({ ...p, [k]: v === '' ? null : v }));
  const setNumOrNull = (k: keyof Claim) => (v: string) => setF(p => ({ ...p, [k]: v === '' ? null : Number(v) }));

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

  const tol = (f.type_of_loss as TypeOfLoss) ?? 'water';
  const causeList = CAUSES[tol] ?? CAUSES.other;
  const discoveryGap = daysBetween(f.date_of_loss, f.date_discovered);
  // A wide gap between when the loss happened and when it was found is precisely the
  // evidence a carrier uses to call the damage gradual and deny it. Warn the tech
  // while they are still on site and can photograph the cause.
  const gradualRisk = (discoveryGap != null && discoveryGap > 14) || f.loss_onset === 'gradual';
  const today = todayISO();

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

  const Head = ({ children }: { children: any }) => (
    <div className="pt-3 pb-0.5 text-[12px] font-bold text-gray-400 uppercase tracking-wider">{children}</div>
  );

  return (
    <div>
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-4 rounded-b-3xl sticky top-0 z-20">
        <button onClick={() => nav(-1)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-xl">{editing ? 'Edit Claim' : 'New Claim'}</div>
      </div>

      <div className="p-4 space-y-3 pb-28">
        <Head>Identifiers</Head>
        <TextField label="Carrier identifier / Job #" value={val('carrier_identifier')} onChange={set('carrier_identifier')} hint="This is the claim number in Xactimate." />
        <TextField label="Contractor identifier" value={val('contractor_identifier')} onChange={set('contractor_identifier')} />
        <TextField label="Assignment identifier" value={val('assignment_identifier')} onChange={set('assignment_identifier')} />
        <TextField label="Address" value={val('address')} onChange={set('address')} />

        {/* ---- Cause & Origin: the coverage decision lives here ---- */}
        <div className="pt-3 font-bold text-sm flex items-center gap-1.5">
          <ShieldQuestion size={15} className="text-sky-deep" /> Cause &amp; origin
        </div>
        <p className="text-[11px] text-gray-400 -mt-1 leading-relaxed">
          A policy covers damage that is sudden and accidental, and excludes damage that developed over time. This section answers that question, and it is the most common reason a water claim is denied outright.
        </p>

        <SelectField
          label="Type of loss"
          value={tol}
          options={TOL_OPTIONS}
          clearable={false}
          onChange={v => setF(p => ({ ...p, type_of_loss: v as TypeOfLoss, cause_of_loss: null, cause_other: null }))}
          sheetTitle="Type of loss"
          sheetNote="Xactimate carries a code and a description. Changing the type resets the cause, because the cause list is populated from the type."
        />

        <SelectField
          label="Cause of loss"
          value={val('cause_of_loss')}
          options={causeList}
          onChange={setOrNull('cause_of_loss')}
          placeholder="Select a cause"
          sheetTitle="Cause of loss"
          sheetNote="What failed. The list is scoped to the type of loss, the same way Xactimate scopes it."
        />

        <TextField
          label="Other cause detail"
          value={val('cause_other')}
          onChange={setOrNull('cause_other')}
          placeholder="e.g. High water pressure"
          hint="Xactimate carries this alongside the named cause (COL otherCause). Use it for what made the failure happen."
        />

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
          <DateField label="Date of loss" value={val('date_of_loss')} onChange={setOrNull('date_of_loss')} max={today}
                     sheetNote="When the failure actually happened." />
          <DateField label="Date discovered" value={val('date_discovered')} onChange={setOrNull('date_discovered')}
                     min={val('date_of_loss') || undefined} max={today}
                     sheetNote="When someone first noticed it. The gap between these two dates is what a carrier uses to argue the damage was gradual." />
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

        {/* ---- S500 classification ---- */}
        <Head>Water classification (IICRC S500)</Head>
        <ChoiceCards
          label="Category of water"
          value={(f.category_of_water as number | null) != null ? String(f.category_of_water) : ''}
          options={CATEGORY}
          columns={1}
          onChange={setNumOrNull('category_of_water')}
          hint="Category is about contamination, not volume. Category 1 becomes Category 2 after roughly 24 to 48 hours of dwell time."
        />
        <ChoiceCards
          label="Class of water"
          value={(f.class_of_water as number | null) != null ? String(f.class_of_water) : ''}
          options={CLASS}
          columns={1}
          onChange={setNumOrNull('class_of_water')}
          hint="Class is the evaporation load, and it drives the equipment count. It is determined AFTER demolition, so revisit it once tear-out is done."
        />

        {/* ---- Claim dates: Xactimate needs these to complete an estimate ---- */}
        <Head>Claim dates</Head>
        <p className="text-[11px] text-gray-400 -mt-1">Xactimate requires these to complete an estimate.</p>
        <div className="grid grid-cols-3 gap-2">
          <DateField label="Received" value={val('date_received')} onChange={setOrNull('date_received')} max={today} />
          <DateField label="Contacted" value={val('date_contacted')} onChange={setOrNull('date_contacted')} max={today} />
          <DateField label="Inspected" value={val('date_inspected')} onChange={setOrNull('date_inspected')} max={today} />
        </div>

        <Head>Policyholder</Head>
        <TextField label="Name" value={val('policyholder_name')} onChange={set('policyholder_name')} />
        <TextField label="Email" type="email" value={val('policyholder_email')} onChange={set('policyholder_email')} />
        <TextField label="Phone" type="tel" value={val('policyholder_phone')} onChange={set('policyholder_phone')} />

        <Head>Insurance</Head>
        <TextField label="Insurance company" value={val('insurance_company')} onChange={set('insurance_company')} />
        <TextField label="Broker / agent" value={val('broker_agent')} onChange={set('broker_agent')} />
        <TextField label="Project manager" value={val('project_manager')} onChange={set('project_manager')} />
        <TextField label="Adjuster / claim rep" value={val('adjuster')} onChange={set('adjuster')} />
        <TextField label="Estimator" value={val('estimator')} onChange={set('estimator')} hint="Required by Xactimate alongside the claim rep." />
        <TextField label="Policy number" value={val('policy_number')} onChange={set('policy_number')} />
        <TextField label="CAT code" value={val('cat_code')} onChange={set('cat_code')} />

        <SelectField
          label="Policy type"
          value={val('policy_type')}
          options={POLICY_TYPE}
          onChange={v => setF(p => ({ ...p, policy_type: (v || null) as PolicyType | null }))}
        />

        <div className="grid grid-cols-2 gap-2">
          <DateField label="Policy effective" value={val('policy_effective_date')} onChange={setOrNull('policy_effective_date')} />
          <DateField label="Policy expires" value={val('policy_expiration_date')} onChange={setOrNull('policy_expiration_date')} />
        </div>

        <div className="grid grid-cols-2 gap-2 items-start">
          <TextField label="Deductible ($)" type="number"
                     value={(f.deductible as number | null) != null ? String(f.deductible) : ''}
                     onChange={setNumOrNull('deductible')} />
          <SelectField
            label="Deductible applies"
            value={val('deductible_applies')}
            options={DEDUCTIBLE_APPLIES}
            onChange={v => setF(p => ({ ...p, deductible_applies: (v || null) as any }))}
          />
        </div>

        {/* ---- Coverages (Xactimate Coverages & Loss) ---- */}
        <Head>Coverages</Head>
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
          {saving ? 'Saving...' : 'Save Claim'}
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