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