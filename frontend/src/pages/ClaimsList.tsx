import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Droplet, Flame, Sprout, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim } from '../types/models';

// Loss-type visual language: water=aqua, fire=coral, mold=green.
function lossStyle(type: string | null) {
  switch (type) {
    case 'water': return { icon: Droplet, thumb: 'bg-aqua-soft text-aqua-deep', chip: 'bg-aqua-soft text-aqua-deep', dot: 'bg-aqua', label: 'Water' };
    case 'fire':  return { icon: Flame, thumb: 'bg-coral-soft text-coral-deep', chip: 'bg-coral-soft text-coral-deep', dot: 'bg-coral', label: 'Fire' };
    case 'mold':  return { icon: Sprout, thumb: 'bg-green-50 text-green-600', chip: 'bg-green-50 text-green-600', dot: 'bg-green-500', label: 'Mold' };
    default:      return { icon: FolderOpen, thumb: 'bg-gray-100 text-gray-500', chip: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400', label: 'Claim' };
  }
}

export default function ClaimsList() {
  const { activeOrg } = useOrg();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [shared, setShared] = useState<Claim[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrg) return;
    setLoading(true);
    Promise.all([
      supabase.from('resto_claims').select('*').eq('org_id', activeOrg.id).order('created_at', { ascending: false }),
      supabase.from('resto_claims').select('*').neq('org_id', activeOrg.id).order('created_at', { ascending: false })
    ]).then(([own, sh]) => {
      setClaims((own.data as Claim[]) ?? []);
      setShared((sh.data as Claim[]) ?? []);
      setLoading(false);
    });
  }, [activeOrg?.id]);

  const filtered = claims.filter(c =>
    !q || [c.policyholder_name, c.address, c.carrier_identifier]
      .some(v => v?.toLowerCase().includes(q.toLowerCase())));

  const ClaimCard = ({ c, isShared }: { c: Claim; isShared?: boolean }) => {
    const st = lossStyle(c.type_of_loss);
    const Icon = st.icon;
    return (
      <Link to={`/claims/${c.id}`} className="card flex gap-3.5 items-center active:scale-[.99] transition">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${st.thumb}`}><Icon size={22} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15.5px] leading-tight truncate">{c.policyholder_name ?? 'Unnamed claim'}</div>
          <div className="text-[12.5px] text-gray-500 font-medium truncate mt-0.5">
            {[c.carrier_identifier, c.address].filter(Boolean).join(' · ') || 'No job number yet'}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`chip ${st.chip}`}><span className={`w-2 h-2 rounded-full ${st.dot}`} />{st.label}</span>
          {isShared
            ? <span className="text-[10px] font-bold text-sky-deep bg-sky-soft px-2 py-0.5 rounded-full">Shared</span>
            : <span className="text-[11px] text-gray-400 font-semibold">{c.date_created ?? ''}</span>}
        </div>
      </Link>
    );
  };

  return (
    <div className="p-4 space-y-4">
      <div className="pt-1">
        <h1 className="text-[22px] font-bold">Claims</h1>
        <p className="text-[13px] text-gray-500 font-medium">
          {claims.length === 0 ? 'No active jobs yet' : `${claims.length} active ${claims.length === 1 ? 'job' : 'jobs'}`}
        </p>
      </div>

      <div className="flex gap-2.5">
        <div className="input flex items-center gap-2.5 py-0">
          <Search size={18} className="text-gray-400" />
          <input className="flex-1 py-3 outline-none bg-transparent text-[15px]" placeholder="Search all claims"
                 value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Link to="/claims/new" className="btn-primary px-4 shrink-0">
          <Plus size={18} /> New
        </Link>
      </div>

      {loading && <p className="text-gray-400 text-sm px-1">Loading claims...</p>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center text-center gap-3 pt-16 px-8">
          <div className="w-16 h-16 rounded-3xl bg-sky-soft text-sky flex items-center justify-center">
            <FolderOpen size={30} />
          </div>
          <p className="text-gray-500 font-medium text-sm">
            {q ? 'No claims match your search.' : 'Your first job is one tap away. Add a claim to start documenting.'}
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.map(c => <ClaimCard key={c.id} c={c} />)}
      </div>

      {shared.length > 0 && (
        <div className="pt-1">
          <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">Shared with me</div>
          <div className="space-y-2.5">
            {shared.map(c => <ClaimCard key={c.id} c={c} isShared />)}
          </div>
        </div>
      )}
    </div>
  );
}