import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Share2, FileText, StickyNote, ClipboardList, Home, ChevronRight, ChevronLeft, Droplet, Flame, Sprout , Package , FileSignature } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { NameSheet } from '../components/NameSheet';
import type { Claim, Structure } from '../types/models';

const lossChip = (t: string | null) =>
  t === 'water' ? { Icon: Droplet, label: 'Water' } :
  t === 'fire'  ? { Icon: Flame, label: 'Fire' } :
  t === 'mold'  ? { Icon: Sprout, label: 'Mold' } : null;

const STRUCTURE_SUGGESTIONS = ['Main Level', 'Second Level', 'Basement', 'Attic', 'Garage', 'Crawlspace', 'Exterior'];

export default function ClaimDetail() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const nav = useNavigate();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [adding, setAdding] = useState(false);

  async function load() {
    if (!claimId) return;
    const { data: c } = await supabase.from('resto_claims').select('*').eq('id', claimId).single();
    setClaim(c as Claim);
    const { data: s } = await supabase.from('resto_structures').select('*')
      .eq('claim_id', claimId).order('sort_order');
    setStructures((s as Structure[]) ?? []);
  }
  useEffect(() => { void load(); }, [claimId]);

  async function createStructure(name: string) {
    if (!activeOrg || !claimId) return;
    await supabase.from('resto_structures').insert({
      org_id: activeOrg.id, claim_id: claimId, name, sort_order: structures.length
    });
    setAdding(false); void load();
  }

  if (!claim) return <div className="p-4 text-gray-400">Loading...</div>;

  const chip = lossChip(claim.type_of_loss);
  const Action = ({ icon: Icon, label, to }: { icon: any; label: string; to: string }) => (
    <button onClick={() => nav(to)}
            className="flex-1 bg-white/10 rounded-2xl py-2.5 flex flex-col items-center gap-1.5 text-[11px] font-semibold text-white active:scale-95 transition">
      <Icon size={17} /> {label}
    </button>
  );

  return (
    <div>
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav('/')} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-[21px] leading-tight">{claim.policyholder_name ?? 'Unnamed claim'}</div>
        {claim.address && <div className="opacity-75 text-[13px] font-medium mt-0.5">{claim.address}</div>}

        <div className="flex flex-wrap gap-2 mt-3">
          {chip && (
            <span className="bg-white text-aqua-deep text-[11px] font-bold px-2.5 py-1.5 rounded-full inline-flex items-center gap-1.5">
              <chip.Icon size={12} /> {chip.label}
            </span>
          )}
          {(claim.category_of_water || claim.class_of_water) && (
            <span className="bg-white/12 text-[11px] font-bold px-2.5 py-1.5 rounded-full">
              Cat {claim.category_of_water ?? '-'} · Class {claim.class_of_water ?? '-'}
            </span>
          )}
          {claim.carrier_identifier && (
            <span className="bg-white/12 text-[11px] font-bold px-2.5 py-1.5 rounded-full">{claim.carrier_identifier}</span>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <Action icon={Pencil} label="Edit" to={`/claims/${claim.id}/edit`} />
          <Action icon={ClipboardList} label="Scope" to={`/claims/${claim.id}/scope`} />
          <Action icon={Package} label="Contents" to={`/claims/${claim.id}/contents`} />
          <Action icon={FileSignature} label="Forms" to={`/claims/${claim.id}/forms`} />
          <Action icon={FileText} label="Docs" to={`/claims/${claim.id}/documents`} />
          <Action icon={StickyNote} label="Notes" to={`/claims/${claim.id}/notes`} />
          <Action icon={Share2} label="Share" to={`/claims/${claim.id}/share`} />
        </div>
      </div>

      <div className="p-4 space-y-3">
        <button onClick={() => setAdding(true)} className="btn-primary w-full py-3.5">
          <Plus size={18} /> Add structure
        </button>

        <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 pt-1">Structures</div>

        {structures.length === 0 && (
          <p className="text-gray-400 text-sm px-1">No structures yet. Add the building or level you're working on.</p>
        )}

        {structures.map(s => (
          <Link key={s.id} to={`/claims/${claim.id}/structures/${s.id}`}
                className="card flex items-center gap-3 active:scale-[.99] transition">
            <div className="w-10 h-10 rounded-xl bg-aqua-soft text-aqua-deep flex items-center justify-center shrink-0">
              <Home size={18} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[15px] truncate">{s.name}</div>
            </div>
            <ChevronRight size={18} className="ml-auto text-gray-300 shrink-0" />
          </Link>
        ))}
      </div>

      {adding && (
        <NameSheet title="Add structure" subtitle="Pick a level or building, or type your own."
          placeholder="Structure name" suggestions={STRUCTURE_SUGGESTIONS} existing={structures.map(s => s.name)}
          onCancel={() => setAdding(false)} onSubmit={createStructure} />
      )}
    </div>
  );
}