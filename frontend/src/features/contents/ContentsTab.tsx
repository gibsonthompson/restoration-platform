import { useEffect, useRef, useState } from 'react';
import { Plus, Camera, Trash2, Package, Box, Tag, AlertTriangle, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadMedia, signedUrl, getPositionIfEnabled } from '../../lib/storage';
import { SelectField, type Option } from '../../components/Pickers';
import {
  CONTENTS_ITEM_TYPES, ITEM_TYPE_BY_VALUE, CONTENTS_CATEGORIES,
  suggestContentsCat, CATEGORY_LABEL
} from '../../lib/xactimateCodes';
import type { ContentsItem, Disposition } from '../../types/models';

// ============================================================================
// CONTENTS
// ----------------------------------------------------------------------------
// WHAT THE ITEM IS, and WHAT WE DID TO IT. Not what it is worth.
//
// This module used to ask a tech for a replacement cost and an actual cash value, and
// then printed a total-loss dollar figure on a carrier document. That was wrong. We do
// not price contents: Xactimate prices every line from the carrier price list for the
// region and the date of loss, and personal property is inventoried and valued in
// XactContents. A number we invent is a number that gets overwritten, argued about, or
// both, and it hands the adjuster an argument for free.
//
// What replaces it is Xactimate's own language. Verisk's contents categories are not a
// taxonomy of work, they are a taxonomy of ITEM TYPE: "clean hard furniture" is a
// category because a sofa and a dresser price differently. So the type a tech picks IS
// the category code, and the billable line comes out of what was actually done to it.
//
// PHOTOS: one item, MANY photos. A non-salvageable item needs the item, the damage, and
// any model or serial plate, so each item carries a photo strip. Photos are ordinary
// resto_media rows (room_id set, so they also appear in the room photo grid and the
// report) with contents_item_id pointing back to this item. The old single media_id
// pointer is still read for items photographed before this, and still written to a
// surviving photo, so nothing that reads the single pointer breaks.
// ============================================================================

const DISPOSITIONS: { value: Disposition; label: string; cls: string; on: string }[] = [
  { value: 'restorable', label: 'Restorable', cls: 'bg-green-100 text-green-700', on: 'bg-green-600 text-white' },
  { value: 'non_restorable', label: 'Total loss', cls: 'bg-red-100 text-red-700', on: 'bg-red-600 text-white' },
  { value: 'disposed', label: 'Disposed', cls: 'bg-gray-200 text-gray-600', on: 'bg-gray-700 text-white' }
];

const CAT_OPTIONS: Option[] = CONTENTS_CATEGORIES.map(c => ({
  value: c.code, label: c.label, code: c.code
}));

type Draft = Partial<ContentsItem>;
type Photo = { mediaId: string; path: string; url: string };
const blank: Draft = { quantity: 1, disposition: 'restorable', packed_out: false, moved: false, cleaned: false };
const isLoss = (d?: Disposition | null) => d === 'non_restorable' || d === 'disposed';

