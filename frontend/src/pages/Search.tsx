import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, X, ChevronRight, Droplet, Flame, Sprout, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim } from '../types/models';

const lossIcon = (t: string | null | undefined) =>
  t === 'water' ? Droplet : t === 'fire' ? Flame : t === 'mold' ? Sprout : FolderOpen;

// Global search across the org's claims (name / address / job #).
export default function Search() {
  const { activeOrg } = useOrg();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run(term: string) {
    if (!activeOrg || term.trim().length < 2) { setResults([]); setSearched(false); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('resto_claims').select('*')
      .eq('org_id', activeOrg.id)
      .or(`policyholder_name.ilike.%${term}%,address.ilike.%${term}%,carrier_identifier.ilike.%${term}%`)
      .order('created_at', { ascending: false })
      .limit(30);
    setResults((data as Claim[]) ?? []);
    setSearched(true);
    setLoading(false);
  }

  // debounce so we don't query on every keystroke
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(q), 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, activeOrg?.id]);

  return (
    <div className="pb-10">
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <div className="font-display font-bold text-[21px] leading-tight flex items-center gap-2"><SearchIcon size={22} /> Search</div>
        <div className="opacity-75 text-[13px] font-medium mt-0.5 mb-3">Find any claim by name, address, or job number</div>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-3.5 shadow-sm">
          <SearchIcon size={18} className="text-gray-400 shrink-0" />
          <input autoFocus className="flex-1 py-3 outline-none text-navy text-[15px] bg-transparent" placeholder="Search claims"
                 value={q} onChange={e => setQ(e.target.value)} />
          {q && <button onClick={() => setQ('')} className="shrink-0 text-gray-400 active:scale-90 transition"><X size={17} /></button>}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-2.5">
        {loading && <p className="text-gray-400 text-sm px-1">Searching…</p>}

        {!loading && !searched && q.trim().length < 2 && (
          <div className="flex flex-col items-center text-center text-gray-400 pt-16 px-8">
            <SearchIcon size={30} className="text-gray-300 mb-3" />
            <p className="text-sm">Start typing to search across all your claims by policyholder, address, or claim/job number.</p>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center text-center text-gray-400 pt-16 px-8">
            <FolderOpen size={30} className="text-gray-300 mb-3" />
            <p className="text-sm">No claims match "{q}".</p>
          </div>
        )}

        {!loading && results.map(c => {
          const Icon = lossIcon(c.type_of_loss);
          return (
            <button key={c.id} onClick={() => nav(`/claims/${c.id}`)}
              className="card w-full flex items-center gap-3 text-left active:scale-[.99] transition">
              <div className="w-10 h-10 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0"><Icon size={18} /></div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{c.policyholder_name ?? 'Unnamed claim'}</div>
                <div className="text-xs text-gray-400 truncate mt-0.5">{c.address || 'No address'}</div>
                {(c.category_of_water || c.class_of_water || c.carrier_identifier) && (
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {(c.category_of_water || c.class_of_water) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Cat {c.category_of_water ?? '-'} · Class {c.class_of_water ?? '-'}</span>
                    )}
                    {c.carrier_identifier && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-soft text-sky-deep">{c.carrier_identifier}</span>
                    )}
                  </div>
                )}
              </div>
              <ChevronRight size={18} className="text-gray-300 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}