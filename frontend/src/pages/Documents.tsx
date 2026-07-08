import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, FilePlus, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SubHeader } from '../components/SubHeader';

const API = import.meta.env.VITE_API_URL;

interface Doc {
  id: string; title: string | null; type: string; status: string;
  storage_path: string | null; created_at: string;
}

// Claim-level documents: generated carrier-ready reports + status, with download.
// Generate Report calls the backend (/api/resto/report) with the user's Supabase
// JWT; the backend builds the PDF, stores it, and records the document.
export default function Documents() {
  const { claimId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!claimId) return;
    const { data } = await supabase.from('resto_documents')
      .select('id, title, type, status, storage_path, created_at')
      .eq('claim_id', claimId).order('created_at', { ascending: false });
    setDocs((data as Doc[]) ?? []);
  }
  useEffect(() => { void load(); }, [claimId]);

  async function generate() {
    if (!claimId) return;
    if (!API) { alert('Report service not configured. Set VITE_API_URL in Vercel.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API}/api/resto/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ claimId })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as any));
        throw new Error(e.error || res.statusText);
      }
      await load();
    } catch (err: any) {
      alert('Report failed: ' + (err?.message ?? 'unknown'));
    } finally {
      setBusy(false);
    }
  }

  async function download(d: Doc) {
    if (!d.storage_path) return;
    const { data } = await supabase.storage.from('resto-media').createSignedUrl(d.storage_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return (
    <div>
      <SubHeader title="Documents" />
      <div className="p-4 space-y-3">
        <button onClick={generate} disabled={busy} className="btn-primary w-full py-3.5 disabled:opacity-60">
          <FilePlus size={17} /> {busy ? 'Generating report…' : 'Generate Full Report'}
        </button>

        {docs.length === 0 && (
          <p className="text-gray-400 text-sm px-1 pt-1">No reports yet. Tap Generate Full Report to build a carrier-ready PDF from this claim.</p>
        )}

        {docs.map(d => (
          <div key={d.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0"><FileText size={18} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">{d.title ?? 'Full Report'}</div>
              <div className="text-xs text-gray-400 capitalize">{d.status} · {new Date(d.created_at).toLocaleDateString()}</div>
            </div>
            {d.storage_path && (
              <button onClick={() => download(d)} className="btn-soft px-3 py-2 text-sm"><Download size={16} /> PDF</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}