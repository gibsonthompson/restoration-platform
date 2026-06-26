import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim, TypeOfLoss } from '../types/models';

// Mirrors the "Edit Home" form. Full field set from the data model. Nullable
// fields map to the N/A pattern in the real UI (left blank).

// Hoisted out of the page component on purpose: defining it inline would remount
// the input on every keystroke and drop focus.
function TextField({ label, value, onChange }:
  { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input className="w-full border rounded px-3 py-2 mt-1"
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
  const editing = Boolean(claimId);

  useEffect(() => {
    if (!claimId) return;
    supabase.from('resto_claims').select('*').eq('id', claimId).single()
      .then(({ data }) => data && setF(data as Claim));
  }, [claimId]);

  const val = (k: keyof Claim) => (f[k] as string) ?? '';
  const set = (k: keyof Claim) => (v: string) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!activeOrg) return;
    const row = { ...f, org_id: activeOrg.id };
    if (editing) {
      await supabase.from('resto_claims').update(row).eq('id', claimId!);
      return nav(`/claims/${claimId}`);
    }
    const { data } = await supabase.from('resto_claims').insert(row).select('id').single();
    nav(data ? `/claims/${(data as { id: string }).id}` : '/');
  }

  return (
    <div className="p-4 space-y-3 pb-24">
      <h1 className="text-lg font-bold">{editing ? 'Edit' : 'New'} Claim</h1>
      <TextField label="Carrier Identifier / Job #" value={val('carrier_identifier')} onChange={set('carrier_identifier')} />
      <TextField label="Contractor Identifier" value={val('contractor_identifier')} onChange={set('contractor_identifier')} />
      <TextField label="Assignment Identifier" value={val('assignment_identifier')} onChange={set('assignment_identifier')} />
      <TextField label="Address" value={val('address')} onChange={set('address')} />
      <TextField label="Date of Loss" value={val('date_of_loss')} onChange={set('date_of_loss')} />

      <div className="pt-2 font-semibold">Policyholder</div>
      <TextField label="Name" value={val('policyholder_name')} onChange={set('policyholder_name')} />
      <TextField label="Email" value={val('policyholder_email')} onChange={set('policyholder_email')} />
      <TextField label="Phone" value={val('policyholder_phone')} onChange={set('policyholder_phone')} />

      <div className="pt-2 font-semibold">Additional</div>
      <TextField label="Insurance Company" value={val('insurance_company')} onChange={set('insurance_company')} />
      <TextField label="Broker / Agent" value={val('broker_agent')} onChange={set('broker_agent')} />
      <TextField label="Project Manager" value={val('project_manager')} onChange={set('project_manager')} />
      <TextField label="Adjuster" value={val('adjuster')} onChange={set('adjuster')} />
      <TextField label="Policy Number" value={val('policy_number')} onChange={set('policy_number')} />
      <TextField label="CAT Code" value={val('cat_code')} onChange={set('cat_code')} />

      <label className="block">
        <span className="text-xs text-gray-500">Type of Loss</span>
        <select className="w-full border rounded px-3 py-2 mt-1"
                value={f.type_of_loss ?? 'water'}
                onChange={e => setF(p => ({ ...p, type_of_loss: e.target.value as TypeOfLoss }))}>
          <option value="water">Water</option>
          <option value="fire">Fire</option>
          <option value="mold">Mold</option>
          <option value="other">Other</option>
        </select>
      </label>

      <button onClick={save} className="w-full bg-brand text-white rounded py-3 font-medium mt-2">Save</button>
    </div>
  );
}
