import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { UserPlus, Trash2, Mail, Link2, Copy, Share as ShareIcon, ExternalLink, Check } from 'lucide-react';
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

export default function Share() {
  const { claimId } = useParams();

  // public report link
  const [token, setToken] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [claimName, setClaimName] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  // team (account) access
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  const api = import.meta.env.VITE_API_URL as string | undefined;
  const publicUrl = token && api ? `${api}/api/resto/public/${token}` : '';

  async function authFetch(path: string, body: any) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify(body)
    });
    return { res, json: await res.json().catch(() => ({})) };
  }

  // Best-effort activity log (ignored if the events table isn't there yet).
  async function logShare(kind: string, message: string, meta: any) {
    if (!claimId || !orgId) return;
    try { await supabase.from('resto_job_events').insert({ org_id: orgId, claim_id: claimId, kind, message, meta: meta || {} }); }
    catch { /* ignore */ }
  }

  async function loadAll() {
    if (!claimId) return;
    const [{ data: claim }, { data: sh }] = await Promise.all([
      supabase.from('resto_claims').select('org_id, policyholder_name, policyholder_phone, policyholder_email').eq('id', claimId).maybeSingle(),
      supabase.rpc('resto_list_claim_shares', { p_claim_id: claimId })
    ]);
    if (claim?.org_id) setOrgId(claim.org_id);
    if (claim?.policyholder_name) setClaimName(claim.policyholder_name);
    if (claim?.policyholder_email) setToEmail(claim.policyholder_email);
    setShares((sh as ShareRow[]) ?? []);
    if (api) {
      try {
        const { res, json } = await authFetch('/api/resto/share-link', { claimId });
        if (res.ok && json.token) { setToken(json.token); setLinkErr(null); }
        else setLinkErr((json && json.error) || `share link failed (${res.status})`);
      } catch { setLinkErr('could not reach the report service'); }
    }
  }
  useEffect(() => { void loadAll(); }, [claimId]);

  async function copyLink() {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  }
  async function nativeShare() {
    if (!publicUrl) return;
    if (navigator.share) { try { await navigator.share({ title: 'Restoration report', url: publicUrl }); } catch { /* cancelled */ } }
    else void copyLink();
  }

  // SMS goes through Telnyx (business number) and is logged server-side.

  // Email opens the user's own mail app (no server send). Logged best-effort.
  const mailHref = publicUrl
    ? `mailto:${toEmail.trim()}?subject=${encodeURIComponent('Restoration report' + (claimName ? ' - ' + claimName : ''))}&body=${encodeURIComponent(`View the restoration report here:\n\n${publicUrl}`)}`
    : undefined;

  async function invite() {
    setMsg(null);
    const e = inviteEmail.trim();
    if (!e) { setMsg({ kind: 'err', text: 'Enter an email.' }); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('resto_share_claim', { p_claim_id: claimId, p_email: e, p_role: role });
      if (error) { setMsg({ kind: 'err', text: error.message }); return; }
      const res = data as { ok: boolean; error?: string };
      if (!res?.ok) { setMsg({ kind: 'err', text: ERR[res?.error ?? ''] ?? 'Could not share.' }); return; }
      setInviteEmail(''); setMsg({ kind: 'ok', text: `Shared with ${e}.` });
      const { data: sh } = await supabase.rpc('resto_list_claim_shares', { p_claim_id: claimId });
      setShares((sh as ShareRow[]) ?? []);
    } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!confirm('Revoke access for this person?')) return;
    await supabase.from('resto_claim_shares').delete().eq('id', id);
    const { data: sh } = await supabase.rpc('resto_list_claim_shares', { p_claim_id: claimId });
    setShares((sh as ShareRow[]) ?? []);
  }

  return (
    <div>
      <SubHeader title="Share" subtitle="Send the report or give an account access" />

      <div className="p-4 space-y-4">
        {/* ---- Send report (public link, no account needed) ---- */}
        <div className="card space-y-3">
          <div className="text-sm font-bold flex items-center gap-1.5"><Link2 size={15} className="text-brand" /> Send report</div>

          {!api && <p className="text-xs text-red-500">Sending is not configured (missing VITE_API_URL).</p>}
          {api && !publicUrl && linkErr && (
            <p className="text-xs text-red-500 leading-snug">Link unavailable: {linkErr}. Confirm the backend is deployed with the share routes and that migration 0022 (public_token) has been run.</p>
          )}

          {api && (
            <>
              <div className="flex gap-2">
                <button onClick={copyLink} disabled={!publicUrl} className="btn-soft flex-1 py-2.5 text-sm disabled:opacity-50">
                  {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}
                </button>
                <button onClick={nativeShare} disabled={!publicUrl} className="btn-soft flex-1 py-2.5 text-sm disabled:opacity-50">
                  <ShareIcon size={15} /> Share
                </button>
              </div>

              <a href={publicUrl || undefined} target="_blank" rel="noreferrer"
                 className={`btn-primary w-full py-2.5 text-sm justify-center ${!publicUrl ? 'opacity-50 pointer-events-none' : ''}`}>
                <ExternalLink size={15} /> Open / download PDF report
              </a>

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div className="flex gap-2">
                  <input className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                         placeholder="Email address" type="email" autoCapitalize="none" value={toEmail} onChange={e => setToEmail(e.target.value)} />
                  <a href={mailHref}
                     onClick={() => publicUrl && logShare('share_email', `Report emailed to ${toEmail.trim() || 'recipient'}`, { to: toEmail.trim() })}
                     className={`btn-primary px-4 ${!publicUrl ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Mail size={15} /> Email
                  </a>
                </div>
                {sendMsg && (
                  <div className={`text-xs font-medium rounded-xl px-3 py-2 ${sendMsg.kind === 'err' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                    {sendMsg.text}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Anyone with this link can view or download the report PDF, no login needed. Email opens your mail app. Opens and shares are logged to the job.
              </p>
            </>
          )}
        </div>

        {/* ---- Team access (accounts) ---- */}
        <div className="card space-y-2.5">
          <div className="text-sm font-bold flex items-center gap-1.5"><UserPlus size={15} className="text-brand" /> Give an account access</div>
          <input className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                 placeholder="name@company.com" type="email" autoCapitalize="none" autoCorrect="off"
                 value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
          <div className="flex gap-2">
            <select className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky"
                    value={role} onChange={e => setRole(e.target.value)}>
              <option value="viewer">Viewer (read only)</option>
              <option value="estimator">Estimator (read only)</option>
              <option value="editor">Editor (can edit the job)</option>
            </select>
            <button onClick={invite} disabled={busy} className="btn-soft px-4 disabled:opacity-50">
              {busy ? 'Adding...' : 'Add'}
            </button>
          </div>
          {msg && (
            <div className={`text-xs font-medium rounded-xl px-3 py-2 ${msg.kind === 'err' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
              {msg.text}
            </div>
          )}
          <p className="text-[11px] text-gray-400">For a teammate, sub, or adjuster with a Restoration Docs login. Editors can add and change job data; viewers and estimators are read-only.</p>
        </div>

        {shares.length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">People with account access</div>
            <div className="space-y-2">
              {shares.map(s => (
                <div key={s.id} className="card flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0 font-bold text-sm">
                    {(s.email ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{s.email ?? 'Unknown user'}</div>
                    <div className="text-[11px] text-gray-400 font-medium capitalize">{s.role} · {s.role === 'editor' ? 'can edit' : 'read only'}</div>
                  </div>
                  <button onClick={() => revoke(s.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}