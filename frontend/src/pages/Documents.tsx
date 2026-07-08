import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, FilePlus, Download, X, ChevronRight, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SubHeader } from '../components/SubHeader';

const API = import.meta.env.VITE_API_URL;

interface Doc {
  id: string; title: string | null; type: string; status: string;
  storage_path: string | null; created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  preliminary_report: 'Preliminary Report', drying_report: 'Drying Report',
  schedule_of_loss: 'Schedule of Loss', full_export: 'Full Report', upload: 'Upload', esx: 'Xactimate ESX'
};
const docName = (d: Doc) => d.title || TYPE_LABEL[d.type] || 'Report';

export default function Documents() {
  const { claimId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ doc: Doc; url: string | null; loading: boolean; error: string | null } | null>(null);

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
      if (!res.ok) { const e = await res.json().catch(() => ({} as any)); throw new Error(e.error || res.statusText); }
      await load();
    } catch (err: any) {
      alert('Report failed: ' + (err?.message ?? 'unknown'));
    } finally { setBusy(false); }
  }

  // Open a details + preview sheet. The signed URL is fetched here (once), so the
  // "Open PDF" control in the sheet can be a plain anchor — no window.open after an
  // await, which is what the mobile popup blocker was killing.
  async function openDoc(d: Doc) {
    setPreview({ doc: d, url: null, loading: true, error: null });
    if (!d.storage_path) { setPreview({ doc: d, url: null, loading: false, error: 'No file is stored for this report yet.' }); return; }
    const { data, error } = await supabase.storage.from('resto-media').createSignedUrl(d.storage_path, 3600);
    if (error || !data?.signedUrl) { setPreview({ doc: d, url: null, loading: false, error: error?.message || 'Could not load the file. It may still be generating.' }); return; }
    setPreview({ doc: d, url: data.signedUrl, loading: false, error: null });
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
          <button key={d.id} onClick={() => openDoc(d)} className="card w-full flex items-center gap-3 text-left active:scale-[.99] transition">
            <div className="w-11 h-11 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0"><FileText size={19} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-snug break-words">{docName(d)}</div>
              <div className="text-xs text-gray-400 capitalize mt-0.5">{d.status.replace('_', ' ')} · {new Date(d.created_at).toLocaleDateString()}</div>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </button>
        ))}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col">
          <div className="safe-top px-4 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-navy text-sm truncate">{docName(preview.doc)}</div>
              <div className="text-[11px] text-gray-400 capitalize">{preview.doc.status.replace('_', ' ')} · {new Date(preview.doc.created_at).toLocaleString()}</div>
            </div>
            <button onClick={() => setPreview(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><X size={18} /></button>
          </div>

          {preview.loading && <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading preview…</div>}
          {preview.error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <FileText size={32} className="text-gray-300" />
              <p className="text-sm text-gray-500">{preview.error}</p>
            </div>
          )}
          {preview.url && (
            <iframe src={preview.url} title="Report preview" className="flex-1 w-full bg-gray-100" />
          )}

          {preview.url && (
            <div className="px-4 py-3 border-t border-gray-100 safe-bottom flex gap-2">
              <a href={preview.url} target="_blank" rel="noreferrer" className="btn-soft flex-1 py-3 justify-center text-sm">
                <ExternalLink size={16} /> Open in new tab
              </a>
              <a href={preview.url} download={`${docName(preview.doc).replace(/\s+/g, '_')}.pdf`} className="btn-primary flex-1 py-3 justify-center text-sm">
                <Download size={16} /> Download PDF
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}