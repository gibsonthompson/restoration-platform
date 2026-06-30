import { useEffect, useRef, useState } from 'react';
import { Plus, Camera, Trash2, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadMedia, signedUrl } from '../../lib/storage';
import type { ContentsItem, Disposition } from '../../types/models';

// Full Contents module: per-room inventory with photo, identifying details,
// disposition, and replacement / actual cash value. Footer shows a running
// Schedule of Loss total. Feeds the claim-level SoL report later.

const DISPOSITIONS: { value: Disposition; label: string; cls: string }[] = [
  { value: 'restorable', label: 'Restorable', cls: 'bg-green-100 text-green-700' },
  { value: 'non_restorable', label: 'Non-restorable', cls: 'bg-amber-100 text-amber-700' },
  { value: 'disposed', label: 'Disposed', cls: 'bg-gray-200 text-gray-600' }
];

type Draft = Partial<ContentsItem>;
const blank: Draft = { quantity: 1, disposition: 'restorable' };

export function ContentsTab({ roomId, claimId, orgId }:
  { roomId: string; claimId: string; orgId: string }) {
  const [items, setItems] = useState<ContentsItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftPhotoPath, setDraftPhotoPath] = useState<string | null>(null);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('resto_contents_items').select('*')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    const rows = (data as ContentsItem[]) ?? [];
    setItems(rows);
    const withMedia = rows.filter(r => r.media_id);
    if (withMedia.length) {
      const mediaIds = withMedia.map(r => r.media_id);
      const { data: media } = await supabase.from('resto_media')
        .select('id, storage_path').in('id', mediaIds as string[]);
      const pathById: Record<string, string> = {};
      (media ?? []).forEach((m: any) => { pathById[m.id] = m.storage_path; });
      const entries = await Promise.all(withMedia.map(async r => {
        const p = pathById[r.media_id as string];
        return [r.id, p ? await signedUrl(p) : null] as const;
      }));
      setUrls(Object.fromEntries(entries.filter(([, u]) => u)) as Record<string, string>);
    } else {
      setUrls({});
    }
  }
  useEffect(() => { void load(); }, [roomId]);

  function openNew() { setEditing({ ...blank }); setDraftPhotoPath(null); setDraftPhotoUrl(null); }
  function openEdit(it: ContentsItem) { setEditing({ ...it }); setDraftPhotoPath(null); setDraftPhotoUrl(urls[it.id] ?? null); }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const path = await uploadMedia(file, { orgId, claimId, roomId });
      setDraftPhotoPath(path);
      setDraftPhotoUrl(await signedUrl(path));
    } catch (err: any) {
      alert('Photo upload failed: ' + (err?.message ?? 'unknown'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      let mediaId = editing.media_id ?? null;
      if (draftPhotoPath) {
        const { data: m } = await supabase.from('resto_media').insert({
          org_id: orgId, claim_id: claimId, room_id: roomId,
          type: 'photo', storage_path: draftPhotoPath, captured_at: new Date().toISOString()
        }).select('id').single();
        mediaId = (m as { id: string } | null)?.id ?? null;
      }
      const row = {
        org_id: orgId, room_id: roomId, media_id: mediaId,
        description: editing.description ?? null,
        brand: editing.brand ?? null,
        model: editing.model ?? null,
        serial: editing.serial ?? null,
        quantity: editing.quantity ?? 1,
        condition: editing.condition ?? null,
        disposition: editing.disposition ?? null,
        replacement_cost: editing.replacement_cost ?? null,
        acv: editing.acv ?? null
      };
      if (editing.id) await supabase.from('resto_contents_items').update(row).eq('id', editing.id);
      else await supabase.from('resto_contents_items').insert(row);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this item?')) return;
    await supabase.from('resto_contents_items').delete().eq('id', id);
    await load();
  }

  const totalRcv = items.reduce((s, i) => s + (Number(i.replacement_cost) || 0) * (i.quantity || 1), 0);
  const totalAcv = items.reduce((s, i) => s + (Number(i.acv) || 0) * (i.quantity || 1), 0);

  // ---- Editor ----
  if (editing) {
    const set = (k: keyof ContentsItem) => (v: any) => setEditing(p => ({ ...(p ?? {}), [k]: v }));
    const F = ({ label, k, type = 'text' }: { label: string; k: keyof ContentsItem; type?: string }) => (
      <label className="block">
        <span className="text-xs text-gray-500">{label}</span>
        <input type={type} className="w-full border rounded px-3 py-2 mt-1"
               value={(editing[k] as any) ?? ''}
               onChange={e => set(k)(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
      </label>
    );
    return (
      <div className="space-y-3">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
        <button onClick={() => fileRef.current?.click()}
                className="w-full border rounded py-3 text-sm font-medium flex items-center justify-center gap-2 text-gray-600">
          <Camera size={16} /> {draftPhotoUrl ? 'Replace Photo' : 'Add Photo'}
        </button>
        {draftPhotoUrl && <img src={draftPhotoUrl} className="w-full h-44 object-cover rounded" />}

        <F label="Description" k="description" />
        <div className="grid grid-cols-2 gap-2">
          <F label="Brand" k="brand" />
          <F label="Model" k="model" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <F label="Serial" k="serial" />
          <F label="Quantity" k="quantity" type="number" />
        </div>
        <F label="Condition" k="condition" />
        <label className="block">
          <span className="text-xs text-gray-500">Disposition</span>
          <select className="w-full border rounded px-3 py-2 mt-1"
                  value={editing.disposition ?? 'restorable'}
                  onChange={e => set('disposition')(e.target.value)}>
            {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <F label="Replacement Cost ($)" k="replacement_cost" type="number" />
          <F label="Actual Cash Value ($)" k="acv" type="number" />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(null)} className="flex-1 border rounded py-3 text-sm font-medium text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-brand text-white rounded py-3 text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </div>
    );
  }

  // ---- List ----
  return (
    <div className="space-y-2">
      <button onClick={openNew} className="w-full bg-brand text-white rounded py-3 font-medium flex items-center justify-center gap-1">
        <Plus size={16} /> Add Item
      </button>

      {items.length === 0 && <p className="text-gray-400 text-sm">No contents logged in this room.</p>}

      {items.map(it => {
        const disp = DISPOSITIONS.find(d => d.value === it.disposition);
        return (
          <div key={it.id} className="bg-white border rounded p-3 flex gap-3">
            <div className="w-14 h-14 rounded bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
              {urls[it.id] ? <img src={urls[it.id]} className="w-full h-full object-cover" /> : <Package size={20} className="text-gray-300" />}
            </div>
            <div className="flex-1 min-w-0" onClick={() => openEdit(it)}>
              <div className="font-medium text-sm truncate">{it.description ?? 'Untitled item'}</div>
              <div className="text-xs text-gray-400 truncate">
                {[it.brand, it.model].filter(Boolean).join(' ') || '—'} · Qty {it.quantity ?? 1}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {disp && <span className={`text-[10px] px-1.5 py-0.5 rounded ${disp.cls}`}>{disp.label}</span>}
                {it.replacement_cost != null && <span className="text-xs text-gray-600">RCV ${Number(it.replacement_cost).toFixed(0)}</span>}
              </div>
            </div>
            <button onClick={() => remove(it.id)} className="text-gray-300 hover:text-red-500 self-start"><Trash2 size={16} /></button>
          </div>
        );
      })}

      {items.length > 0 && (
        <div className="bg-gray-100 rounded p-3 text-sm flex justify-between mt-2">
          <span className="text-gray-500">Schedule of Loss ({items.length})</span>
          <span className="font-semibold">RCV ${totalRcv.toFixed(0)} · ACV ${totalAcv.toFixed(0)}</span>
        </div>
      )}
    </div>
  );
}