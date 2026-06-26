import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Claim } from '../types/models';

// Mirrors the "Property Claims" list screen.
export default function ClaimsList() {
  const { activeOrg } = useOrg();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrg) return;
    setLoading(true);
    supabase.from('resto_claims').select('*').eq('org_id', activeOrg.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setClaims((data as Claim[]) ?? []); setLoading(false); });
  }, [activeOrg?.id]);

  const filtered = claims.filter(c =>
    !q || [c.policyholder_name, c.address, c.carrier_identifier]
      .some(v => v?.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 border rounded px-3 bg-white">
          <Search size={16} className="text-gray-400" />
          <input className="flex-1 py-2 outline-none" placeholder="Search all claims"
                 value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Link to="/claims/new" className="bg-brand text-white rounded px-4 flex items-center gap-1 font-medium">
          <Plus size={16} /> Add
        </Link>
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading...</p>}
      {!loading && filtered.length === 0 && <p className="text-gray-400 text-sm">No claims yet.</p>}

      <div className="space-y-2">
        {filtered.map(c => (
          <Link key={c.id} to={`/claims/${c.id}`}
                className="block bg-white rounded border p-4 hover:bg-gray-50">
            <div className="flex justify-between">
              <span className="font-semibold">{c.policyholder_name ?? 'Unnamed'}</span>
              <span className="text-xs text-gray-400">{c.date_created ?? ''}</span>
            </div>
            <div className="text-sm text-gray-600">{c.carrier_identifier ?? 'No job #'}</div>
            <div className="text-sm text-gray-400">{c.address ?? ''}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
