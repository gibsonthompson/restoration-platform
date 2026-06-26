import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim, Structure } from '../types/models';

// Mirrors the claim detail (structures list) screen.
export default function ClaimDetail() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [structures, setStructures] = useState<Structure[]>([]);

  async function load() {
    if (!claimId) return;
    const { data: c } = await supabase.from('resto_claims').select('*').eq('id', claimId).single();
    setClaim(c as Claim);
    const { data: s } = await supabase.from('resto_structures').select('*')
      .eq('claim_id', claimId).order('sort_order');
    setStructures((s as Structure[]) ?? []);
  }
  useEffect(() => { void load(); }, [claimId]);

  async function addStructure() {
    if (!activeOrg || !claimId) return;
    const name = prompt('Structure name (e.g. Main Building, Basement)');
    if (!name) return;
    await supabase.from('resto_structures').insert({
      org_id: activeOrg.id, claim_id: claimId, name, sort_order: structures.length
    });
    void load();
  }

  if (!claim) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="bg-brand-dark text-white p-4">
        <div className="text-xl font-bold">{claim.policyholder_name}</div>
        <div className="text-sm opacity-80">{claim.address}</div>
        <div className="text-sm opacity-60">{claim.type_of_loss ?? 'Type of loss not set'}</div>
        <Link to={`/claims/${claim.id}/edit`} className="inline-flex items-center gap-1 text-sm mt-2 opacity-90">
          <Pencil size={14} /> Edit
        </Link>
      </div>

      <div className="p-4 space-y-3">
        <button onClick={addStructure}
                className="w-full bg-brand text-white rounded py-3 font-medium flex items-center justify-center gap-1">
          <Plus size={16} /> Add Structure
        </button>
        {structures.map(s => (
          <Link key={s.id} to={`/structures/${s.id}`}
                className="block bg-white rounded border p-4 hover:bg-gray-50 font-medium">
            {s.name}
          </Link>
        ))}
        {structures.length === 0 && <p className="text-gray-400 text-sm">No structures yet.</p>}
      </div>
    </div>
  );
}
