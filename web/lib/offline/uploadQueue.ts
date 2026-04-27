// Offline upload queue (Phase 6.2).
//
// Stashes receipt uploads in IndexedDB when the network is unreachable so
// the camera-capture flow on a flaky cellular connection isn't lost.
// Drains itself when the browser comes back online (see PwaBootstrap).
//
// Storage shape: one IDB object store ``uploads`` with auto-incrementing
// ids. Each row pins a Blob (raw file bytes), the original filename, the
// companyId we should upload under, and a queuedAt timestamp.

const DB_NAME = "opsflow.offline";
const DB_VERSION = 1;
const STORE = "uploads";

export type QueuedUpload = {
  id: number;
  companyId: number;
  filename: string;
  blob: Blob;
  queuedAt: number;
};

export type QueuedUploadInput = Omit<QueuedUpload, "id" | "queuedAt">;

function idbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

export async function enqueueUpload(input: QueuedUploadInput): Promise<number> {
  if (!idbAvailable()) throw new Error("IndexedDB unavailable");
  const row = { ...input, queuedAt: Date.now() };
  const key = await tx<IDBValidKey>("readwrite", (s) => s.add(row));
  return Number(key);
}

export async function listQueuedUploads(): Promise<QueuedUpload[]> {
  if (!idbAvailable()) return [];
  return tx<QueuedUpload[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedUpload[]>);
}

export async function removeQueuedUpload(id: number): Promise<void> {
  if (!idbAvailable()) return;
  await tx<undefined>("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

export async function countQueuedUploads(): Promise<number> {
  if (!idbAvailable()) return 0;
  return tx<number>("readonly", (s) => s.count());
}

export type DrainResult = { sent: number; failed: number; remaining: number };

// Drain the queue against a caller-supplied uploader. The uploader resolves
// truthy on success, falsy/throw to keep the row in the queue. Stops at the
// first non-network failure so we don't burn through retries on a 4xx.
export async function drainUploadQueue(
  uploader: (q: QueuedUpload) => Promise<boolean>,
): Promise<DrainResult> {
  if (!idbAvailable()) return { sent: 0, failed: 0, remaining: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const remaining = await countQueuedUploads();
    return { sent: 0, failed: 0, remaining };
  }
  const rows = await listQueuedUploads();
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    let ok = false;
    try {
      ok = await uploader(row);
    } catch {
      ok = false;
    }
    if (ok) {
      await removeQueuedUpload(row.id);
      sent += 1;
    } else {
      failed += 1;
      // Stop draining on first failure — likely still offline or server is
      // unhealthy. We'll retry on the next online event.
      break;
    }
  }
  const remaining = await countQueuedUploads();
  return { sent, failed, remaining };
}
