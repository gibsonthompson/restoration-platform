import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Upload, FilePlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SubHeader } from '../components/SubHeader';

interface Doc { id: string; title: string | null; type: string; status: string; created_at: string; }

// Claim-level documents: generated reports + uploads, with status filters and a
// Generate Report action. Generation itself calls the backend (/api/resto/report),
// which is stubbed; the list + statuses are wired.
export default function Documents() {
  const { claimId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    if (!claimId) return;
    supabase.from('resto_documents').select('id, title, type, status, created_at')
      .eq('claim_id', claimId).order('created_at', { ascending: false })
      .then(({ data }) => setDocs((data as Doc[]) ?? []));
  }, [claimId]);

  return (
    <div>
      <SubHeader title="Documents" />
      <div className="p-4 space-y-3">
        <div className="flex gap-2 text-xs">
          {['Missing Information', 'Needs Signature', 'Signed'].map(s => (
            <span key={s} className="border rounded-full px-3 py-1 text-gray-500">{s}</span>
          ))}
        </div>

        {docs.length === 0 && <p className="text-gray-400 text-sm">No documents yet.</p>}
        {docs.map(d => (
          <div key={d.id} className="bg-white border rounded p-3 flex items-center gap-3">
            <FileText size={18} className="text-brand" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{d.title ?? d.type}</div>
              <div className="text-xs text-gray-400">{d.status} · {new Date(d.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <button className="flex-1 border rounded py-3 text-sm font-medium flex items-center justify-center gap-1 text-gray-600">
            <Upload size={16} /> Upload
          </button>
          <button onClick={() => alert('Report generation: backend module (/api/resto/report), not built yet.')}
                  className="flex-1 bg-brand text-white rounded py-3 text-sm font-medium flex items-center justify-center gap-1">
            <FilePlus size={16} /> Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}