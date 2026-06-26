import Dexie, { type Table } from 'dexie';

// Local offline store. Two jobs:
//  1) cache the signed-in org's active claims for offline viewing
//  2) hold the outbound mutation queue (see syncQueue.ts)
// CRITICAL: every cached/queued record carries org_id so a device that switches
// orgs can never leak or cross-write tenant data.

export interface QueuedMutation {
  id?: number;
  org_id: string;
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  created_at: number;
  tries: number;
}

export interface CachedBlob {
  id: string;          // local uuid
  org_id: string;
  storage_path: string;
  mime: string;
  blob: Blob;          // not yet uploaded
  created_at: number;
}

class RestoDB extends Dexie {
  mutations!: Table<QueuedMutation, number>;
  blobs!: Table<CachedBlob, string>;
  constructor() {
    super('resto-offline');
    this.version(1).stores({
      mutations: '++id, org_id, table, created_at',
      blobs: 'id, org_id, created_at'
    });
  }
}

export const localdb = new RestoDB();
