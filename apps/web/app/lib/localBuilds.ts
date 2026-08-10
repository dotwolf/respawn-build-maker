import type { OptimizedBuild } from './optimizer';

/**
 * Locally saved builds (IndexedDB). Lets users — signed in or not — keep the
 * builds they generate with the optimizer without needing a server account.
 */

export interface LocalBuild {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  template_id?: string;
  template_name?: string;
  created_at: string;
  updated_at?: string;
  build: OptimizedBuild;
}

export type LocalBuildInput = Omit<LocalBuild, 'id' | 'created_at' | 'updated_at'>;

const DB_NAME = 'respawn-build-maker';
const DB_VERSION = 1;
const STORE_NAME = 'local_builds';

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
  });
  return dbPromise;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function saveLocalBuild(input: LocalBuildInput): Promise<LocalBuild> {
  const db = await openDb();
  const record: LocalBuild = {
    ...input,
    id: generateId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save build.'));
    tx.objectStore(STORE_NAME).put(record);
  });
  return record;
}

export async function updateLocalBuild(id: string, input: LocalBuildInput): Promise<LocalBuild> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const existing = await requestToPromise(tx.objectStore(STORE_NAME).get(id) as IDBRequest<LocalBuild | undefined>);
  const record: LocalBuild = {
    ...existing,
    ...input,
    id,
    created_at: existing?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save build.'));
    tx.objectStore(STORE_NAME).put(record);
  });
  return record;
}

export async function listLocalBuilds(): Promise<LocalBuild[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const all = await requestToPromise(tx.objectStore(STORE_NAME).getAll() as IDBRequest<LocalBuild[]>);
  return all.sort((a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0));
}

export async function getLocalBuild(id: string): Promise<LocalBuild | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const record = await requestToPromise(tx.objectStore(STORE_NAME).get(id) as IDBRequest<LocalBuild | undefined>);
  return record ?? null;
}

export async function deleteLocalBuild(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not delete build.'));
    tx.objectStore(STORE_NAME).delete(id);
  });
}
