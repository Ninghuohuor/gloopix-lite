"use client";

const DATABASE_NAME = "gloopix-lite";
const STORE_NAME = "generations";
const DATABASE_VERSION = 1;
const MAX_HISTORY_BYTES = 500 * 1024 * 1024;

export type LocalHistoryRecord = {
  id: string;
  createdAt: number;
  prompt: string;
  modelLabel: string;
  aspectRatio: "auto" | "square" | "landscape" | "portrait";
  sizeLabel?: string;
  quality?: "low" | "medium" | "high";
  resolution?: "1k" | "2k" | "4k";
  images: Blob[];
  bytes: number;
};

export type LocalHistoryStats = {
  bytes: number;
  count: number;
  imageCount: number;
  limit: number;
  persistent: boolean;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("浏览器本地数据库操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("浏览器本地数据库写入失败"));
    transaction.onabort = () => reject(transaction.error || new Error("浏览器本地数据库写入已取消"));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("当前浏览器不支持本地历史"));
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开浏览器本地历史"));
  });
}

async function withDatabase<T>(work: (database: IDBDatabase) => Promise<T>) {
  const database = await openDatabase();
  try {
    return await work(database);
  } finally {
    database.close();
  }
}

async function historyLimit() {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  return estimate?.quota ? Math.min(MAX_HISTORY_BYTES, Math.floor(estimate.quota * 0.8)) : MAX_HISTORY_BYTES;
}

export function planHistoryEvictions(records: Pick<LocalHistoryRecord, "id" | "createdAt" | "bytes">[], incomingBytes: number, limit: number) {
  if (incomingBytes > limit) throw new Error("这次生成的图片超过本地历史存储上限，请先下载保存");
  let total = records.reduce((sum, item) => sum + item.bytes, 0);
  const removed: string[] = [];
  for (const item of [...records].sort((left, right) => left.createdAt - right.createdAt)) {
    if (total + incomingBytes <= limit) break;
    removed.push(item.id);
    total -= item.bytes;
  }
  return removed;
}

export async function listLocalHistory() {
  return withDatabase(async (database) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as LocalHistoryRecord[];
    return records.sort((left, right) => right.createdAt - left.createdAt);
  });
}

async function deleteRecords(ids: string[]) {
  if (!ids.length) return;
  await withDatabase(async (database) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    ids.forEach((id) => store.delete(id));
    await transactionDone(transaction);
  });
}

async function dataUrlToBlob(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("生成结果不是可保存的图片");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

export async function saveLocalHistory(input: Omit<LocalHistoryRecord, "images" | "bytes"> & { imageUrls: string[] }) {
  const { imageUrls, ...metadata } = input;
  const images = await Promise.all(imageUrls.map(dataUrlToBlob));
  const bytes = images.reduce((total, image) => total + image.size, 0);
  const record: LocalHistoryRecord = { ...metadata, images, bytes };
  const records = await listLocalHistory();
  const limit = await historyLimit();
  const removed = planHistoryEvictions(records, bytes, limit);
  await deleteRecords(removed);
  await withDatabase(async (database) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  });
  return { record, removedCount: removed.length };
}

export async function deleteLocalHistory(id: string) {
  await deleteRecords([id]);
}

export async function clearLocalHistory() {
  await withDatabase(async (database) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  });
}

export async function getLocalHistoryStats(records?: LocalHistoryRecord[]): Promise<LocalHistoryStats> {
  const items = records || await listLocalHistory();
  const persistent = await navigator.storage?.persisted?.().catch(() => false) || false;
  return {
    bytes: items.reduce((total, item) => total + item.bytes, 0),
    count: items.length,
    imageCount: items.reduce((total, item) => total + item.images.length, 0),
    limit: await historyLimit(),
    persistent,
  };
}

export async function requestPersistentLocalHistory() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export function formatStorageBytes(bytes: number) {
  if (bytes === 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
