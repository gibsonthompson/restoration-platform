import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim, TypeOfLoss } from '../types/models';

// Hoisted out of the page component on purpose: defining it inline would remount
// the input on every keystroke and drop focus.
function TextField({ label, value, onChange, type = 'text' }:
  { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input type={type}
             className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky"
             value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

const empty: Partial<Claim> = { type_of_loss: 'water', status: 'open' };

export default function EditClaim() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const nav = useNavigate();
  const [f, setF] = useState<Partial<Claim>>(empty);
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

  async function save() {
    if (!activeOrg || saving) return;
    setSaving(true);
    // Strip read-only/joined fields so update/insert payloads stay clean.
    const { created_at, ...rest } = f as any;
    const row = { ...rest, org_id: activeOrg.id };
    try {
      if (editing) {
        await supabase.from('resto_claims').update(row).eq('id', claimId!);
        return nav(`/claims/${claimId}`);
      }
      const { data } = await supabase.from('resto_claims').insert(row).select('id').single();
      nav(data ? `/claims/${(data as { id: string }).id}` : '/');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-4 rounded-b-3xl sticky top-0 z-20">
        <button onClick={() => nav(-1)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-xl">{editing ? 'Edit claim' : 'New claim'}</div>
      </div>

      <div className="p-4 space-y-3 pb-28">
        <TextField label="Carrier identifier / Job #" value={val('carrier_identifier')} onChange={set('carrier_identifier')} />
        <TextField label="Contractor identifier" value={val('contractor_identifier')} onChange={set('contractor_identifier')} />
        <TextField label="Assignment identifier" value={val('assignment_identifier')} onChange={set('assignment_identifier')} />
        <TextField label="Address" value={val('address')} onChange={set('address')} />
        <TextField label="Date of loss" type="date" value={val('date_of_loss')} onChange={set('date_of_loss')} />

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Type of loss</span>
          <select className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky"
                  value={f.type_of_loss ?? 'water'}
                  onChange={e => setF(p => ({ ...p, type_of_loss: e.target.value as TypeOfLoss }))}>
            <option value="water">Water</option>
            <option value="fire">Fire</option>
            <option value="mold">Mold</option>
            <option value="other">Other</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Category of water</span>
            <select className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky"
                    value={(f.category_of_water as number | null) ?? ''} onChange={e => setNum('category_of_water')(e.target.value)}>
              <option value="">—</option>
              {[1, 2, 3].map(n => <option key={n} value={n}>Cat {n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Class of water</span>
            <select className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky"
                    value={(f.class_of_water as number | null) ?? ''} onChange={e => setNum('class_of_water')(e.target.value)}>
              <option value="">—</option>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>Class {n}</option>)}
            </select>
          </label>
        </div>

        <div className="pt-2 font-bold text-sm">Policyholder</div>
        <TextField label="Name" value={val('policyholder_name')} onChange={set('policyholder_name')} />
        <TextField label="Email" type="email" value={val('policyholder_email')} onChange={set('policyholder_email')} />
        <TextField label="Phone" type="tel" value={val('policyholder_phone')} onChange={set('policyholder_phone')} />

        <div className="pt-2 font-bold text-sm">Insurance</div>
        <TextField label="Insurance company" value={val('insurance_company')} onChange={set('insurance_company')} />
        <TextField label="Broker / agent" value={val('broker_agent')} onChange={set('broker_agent')} />
        <TextField label="Project manager" value={val('project_manager')} onChange={set('project_manager')} />
        <TextField label="Adjuster" value={val('adjuster')} onChange={set('adjuster')} />
        <TextField label="Policy number" value={val('policy_number')} onChange={set('policy_number')} />
        <TextField label="CAT code" value={val('cat_code')} onChange={set('cat_code')} />

        <button onClick={save} disabled={saving} className="btn-primary w-full py-3.5 mt-2 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save claim'}
        </button>
      </div>
    </div>
  );
}