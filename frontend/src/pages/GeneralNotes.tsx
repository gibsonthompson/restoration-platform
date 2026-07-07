import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import { NoteSheet } from '../components/NoteSheet';
import type { Note } from '../types/models';

// Claim-level notes (room_id null).
export default function GeneralNotes() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteEdit, setNoteEdit] = useState<{ id?: string; body: string } | null>(null);

  async function load() {
    if (!claimId) return;
    const { data } = await supabase.from('resto_notes').select('*')
      .eq('claim_id', claimId).is('room_id', null).order('created_at', { ascending: false });
    setNotes((data as Note[]) ?? []);
  }
  useEffect(() => { void load(); }, [claimId]);

  async function saveNote(body: string) {
    if (!activeOrg || !claimId || !noteEdit) return;
    if (noteEdit.id) await supabase.from('resto_notes').update({ body }).eq('id', noteEdit.id);
    else await supabase.from('resto_notes').insert({ org_id: activeOrg.id, claim_id: claimId, room_id: null, body });
    setNoteEdit(null);
    void load();
  }
  async function deleteNote() {
    if (noteEdit?.id) await supabase.from('resto_notes').delete().eq('id', noteEdit.id);
    setNoteEdit(null);
    void load();
  }

  return (
    <div>
      <SubHeader title="General Notes" />
      <div className="p-4 space-y-2">
        <button onClick={() => setNoteEdit({ body: '' })} className="btn-primary w-full py-3">
          <Plus size={16} /> Add note
        </button>
        {notes.length === 0 && <p className="text-gray-400 text-sm">No general notes.</p>}
        {notes.map(n => (
          <div key={n.id} onClick={() => setNoteEdit({ id: n.id, body: n.body })}
            className="card whitespace-pre-wrap text-sm active:scale-[.99] transition cursor-pointer">{n.body}</div>
        ))}
      </div>
      {noteEdit && (
        <NoteSheet title={noteEdit.id ? 'Edit note' : 'New note'} initial={noteEdit.body}
          placeholder="Claim-level note…"
          onSave={saveNote} onDelete={noteEdit.id ? deleteNote : undefined} onClose={() => setNoteEdit(null)} />
      )}
    </div>
  );
}