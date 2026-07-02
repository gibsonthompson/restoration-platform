import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, Mail, Link2, FileText, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SubHeader } from '../components/SubHeader';

interface JobEvent { id: string; kind: string; message: string | null; created_at: string }

const META: Record<string, { icon: any; tint: string }> = {
  share_sms:   { icon: MessageSquare, tint: 'bg-sky-soft text-sky-deep' },
  share_email: { icon: Mail, tint: 'bg-aqua-soft text-aqua-deep' },
  share_link:  { icon: Link2, tint: 'bg-sky-soft text-sky-deep' },
  report:      { icon: FileText, tint: 'bg-slate-100 text-slate-600' }
};

// Claim activity log. Fed by server-side events (report sends, etc.) so there is
// a defensible record of what went to whom and when.
export default function JobEvents() {
  const { claimId } = useParams();
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!claimId) return;
    supabase.from('resto_job_events').select('id, kind, message, created_at')
      .eq('claim_id', claimId).order('created_at', { ascending: false })
      .then(({ data }) => { setEvents((data as JobEvent[]) ?? []); setLoading(false); });
  }, [claimId]);

  return (
    <div>
      <SubHeader title="Activity" subtitle="Sends and updates on this claim" />
      <div className="p-4">
        {loading && <p className="text-gray-400 text-sm px-1">Loading...</p>}
        {!loading && events.length === 0 && (
          <p className="text-gray-400 text-sm px-1">No activity yet. Sends and updates will appear here.</p>
        )}
        <div className="space-y-2.5">
          {events.map(e => {
            const m = META[e.kind] ?? { icon: Activity, tint: 'bg-gray-100 text-gray-500' };
            const Icon = m.icon;
            return (
              <div key={e.id} className="card flex items-start gap-3 py-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${m.tint}`}><Icon size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{e.message ?? e.kind}</div>
                  <div className="text-[11px] text-gray-400 font-medium mt-0.5">{new Date(e.created_at).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}