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
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Sign in</h1>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <input className="w-full border rounded px-3 py-2" placeholder="Email"
               value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" placeholder="Password" type="password"
               value={password} onChange={e => setPassword(e.target.value)} />
        <button onClick={submit} disabled={busy}
                className="w-full bg-brand text-white rounded py-2 font-medium disabled:opacity-50">
          {busy ? '...' : 'Sign in'}
        </button>
        <p className="text-sm text-gray-500">No account? <Link className="text-brand" to="/signup">Sign up</Link></p>
      </div>
    </div>
  );
}
