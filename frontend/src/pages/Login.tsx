import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Droplet } from 'lucide-react';
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
    // Seated in the upper third: high enough that the mobile keyboard clears the
    // button, with real breathing room above so it reads as intentional. The vh
    // offset scales across phone sizes; 100dvh tracks the dynamic viewport.
    <div className="min-h-[100dvh] bg-gray-50 flex justify-center px-6 pb-10"
         style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
      <div className="w-full max-w-sm">
        {/* Brand — replace this block with the app logo when it exists */}
        <div className="flex items-center gap-2.5 mb-9">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky to-sky-deep flex items-center justify-center shadow-soft">
            <Droplet size={22} className="text-white" />
          </div>
          <span className="font-display font-bold text-lg text-navy">Restoration Docs</span>
        </div>

        <h1 className="text-2xl font-bold text-navy">Sign in</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">Welcome back. Sign in to your workspace.</p>

        <div className="space-y-3">
          {err && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</p>}
          <input className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[16px] focus:outline-none focus:border-sky"
                 placeholder="Email" type="email" autoComplete="email" inputMode="email"
                 value={email} onChange={e => setEmail(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[16px] focus:outline-none focus:border-sky"
                 placeholder="Password" type="password" autoComplete="current-password"
                 value={password} onChange={e => setPassword(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
          <button onClick={submit} disabled={busy}
                  className="w-full bg-gradient-to-br from-sky to-sky-deep text-white rounded-xl py-3 font-bold shadow-soft active:scale-[0.99] disabled:opacity-50">
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </div>

        <p className="text-sm text-gray-500 mt-5">No account? <Link className="text-sky-deep font-semibold" to="/signup">Sign up</Link></p>
      </div>
    </div>
  );
}