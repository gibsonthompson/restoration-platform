import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import { uploadMedia, signedUrl } from '../lib/storage';
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
      <div className="flex border-b bg-white sticky top-0 z-10">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm relative ${tab === t.id ? 'text-brand border-b-2 border-brand font-medium' : 'text-gray-500'}`}>
            {t.label}{t.badge ? <span className="ml-1 text-[10px] bg-brand text-white rounded-full px-1.5">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'photos' && (
          <div>
            <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment"
                   multiple className="hidden" onChange={onPickFiles} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="w-full bg-brand text-white rounded py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              <Camera size={18} /> {uploading ? 'Uploading...' : 'Add Photos / Video'}
            </button>
            {media.length === 0 && <p className="text-gray-400 text-sm mt-3">No photos yet.</p>}
            <div className="grid grid-cols-3 gap-1 mt-3">
              {media.map(m => (
                <div key={m.id} className="aspect-square bg-gray-100 rounded overflow-hidden">
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
            <button onClick={addNote}
                    className="w-full bg-brand text-white rounded py-3 font-medium flex items-center justify-center gap-1">
              <Plus size={16} /> Add Note
            </button>
            {notes.length === 0 && <p className="text-gray-400 text-sm">There are no notes in this room.</p>}
            {notes.map(n => (
              <div key={n.id} className="bg-white border rounded p-3 whitespace-pre-wrap text-sm">{n.body}</div>
            ))}
          </div>
        )}

        {(tab === 'contents' || tab === 'sketches') && (
          <p className="text-gray-400 text-sm">
            {tab === 'contents'
              ? 'Contents inventory: next module (item photos, descriptions, disposition, Schedule of Loss).'
              : 'Sketches / moisture maps: next module (canvas editor: Move / Draw / Place / Filter / Grid).'}
          </p>
        )}
      </div>
    </div>
  );
}