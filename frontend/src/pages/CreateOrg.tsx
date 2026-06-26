import { useState } from 'react';
import { useOrg } from '../context/OrgContext';

// Shown after signup when the user has no org. Calls resto_create_org() which
// atomically creates org + owner membership + settings (bypassing the RLS
// chicken-and-egg).
export default function CreateOrg() {
  const { createOrg } = useOrg();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try { await createOrg(name.trim()); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Name your company</h1>
        <p className="text-sm text-gray-500">This is your organization. You'll be the owner.</p>
        <input className="w-full border rounded px-3 py-2" placeholder="e.g. Reliable Solutions"
               value={name} onChange={e => setName(e.target.value)} />
        <button onClick={submit} disabled={busy}
                className="w-full bg-brand text-white rounded py-2 font-medium disabled:opacity-50">
          {busy ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}
