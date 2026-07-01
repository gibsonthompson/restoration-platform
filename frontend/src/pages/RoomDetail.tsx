import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import { uploadMedia, signedUrl } from '../lib/storage';
import { ContentsTab } from '../features/contents/ContentsTab';
import { SketchesTab } from '../features/sketch/SketchesTab';
import type { Note, Room } from '../types/models';

type Tab = 'photos' | 'notes' | 'contents' | 'sketches';

interface MediaRow { id: string; storage_path: string; type: string; }

// Room workspace: four collections. Photos and Notes are wired end to end;
// Contents and Sketches are honest placeholders pending their modules.
export default function RoomDetail() {
  const { claimId, roomId } = useParams();
  const { activeOrg } = useOrg();
  const [room, setRoom] = useState<Room | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  const [notes, setNotes] = useState<Note[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadNotes() {
    if (!roomId) return;
    const { data } = await supabase.from('resto_notes').select('*')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    setNotes((data as Note[]) ?? []);
  }

  async function loadMedia() {
    if (!roomId) return;
    const { data } = await supabase.from('resto_media').select('id, storage_path, type')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    const rows = (data as MediaRow[]) ?? [];
    setMedia(rows);
    // Resolve signed URLs for the private bucket.
    const entries = await Promise.all(rows.map(async r => [r.id, await signedUrl(r.storage_path)] as const));
    setUrls(Object.fromEntries(entries.filter(([, u]) => u)) as Record<string, string>);
  }

  useEffect(() => {
    if (!roomId) return;
    supabase.from('resto_rooms').select('*').eq('id', roomId).single()
      .then(({ data }) => setRoom(data as Room));
    void loadNotes();
    void loadMedia();
  }, [roomId]);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
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
      if (fileRef.current) fileRef.current.value = '';
    }
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

  if (!room) return <div className="p-4 text-gray-400">Loading...</div>;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'photos', label: 'Photos', badge: media.length || undefined },
    { id: 'notes', label: 'Notes', badge: notes.length || undefined },
    { id: 'contents', label: 'Contents' },
    { id: 'sketches', label: 'Sketches' }
  ];

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
            <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment"
                   multiple className="hidden" onChange={onPickFiles} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="btn-primary w-full py-3 disabled:opacity-50">
              <Camera size={18} /> {uploading ? 'Uploading...' : 'Add photos / video'}
            </button>
            {media.length === 0 && <p className="text-gray-400 text-sm mt-3 px-1">No photos yet.</p>}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {media.map(m => (
                <div key={m.id} className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
                  {urls[m.id]
                    ? <img src={urls[m.id]} className="w-full h-full object-cover" />
                    : <div className="w-full h-full animate-pulse bg-gray-200" />}
                </div>
              ))}
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
    </div>
  );
}