import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, FilePlus, Download, X, ChevronRight, ExternalLink , Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SubHeader } from '../components/SubHeader';
import { PdfPreview } from '../components/PdfPreview';

const API = import.meta.env.VITE_API_URL;

interface Doc {
  id: string; title: string | null; type: string; status: string;
  storage_path: string | null; created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  preliminary_report: 'Preliminary Report', drying_report: 'Drying Report', drying_log: 'Daily Drying Log',
  schedule_of_loss: 'Schedule of Loss', full_export: 'Full Report', upload: 'Upload', esx: 'Xactimate ESX'
};
const docName = (d: Doc) => d.title || TYPE_LABEL[d.type] || 'Report';

export default function Documents() {
  const { claimId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLog, setBusyLog] = useState(false);
  const [preview, setPreview] = useState<{ doc: Doc; url: string | null; downloadUrl: string | null; loading: boolean; error: string | null } | null>(null);

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

  async function generateDryingLog() {
    if (!claimId) return;
    if (!API) { alert('Report service not configured. Set VITE_API_URL in Vercel.'); return; }
    setBusyLog(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API}/api/resto/drying-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ claimId })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as any)); throw new Error(e.error || res.statusText); }
      await load();
    } catch (err: any) {
      alert('Drying log failed: ' + (err?.message ?? 'unknown'));
    } finally { setBusyLog(false); }
  }

  // Open a details + preview sheet. The signed URL is fetched here (once), so the
  // "Open PDF" control in the sheet can be a plain anchor — no window.open after an
  // await, which is what the mobile popup blocker was killing.
  async function deleteDoc(d: Doc) {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    try {
      if (d.storage_path) await supabase.storage.from('resto-media').remove([d.storage_path]);
      await supabase.from('resto_documents').delete().eq('id', d.id);
      await load();
    } catch (e: any) { alert('Could not delete: ' + (e?.message ?? 'unknown')); }
  }

  async function openDoc(d: Doc) {
    setPreview({ doc: d, url: null, downloadUrl: null, loading: true, error: null });
    if (!d.storage_path) { setPreview({ doc: d, url: null, downloadUrl: null, loading: false, error: 'No file is stored for this report yet.' }); return; }
    // Serve through our own domain (Vercel /api proxy -> backend) so the Supabase host
    // and its random object name are never exposed. Clean filename in the path means a
    // clean name when saved or shared onward. Auth rides in ?t= (the PDF viewer/anchors
    // can't send an Authorization header).
    const { data: { session } } = await supabase.auth.getSession();
    const t = session?.access_token;
    if (!t) { setPreview({ doc: d, url: null, downloadUrl: null, loading: false, error: 'Please sign in again.' }); return; }
    const clean = docName(d).replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
    const base = `${window.location.origin}/api/resto/document/${d.id}/${clean}.pdf?t=${encodeURIComponent(t)}`;
    setPreview({ doc: d, url: base, downloadUrl: `${base}&download=1`, loading: false, error: null });
  }

  return (
    <div>
      <SubHeader title="Documents" />
      <div className="p-4 space-y-3">
        <button onClick={generate} disabled={busy} className="btn-primary w-full py-3.5 disabled:opacity-60">
          <FilePlus size={17} /> {busy ? 'Generating report…' : 'Generate Full Report'}
        </button>
        <button onClick={generateDryingLog} disabled={busyLog} className="btn-soft w-full py-3 text-sm disabled:opacity-60">
          <FileText size={16} /> {busyLog ? 'Generating drying log…' : 'Generate Daily Drying Log'}
        </button>

        {docs.length === 0 && (
          <p className="text-gray-400 text-sm px-1 pt-1">No reports yet. Tap Generate Full Report to build a carrier-ready PDF from this claim.</p>
        )}

        {docs.map(d => (
          <div key={d.id} onClick={() => openDoc(d)} className="card w-full flex items-center gap-3 text-left active:scale-[.99] transition cursor-pointer">
            <div className="w-11 h-11 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0"><FileText size={19} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-snug break-words">{docName(d)}</div>
              <div className="text-xs text-gray-400 capitalize mt-0.5">{d.status.replace('_', ' ')} · {new Date(d.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); void deleteDoc(d); }} className="text-gray-300 hover:text-red-500 shrink-0 p-1"><Trash2 size={16} /></button>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </div>
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
            <div className="flex-1 overflow-y-auto px-3 py-3 bg-gray-100">
              <PdfPreview url={preview.url} />
            </div>
          )}

          {preview.url && (
            <div className="px-4 pt-2 pb-3 border-t border-gray-100 safe-bottom">
              <a href={preview.downloadUrl || preview.url} className="btn-primary w-full py-3 justify-center text-sm">
                <Download size={16} /> Download PDF
              </a>
              <p className="text-[11px] text-gray-400 text-center mt-2 leading-snug">
                On iPhone, tap <span className="font-semibold">Download</span>, then the share icon and <span className="font-semibold">"Save to Files"</span>. On Android/desktop it saves straight to your downloads.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}