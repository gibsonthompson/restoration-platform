import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Share2, FileText, StickyNote, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim, Structure } from '../types/models';

// Claim detail = structures list + the Edit/Share/Documents/General Notes action
// row (mirrors the live app). Bottom nav switches to claim-context here.
export default function ClaimDetail() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const nav = useNavigate();
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

  const Action = ({ icon: Icon, label, to }: { icon: any; label: string; to: string }) => (
    <button onClick={() => nav(to)} className="flex-1 flex flex-col items-center gap-1 py-2 text-xs text-gray-200">
      <Icon size={20} /> {label}
    </button>
  );

  return (
    <div>
      <div className="bg-brand-dark text-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-bold">{claim.policyholder_name ?? 'Unnamed'}</div>
            <div className="text-sm opacity-80">{claim.address}</div>
            <div className="text-sm opacity-60 capitalize">{claim.type_of_loss ?? 'Type of loss not set'}</div>
          </div>
          <Globe size={18} className="opacity-70 mt-1" />
        </div>
        <div className="flex mt-3 border-t border-white/10 pt-1">
          <Action icon={Pencil} label="Edit" to={`/claims/${claim.id}/edit`} />
          <Action icon={Share2} label="Share" to={`/claims/${claim.id}/share`} />
          <Action icon={FileText} label="Documents" to={`/claims/${claim.id}/documents`} />
          <Action icon={StickyNote} label="Notes" to={`/claims/${claim.id}/notes`} />
        </div>
      </div>

      <div className="p-4 space-y-3">
        <button onClick={addStructure}
                className="w-full bg-brand text-white rounded py-3 font-medium flex items-center justify-center gap-1">
          <Plus size={16} /> Add Structure
        </button>
        {structures.map(s => (
          <Link key={s.id} to={`/claims/${claim.id}/structures/${s.id}`}
                className="block bg-white rounded border p-4 hover:bg-gray-50 font-medium">
            {s.name}
          </Link>
        ))}
        {structures.length === 0 && <p className="text-gray-400 text-sm">No structures yet.</p>}
      </div>
    </div>
  );
}