export function ContentsTab({ roomId, claimId, orgId }:
  { roomId: string; claimId: string; orgId: string }) {
  const [items, setItems] = useState<ContentsItem[]>([]);
  const [photosByItem, setPhotosByItem] = useState<Record<string, Photo[]>>({});
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Photos for the item currently open in the editor.
  const [existingPhotos, setExistingPhotos] = useState<Photo[]>([]);   // already saved
  const [draftPhotos, setDraftPhotos] = useState<{ path: string; url: string }[]>([]);  // uploaded, not yet linked
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);  // existing photos to delete on save
  const [photoBusy, setPhotoBusy] = useState(false);

  // Inline, per-item photo add from the LIST (no need to open the editor). This is the
  // fast path at the master inventory: expand a room, tap the camera on any item, attach.
  const listFileRef = useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  function addPhotoTo(itemId: string) { setPhotoTarget(itemId); listFileRef.current?.click(); }

  async function onListPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const itemId = photoTarget;
    if (listFileRef.current) listFileRef.current.value = '';
    setPhotoTarget(null);
    if (!files.length || !itemId) return;
    setRowBusy(itemId);
    try {
      const pos = await getPositionIfEnabled(orgId);
      const item = items.find(x => x.id === itemId);
      let firstNew: string | null = null;
      for (const file of files) {
        const path = await uploadMedia(file, { orgId, claimId, roomId });
        const { data: m, error } = await supabase.from('resto_media').insert({
          org_id: orgId, claim_id: claimId, room_id: roomId, contents_item_id: itemId,
          type: 'photo', storage_path: path, captured_at: new Date().toISOString(),
          lat: pos?.lat ?? null, lng: pos?.lng ?? null
        }).select('id').single();
        if (error || !m) throw new Error(error?.message ?? 'the photo was not linked to the item');
        if (!firstNew) firstNew = (m as { id: string }).id;
      }
      // Populate the legacy single pointer if the item had none, so older readers show a thumbnail.
      if (item && !item.media_id && firstNew) {
        await supabase.from('resto_contents_items').update({ media_id: firstNew }).eq('id', itemId);
      }
      await load();
    } catch (err: any) {
      alert('Photo upload failed: ' + (err?.message ?? 'unknown'));
    } finally {
      setRowBusy(null);
    }
  }

  async function load() {
    const { data } = await supabase.from('resto_contents_items').select('*')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    const rows = (data as ContentsItem[]) ?? [];
    setItems(rows);
    const itemIds = rows.map(r => r.id);

    const byItem: Record<string, { mediaId: string; path: string }[]> = {};

    // The one-to-many link. If the column is not there yet (migration not run), this
    // returns nothing and the legacy media_id below still shows the single photo.
    if (itemIds.length) {
      const { data: media } = await supabase.from('resto_media')
        .select('id, storage_path, contents_item_id').eq('type', 'photo').in('contents_item_id', itemIds);
      (media ?? []).forEach((m: any) => {
        const cid = m.contents_item_id;
        if (!cid) return;
        if (!byItem[cid]) byItem[cid] = [];
        byItem[cid].push({ mediaId: m.id, path: m.storage_path });
      });
    }

    // Legacy single-photo pointer, for items created before this feature.
    const legacyIds = rows.map(r => r.media_id).filter(Boolean) as string[];
    if (legacyIds.length) {
      const { data: legacy } = await supabase.from('resto_media').select('id, storage_path').in('id', legacyIds);
      const pathById: Record<string, string> = {};
      (legacy ?? []).forEach((m: any) => { pathById[m.id] = m.storage_path; });
      rows.forEach(r => {
        const mid = r.media_id as string | null;
        if (mid && pathById[mid]) {
          if (!byItem[r.id]) byItem[r.id] = [];
          if (!byItem[r.id].some(p => p.mediaId === mid)) byItem[r.id].unshift({ mediaId: mid, path: pathById[mid] });
        }
      });
    }

    // Sign every distinct path once.
    const paths = Array.from(new Set(Object.values(byItem).flat().map(p => p.path)));
    const urlByPath: Record<string, string> = {};
    await Promise.all(paths.map(async p => { const u = await signedUrl(p); if (u) urlByPath[p] = u; }));

    const withUrls: Record<string, Photo[]> = {};
    Object.entries(byItem).forEach(([id, list]) => {
      withUrls[id] = list.map(p => ({ ...p, url: urlByPath[p.path] ?? '' }));
    });
    setPhotosByItem(withUrls);
  }
  useEffect(() => { void load(); }, [roomId]);

  function resetPhotoEditor(existing: Photo[]) {
    setExistingPhotos(existing);
    setDraftPhotos([]);
    setRemovedMediaIds([]);
  }
  function openNew() { setEditing({ ...blank }); resetPhotoEditor([]); }
  function openEdit(it: ContentsItem) { setEditing({ ...it }); resetPhotoEditor(photosByItem[it.id] ?? []); }

  // Multiple at once: the iOS picker offers Camera or Photo Library, and library
  // multi-select adds them all. Each uploads to storage now; the resto_media rows are
  // written on save, once the item has an id to link to.
  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoBusy(true);
    try {
      for (const file of files) {
        try {
          const path = await uploadMedia(file, { orgId, claimId, roomId });
          const url = (await signedUrl(path)) ?? '';
          setDraftPhotos(prev => [...prev, { path, url }]);
        } catch (err: any) {
          alert('Photo upload failed: ' + (err?.message ?? 'unknown'));
        }
      }
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeExisting(mediaId: string) {
    setRemovedMediaIds(prev => (prev.includes(mediaId) ? prev : [...prev, mediaId]));
  }
  async function removeDraft(idx: number) {
    const dp = draftPhotos[idx];
    setDraftPhotos(prev => prev.filter((_, i) => i !== idx));
    // The file is in storage but never linked, so clean it up rather than orphan it.
    if (dp?.path) { try { await supabase.storage.from('resto-media').remove([dp.path]); } catch { /* best effort */ } }
  }

  async function save() {
    if (!editing || !editing.description) return;
    setSaving(true);
    try {
      const pos = await getPositionIfEnabled(orgId);

      // 1. the item. media_id is set afterwards, once the photos are settled.
      // NOTE what is absent: replacement_cost and acv. Deliberately. Those columns are
      // retired and nothing writes them.
      const row = {
        org_id: orgId, claim_id: claimId, room_id: roomId,
        description: editing.description ?? null,
        item_type: editing.item_type ?? null,
        category: editing.item_type ? (ITEM_TYPE_BY_VALUE[editing.item_type]?.label ?? null) : (editing.category ?? null),
        xact_cat: editing.xact_cat ?? null,
        xact_sel: editing.xact_sel ? String(editing.xact_sel).trim().toUpperCase() : null,
        brand: editing.brand ?? null,
        model: editing.model ?? null,
        serial: editing.serial ?? null,
        quantity: editing.quantity ?? 1,
        condition: editing.condition ?? null,
        disposition: editing.disposition ?? 'restorable',
        age_years: editing.age_years ?? null,
        year_purchased: editing.year_purchased ?? null,
        purchase_location: editing.purchase_location ?? null,
        loss_reason: editing.loss_reason ?? null,
        moved: !!editing.moved,
        cleaned: !!editing.cleaned,
        packed_out: !!editing.packed_out,
        box_label: editing.box_label ?? null
      };

      let itemId = editing.id ?? null;
      if (itemId) {
        const { error } = await supabase.from('resto_contents_items').update(row).eq('id', itemId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from('resto_contents_items').insert(row).select('id').single();
        if (error || !data) throw new Error(error?.message ?? 'the item was not recorded');
        itemId = (data as { id: string }).id;
      }

      // 2. link the new photos to this item
      const newMediaIds: string[] = [];
      for (const dp of draftPhotos) {
        const { data: m, error: me } = await supabase.from('resto_media').insert({
          org_id: orgId, claim_id: claimId, room_id: roomId, contents_item_id: itemId,
          type: 'photo', storage_path: dp.path, captured_at: new Date().toISOString(),
          lat: pos?.lat ?? null, lng: pos?.lng ?? null
        }).select('id').single();
        if (me || !m) throw new Error('a photo could not be linked to the item: ' + (me?.message ?? 'unknown'));
        newMediaIds.push((m as { id: string }).id);
      }

      // 3. delete the photos the tech removed (row and stored file)
      for (const mid of removedMediaIds) {
        const path = existingPhotos.find(p => p.mediaId === mid)?.path;
        if (path) { try { await supabase.storage.from('resto-media').remove([path]); } catch { /* best effort */ } }
        await supabase.from('resto_media').delete().eq('id', mid);
      }

      // 4. keep media_id pointing at a surviving photo, so anything still reading the
      //    single pointer shows a thumbnail.
      const surviving = existingPhotos.filter(p => !removedMediaIds.includes(p.mediaId)).map(p => p.mediaId);
      const repMediaId = surviving[0] ?? newMediaIds[0] ?? null;
      if (repMediaId !== (editing.media_id ?? null)) {
        await supabase.from('resto_contents_items').update({ media_id: repMediaId }).eq('id', itemId);
      }

      setEditing(null);
      await load();
    } catch (e: any) {
      alert('Could not save the item: ' + (e?.message ?? 'unknown error'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this item?')) return;
    await supabase.from('resto_contents_items').delete().eq('id', id);
    await load();
  }

  // ---- EDITOR ----
  if (editing) {
    const set = (k: keyof ContentsItem) => (v: any) => setEditing(p => ({ ...(p ?? {}), [k]: v }));
    const field = (label: string, k: keyof ContentsItem, type = 'text', ph = '') => (
      <label className="block">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <input type={type} inputMode={type === 'number' ? 'decimal' : undefined} placeholder={ph}
               className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-[16px] outline-none focus:border-sky"
               value={(editing[k] as any) ?? ''}
               onChange={e => set(k)(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
      </label>
    );
    const loss = isLoss(editing.disposition);
    const visibleExisting = existingPhotos.filter(p => !removedMediaIds.includes(p.mediaId));
    const photoCount = visibleExisting.length + draftPhotos.length;

    // The suggestion. HANDLING BEATS TYPE: if the item was packed out, the billable line
    // is the pack-out, not the cleaning of it.
    const suggested = suggestContentsCat({
      itemType: editing.item_type, packedOut: editing.packed_out,
      moved: editing.moved, cleaned: editing.cleaned
    });
    const catNow = editing.xact_cat ?? null;
    const takeSuggestion = () => { if (suggested) set('xact_cat')(suggested.cat); };

    const Toggle = ({ k, label, note }: { k: 'moved' | 'cleaned' | 'packed_out'; label: string; note: string }) => (
      <button type="button" onClick={() => set(k)(!editing[k])}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${editing[k] ? 'border-sky bg-sky-soft' : 'border-gray-200 bg-white active:bg-gray-50'}`}>
        <div className={`text-[14px] font-bold leading-tight ${editing[k] ? 'text-sky-deep' : 'text-navy'}`}>{label}</div>
        <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{note}</div>
      </button>
    );

    return (
      <div className="space-y-3 pb-4">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickPhoto} />

        {/* PHOTO STRIP: as many as the item needs. Each thumbnail can be removed. */}
        {photoCount > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {visibleExisting.map(p => (
              <div key={p.mediaId} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                {p.url
                  ? <img src={p.url} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Package size={18} className="text-gray-300" /></div>}
                <button type="button" onClick={() => removeExisting(p.mediaId)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-navy/70 text-white flex items-center justify-center active:scale-95">
                  <X size={13} />
                </button>
              </div>
            ))}
            {draftPhotos.map((p, idx) => (
              <div key={'d' + idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img src={p.url} className="w-full h-full object-cover" />
                <button type="button" onClick={() => void removeDraft(idx)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-navy/70 text-white flex items-center justify-center active:scale-95">
                  <X size={13} />
                </button>
                <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-sky text-white rounded px-1 py-0.5">New</span>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy}
                className="btn-soft w-full py-3 text-sm disabled:opacity-60">
          {photoBusy
            ? <><Loader2 size={16} className="animate-spin" /> Uploading...</>
            : <><Camera size={16} /> {photoCount > 0 ? 'Add more photos' : 'Add photos'}</>}
        </button>

        {photoCount === 0 && (
          <p className="text-[11px] text-amber-700 px-1 leading-snug">
            Photograph it before it goes in the dumpster. Get the item, the damage, and any model or serial plate. A non-salvageable item with no photo behind it is an item the carrier does not pay for.
          </p>
        )}

        {field('Item description', 'description', 'text', 'e.g. Leather sofa, three seat')}

        {/* ITEM TYPE = the Xactimate category. Not our invention: Verisk's. */}
        <div>
          <span className="text-xs font-medium text-gray-500">Item type</span>
          <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
            This is Xactimate's own contents category. Picking the type sets the code.
          </p>
          <div className="grid grid-cols-1 gap-2 mt-1.5">
            {CONTENTS_ITEM_TYPES.map(t => {
              const on = editing.item_type === t.value;
              return (
                <button key={t.value} type="button"
                        onClick={() => setEditing(p => ({ ...(p ?? {}), item_type: on ? null : t.value }))}
                        className={`text-left rounded-xl border px-3 py-2.5 transition ${on ? 'border-sky bg-sky-soft' : 'border-gray-200 bg-white active:bg-gray-50'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[14px] font-bold leading-tight ${on ? 'text-sky-deep' : 'text-navy'}`}>{t.label}</span>
                    <span className="text-[10px] font-bold bg-gray-100 text-gray-500 rounded-md px-1.5 py-0.5">{t.cat}</span>
                  </div>
                  {t.hint && <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{t.hint}</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-gray-500">Disposition</span>
          <div className="flex gap-1.5 mt-1">
            {DISPOSITIONS.map(d => (
              <button key={d.value} type="button" onClick={() => set('disposition')(d.value)}
                className={`flex-1 py-2 rounded-xl text-[13px] font-bold ${editing.disposition === d.value ? d.on : 'bg-gray-100 text-gray-500'}`}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* WHAT WE DID TO IT. This is what the billable line is for. */}
        <div>
          <span className="text-xs font-medium text-gray-500">What we did with it</span>
          <div className="space-y-2 mt-1">
            <Toggle k="cleaned" label="Cleaned on site" note="Bills against the cleaning category for this item type." />
            <Toggle k="moved" label="Moved within the property" note="Content manipulation, CON." />
            <Toggle k="packed_out" label="Packed out and stored" note="Packing, handling and storage, CPS CONT." />
          </div>
          {editing.packed_out && <div className="mt-2">{field('Box / container label', 'box_label', 'text', 'e.g. Box 12')}</div>}
        </div>

        {/* THE LINE CODE. Suggested, never silently applied. */}
        <div className="rounded-2xl bg-gray-50 p-3 space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <Tag size={12} /> Xactimate line code
          </div>

          {suggested && catNow !== suggested.cat && (
            <button type="button" onClick={takeSuggestion}
                    className="w-full text-left rounded-xl border border-dashed border-sky bg-white px-3 py-2.5 active:bg-sky-soft">
              <div className="text-[13px] font-bold text-sky-deep">
                Suggested: {CATEGORY_LABEL[suggested.cat] || suggested.cat}
                <span className="ml-1.5 text-[10px] font-bold bg-sky-soft text-sky-deep rounded-md px-1.5 py-0.5">{suggested.cat}</span>
              </div>
              <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{suggested.why} Tap to use it.</div>
            </button>
          )}

          <SelectField
            label="Category"
            value={catNow ?? ''}
            options={CAT_OPTIONS}
            onChange={v => set('xact_cat')(v || null)}
            placeholder="Select a category"
            sheetTitle="Xactimate contents category"
            sheetNote="Verisk's published list. A category plus a selector resolves to exactly one row of the price list."
          />

          {field('Selector', 'xact_sel', 'text', 'e.g. AVG')}

          <div className="flex items-start gap-2 text-[11px] text-amber-700 leading-snug">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              Selectors are not yet verified against a real Xactimate price list. Leave this blank if you are not certain.
              We send the code and the quantity; Xactimate sets the price.
            </span>
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

        {/* INVENTORY DETAIL. Facts about the item, not prices. Age and purchase details
            are what XactContents needs to value it; the value itself is theirs to set. */}
        <div className="rounded-2xl bg-gray-50 p-3 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Inventory detail</div>
          <p className="text-[11px] text-gray-500 leading-snug -mt-1">
            XactContents values the item from these. We do not put a price on it.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {field('Age (years)', 'age_years', 'number')}
            {field('Year purchased', 'year_purchased', 'number')}
          </div>
          {field('Where purchased', 'purchase_location', 'text', 'store / site')}
          {loss && field('Reason non-salvageable', 'loss_reason', 'text', 'e.g. Cat 3 water, charred')}
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

  // ---- LIST ----
  const lossItems = items.filter(i => isLoss(i.disposition));
  const noPhoto = lossItems.filter(i => (photosByItem[i.id]?.length ?? 0) === 0).length;

  return (
    <div className="space-y-2.5">
      <input ref={listFileRef} type="file" accept="image/*" multiple className="hidden" onChange={onListPhoto} />
      <button onClick={openNew} className="btn-primary w-full py-3">
        <Plus size={16} /> Add item
      </button>

      {items.length === 0 && <p className="text-gray-400 text-sm px-1">No contents logged in this room yet.</p>}

      {items.map(it => {
        const disp = DISPOSITIONS.find(d => d.value === it.disposition);
        const type = it.item_type ? ITEM_TYPE_BY_VALUE[it.item_type] : null;
        const itemPhotos = photosByItem[it.id] ?? [];
        const thumb = itemPhotos.find(p => p.url)?.url;
        return (
          <div key={it.id} className="card flex gap-3 active:scale-[.99] transition">
            <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center relative">
              {thumb ? <img src={thumb} className="w-full h-full object-cover" /> : <Package size={20} className="text-gray-300" />}
              {itemPhotos.length > 1 && (
                <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold bg-navy/75 text-white rounded px-1 leading-tight">{itemPhotos.length}</span>
              )}
            </div>
            <div className="flex-1 min-w-0" onClick={() => openEdit(it)}>
              <div className="font-bold text-sm truncate">{it.description ?? 'Untitled item'}</div>
              <div className="text-xs text-gray-400 font-medium truncate mt-0.5">
                {[type?.label ?? it.category, [it.brand, it.model].filter(Boolean).join(' ')].filter(Boolean).join(' \u00b7 ') || 'No type set'} &middot; Qty {it.quantity ?? 1}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {disp && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${disp.cls}`}>{disp.label}</span>}
                {it.packed_out && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-soft text-sky-deep"><Box size={9} className="inline mr-0.5" />Packed out</span>}
                {it.xact_cat && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {it.xact_cat}{it.xact_sel ? ' ' + it.xact_sel : ''}
                  </span>
                )}
                {isLoss(it.disposition) && itemPhotos.length === 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">No photo</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2.5 self-start shrink-0">
              <button onClick={(e) => { e.stopPropagation(); addPhotoTo(it.id); }} disabled={rowBusy === it.id}
                      className="text-gray-300 hover:text-sky disabled:opacity-50" aria-label="Add photo">
                {rowBusy === it.id ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); void remove(it.id); }}
                      className="text-gray-300 hover:text-red-500" aria-label="Delete item"><Trash2 size={16} /></button>
            </div>
          </div>
        );
      })}

      {/* A count, not a total. The dollar figure is Xactimate's to produce, not ours. */}
      {lossItems.length > 0 && (
        <div className="bg-gray-50 rounded-2xl p-3.5 mt-2 space-y-1.5">
          <div className="flex justify-between items-center text-sm">
            <span className="font-semibold text-gray-600">Non-salvageable</span>
            <span className="font-bold text-navy">{lossItems.length} item{lossItems.length === 1 ? '' : 's'}</span>
          </div>
          <p className="text-[11px] text-gray-400 leading-snug">
            Valued in Xactimate and XactContents from the carrier price list. This app records the inventory, not the price.
          </p>
          {noPhoto > 0 && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-700 font-semibold leading-snug pt-0.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{noPhoto} non-salvageable item{noPhoto === 1 ? ' has' : 's have'} no photo. Photograph before disposal or the line gets cut.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}