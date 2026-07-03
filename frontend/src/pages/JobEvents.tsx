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

// What lands in the log, shown in the empty state so the tech knows what to expect.
const EMPTY_ROWS: { icon: any; tint: string; title: string; sub: string }[] = [
  { icon: FileText, tint: 'bg-slate-100 text-slate-600', title: 'Report generated', sub: 'When you export the claim report' },
  { icon: Link2, tint: 'bg-sky-soft text-sky-deep', title: 'Link shared', sub: 'When you create a public report link' },
  { icon: MessageSquare, tint: 'bg-sky-soft text-sky-deep', title: 'Text sent', sub: 'When the report is texted to the client' },
  { icon: Mail, tint: 'bg-aqua-soft text-aqua-deep', title: 'Email sent', sub: 'When the report is emailed' }
];

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
          <div className="flex flex-col items-center text-center px-6 pt-12 pb-6">
            <div className="w-16 h-16 rounded-2xl bg-sky-soft text-sky-deep flex items-center justify-center mb-4">
              <Activity size={28} />
            </div>
            <h3 className="font-display font-bold text-[17px] text-navy">No activity yet</h3>
            <p className="text-sm text-gray-500 mt-1.5 max-w-[290px] leading-relaxed">
              Every time you send this claim's report, it's logged here with a timestamp, so you keep a defensible record of what went out and when.
            </p>

            <div className="w-full max-w-[300px] mt-7 space-y-3 text-left">
              {EMPTY_ROWS.map(({ icon: Icon, tint, title, sub }) => (
                <div key={title} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tint}`}><Icon size={15} /></div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-navy leading-tight">{title}</div>
                    <div className="text-[11px] text-gray-400">{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 mt-7 max-w-[280px]">
              Send a report from the Share tab to start the log.
            </p>
          </div>
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