import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Plus, X, Microscope, TriangleAlert, Image as ImageIcon, StickyNote, Trash2, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import { uploadMedia, signedUrl, getPositionIfEnabled, removeRoomMedia } from '../lib/storage';
import { ContentsTab } from '../features/contents/ContentsTab';
import { SketchesTab } from '../features/sketch/SketchesTab';
import type { Note, Room } from '../types/models';
import { NoteSheet } from '../components/NoteSheet';

type Tab = 'photos' | 'notes' | 'contents' | 'sketches';

interface MediaRow { id: string; storage_path: string; type: string; caption: string | null; }
interface MoldScan {
  id: string; media_id: string; verdict: string; confidence: number | null;
  indicators: string[]; recommend_lab_sampling: boolean; summary: string | null;
}

// CEILING HEIGHT IS NOT SET HERE. It is a measurement, and it belongs where the tech is
// measuring: inside the sketch. The sketch editor writes resto_rooms.height_ft, and that
// is the only place it is written. Three doors into one number is how the three of them
// end up disagreeing.

// PER-SURFACE SCOPE. Which surfaces of THIS room are part of the loss. The room is the
// natural home for it: it is the one screen a tech opens for every room, and the affected
// flag (whole-room in or out) is refined here to the surface level. Each toggle writes one
// resto_rooms boolean, and every document reads them: the measurement sheet and the report
// mark an off surface "not in scope" and drop it from the totals, and the Xactimate export
// omits its line items. The geometry is never touched, so an off surface is still drawn and
// measured, just not billed. Default is all four on (fully in scope).
const SURFACES: { col: 'include_floor' | 'include_walls' | 'include_ceiling' | 'include_baseboard'; label: string }[] = [
  { col: 'include_floor', label: 'Floor' },
  { col: 'include_walls', label: 'Walls' },
  { col: 'include_ceiling', label: 'Ceiling' },
  { col: 'include_baseboard', label: 'Baseboard' }
];

