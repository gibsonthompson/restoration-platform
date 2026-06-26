import { localdb, type QueuedMutation } from './db';
import { supabase } from './supabase';

// Offline mutation queue. STUB / scaffold only.
//
// The hard problem (intentionally not finished here): reliable background sync
// on iOS PWAs. iOS Safari has no Background Sync API and can evict IndexedDB,
// so we sync aggressively while foregrounded and upload media as-you-go rather
// than pooling a day of un-synced blobs. Finishing this (conflict resolution,
// retry/backoff, media upload ordering) is Phase-1 engineering work and the
// single biggest risk to validate on real devices before going deep.

export async function enqueue(m: Omit<QueuedMutation, 'id' | 'created_at' | 'tries'>) {
  await localdb.mutations.add({ ...m, created_at: Date.now(), tries: 0 });
}

export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  const pending = await localdb.mutations.orderBy('created_at').toArray();
  let ok = 0, failed = 0;
  for (const m of pending) {
    try {
      if (m.op === 'insert') await supabase.from(m.table).insert(m.payload).throwOnError();
      else if (m.op === 'update') {
        const { id, ...rest } = m.payload as { id: string };
        await supabase.from(m.table).update(rest).eq('id', id).throwOnError();
      } else if (m.op === 'delete') {
        await supabase.from(m.table).delete().eq('id', (m.payload as { id: string }).id).throwOnError();
      }
      if (m.id != null) await localdb.mutations.delete(m.id);
      ok++;
    } catch {
      failed++; // TODO: backoff, max-tries, surface to UI
    }
  }
  return { ok, failed };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
}
