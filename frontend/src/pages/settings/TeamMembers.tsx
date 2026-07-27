import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, UserPlus, Trash2, Users, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../context/OrgContext';

interface Member { user_id: string; email: string | null; role: string; is_self: boolean }

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'tech', label: 'Tech' }
];
const roleLabel = (r: string) => ({ owner: 'Owner', manager: 'Manager', lead_tech: 'Lead tech', tech: 'Tech' } as Record<string, string>)[r] || r;

// A readable password the owner can hand off, if they would rather not think one up.
function suggestPassword(): string {
  const words = ['River', 'Cedar', 'Maple', 'Harbor', 'Summit', 'Falcon', 'Anchor', 'Copper', 'Willow', 'Canyon'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${n}`;
}

// The URL and public key the main client was built with. We read them off the existing
// client so we do not depend on a particular env var name being present in the build.
const SB_URL: string = (supabase as any).supabaseUrl;
const SB_KEY: string = (supabase as any).supabaseKey;

// A SEPARATE, throwaway Supabase client used ONLY to create the new account. It stores
// nothing (persistSession: false) and uses its own storageKey, so signing the new user up
// does NOT touch or replace the owner's own logged-in session on the main client. This is
// the standard way to create an account for someone else from the browser with no backend.
function makeSignupClient() {
  return createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-teammember-signup' }
  });
}

export default function TeamMembers() {
  const nav = useNavigate();
  const { activeOrg, role: myRole } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState('tech');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const canManage = myRole === 'owner' || myRole === 'manager';

  async function load() {
    if (!activeOrg) return;
    const { data: m } = await supabase.rpc('resto_list_org_members', { p_org: activeOrg.id });
    setMembers((m as Member[]) ?? []);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeOrg?.id, myRole]);

  async function copyPw() {
    try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked, no-op */ }
  }

  // Create the member's login entirely in the browser, no backend:
  //   1. sign the new email + password up on a throwaway client (owner stays logged in),
  //   2. link the resulting user into this org with the existing SECURITY DEFINER RPC,
  //      which does its own owner/manager permission check.
  // The person then signs in on the normal login screen with exactly these credentials.
  async function createMember() {
    if (!activeOrg || !email.trim() || password.length < 8) return;
    const em = email.trim().toLowerCase();
    setBusy(true); setMsg(null);
    try {
      const signup = makeSignupClient();
      const { error: suErr } = await signup.auth.signUp({ email: em, password });

      // Already registered: skip creation and just link them. Supabase may report this a few
      // different ways, so we treat "already exists" as a link, not a failure.
      const alreadyExists = !!suErr && /already|registered|exists/i.test(suErr.message);
      if (suErr && !alreadyExists) {
        setMsg({ kind: 'err', text: suErr.message });
        return;
      }
      // Make sure nothing from the signup lingers in storage.
      try { await signup.auth.signOut(); } catch { /* ignore */ }

      // Link them into the org. resto_invite_member finds the user by email and inserts the
      // membership row (or updates the role), checking that WE are an owner/manager first.
      const { data: linkRes, error: linkErr } = await supabase.rpc('resto_invite_member', {
        p_org: activeOrg.id, p_email: em, p_role: role
      });
      if (linkErr) { setMsg({ kind: 'err', text: linkErr.message }); return; }

      // resto_invite_member returns 'added' when the auth user existed and was linked, or
      // 'invited' when it could not find them yet. If we just created the account but the RPC
      // still says 'invited', the new row in auth.users has not propagated for the lookup; the
      // account IS made, so tell the owner it is ready and to refresh the list in a moment.
      if (linkRes === 'invited' && !alreadyExists) {
        setMsg({ kind: 'ok', text: `${em} was created and can sign in with the password you set. If they are not in the list yet, refresh in a moment.` });
      } else if (alreadyExists) {
        setMsg({ kind: 'ok', text: `${em} already had an account and was added to your team. Their existing password still works.` });
      } else {
        setMsg({ kind: 'ok', text: `${em} can now sign in with the password you set.` });
      }

      setEmail(''); setPassword(''); setShowPw(false);
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message ?? 'Something went wrong. Try again.' });
    } finally { setBusy(false); }
  }

  async function changeRole(userId: string, newRole: string) {
    if (!activeOrg) return;
    await supabase.from('resto_org_members').update({ role: newRole }).eq('org_id', activeOrg.id).eq('user_id', userId);
    await load();
  }
  async function removeMember(userId: string) {
    if (!activeOrg || !confirm('Remove this team member? They will lose access to every job in this company.')) return;
    await supabase.from('resto_org_members').delete().eq('org_id', activeOrg.id).eq('user_id', userId);
    await load();
  }

  const canSubmit = !busy && !!email.trim() && password.length >= 8;

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
            <p className="text-[12px] text-gray-500 leading-snug">
              Set their email and a password. They sign in with exactly these on the login screen. No email is sent, so tell them the password yourself.
            </p>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Email</label>
              <input className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                     placeholder="name@company.com" type="email" autoCapitalize="none" autoCorrect="off" autoComplete="off"
                     value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Password</label>
              <div className="flex gap-2 mt-1">
                <div className="flex-1 relative">
                  <input className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm outline-none focus:border-sky"
                         placeholder="At least 8 characters" type={showPw ? 'text' : 'password'} autoComplete="new-password"
                         value={password} onChange={e => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600 p-1">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {password
                  ? <button type="button" onClick={copyPw} className="px-3 rounded-xl border border-gray-200 text-gray-500 active:bg-gray-50 flex items-center" aria-label="Copy password">
                      {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                    </button>
                  : <button type="button" onClick={() => { setPassword(suggestPassword()); setShowPw(true); }} className="px-3 rounded-xl border border-gray-200 text-[12px] font-semibold text-sky-deep active:bg-sky-soft">
                      Suggest
                    </button>}
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-[11px] text-amber-600 mt-1 font-medium">A little longer, at least 8 characters.</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Role</label>
              <select className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky" value={role} onChange={e => setRole(e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            <button onClick={createMember} disabled={!canSubmit} className="btn-primary w-full justify-center disabled:opacity-50">
              {busy ? 'Creating…' : 'Create login'}
            </button>

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
      </div>
    </div>
  );
}