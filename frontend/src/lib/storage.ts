import { supabase } from './supabase';

// Private media bucket. Path convention {org_id}/{claim_id}/{room_id}/{uuid}.ext
// matches the storage RLS (first path segment must be an org the user belongs to).
export const BUCKET = 'resto-media';

export async function uploadMedia(
  file: File,
  ctx: { orgId: string; claimId: string; roomId: string }
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${ctx.orgId}/${ctx.claimId}/${ctx.roomId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw error;
  return path;
}

export async function signedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

// Delete every stored file that belongs to a room. Deleting the resto_rooms row cascades
// its database rows (media, sketches, notes, contents, mold scans), but a row delete never
// touches the storage bucket, so the image and video files would otherwise be orphaned.
//
// Every file for a room lives under {org}/{claim}/{room}/, which is a flat folder of
// {uuid}.ext objects, so one listing of that prefix is the whole set. list() is paged, so
// we walk the pages rather than trusting a single call to return everything.
export async function removeRoomMedia(orgId: string, claimId: string, roomId: string): Promise<void> {
  const prefix = `${orgId}/${claimId}/${roomId}`;
  const pageSize = 100;
  const toRemove: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: pageSize, offset });
    if (error) throw error;
    const batch = data ?? [];
    for (const f of batch) {
      if (f.name) toRemove.push(`${prefix}/${f.name}`);
    }
    if (batch.length < pageSize) break;
  }
  if (toRemove.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(toRemove);
    if (error) throw error;
  }
}

// Best-effort device GPS for stamping field photos. Resolves null on denial,
// timeout, or lack of support, never blocks or throws, so uploads still work.
export async function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { lat: number; lng: number } | null) => { if (!done) { done = true; resolve(v); } };
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => finish(null),
        { timeout: 5000, maximumAge: 60000, enableHighAccuracy: true }
      );
    } catch { finish(null); }
    setTimeout(() => finish(null), 5500);
  });
}

// GPS capture that respects the org's stamp_gps setting (default on). Returns
// null without prompting for location if the company disabled GPS stamping.
export async function getPositionIfEnabled(orgId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await supabase.from('resto_org_settings').select('stamp_gps').eq('org_id', orgId).maybeSingle();
    if ((data as { stamp_gps?: boolean } | null)?.stamp_gps === false) return null;
  } catch { /* default to enabled if the setting can't be read */ }
  return getPosition();
}