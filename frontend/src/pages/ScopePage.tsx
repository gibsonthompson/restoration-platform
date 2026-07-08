import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Sparkles, ClipboardList } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ScopeItem { task: string; justification?: string; standard?: string }
interface ScopeRoom { room: string; items: ScopeItem[] }
interface ScopeContent { summary?: string; rooms?: ScopeRoom[]; raw?: string }
interface ScopeRow { id: string; content: ScopeContent; summary: string | null; model: string | null; created_at: string }

export default function ScopePage() {
  const { claimId } = useParams();
  const nav = useNavigate();
  const [scope, setScope] = useState<ScopeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadLatest() {
    if (!claimId) return;
    const { data } = await supabase.from('resto_scopes').select('*')
      .eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setScope((data as ScopeRow) ?? null);
    setLoading(false);
  }
  useEffect(() => { void loadLatest(); }, [claimId]);

  async function generate() {
    setErr(null);
    const api = import.meta.env.VITE_API_URL;
    if (!api) { setErr('Scope generation is not configured (missing VITE_API_URL).'); return; }
    if (!claimId) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${api}/api/resto/scope`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ claimId })
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error === 'scope not configured' ? 'Scope AI is not enabled on the server yet.' : ('Could not generate scope: ' + (json.error || res.status))); return; }
      await loadLatest();
    } catch (e: any) {
      setErr('Scope generation failed: ' + (e?.message ?? 'error'));
    } finally { setBusy(false); }
  }

  const content = scope?.content;
  const rooms = content?.rooms ?? [];

  return (
    <div>
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav(`/claims/${claimId}`)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-[21px] leading-tight flex items-center gap-2"><ClipboardList size={22} /> Scope of Work</div>
        <div className="opacity-75 text-[13px] font-medium mt-0.5">AI mitigation scope, IICRC S500 / S520</div>
      </div>

      <div className="p-4 space-y-4">
        <button onClick={generate} disabled={busy} className="btn-primary w-full py-3.5 disabled:opacity-60">
          <Sparkles size={18} /> {busy ? 'Generating scope...' : scope ? 'Regenerate scope' : 'Generate scope'}
        </button>
        <p className="text-[12px] text-gray-400 px-1">
          Reads the claim's notes, moisture readings, equipment, mold screening, and drying data, then drafts a room-by-room scope. Review before sending to a carrier.
        </p>

        {err && <div className="bg-red-50 text-red-600 text-sm rounded-2xl px-4 py-3">{err}</div>}

        {loading && <p className="text-gray-400 text-sm px-1">Loading...</p>}

        {!loading && !scope && !busy && (
          <p className="text-gray-400 text-sm px-1">No scope generated yet. Tap Generate scope.</p>
        )}

        {scope && (
          <>
            {content?.summary && (
              <div className="card">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Summary</div>
                <p className="text-sm text-ink leading-relaxed">{content.summary}</p>
              </div>
            )}

            {rooms.map((r, i) => (
              <div key={i} className="card">
                <div className="font-bold text-[15px] mb-2">{r.room}</div>
                <div className="space-y-2.5">
                  {(r.items ?? []).map((it, j) => (
                    <div key={j} className="border-t border-gray-100 first:border-0 pt-2.5 first:pt-0">
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-semibold flex-1">{it.task}</span>
                        {it.standard && <span className="chip bg-sky-soft text-sky-deep shrink-0">{it.standard}</span>}
                      </div>
                      {it.justification && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{it.justification}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {content?.raw && rooms.length === 0 && (
              <div className="card"><pre className="text-xs whitespace-pre-wrap text-ink">{content.raw}</pre></div>
            )}

            <p className="text-[11px] text-gray-400 px-1">
              Generated {new Date(scope.created_at).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}