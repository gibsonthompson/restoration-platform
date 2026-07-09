import { useEffect, useRef, useState } from 'react';
import { Plus, Camera, Trash2, Package, Box } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadMedia, signedUrl, getPositionIfEnabled } from '../../lib/storage';
import type { ContentsItem, Disposition } from '../../types/models';

// Contents module: per-room personal-property inventory. Captures what carriers
// need for the two contents outputs — the pack-out/handling of salvageable items
// and the non-salvageable (total-loss) list that drives the ACV/RCV payout.

const DISPOSITIONS: { value: Disposition; label: string; cls: string; on: string }[] = [
  { value: 'restorable', label: 'Restorable', cls: 'bg-green-100 text-green-700', on: 'bg-green-600 text-white' },
  { value: 'non_restorable', label: 'Total loss', cls: 'bg-red-100 text-red-700', on: 'bg-red-600 text-white' },
  { value: 'disposed', label: 'Disposed', cls: 'bg-gray-200 text-gray-600', on: 'bg-gray-700 text-white' }
];
const CATEGORIES = ['Furniture', 'Electronics', 'Textile / soft', 'Appliance', 'Document', 'High-value', 'Other'];

type Draft = Partial<ContentsItem>;
const blank: Draft = { quantity: 1, disposition: 'restorable' };
const isLoss = (d?: Disposition | null) => d === 'non_restorable' || d === 'disposed';