// Verdict visual language for the mold screening result.
const VERDICT: Record<string, { label: string; cls: string; dot: string }> = {
  mold_likely:   { label: 'Mold likely',   cls: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  mold_possible: { label: 'Mold possible', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  mold_unlikely: { label: 'Mold unlikely', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  inconclusive:  { label: 'Inconclusive',  cls: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' }
};
const verdictMeta = (v?: string) => VERDICT[v ?? 'inconclusive'] ?? VERDICT.inconclusive;

// Join a short list into prose without an em-dash: "floor", "floor and walls",
// "floor, walls and ceiling".
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Room workspace: four collections. Photos support a manual AI mold scan.
export default function RoomDetail() {
  const { claimId, structureId, roomId } = useParams();
  const { activeOrg } = useOrg();
  const nav = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteEdit, setNoteEdit] = useState<{ id?: string; body: string } | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [scans, setScans] = useState<Record<string, MoldScan>>({});
  const [viewer, setViewer] = useState<MediaRow | null>(null);
  const [caption, setCaption] = useState('');
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
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

  async function loadRoom() {
    if (!roomId) return;
    const { data } = await supabase.from('resto_rooms').select('*').eq('id', roomId).single();
    setRoom(data as Room);
  }

  useEffect(() => {
    void loadRoom();
    void loadNotes();
    void loadMedia();
  }, [roomId, structureId]);

  // Flip one surface in or out of scope. Optimistic so the tap is instant, but the
  // Supabase error is READ and surfaced, and the toggle reverts if the write failed:
  // a checklist that lies about what it saved is worse than no checklist.
  async function toggleSurface(col: typeof SURFACES[number]['col']) {
    if (!room || savingScope) return;
    const prev = room[col] !== false;
    const next = !prev;
    setRoom(r => (r ? { ...r, [col]: next } : r));
    setSavingScope(true);
    try {
      const { error } = await supabase.from('resto_rooms').update({ [col]: next }).eq('id', room.id);
      if (error) {
        setRoom(r => (r ? { ...r, [col]: prev } : r));   // revert; nothing was saved
        alert('Could not update the scope: ' + error.message);
      }
    } catch (e: any) {
      setRoom(r => (r ? { ...r, [col]: prev } : r));
      alert('Could not update the scope: ' + (e?.message ?? 'unknown error'));
    } finally {
      setSavingScope(false);
    }
  }

  // WALL AREA: deduct the doors and windows, or bill the full wall.
  //
  // deduct_openings = true (default): the report bills the NET wall, gross minus every
  //   opening, i.e. the paintable / drywall surface you can actually see.
  // deduct_openings = false: the report bills the GROSS wall, perimeter x ceiling height,
  //   with doors and windows included and not deducted. The openings are still measured
  //   and listed on the report, they are just not subtracted.
  //
  // Writes one resto_rooms boolean, read by resto-report.js. Same optimistic pattern as the
  // surface toggles: revert on a failed write rather than lie about what saved.
  async function setDeductOpenings(next: boolean) {
    if (!room || savingScope) return;
    const prev = (room as any).deduct_openings !== false;
    if (prev === next) return;
    setRoom(r => (r ? ({ ...r, deduct_openings: next } as any) : r));
    setSavingScope(true);
    try {
      const { error } = await supabase.from('resto_rooms').update({ deduct_openings: next }).eq('id', room.id);
      if (error) {
        setRoom(r => (r ? ({ ...r, deduct_openings: prev } as any) : r));
        alert('Could not update the wall area setting: ' + error.message);
      }
    } catch (e: any) {
      setRoom(r => (r ? ({ ...r, deduct_openings: prev } as any) : r));
      alert('Could not update the wall area setting: ' + (e?.message ?? 'unknown error'));
    } finally {
      setSavingScope(false);
    }
  }

  // Rename the room. Optimistic, and reverts on a failed write. Every screen (this header,
  // the report, the Xactimate export) reads resto_rooms.name live, and the floor plan stores
  // room ids not names, so nothing else has to change when the name does.
  async function saveName() {
    if (!room) return;
    const next = nameDraft.trim();
    if (!next || next === room.name) { setRenaming(false); return; }
    const prev = room.name;
    setRoom(r => (r ? { ...r, name: next } : r));
    setSavingName(true);
    try {
      const { error } = await supabase.from('resto_rooms').update({ name: next }).eq('id', room.id);
      if (error) { setRoom(r => (r ? { ...r, name: prev } : r)); alert('Could not rename the room: ' + error.message); return; }
      setRenaming(false);
    } catch (e: any) {
      setRoom(r => (r ? { ...r, name: prev } : r));
      alert('Could not rename the room: ' + (e?.message ?? 'unknown error'));
    } finally {
      setSavingName(false);
    }
  }

  // Delete the whole room and everything under it. Order matters:
  //   1. Strip this room's block from the structure floor plan FIRST. It is a JSON blob,
  //      not a foreign key, so nothing else removes it, and doing it first means a failure
  //      here leaves the room fully intact and the delete can be retried.
  //   2. Delete the resto_rooms row. The database cascades the sketches, notes, contents,
  //      media rows and mold scans (migration 20260715_room_delete_cascade.sql).
  //   3. Remove the room's photo and video FILES from the bucket. Best effort: the room is
  //      already gone and an orphaned file is harmless, so a storage hiccup must not strand
  //      the tech looking at a room that no longer exists.
  async function deleteRoom() {
    if (!room || !activeOrg || !claimId || !roomId || deleting) return;
    setDeleting(true);
    try {
      if (structureId) {
        const { data: fp } = await supabase.from('resto_structure_floorplans')
          .select('layout_json').eq('structure_id', structureId).maybeSingle();
        const layout = (fp as any)?.layout_json;
        const blocks = layout?.blocks;
        if (Array.isArray(blocks)) {
          const next = blocks.filter((b: any) => b.roomId !== roomId);
          if (next.length !== blocks.length) {
            const { error } = await supabase.from('resto_structure_floorplans')
              .update({ layout_json: { ...layout, blocks: next }, updated_at: new Date().toISOString() })
              .eq('structure_id', structureId);
            if (error) throw new Error('Could not update the floor plan: ' + error.message);
          }
        }
      }

      const { error } = await supabase.from('resto_rooms').delete().eq('id', roomId);
      if (error) throw new Error('Could not delete the room: ' + error.message);

      try { await removeRoomMedia(activeOrg.id, claimId, roomId); } catch { /* orphaned files are harmless */ }

      nav(`/claims/${claimId}/structures/${structureId}`);
    } catch (e: any) {
      alert(e?.message ?? 'Could not delete the room.');
      setDeleting(false);   // stay on the confirm so it can be tried again
    }
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    if (!files.length || !activeOrg || !claimId || !roomId) return;
    setUploading(true);
    try {
      const pos = await getPositionIfEnabled(activeOrg.id);
      for (const file of files) {
        const path = await uploadMedia(file, { orgId: activeOrg.id, claimId, roomId });
        await supabase.from('resto_media').insert({
          org_id: activeOrg.id, claim_id: claimId, room_id: roomId,
          type: file.type.startsWith('video') ? 'video' : 'photo',
          storage_path: path, captured_at: new Date().toISOString(),
          lat: pos?.lat ?? null, lng: pos?.lng ?? null
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

  async function saveNote(body: string) {
    if (!activeOrg || !roomId || !noteEdit) return;
    if (noteEdit.id) await supabase.from('resto_notes').update({ body }).eq('id', noteEdit.id);
    else await supabase.from('resto_notes').insert({ org_id: activeOrg.id, claim_id: claimId, room_id: roomId, body });
    setNoteEdit(null);
    void loadNotes();
  }
  async function deleteNote() {
    if (noteEdit?.id) await supabase.from('resto_notes').delete().eq('id', noteEdit.id);
    setNoteEdit(null);
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

  // Surface scope only matters on an affected room. A context-only space (affected =
  // false) has nothing in scope by definition, so the checklist would be four dead
  // toggles; hide it and say why. The affected flag itself is set on the floor plan.
  const affected = room.affected !== false;
  const wallsInScope = room.include_walls !== false;
  const deductOpenings = (room as any).deduct_openings !== false;
  const outOfScope = SURFACES.filter(s => room[s.col] === false).map(s => s.label.toLowerCase());
  const scopeHint = outOfScope.length === 0
    ? 'The whole room is part of the loss. Turn a surface off if it was not affected, for example an unaffected floor under wet walls.'
    : `${joinList(outOfScope).charAt(0).toUpperCase() + joinList(outOfScope).slice(1)} ${outOfScope.length === 1 ? 'is' : 'are'} marked not in scope. Still shown on the documents for reference, but left out of the measurement totals and the estimate.`;

  return (
    <div>
      <SubHeader title={room.name} />

      {/* Room name, editable. Tap to rename. */}
      <div className="px-4 pt-3">
        <button onClick={() => { setNameDraft(room.name); setRenaming(true); }}
          className="w-full flex items-center justify-between gap-3 bg-white rounded-2xl p-3.5 shadow-soft active:bg-gray-50 text-left">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Room name</div>
            <div className="text-[15px] font-bold text-navy truncate">{room.name}</div>
          </div>
          <span className="shrink-0 w-9 h-9 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center"><Pencil size={16} /></span>
        </button>
      </div>

      {/* Which surfaces of this room are part of the loss. Reflected on every document. */}
      {affected && (
        <div className="px-4 pt-3">
          <div className="bg-white rounded-2xl p-3.5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Surfaces in scope</span>
              {savingScope && <span className="text-[11px] text-sky-deep font-semibold">Saving...</span>}
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {SURFACES.map(s => {
                const on = room[s.col] !== false;
                return (
                  <button key={s.col} onClick={() => toggleSurface(s.col)} disabled={savingScope}
                    aria-pressed={on}
                    className={`py-2 rounded-xl text-[12px] font-semibold transition disabled:opacity-60 ${on ? 'bg-sky-soft text-sky-deep ring-1 ring-sky/30' : 'bg-gray-100 text-gray-400'}`}>
                    <span className={on ? '' : 'line-through'}>{s.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-snug">{scopeHint}</p>

            {/* WALL AREA on the report: deduct the doors and windows (net, the default) or
                bill the full wall with the openings included. Only shown when walls are in
                scope, since it is moot otherwise. */}
            {wallsInScope && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Wall area on the report</span>
                <div className="flex bg-gray-100 rounded-full p-0.5 mt-2">
                  {([[true, 'Deduct openings'], [false, 'Include openings']] as [boolean, string][]).map(([val, label]) => {
                    const on = deductOpenings === val;
                    return (
                      <button key={label} onClick={() => setDeductOpenings(val)} disabled={savingScope}
                        aria-pressed={on}
                        className={`flex-1 py-1.5 rounded-full text-xs font-bold transition disabled:opacity-60 ${on ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                  {deductOpenings
                    ? 'Doors and windows are taken out of the wall area, so the report bills only the wall surface itself.'
                    : 'The full wall square footage is billed, doors and windows included and not deducted. They are still measured and listed on the report.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
            <button onClick={() => setNoteEdit({ body: '' })} className="btn-primary w-full py-3">
              <Plus size={16} /> Add note
            </button>
            {notes.length === 0 && <p className="text-gray-400 text-sm">There are no notes in this room.</p>}
            {notes.map(n => (
              <div key={n.id} onClick={() => setNoteEdit({ id: n.id, body: n.body })}
                className="card whitespace-pre-wrap text-sm active:scale-[.99] transition cursor-pointer">{n.body}</div>
            ))}
          </div>
        )}
        {noteEdit && (
          <NoteSheet title={noteEdit.id ? 'Edit note' : 'New note'} initial={noteEdit.body}
            placeholder="Measurements, scope, observations…"
            onSave={saveNote} onDelete={noteEdit.id ? deleteNote : undefined} onClose={() => setNoteEdit(null)} />
        )}

        {tab === 'contents' && activeOrg && claimId && roomId && (
          <ContentsTab roomId={roomId} claimId={claimId} orgId={activeOrg.id} />
        )}

        {tab === 'sketches' && activeOrg && claimId && roomId && (
          <SketchesTab roomId={roomId} roomName={room?.name} claimId={claimId} orgId={activeOrg.id} structureId={structureId} />
        )}
      </div>

      {/* Remove the whole room and everything in it. Kept quiet at the very bottom, behind
          a confirm, because it is irreversible. */}
      <div className="px-4 pb-10 pt-1">
        <button onClick={() => setConfirmDelete(true)}
          className="w-full py-3 rounded-xl font-semibold text-red-600 border border-red-200 active:bg-red-50 flex items-center justify-center gap-2">
          <Trash2 size={16} /> Delete this room
        </button>
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

      {/* Rename the room. */}
      {renaming && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12vh)' }}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => { if (!savingName) setRenaming(false); }} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Rename room</div>
            <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} autoFocus
              placeholder="Room name"
              onKeyDown={e => { if (e.key === 'Enter') saveName(); }}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 mt-3 text-[16px] focus:outline-none focus:border-sky" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setRenaming(false)} disabled={savingName}
                className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={saveName} disabled={savingName || !nameDraft.trim()}
                className="btn-primary flex-1 py-3 justify-center disabled:opacity-50">{savingName ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Deleting a room takes its photos, notes, contents and moisture maps with it. Ask. */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12vh)' }}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => { if (!deleting) setConfirmDelete(false); }} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Delete {room.name}?</div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              This permanently removes the room and everything in it: its photos, notes, contents and moisture maps. It cannot be undone.
            </p>
            <button onClick={deleteRoom} disabled={deleting}
              className="w-full py-3 mt-4 rounded-xl font-semibold text-white bg-red-600 active:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              <Trash2 size={16} /> {deleting ? 'Deleting...' : `Delete ${room.name}`}
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={deleting}
              className="w-full py-3 mt-2 rounded-xl font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}