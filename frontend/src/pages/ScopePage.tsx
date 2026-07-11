import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Sparkles, ClipboardList, Check, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ScopeItem { task: string; justification?: string; standard?: string }
interface ScopeRoom { room: string; items: ScopeItem[] }
interface ScopeContent { summary?: string; rooms?: ScopeRoom[]; raw?: string }
interface ScopeRow { id: string; content: ScopeContent; summary: string | null; model: string | null; created_at: string }

// What the scope generator actually reads. The AI can only justify what you
// documented, so a claim with no readings and no moisture map produces a thin
// scope that an adjuster will cut. Show the tech the inputs, and link them
// straight to the page that fills each gap.
interface Input { id: string; label: string; why: string; ok: boolean; to: string; required: boolean }

export default function ScopePage() {
  const { claimId } = useParams();
  const nav = useNavigate();
  const [scope, setScope] = useState<ScopeRow | null>(null);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showInputs, setShowInputs] = useState(false);

  async function loadLatest() {
    if (!claimId) return;
    const { data } = await supabase.from('resto_scopes').select('*')
      .eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setScope((data as ScopeRow) ?? null);
  }

  async function loadInputs() {
    if (!claimId) return;
    const { data: claim } = await supabase.from('resto_claims')
      .select('type_of_loss, category_of_water, class_of_water, date_of_loss').eq('id', claimId).single();

    const { data: structs } = await supabase.from('resto_structures').select('id').eq('claim_id', claimId);
    const structIds = ((structs as { id: string }[]) ?? []).map(s => s.id);

    let roomIds: string[] = [];
    if (structIds.length) {
      const { data: rm } = await supabase.from('resto_rooms').select('id').in('structure_id', structIds);
      roomIds = ((rm as { id: string }[]) ?? []).map(r => r.id);
    }

    const [sketches, notes, photos, chambers] = await Promise.all([
      roomIds.length ? supabase.from('resto_sketches').select('canvas_json').in('room_id', roomIds) : Promise.resolve({ data: [] as any[] }),
      roomIds.length ? supabase.from('resto_notes').select('id').in('room_id', roomIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('resto_media').select('id').eq('claim_id', claimId).eq('type', 'photo'),
      structIds.length ? supabase.from('resto_drying_chambers').select('id, structure_id').in('structure_id', structIds) : Promise.resolve({ data: [] as any[] })
    ]);

    const chamberRows = (chambers.data as { id: string; structure_id: string }[]) ?? [];
    const chamberIds = chamberRows.map(c => c.id);
    const [readings, equipment] = await Promise.all([
      chamberIds.length ? supabase.from('resto_readings').select('id').in('chamber_id', chamberIds) : Promise.resolve({ data: [] as any[] }),
      chamberIds.length ? supabase.from('resto_equipment').select('id, placed_at').in('chamber_id', chamberIds) : Promise.resolve({ data: [] as any[] })
    ]);

    const hasMap = ((sketches.data as any[]) ?? []).some(s => {
      const cj = s.canvas_json || {};
      return (cj.wetAreas && cj.wetAreas.length) || (cj.walls && cj.walls.length);
    });

    const c: any = claim ?? {};
    const structureId = structIds[0];
    const hydroTo = structureId ? `/claims/${claimId}/structures/${structureId}/hydro` : `/claims/${claimId}`;

    setInputs([
      {
        id: 'loss', required: true,
        label: 'Loss details (category and class)',
        why: 'Category drives antimicrobial and tear-out. Class drives the drying plan. Without them the scope cannot be defended.',
        ok: !!c.type_of_loss && c.category_of_water != null && c.class_of_water != null && !!c.date_of_loss,
        to: `/claims/${claimId}/edit`
      },
      {
        id: 'rooms', required: true,
        label: 'Structures and rooms',
        why: 'The scope is written room by room. No rooms, no scope.',
        ok: roomIds.length > 0,
        to: `/claims/${claimId}`
      },
      {
        id: 'map', required: true,
        label: 'Moisture map with wet areas',
        why: 'The wet areas you paint become the measured square footage behind extraction, tear-out, and drywall lines. This is where the quantities come from.',
        ok: hasMap,
        to: `/claims/${claimId}`
      },
      {
        id: 'photos', required: false,
        label: 'Photos',
        why: 'Every billed line needs a photo the adjuster can see, or the line gets cut.',
        ok: (((photos.data as any[]) ?? []).length) > 0,
        to: `/claims/${claimId}/photos`
      },
      {
        id: 'readings', required: false,
        label: 'Drying readings',
        why: 'Psychrometrics and material moisture prove the drying worked and that the equipment came off at the right time.',
        ok: (((readings.data as any[]) ?? []).length) > 0,
        to: hydroTo
      },
      {
        id: 'equipment', required: false,
        label: 'Equipment with placement dates',
        why: 'Equipment-days is the most scrubbed line on a mitigation invoice. Dates are the justification.',
        ok: (((equipment.data as any[]) ?? []).some((e: any) => e.placed_at)),
        to: hydroTo
      },
      {
        id: 'notes', required: false,
        label: 'Field notes',
        why: 'Notes give the AI the context a photo cannot: what you found, what you did, and why.',
        ok: (((notes.data as any[]) ?? []).length) > 0,
        to: `/claims/${claimId}/notes`
      }
    ]);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadLatest(), loadInputs()]);
      setLoading(false);
    })();
  }, [claimId]);

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
  const missingRequired = inputs.filter(i => i.required && !i.ok);
  const missingOptional = inputs.filter(i => !i.required && !i.ok);
  const readyCount = inputs.filter(i => i.ok).length;

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
        {/* What this is, and what it is for */}
        <div className="card">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy text-white flex items-center justify-center shrink-0"><Info size={16} /></div>
            <div className="min-w-0">
              <div className="font-bold text-[14px] text-navy">What the scope of work is</div>
              <p className="text-[12px] text-gray-500 leading-relaxed mt-1">
                A room-by-room list of the work the loss actually requires, with the standard and the reason behind each task. It is what you hand an adjuster to justify the estimate, and what your crew works from. DocuMate drafts it from what you documented in the field, so it only says what you can prove.
              </p>
            </div>
          </div>
        </div>

        {/* What it reads, and what is missing */}
        {!loading && inputs.length > 0 && (
          <div className="card !p-0 overflow-hidden">
            <button onClick={() => setShowInputs(s => !s)} className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50 transition">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${missingRequired.length ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>
                {missingRequired.length ? <AlertTriangle size={17} /> : <Check size={17} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14px] text-navy">
                  {missingRequired.length
                    ? `${missingRequired.length} thing${missingRequired.length === 1 ? '' : 's'} the scope still needs`
                    : missingOptional.length
                      ? 'Ready to generate, but thin in places'
                      : 'All inputs documented'}
                </div>
                <div className="text-[11px] text-gray-400 leading-snug">{readyCount} of {inputs.length} inputs captured. Tap to see what the AI reads.</div>
              </div>
              <ChevronRight size={16} className={`text-gray-300 shrink-0 transition-transform ${showInputs ? 'rotate-90' : ''}`} />
            </button>

            {showInputs && (
              <div className="border-t border-gray-100 divide-y divide-gray-100">
                {inputs.map(i => (
                  <button key={i.id} onClick={() => nav(i.to)} className="w-full flex items-start gap-3 p-3.5 text-left active:bg-gray-50 transition">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${i.ok ? 'bg-emerald-50 text-emerald-600' : i.required ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                      {i.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[13px] font-bold ${i.ok ? 'text-navy' : i.required ? 'text-amber-800' : 'text-gray-600'}`}>{i.label}</span>
                        {i.required && !i.ok && <span className="chip bg-amber-100 text-amber-700">Needed</span>}
                      </div>
                      <p className="text-[11.5px] text-gray-500 leading-relaxed mt-0.5">{i.why}</p>
                    </div>
                    <ChevronRight size={15} className="text-gray-300 shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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