export function ContentsTab({ roomId, claimId, orgId }:
  { roomId: string; claimId: string; orgId: string }) {
  const [items, setItems] = useState<ContentsItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftPhotoPath, setDraftPhotoPath] = useState<string | null>(null);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [addingCat, setAddingCat] = useState(false);
  const [catInput, setCatInput] = useState('');

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
  async function loadCats() {
    const { data } = await supabase.from('resto_org_settings').select('content_categories').eq('org_id', orgId).maybeSingle();
    setCustomCats(((data as { content_categories?: string[] } | null)?.content_categories) ?? []);
  }
  useEffect(() => { void load(); }, [roomId]);
  useEffect(() => { void loadCats(); }, [orgId]);

  async function addCategory() {
    const name = catInput.trim();
    if (!name) { setAddingCat(false); return; }
    const existing = [...CATEGORIES, ...customCats].map(c => c.toLowerCase());
    if (!existing.includes(name.toLowerCase())) {
      const next = [...customCats, name];
      await supabase.from('resto_org_settings').upsert({ org_id: orgId, content_categories: next }, { onConflict: 'org_id' });
      setCustomCats(next);
    }
    setEditing(p => ({ ...(p ?? {}), category: name }));
    setCatInput(''); setAddingCat(false);
  }

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
        const pos = await getPositionIfEnabled(orgId);
        const { data: m } = await supabase.from('resto_media').insert({
          org_id: orgId, claim_id: claimId, room_id: roomId,
          type: 'photo', storage_path: draftPhotoPath, captured_at: new Date().toISOString(),
          lat: pos?.lat ?? null, lng: pos?.lng ?? null
        }).select('id').single();
        mediaId = (m as { id: string } | null)?.id ?? null;
      }
      const row = {
        org_id: orgId, claim_id: claimId, room_id: roomId, media_id: mediaId,
        description: editing.description ?? null,
        category: editing.category ?? null,
        brand: editing.brand ?? null,
        model: editing.model ?? null,
        serial: editing.serial ?? null,
        quantity: editing.quantity ?? 1,
        condition: editing.condition ?? null,
        disposition: editing.disposition ?? 'restorable',
        replacement_cost: editing.replacement_cost ?? null,
        acv: editing.acv ?? null,
        age_years: editing.age_years ?? null,
        year_purchased: editing.year_purchased ?? null,
        purchase_location: editing.purchase_location ?? null,
        loss_reason: editing.loss_reason ?? null,
        packed_out: editing.packed_out ?? false,
        box_label: editing.box_label ?? null
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

  const lossItems = items.filter(i => isLoss(i.disposition));
  const totalRcv = lossItems.reduce((s, i) => s + (Number(i.replacement_cost) || 0) * (i.quantity || 1), 0);
  const totalAcv = lossItems.reduce((s, i) => s + (Number(i.acv) || 0) * (i.quantity || 1), 0);

  if (editing) {
    const set = (k: keyof ContentsItem) => (v: any) => setEditing(p => ({ ...(p ?? {}), [k]: v }));
    const field = (label: string, k: keyof ContentsItem, type = 'text', ph = '') => (
      <label className="block">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <input type={type} inputMode={type === 'number' ? 'decimal' : undefined} placeholder={ph}
               className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 outline-none focus:border-sky"
               value={(editing[k] as any) ?? ''}
               onChange={e => set(k)(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
      </label>
    );
    const loss = isLoss(editing.disposition);
    return (
      <div className="space-y-3 pb-4">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
        <button onClick={() => fileRef.current?.click()} className="btn-soft w-full py-3 text-sm">
          <Camera size={16} /> {draftPhotoUrl ? 'Replace photo' : 'Add photo'}
        </button>
        {draftPhotoUrl && <img src={draftPhotoUrl} className="w-full h-44 object-cover rounded-2xl" />}

        {field('Item description', 'description', 'text', 'e.g. Leather sofa')}

        <div>
          <span className="text-xs font-medium text-gray-500">Category</span>
          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
            {[...CATEGORIES, ...customCats].map(c => (
              <button key={c} onClick={() => set('category')(editing.category === c ? null : c)}
                className={`px-2.5 py-1.5 rounded-full text-[12px] font-semibold ${editing.category === c ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'}`}>{c}</button>
            ))}
            {addingCat ? (
              <span className="flex items-center gap-1">
                <input autoFocus value={catInput} onChange={e => setCatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void addCategory(); }}
                  placeholder="New category" className="w-32 border border-sky rounded-full px-2.5 py-1.5 text-[12px] outline-none" />
                <button onClick={() => void addCategory()} className="px-2.5 py-1.5 rounded-full text-[12px] font-bold bg-sky text-white">Add</button>
              </span>
            ) : (
              <button onClick={() => setAddingCat(true)} className="px-2.5 py-1.5 rounded-full text-[12px] font-semibold border border-dashed border-gray-300 text-gray-500">+ Add</button>
            )}
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-gray-500">Disposition</span>
          <div className="flex gap-1.5 mt-1">
            {DISPOSITIONS.map(d => (
              <button key={d.value} onClick={() => set('disposition')(d.value)}
                className={`flex-1 py-2 rounded-xl text-[13px] font-bold ${editing.disposition === d.value ? d.on : 'bg-gray-100 text-gray-500'}`}>{d.label}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {field('Quantity', 'quantity', 'number')}
          {field('Condition', 'condition', 'text', 'e.g. soaked, mold')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field('Brand', 'brand')}
          {field('Model', 'model')}
        </div>
        {field('Serial number', 'serial')}

        <div className={`rounded-2xl p-3 space-y-3 ${loss ? 'bg-red-50' : 'bg-gray-50'}`}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
            {loss ? 'Total-loss valuation (drives the payout)' : 'Valuation (optional)'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field('Replacement cost $', 'replacement_cost', 'number')}
            {field('Actual cash value $', 'acv', 'number')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field('Age (years)', 'age_years', 'number')}
            {field('Year purchased', 'year_purchased', 'number')}
          </div>
          {field('Where purchased', 'purchase_location', 'text', 'store / site')}
          {loss && field('Reason non-salvageable', 'loss_reason', 'text', 'e.g. Cat 3 water, charred')}
        </div>

        <div className="rounded-2xl bg-gray-50 p-3 space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-600 flex items-center gap-2"><Box size={15} /> Packed out</span>
            <input type="checkbox" className="w-5 h-5 accent-sky" checked={!!editing.packed_out} onChange={e => set('packed_out')(e.target.checked)} />
          </label>
          {editing.packed_out && field('Box / container label', 'box_label', 'text', 'e.g. Box 12')}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(null)} className="flex-1 btn-soft py-3 text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !editing.description} className="flex-1 btn-primary py-3 text-sm disabled:opacity-50">
            {saving ? 'Saving...' : 'Save item'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <button onClick={openNew} className="btn-primary w-full py-3">
        <Plus size={16} /> Add item
      </button>

      {items.length === 0 && <p className="text-gray-400 text-sm px-1">No contents logged in this room yet.</p>}

      {items.map(it => {
        const disp = DISPOSITIONS.find(d => d.value === it.disposition);
        return (
          <div key={it.id} className="card flex gap-3 active:scale-[.99] transition">
            <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
              {urls[it.id] ? <img src={urls[it.id]} className="w-full h-full object-cover" /> : <Package size={20} className="text-gray-300" />}
            </div>
            <div className="flex-1 min-w-0" onClick={() => openEdit(it)}>
              <div className="font-bold text-sm truncate">{it.description ?? 'Untitled item'}</div>
              <div className="text-xs text-gray-400 font-medium truncate mt-0.5">
                {[it.category, [it.brand, it.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'} · Qty {it.quantity ?? 1}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {disp && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${disp.cls}`}>{disp.label}</span>}
                {it.packed_out && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-soft text-sky-deep">Packed out</span>}
                {isLoss(it.disposition) && it.replacement_cost != null && <span className="text-xs font-semibold text-gray-600">${Number(it.replacement_cost).toFixed(0)} RCV</span>}
              </div>
            </div>
            <button onClick={() => remove(it.id)} className="text-gray-300 hover:text-red-500 self-start"><Trash2 size={16} /></button>
          </div>
        );
      })}

      {lossItems.length > 0 && (
        <div className="bg-red-50 rounded-2xl p-3.5 text-sm flex justify-between items-center mt-2">
          <span className="text-red-700 font-semibold">Total loss · {lossItems.length} item{lossItems.length === 1 ? '' : 's'}</span>
          <span className="font-bold text-red-700">${totalRcv.toFixed(0)} RCV · ${totalAcv.toFixed(0)} ACV</span>
        </div>
      )}
    </div>
  );
}