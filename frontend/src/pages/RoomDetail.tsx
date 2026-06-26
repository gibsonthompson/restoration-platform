import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Note, Room } from '../types/models';

type Tab = 'photos' | 'notes' | 'contents' | 'sketches';

// Mirrors the room workspace with four collections. Photos/Contents/Sketches are
// scaffolded as tabs; Notes is wired end-to-end as the reference implementation
// (and is the input the AI scope engine will consume).
export default function RoomDetail() {
  const { roomId } = useParams();
  const { activeOrg } = useOrg();
  const [room, setRoom] = useState<Room | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  const [notes, setNotes] = useState<Note[]>([]);

  async function loadNotes() {
    if (!roomId) return;
    const { data } = await supabase.from('resto_notes').select('*')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    setNotes((data as Note[]) ?? []);
  }

  useEffect(() => {
    if (!roomId) return;
    supabase.from('resto_rooms').select('*').eq('id', roomId).single()
      .then(({ data }) => setRoom(data as Room));
    void loadNotes();
  }, [roomId]);

  async function addNote() {
    if (!activeOrg || !roomId) return;
    const body = prompt('Note (e.g. measurements / scope)');
    if (!body) return;
    await supabase.from('resto_notes').insert({ org_id: activeOrg.id, room_id: roomId, body });
    void loadNotes();
  }

  if (!room) return <div className="p-4 text-gray-400">Loading...</div>;

  const tabs: Tab[] = ['photos', 'notes', 'contents', 'sketches'];
  return (
    <div>
      <div className="bg-brand-dark text-white p-3 font-semibold">{room.name}</div>
      <div className="flex border-b bg-white">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-3 text-sm capitalize ${tab === t ? 'text-brand border-b-2 border-brand font-medium' : 'text-gray-500'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'notes' && (
          <div className="space-y-2">
            <button onClick={addNote} className="bg-brand text-white rounded px-4 py-2 text-sm font-medium">+ Note</button>
            {notes.length === 0 && <p className="text-gray-400 text-sm">There are no notes in this room.</p>}
            {notes.map(n => (
              <div key={n.id} className="bg-white border rounded p-3 whitespace-pre-wrap text-sm">{n.body}</div>
            ))}
          </div>
        )}
        {tab !== 'notes' && (
          <p className="text-gray-400 text-sm">
            {tab} collection: scaffolded. Implementation lives in src/features/.
          </p>
        )}
      </div>
    </div>
  );
}
