import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, UserPlus, Trash2, Mail, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../context/OrgContext';

interface Member { user_id: string; email: string | null; role: string; is_self: boolean }
interface Invite { id: string; email: string; role: string; created_at: string }

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'lead_tech', label: 'Lead tech' },
  { value: 'tech', label: 'Tech' }
];
const roleLabel = (r: string) => ({ owner: 'Owner', manager: 'Manager', lead_tech: 'Lead tech', tech: 'Tech' } as Record<string, string>)[r] || r;

export default function TeamMembers() {
  const nav = useNavigate();
  const { activeOrg, role: myRole } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('tech');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const canManage = myRole === 'owner' || myRole === 'manager';

  async function load() {
    if (!activeOrg) return;
    const { data: m } = await supabase.rpc('resto_list_org_members', { p_org: activeOrg.id });
    setMembers((m as Member[]) ?? []);
    if (canManage) {
      const { data: i } = await supabase.rpc('resto_list_org_invites', { p_org: activeOrg.id });
      setInvites((i as Invite[]) ?? []);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeOrg?.id, myRole]);

  async function invite() {
    if (!activeOrg || !email.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc('resto_invite_member', { p_org: activeOrg.id, p_email: email.trim(), p_role: role });
      if (error) { setMsg({ kind: 'err', text: error.message }); return; }
      setEmail('');
      setMsg({ kind: 'ok', text: data === 'added' ? 'Added to the team.' : 'Invite sent. They join when they sign in with this email.' });
      await load();
    } finally { setBusy(false); }
  }

  async function changeRole(userId: string, newRole: string) {
    if (!activeOrg) return;
    await supabase.from('resto_org_members').update({ role: newRole }).eq('org_id', activeOrg.id).eq('user_id', userId);
    await load();
  }
  async function removeMember(userId: string) {
    if (!activeOrg || !confirm('Remove this team member?')) return;
    await supabase.from('resto_org_members').delete().eq('org_id', activeOrg.id).eq('user_id', userId);
    await load();
  }
  async function revokeInvite(id: string) {
    await supabase.from('resto_org_invites').delete().eq('id', id);
    await load();
  }

  return (
    <div className="pb-10">
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav('/settings')} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition"><ChevronLeft size={20} /></button>
        <div className="font-display font-bold text-[21px] leading-tight flex items-center gap-2"><Users size={22} /> Team Members</div>
        <div className="opacity-75 text-[13px] font-medium mt-0.5">Crew who can work on every job in {activeOrg?.name || 'your company'}</div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {canManage && (
          <div className="card space-y-2.5">
            <div className="text-sm font-bold flex items-center gap-1.5"><UserPlus size={15} className="text-brand" /> Add a team member</div>
            <input className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                   placeholder="name@company.com" type="email" autoCapitalize="none" autoCorrect="off" value={email} onChange={e => setEmail(e.target.value)} />
            <div className="flex gap-2">
              <select className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" value={role} onChange={e => setRole(e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={invite} disabled={busy || !email.trim()} className="btn-primary px-4 disabled:opacity-50">{busy ? 'Adding…' : 'Add'}</button>
            </div>
            {msg && <div className={`text-xs font-medium rounded-xl px-3 py-2 ${msg.kind === 'err' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{msg.text}</div>}
            <p className="text-[11px] text-gray-400">Team members can view and edit every job. Managers can also add and remove members.</p>
          </div>
        )}

        <div>
          <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">Members</div>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.user_id} className="card flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0 font-bold text-sm">{(m.email ?? '?').slice(0, 1).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{m.email ?? 'Unknown'}{m.is_self && <span className="text-gray-400 font-normal"> (you)</span>}</div>
                  <div className="text-[11px] text-gray-400 font-medium">{roleLabel(m.role)}</div>
                </div>
                {canManage && m.role !== 'owner' && !m.is_self && (
                  <>
                    <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button onClick={() => removeMember(m.user_id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {canManage && invites.length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">Pending invites</div>
            <div className="space-y-2">
              {invites.map(i => (
                <div key={i.id} className="card flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><Mail size={16} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{i.email}</div>
                    <div className="text-[11px] text-gray-400 font-medium">{roleLabel(i.role)} · invited, not yet joined</div>
                  </div>
                  <button onClick={() => revokeInvite(i.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}