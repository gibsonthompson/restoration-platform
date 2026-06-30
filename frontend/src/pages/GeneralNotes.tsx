import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import type { Note } from '../types/models';

// Claim-level notes (room_id null).
export default function GeneralNotes() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const [notes, setNotes] = useState<Note[]>([]);

  async function load() {
    if (!claimId) return;
    const { data } = await supabase.from('resto_notes').select('*')
      .eq('claim_id', claimId).is('room_id', null).order('created_at', { ascending: false });
    setNotes((data as Note[]) ?? []);
  }
  useEffect(() => { void load(); }, [claimId]);

  async function add() {
    if (!activeOrg || !claimId) return;
    const body = prompt('General note');
    if (!body) return;
    await supabase.from('resto_notes').insert({ org_id: activeOrg.id, claim_id: claimId, room_id: null, body });
    void load();
  }

  return (
    <div>
      <SubHeader title="General Notes" />
      <div className="p-4 space-y-2">
        <button onClick={add} className="w-full bg-brand text-white rounded py-3 font-medium flex items-center justify-center gap-1">
          <Plus size={16} /> Add Note
        </button>
        {notes.length === 0 && <p className="text-gray-400 text-sm">No general notes.</p>}
        {notes.map(n => (
          <div key={n.id} className="bg-white border rounded p-3 whitespace-pre-wrap text-sm">{n.body}</div>
        ))}
      </div>
    </div>
  );
}