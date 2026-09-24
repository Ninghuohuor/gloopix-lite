"use client";

const DATABASE_NAME = "gloopix-lite-branding";
const STORE_NAME = "settings";
const DATABASE_VERSION = 1;
const SETTINGS_KEY = "current";
export const MAX_BRANDING_ASSET_BYTES = 2 * 1024 * 1024;

export type BrandingSettings = {
  siteName: string;
  browserTitle: string;
  browserTitleCustomized?: boolean;
  siteDescription: string;
  logoText: string;
  logoTextCustomized?: boolean;
  logoImage?: Blob;
  favicon?: Blob;
};

type StoredBrandingSettings = BrandingSettings & { key: typeof SETTINGS_KEY };

export function renameBrandingSite(settings: BrandingSettings, siteName: string): BrandingSettings {
  return {
    ...settings,
    siteName,
    browserTitle: !settings.browserTitleCustomized && settings.browserTitle === settings.siteName ? siteName : settings.browserTitle,
    logoText: !settings.logoTextCustomized && settings.logoText === settings.siteName ? siteName : settings.logoText,
  };
}

export function resolveBrandingSettings(stored: BrandingSettings | undefined, fallback: BrandingSettings): BrandingSettings {
  if (!stored) return fallback;
  const siteName = stored.siteName || fallback.siteName;
  const staleDefault = siteName !== fallback.siteName;
  const browserTitle = stored.browserTitle || fallback.browserTitle;
  const logoText = stored.logoText || fallback.logoText;
  const browserTitleCustomized = stored.browserTitleCustomized ?? (browserTitle !== siteName && !(staleDefault && browserTitle === fallback.browserTitle));
  const logoTextCustomized = stored.logoTextCustomized ?? (logoText !== siteName && !(staleDefault && logoText === fallback.logoText));
  return {
    siteName,
    browserTitle: !browserTitleCustomized && staleDefault && browserTitle === fallback.browserTitle ? siteName : browserTitle,
    browserTitleCustomized,
    siteDescription: typeof stored.siteDescription === "string" ? stored.siteDescription : fallback.siteDescription,
    logoText: !logoTextCustomized && staleDefault && logoText === fallback.logoText ? siteName : logoText,
    logoTextCustomized,
    logoImage: stored.logoImage instanceof Blob ? stored.logoImage : undefined,
    favicon: stored.favicon instanceof Blob ? stored.favicon : undefined,
  };
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("当前浏览器不支持保存基础信息"));
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开浏览器本地设置"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("浏览器本地设置操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("浏览器本地设置写入失败"));
    transaction.onabort = () => reject(transaction.error || new Error("浏览器本地设置写入已取消"));
  });
}

export async function loadLocalBranding(fallback: BrandingSettings) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const stored = await requestResult(transaction.objectStore(STORE_NAME).get(SETTINGS_KEY)) as StoredBrandingSettings | undefined;
    return resolveBrandingSettings(stored, fallback);
  } finally {
    database.close();
  }
}

export async function saveLocalBranding(settings: BrandingSettings) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...settings, key: SETTINGS_KEY } satisfies StoredBrandingSettings);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export function validateBrandingAsset(asset: Pick<Blob, "size" | "type">, kind: "logo" | "favicon", fileName = "") {
  const allowed = kind === "logo"
    ? ["image/png", "image/jpeg", "image/webp"]
    : ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"];
  const isIconFile = kind === "favicon" && !asset.type && fileName.toLowerCase().endsWith(".ico");
  if (!allowed.includes(asset.type) && !isIconFile) return kind === "logo" ? "Logo 仅支持 PNG、JPG 或 WebP" : "标签页图标仅支持 PNG、JPG、WebP 或 ICO";
  if (asset.size > MAX_BRANDING_ASSET_BYTES) return "图片不能超过 2MB";
  return "";
}
