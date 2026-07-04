import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Plus, X, Microscope, TriangleAlert, Image as ImageIcon, StickyNote } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import { uploadMedia, signedUrl } from '../lib/storage';
import { ContentsTab } from '../features/contents/ContentsTab';
import { SketchesTab } from '../features/sketch/SketchesTab';
import type { Note, Room } from '../types/models';

type Tab = 'photos' | 'notes' | 'contents' | 'sketches';

interface MediaRow { id: string; storage_path: string; type: string; caption: string | null; }
interface MoldScan {
  id: string; media_id: string; verdict: string; confidence: number | null;
  indicators: string[]; recommend_lab_sampling: boolean; summary: string | null;
}

// Verdict visual language for the mold screening result.
const VERDICT: Record<string, { label: string; cls: string; dot: string }> = {
  mold_likely:   { label: 'Mold likely',   cls: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  mold_possible: { label: 'Mold possible', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  mold_unlikely: { label: 'Mold unlikely', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  inconclusive:  { label: 'Inconclusive',  cls: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' }
};
const verdictMeta = (v?: string) => VERDICT[v ?? 'inconclusive'] ?? VERDICT.inconclusive;

// Room workspace: four collections. Photos support a manual AI mold scan.
export default function RoomDetail() {
  const { claimId, roomId } = useParams();
  const { activeOrg } = useOrg();
  const [room, setRoom] = useState<Room | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  const [notes, setNotes] = useState<Note[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [scans, setScans] = useState<Record<string, MoldScan>>({});
  const [viewer, setViewer] = useState<MediaRow | null>(null);
  const [caption, setCaption] = useState('');
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  async function loadNotes() {
    if (!roomId) return;
    const { data } = await supabase.from('resto_notes').select('*')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    setNotes((data as Note[]) ?? []);
  }

  async function loadMedia() {
    if (!roomId) return;
    const { data } = await supabase.from('resto_media').select('id, storage_path, type, caption')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    const rows = (data as MediaRow[]) ?? [];
    setMedia(rows);
    // Resolve signed URLs for the private bucket.
    const entries = await Promise.all(rows.map(async r => [r.id, await signedUrl(r.storage_path)] as const));
    setUrls(Object.fromEntries(entries.filter(([, u]) => u)) as Record<string, string>);
    // Latest mold scan per media.
    const ids = rows.map(r => r.id);
    if (ids.length) {
      const { data: srows } = await supabase.from('resto_mold_scans').select('*')
        .in('media_id', ids).order('created_at', { ascending: false });
      const latest: Record<string, MoldScan> = {};
      ((srows as MoldScan[]) ?? []).forEach(s => { if (!latest[s.media_id]) latest[s.media_id] = s; });
      setScans(latest);
    } else {
      setScans({});
    }
  }

  useEffect(() => {
    if (!roomId) return;
    supabase.from('resto_rooms').select('*').eq('id', roomId).single()
      .then(({ data }) => setRoom(data as Room));
    void loadNotes();
    void loadMedia();
  }, [roomId]);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    if (!files.length || !activeOrg || !claimId || !roomId) return;
    setUploading(true);
    try {
      for (const file of files) {
        const path = await uploadMedia(file, { orgId: activeOrg.id, claimId, roomId });
        await supabase.from('resto_media').insert({
          org_id: activeOrg.id, claim_id: claimId, room_id: roomId,
          type: file.type.startsWith('video') ? 'video' : 'photo',
          storage_path: path, captured_at: new Date().toISOString()
        });
      }
      await loadMedia();
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message ?? 'unknown'));
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  // Keep the viewer's editable note in sync with whichever photo is open.
  useEffect(() => { setCaption(viewer?.caption ?? ''); }, [viewer]);

  async function saveCaption() {
    if (!viewer) return;
    const c = caption.trim();
    if ((viewer.caption ?? '') === c) return;
    await supabase.from('resto_media').update({ caption: c || null }).eq('id', viewer.id);
    setMedia(ms => ms.map(m => (m.id === viewer.id ? { ...m, caption: c || null } : m)));
    setViewer(v => (v ? { ...v, caption: c || null } : v));
  }

  async function addNote() {
    if (!activeOrg || !roomId) return;
    const body = prompt('Note (e.g. measurements / scope)');
    if (!body) return;
    await supabase.from('resto_notes').insert({
      org_id: activeOrg.id, claim_id: claimId, room_id: roomId, body
    });
    void loadNotes();
  }

  async function scanForMold(mediaId: string) {
    const api = import.meta.env.VITE_API_URL;
    if (!api) { alert('Mold scanner is not configured (missing VITE_API_URL).'); return; }
    if (!claimId) return;
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${api}/api/resto/mold-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ claimId, mediaId })
      });
      const json = await res.json();
      if (!res.ok) { alert('Scan failed: ' + (json.error || res.status)); return; }
      setScans(p => ({ ...p, [mediaId]: json.scan as MoldScan }));
    } catch (e: any) {
      alert('Scan failed: ' + (e?.message ?? 'network error'));
    } finally {
      setScanning(false);
    }
  }

  if (!room) return <div className="p-4 text-gray-400">Loading...</div>;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'photos', label: 'Photos', badge: media.length || undefined },
    { id: 'notes', label: 'Notes', badge: notes.length || undefined },
    { id: 'contents', label: 'Contents' },
    { id: 'sketches', label: 'Sketches' }
  ];

  const viewerScan = viewer ? scans[viewer.id] : undefined;

  return (
    <div>
      <SubHeader title={room.name} />
      <div className="px-4 pt-3">
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-soft">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition ${tab === t.id ? 'bg-gradient-to-br from-sky to-sky-deep text-white shadow-sky' : 'text-gray-500'}`}>
              {t.label}{t.badge ? <span className={`ml-1 text-[10px] rounded-full px-1.5 ${tab === t.id ? 'bg-white/25' : 'bg-gray-200 text-gray-600'}`}>{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {tab === 'photos' && (
          <div>
            <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment"
                   multiple className="hidden" onChange={onPickFiles} />
            <input ref={libraryRef} type="file" accept="image/*,video/*"
                   multiple className="hidden" onChange={onPickFiles} />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => cameraRef.current?.click()} disabled={uploading}
                      className="btn-primary py-3 justify-center disabled:opacity-50">
                <Camera size={18} /> Take photo
              </button>
              <button onClick={() => libraryRef.current?.click()} disabled={uploading}
                      className="btn-soft py-3 justify-center disabled:opacity-50">
                <ImageIcon size={18} /> Upload
              </button>
            </div>
            {uploading && <p className="text-[12px] text-sky-deep font-semibold mt-2 px-1">Uploading...</p>}
            {media.length === 0 && <p className="text-gray-400 text-sm mt-3 px-1">No photos yet.</p>}
            {media.length > 0 && <p className="text-[11px] text-gray-400 mt-3 px-1">Tap a photo to view it or scan for mold.</p>}
            <div className="grid grid-cols-3 gap-2 mt-2">
              {media.map(m => {
                const sc = scans[m.id];
                return (
                  <button key={m.id} onClick={() => setViewer(m)}
                          className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden active:scale-[.98] transition">
                    {urls[m.id]
                      ? <img src={urls[m.id]} className="w-full h-full object-cover" />
                      : <div className="w-full h-full animate-pulse bg-gray-200" />}
                    {sc && (
                      <span className={`absolute top-1.5 right-1.5 w-3 h-3 rounded-full ring-2 ring-white ${verdictMeta(sc.verdict).dot}`} />
                    )}
                    {m.caption && (
                      <span className="absolute bottom-1.5 left-1.5 bg-black/50 rounded-md p-1 flex items-center justify-center">
                        <StickyNote size={11} className="text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-2">
            <button onClick={addNote} className="btn-primary w-full py-3">
              <Plus size={16} /> Add note
            </button>
            {notes.length === 0 && <p className="text-gray-400 text-sm">There are no notes in this room.</p>}
            {notes.map(n => (
              <div key={n.id} className="card whitespace-pre-wrap text-sm">{n.body}</div>
            ))}
          </div>
        )}

        {tab === 'contents' && activeOrg && claimId && roomId && (
          <ContentsTab roomId={roomId} claimId={claimId} orgId={activeOrg.id} />
        )}

        {tab === 'sketches' && activeOrg && claimId && roomId && (
          <SketchesTab roomId={roomId} claimId={claimId} orgId={activeOrg.id} />
        )}
      </div>

      {/* Photo viewer + mold scan */}
      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3"
             onClick={() => setViewer(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="relative">
              {urls[viewer.id] && <img src={urls[viewer.id]} className="w-full max-h-[52vh] object-contain bg-gray-900 rounded-t-3xl" />}
              <button onClick={() => setViewer(null)}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Note</span>
                <textarea value={caption} onChange={e => setCaption(e.target.value)} onBlur={saveCaption}
                          placeholder="Add a note about this photo (prints under it in the report)" rows={2}
                          className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-[16px] resize-none focus:outline-none focus:border-sky" />
              </div>
              {viewerScan ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${verdictMeta(viewerScan.verdict).cls}`}>
                      {verdictMeta(viewerScan.verdict).label}
                    </span>
                    <span className="text-xs font-semibold text-gray-400">{viewerScan.confidence ?? 0}% confidence</span>
                  </div>
                  {viewerScan.summary && <p className="text-sm text-gray-600">{viewerScan.summary}</p>}
                  {viewerScan.indicators?.length > 0 && (
                    <ul className="text-[13px] text-gray-500 space-y-1">
                      {viewerScan.indicators.map((ind, i) => (
                        <li key={i} className="flex gap-2"><span className="text-gray-300">•</span>{ind}</li>
                      ))}
                    </ul>
                  )}
                  {viewerScan.recommend_lab_sampling && (
                    <div className="flex gap-2 items-start bg-amber-50 text-amber-800 rounded-xl p-3 text-[13px]">
                      <TriangleAlert size={16} className="shrink-0 mt-0.5" />
                      <span>Confirm with lab or air sampling. This is a visual screening, not a lab diagnosis.</span>
                    </div>
                  )}
                  <button onClick={() => scanForMold(viewer.id)} disabled={scanning}
                          className="btn-soft w-full py-2.5 text-sm disabled:opacity-50">
                    <Microscope size={16} /> {scanning ? 'Scanning...' : 'Scan again'}
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => scanForMold(viewer.id)} disabled={scanning}
                          className="btn-primary w-full py-3 disabled:opacity-50">
                    <Microscope size={18} /> {scanning ? 'Scanning...' : 'Scan for mold'}
                  </button>
                  <p className="text-[11px] text-gray-400 text-center">AI visual screening. Not a lab diagnosis.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}