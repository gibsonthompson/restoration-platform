import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { UserPlus, Trash2, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SubHeader } from '../components/SubHeader';

interface ShareRow { id: string; email: string | null; role: string; created_at: string }

const ERR: Record<string, string> = {
  claim_not_found: 'Claim not found.',
  forbidden: 'You do not have permission to share this claim.',
  user_not_found: 'No account found for that email. They need a Restoration Docs login first.',
  cannot_share_with_self: 'That is your own account.',
  already_shared: 'This claim is already shared with that person.'
};

// Cross-org sharing. Shares a claim (read-only) with another platform user by
// email; the recipient sees it under "Shared with me" and can open the full
// claim but cannot edit. RLS enforces access (migration 0010).
export default function Share() {
  const { claimId } = useParams();
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  async function load() {
    if (!claimId) return;
    const { data } = await supabase.rpc('resto_list_claim_shares', { p_claim_id: claimId });
    setShares((data as ShareRow[]) ?? []);
  }
  useEffect(() => { void load(); }, [claimId]);

  async function share() {
    setMsg(null);
    const e = email.trim();
    if (!e) { setMsg({ kind: 'err', text: 'Enter an email.' }); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('resto_share_claim', { p_claim_id: claimId, p_email: e, p_role: role });
      if (error) { setMsg({ kind: 'err', text: error.message }); return; }
      const res = data as { ok: boolean; error?: string };
      if (!res?.ok) { setMsg({ kind: 'err', text: ERR[res?.error ?? ''] ?? 'Could not share.' }); return; }
      setEmail('');
      setMsg({ kind: 'ok', text: `Shared with ${e}.` });
      await load();
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke access for this person?')) return;
    await supabase.from('resto_claim_shares').delete().eq('id', id);
    await load();
  }

  return (
    <div>
      <SubHeader title="Share" subtitle="Give an adjuster or estimator read access" />

      <div className="p-4 space-y-4">
        <div className="card space-y-2.5">
          <div className="text-sm font-bold flex items-center gap-1.5"><Mail size={15} className="text-brand" /> Invite by email</div>
          <input className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                 placeholder="name@company.com" type="email" autoCapitalize="none" autoCorrect="off"
                 value={email} onChange={e => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <select className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                    value={role} onChange={e => setRole(e.target.value)}>
              <option value="viewer">Viewer (read only)</option>
              <option value="estimator">Estimator (read only)</option>
            </select>
            <button onClick={share} disabled={busy} className="btn-primary px-4 disabled:opacity-50">
              <UserPlus size={16} /> {busy ? 'Sharing...' : 'Share'}
            </button>
          </div>
          {msg && (
            <div className={`text-xs font-medium rounded-xl px-3 py-2 ${msg.kind === 'err' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
              {msg.text}
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            Recipients need a Restoration Docs account. Shared access is read-only; only your team can edit.
          </p>
        </div>

        <div>
          <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">People with access</div>
          {shares.length === 0 && <p className="text-gray-400 text-sm px-1">Not shared with anyone yet.</p>}
          <div className="space-y-2">
            {shares.map(s => (
              <div key={s.id} className="card flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0 font-bold text-sm">
                  {(s.email ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{s.email ?? 'Unknown user'}</div>
                  <div className="text-[11px] text-gray-400 font-medium capitalize">{s.role} · read only</div>
                </div>
                <button onClick={() => revoke(s.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}