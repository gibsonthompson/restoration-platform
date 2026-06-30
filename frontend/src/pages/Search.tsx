import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim } from '../types/models';

// Global search across the org's claims (name / address / job #).
export default function Search() {
  const { activeOrg } = useOrg();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Claim[]>([]);

  async function run(term: string) {
    setQ(term);
    if (!activeOrg || term.trim().length < 2) { setResults([]); return; }
    const { data } = await supabase.from('resto_claims').select('*')
      .eq('org_id', activeOrg.id)
      .or(`policyholder_name.ilike.%${term}%,address.ilike.%${term}%,carrier_identifier.ilike.%${term}%`)
      .limit(25);
    setResults((data as Claim[]) ?? []);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 border rounded px-3 bg-white">
        <SearchIcon size={16} className="text-gray-400" />
        <input autoFocus className="flex-1 py-2 outline-none" placeholder="Search claims"
               value={q} onChange={e => run(e.target.value)} />
      </div>
      {results.map(c => (
        <Link key={c.id} to={`/claims/${c.id}`} className="block bg-white border rounded p-3">
          <div className="font-medium">{c.policyholder_name ?? 'Unnamed'}</div>
          <div className="text-sm text-gray-400">{c.address}</div>
        </Link>
      ))}
      {q.length >= 2 && results.length === 0 && <p className="text-gray-400 text-sm">No matches.</p>}
    </div>
  );
}