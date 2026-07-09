import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Image as ImageIcon, X, MapPin, ChevronLeft as Prev, ChevronRight as Next } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { signedUrl } from '../lib/storage';

interface Media {
  id: string; storage_path: string; caption: string | null;
  captured_at: string | null; lat: number | null; lng: number | null; room_id: string | null;
}
interface Room { id: string; name: string | null }

export default function ClaimPhotos() {
  const { claimId } = useParams();
  const nav = useNavigate();
  const [photos, setPhotos] = useState<Media[]>([]);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!claimId) return;
      const { data } = await supabase.from('resto_media')
        .select('id, storage_path, caption, captured_at, lat, lng, room_id')
        .eq('claim_id', claimId).eq('type', 'photo').order('captured_at', { ascending: false });
      const rows = (data as Media[]) ?? [];
      setPhotos(rows);
      const roomIds = [...new Set(rows.map(r => r.room_id).filter(Boolean))];
      if (roomIds.length) {
        const { data: rm } = await supabase.from('resto_rooms').select('id, name').in('id', roomIds as string[]);
        const map: Record<string, string> = {};
        (rm as Room[] ?? []).forEach(r => { map[r.id] = r.name || 'Room'; });
        setRooms(map);
      }
      const entries = await Promise.all(rows.map(async r => [r.id, await signedUrl(r.storage_path)] as const));
      setUrls(Object.fromEntries(entries.filter(([, u]) => u)) as Record<string, string>);
      setLoading(false);
    })();
  }, [claimId]);

  // group by room, preserving recency order of rooms
  const byRoom: { roomId: string; label: string; items: Media[] }[] = [];
  const seen: Record<string, number> = {};
  for (const p of photos) {
    const key = p.room_id ?? 'none';
    if (seen[key] == null) { seen[key] = byRoom.length; byRoom.push({ roomId: key, label: p.room_id ? (rooms[p.room_id] ?? 'Room') : 'Unassigned', items: [] }); }
    byRoom[seen[key]].items.push(p);
  }

  const stamp = (p: Media) => {
    const parts: string[] = [];
    if (p.captured_at) { try { parts.push(new Date(p.captured_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })); } catch { /* ignore */ } }
    return parts.join(' · ');
  };

  const view = viewIdx != null ? photos[viewIdx] : null;

  return (
    <div className="pb-10">
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav(`/claims/${claimId}`)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-[21px] leading-tight flex items-center gap-2"><ImageIcon size={22} /> Photos</div>
        <div className="opacity-75 text-[13px] font-medium mt-0.5">{photos.length} photo{photos.length === 1 ? '' : 's'} across the job</div>
      </div>

      <div className="px-4 mt-4 space-y-5">
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}
        {!loading && photos.length === 0 && (
          <p className="text-gray-400 text-sm">No photos yet. Open a room and capture photos, they'll gather here as the job's visual record.</p>
        )}

        {byRoom.map(group => (
          <div key={group.roomId}>
            <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">{group.label} · {group.items.length}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {group.items.map(p => {
                const gi = photos.indexOf(p);
                return (
                  <button key={p.id} onClick={() => setViewIdx(gi)} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 active:scale-[.98] transition">
                    {urls[p.id] ? <img src={urls[p.id]} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={18} className="text-gray-300" /></div>}
                    {p.lat != null && p.lng != null && <span className="absolute bottom-1 right-1 bg-navy/70 text-white rounded-md p-0.5"><MapPin size={9} /></span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {view && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          <div className="safe-top px-4 pt-3 pb-2 flex items-center justify-between text-white">
            <div className="text-sm font-semibold">{viewIdx! + 1} / {photos.length}</div>
            <button onClick={() => setViewIdx(null)} className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><X size={18} /></button>
          </div>
          <div className="flex-1 flex items-center justify-center relative">
            {urls[view.id] && <img src={urls[view.id]} className="max-w-full max-h-full object-contain" />}
            {viewIdx! > 0 && <button onClick={() => setViewIdx(viewIdx! - 1)} className="absolute left-2 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"><Prev size={22} /></button>}
            {viewIdx! < photos.length - 1 && <button onClick={() => setViewIdx(viewIdx! + 1)} className="absolute right-2 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"><Next size={22} /></button>}
          </div>
          <div className="safe-bottom px-4 py-3 text-white">
            {view.caption && <div className="text-sm font-medium">{view.caption}</div>}
            <div className="text-[11px] opacity-70 mt-0.5 flex items-center gap-2 flex-wrap">
              {view.room_id && rooms[view.room_id] && <span>{rooms[view.room_id]}</span>}
              {stamp(view) && <span>· {stamp(view)}</span>}
              {view.lat != null && view.lng != null && (
                <a href={`https://maps.google.com/?q=${view.lat},${view.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  <MapPin size={11} /> {Number(view.lat).toFixed(5)}, {Number(view.lng).toFixed(5)}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}