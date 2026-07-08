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

// Best-effort device GPS for stamping field photos. Resolves null on denial,
// timeout, or lack of support — never blocks or throws, so uploads still work.
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