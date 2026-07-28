import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Share2, FileText, StickyNote, ClipboardList, Home, ChevronRight, ChevronLeft, Droplet, Flame, Sprout , Package , FileSignature , Image as ImageIcon , ScanLine } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { signedUrl } from '../lib/storage';
import { ClaimReadiness } from '../components/ClaimReadiness';
import { NameSheet } from '../components/NameSheet';
import { Loader } from '../components/Loader';
import { computeReadiness, type ReadinessResult } from '../lib/claimReadiness';
import type { Claim, Structure } from '../types/models';

const lossChip = (t: string | null) =>
  t === 'water' ? { Icon: Droplet, label: 'Water' } :
  t === 'fire'  ? { Icon: Flame, label: 'Fire' } :
  t === 'mold'  ? { Icon: Sprout, label: 'Mold' } : null;

const STRUCTURE_SUGGESTIONS = ['Main Level', 'Second Level', 'Basement', 'Attic', 'Garage', 'Crawlspace', 'Exterior'];

export default function ClaimDetail() {
  const { claimId } = useParams();
  const { activeOrg } = useOrg();
  const nav = useNavigate();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [adding, setAdding] = useState(false);
  const [strip, setStrip] = useState<{ id: string; url: string }[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [ready, setReady] = useState(false);

  // One coordinated load. Fetch the claim, its structures, all photos, and
  // everything the readiness engine needs, compute the score, resolve the photo
  // strip URLs, THEN commit it all at once. The page shows the logo loader until
  // `ready`, so it reveals fully populated instead of popping in section by
  // section. `ready` never goes back to false, so a later refresh (e.g. after
  // adding a structure) updates in place without flashing the loader again.
  async function load() {
    if (!claimId) return;
    const { data: c } = await supabase.from('resto_claims').select('*').eq('id', claimId).single();
    if (!c) { setClaim(null); setReady(true); return; }

    const { data: s } = await supabase.from('resto_structures').select('*')
      .eq('claim_id', claimId).order('sort_order');
    const structs = (s as Structure[]) ?? [];
    const structIds = structs.map(x => x.id);

    const [roomsR, chambersR, photosR, sigsR] = await Promise.all([
      structIds.length ? supabase.from('resto_rooms').select('id, structure_id').in('structure_id', structIds) : Promise.resolve({ data: [] as any[] }),
      structIds.length ? supabase.from('resto_drying_chambers').select('id, structure_id').in('structure_id', structIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('resto_media').select('id, storage_path, room_id, captured_at').eq('claim_id', claimId).eq('type', 'photo').order('captured_at', { ascending: false }),
      supabase.from('resto_claim_signatures').select('doc_type, doc_snapshot').eq('claim_id', claimId)
    ]);
    const rooms = roomsR.data ?? [];
    const chambers = chambersR.data ?? [];
    const allPhotos = (photosR.data as { id: string; storage_path: string; room_id: string | null }[]) ?? [];
    const roomIds = rooms.map((r: any) => r.id);
    const chamberIds = chambers.map((ch: any) => ch.id);

    const [sketchesR, readingsR, equipmentR] = await Promise.all([
      roomIds.length ? supabase.from('resto_sketches').select('room_id, canvas_json').in('room_id', roomIds) : Promise.resolve({ data: [] as any[] }),
      chamberIds.length ? supabase.from('resto_readings').select('chamber_id, reading_type, location_label, captured_at, gpp, material_mc').in('chamber_id', chamberIds) : Promise.resolve({ data: [] as any[] }),
      chamberIds.length ? supabase.from('resto_equipment').select('chamber_id, placed_at').in('chamber_id', chamberIds) : Promise.resolve({ data: [] as any[] })
    ]);

    const result = computeReadiness({
      claimId, claim: c,
      rooms, photos: allPhotos, sketches: sketchesR.data ?? [],
      chambers, readings: readingsR.data ?? [], equipment: equipmentR.data ?? [],
      signatures: sigsR.data ?? []
    });

    const stripRows = allPhotos.slice(0, 10);
    const entries = await Promise.all(stripRows.map(
      async r => ({ id: r.id, url: (await signedUrl(r.storage_path)) || '' })));

    setClaim(c as Claim);
    setStructures(structs);
    setPhotoCount(allPhotos.length);
    setStrip(entries.filter(e => e.url));
    setReadiness(result);
    setReady(true);
  }
  useEffect(() => { void load(); }, [claimId]);

  async function createStructure(name: string) {
    if (!activeOrg || !claimId) return;
    await supabase.from('resto_structures').insert({
      org_id: activeOrg.id, claim_id: claimId, name, sort_order: structures.length
    });
    setAdding(false); void load();
  }

  if (!ready) return <Loader />;
  if (!claim) return <div className="p-4 text-gray-400">Job not found.</div>;

  const chip = lossChip(claim.type_of_loss);
  const Action = ({ icon: Icon, label, to }: { icon: any; label: string; to: string }) => (
    <button onClick={() => nav(to)}
            className="bg-white/10 rounded-2xl py-2.5 flex flex-col items-center gap-1.5 text-[11px] font-semibold text-white active:scale-95 transition">
      <Icon size={17} /> {label}
    </button>
  );

  return (
    <div>
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav('/')} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-[21px] leading-tight">{claim.policyholder_name || claim.address || 'Untitled job'}</div>
        {claim.address && claim.policyholder_name && <div className="opacity-75 text-[13px] font-medium mt-0.5">{claim.address}</div>}

        <div className="flex flex-wrap gap-2 mt-3">
          {chip && (
            <span className="bg-white text-aqua-deep text-[11px] font-bold px-2.5 py-1.5 rounded-full inline-flex items-center gap-1.5">
              <chip.Icon size={12} /> {chip.label}
            </span>
          )}
          {(claim.category_of_water || claim.class_of_water) && (
            <span className="bg-white/12 text-[11px] font-bold px-2.5 py-1.5 rounded-full">
              Cat {claim.category_of_water ?? '-'} · Class {claim.class_of_water ?? '-'}
            </span>
          )}
          {claim.carrier_identifier && (
            <span className="bg-white/12 text-[11px] font-bold px-2.5 py-1.5 rounded-full">{claim.carrier_identifier}</span>
          )}
        </div>

        {/* Eight actions in a 4-wide grid. Photos is deliberately NOT here: the photo strip
            sits directly below with a count and a View all, so a second door to the same
            room was just noise. Scan reaches DocScan, which nothing linked to before. */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <Action icon={Pencil} label="Edit" to={`/claims/${claim.id}/edit`} />
          <Action icon={ScanLine} label="Scan doc" to={`/claims/${claim.id}/scan`} />
          <Action icon={ClipboardList} label="Scope" to={`/claims/${claim.id}/scope`} />
          <Action icon={Package} label="Contents" to={`/claims/${claim.id}/contents`} />
          <Action icon={FileSignature} label="Forms" to={`/claims/${claim.id}/forms`} />
          <Action icon={FileText} label="Docs" to={`/claims/${claim.id}/documents`} />
          <Action icon={StickyNote} label="Notes" to={`/claims/${claim.id}/notes`} />
          <Action icon={Share2} label="Share" to={`/claims/${claim.id}/share`} />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {readiness && <ClaimReadiness result={readiness} />}

        {photoCount > 0 ? (
          <button onClick={() => nav(`/claims/${claim.id}/photos`)} className="card w-full text-left active:scale-[.99] transition">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-sm flex items-center gap-1.5"><ImageIcon size={15} className="text-brand" /> Photos</div>
              <span className="text-xs font-semibold text-sky flex items-center">View all {photoCount} <ChevronRight size={14} /></span>
            </div>
            <div className="flex gap-1.5 overflow-hidden">
              {strip.slice(0, 6).map(p => (
                <img key={p.id} src={p.url} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ))}
            </div>
          </button>
        ) : (
          // Photos is no longer in the action grid, so with zero photos this card is the
          // ONLY door to the photo page. Without it a fresh claim could not add any.
          <button onClick={() => nav(`/claims/${claim.id}/photos`)}
                  className="card w-full flex items-center gap-3 text-left active:scale-[.99] transition">
            <div className="w-10 h-10 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0">
              <ImageIcon size={18} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[15px]">Photos</div>
              <div className="text-[12px] text-gray-400">No photos yet. Every line item you bill needs one behind it.</div>
            </div>
            <ChevronRight size={18} className="ml-auto text-gray-300 shrink-0" />
          </button>
        )}

        <button onClick={() => setAdding(true)} className="btn-primary w-full py-3.5">
          <Plus size={18} /> Add structure
        </button>

        <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 pt-1">Structures</div>

        {structures.length === 0 && (
          <p className="text-gray-400 text-sm px-1">No structures yet. Add the building or level you're working on.</p>
        )}

        {structures.map(s => (
          <Link key={s.id} to={`/claims/${claim.id}/structures/${s.id}`}
                className="card flex items-center gap-3 active:scale-[.99] transition">
            <div className="w-10 h-10 rounded-xl bg-aqua-soft text-aqua-deep flex items-center justify-center shrink-0">
              <Home size={18} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[15px] truncate">{s.name}</div>
            </div>
            <ChevronRight size={18} className="ml-auto text-gray-300 shrink-0" />
          </Link>
        ))}
      </div>

      {adding && (
        <NameSheet title="Add structure" subtitle="Pick a level or building, or type your own."
          placeholder="Structure name" suggestions={STRUCTURE_SUGGESTIONS} existing={structures.map(s => s.name)}
          onCancel={() => setAdding(false)} onSubmit={createStructure} />
      )}
    </div>
  );
}