import { useState } from 'react';
import { useOrg } from '../context/OrgContext';

// Shown after signup when the user has no org. Calls resto_create_org() which
// atomically creates org + owner membership + settings (bypassing the RLS
// chicken-and-egg). Surfaces any RPC error so a failure is never silent.
export default function CreateOrg() {
  const { createOrg } = useOrg();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const n = name.trim();
    if (!n) return;
    setBusy(true); setErr(null);
    try {
      await createOrg(n);
      // On success OrgContext.load() runs; activeOrg populates and ProtectedRoute
      // renders the app. No navigation needed here.
    } catch (e: any) {
      setErr(e?.message || 'Could not create your workspace. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-[100dvh] flex items-center justify-center p-6 bg-[#E4E9F0]">
      <div className="card w-full max-w-sm !p-6 space-y-4">
        <img src="/documate-logo.svg" alt="DocuMate" className="h-7 w-auto mx-auto" />
        <div className="text-center">
          <h1 className="font-display font-bold text-xl text-navy">Name your company</h1>
          <p className="text-sm text-gray-500 mt-1">This is your workspace. You’ll be the owner.</p>
        </div>
        {err && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</p>}
        <input
          className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[16px] focus:outline-none focus:border-sky bg-white"
          placeholder="e.g. Reliable Solutions"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          autoFocus
        />
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          className="btn-primary w-full py-3.5 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create workspace'}
        </button>
      </div>
    </div>
  );
}