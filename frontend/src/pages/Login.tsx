import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message); else nav('/');
  }

  return (
    // Top-aligned (not vertically centered) so the form sits high and the mobile
    // keyboard never covers it. 100dvh tracks the dynamic viewport.
    <div className="min-h-[100dvh] bg-gray-50 flex justify-center px-6 pb-10"
         style={{ paddingTop: 'max(4.5rem, calc(env(safe-area-inset-top) + 2rem))' }}>
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-navy">Sign in</h1>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky"
               placeholder="Email" type="email" autoComplete="email" inputMode="email"
               value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky"
               placeholder="Password" type="password" autoComplete="current-password"
               value={password} onChange={e => setPassword(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        <button onClick={submit} disabled={busy}
                className="w-full bg-brand text-white rounded-xl py-2.5 font-semibold disabled:opacity-50">
          {busy ? '...' : 'Sign in'}
        </button>
        <p className="text-sm text-gray-500">No account? <Link className="text-brand font-semibold" to="/signup">Sign up</Link></p>
      </div>
    </div>
  );
}