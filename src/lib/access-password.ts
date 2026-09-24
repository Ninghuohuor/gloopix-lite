import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerConfig } from "@/lib/config";

type PasswordRecord = {
  version: 1;
  salt: string;
  digest: string;
  iterations: number;
  sessionVersion: string;
};

type PasswordStore = {
  get(): Promise<PasswordRecord | null>;
  put(record: PasswordRecord): Promise<void>;
};

const STORE_KEY = "access-password-v1";
const ITERATIONS = 210_000;
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(hex)) throw new Error("访问密码记录格式无效");
  return Uint8Array.from(hex.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

async function digest(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations }, key, 256)));
}

function isPasswordRecord(value: unknown): value is PasswordRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PasswordRecord>;
  return record.version === 1 && typeof record.salt === "string" && /^[a-f0-9]{32}$/.test(record.salt)
    && typeof record.digest === "string" && /^[a-f0-9]{64}$/.test(record.digest)
    && record.iterations === ITERATIONS && typeof record.sessionVersion === "string" && /^[a-f0-9]{32}$/.test(record.sessionVersion);
}

function fileStore(): PasswordStore {
  const filename = process.env.ACCESS_PASSWORD_STORE_FILE || ".data/access-password.json";
  return {
    async get() {
      const { readFile } = await import("node:fs/promises");
      try {
        const record = JSON.parse(await readFile(filename, "utf8")) as unknown;
        if (!isPasswordRecord(record)) throw new Error("访问密码记录格式无效");
        return record;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async put(record) {
      const { mkdir, rename, writeFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
      const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" });
      await rename(temporary, filename);
    },
  };
}

export function getPasswordStore(): PasswordStore | null {
  try {
    const binding = (getCloudflareContext().env as { ACCESS_PASSWORD_KV?: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> } }).ACCESS_PASSWORD_KV;
    if (!binding) return null;
    return {
      async get() {
        const value = await binding.get(STORE_KEY);
        if (!value) return null;
        const record = JSON.parse(value) as unknown;
        if (!isPasswordRecord(record)) throw new Error("访问密码记录格式无效");
        return record;
      },
      put: (record) => binding.put(STORE_KEY, JSON.stringify(record)),
    };
  } catch {
    return fileStore();
  }
}

export async function currentPasswordState() {
  const store = getPasswordStore();
  const record = store ? await store.get() : null;
  return { record, sessionVersion: record?.sessionVersion || "env" };
}

export async function passwordMatches(candidate: string) {
  const { record } = await currentPasswordState();
  if (record) return safeEqual(await digest(candidate, record.salt, record.iterations), record.digest);
  const expected = getServerConfig().accessPassword;
  if (!expected) return false;
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return safeEqual(bytesToHex(new Uint8Array(candidateHash)), bytesToHex(new Uint8Array(expectedHash)));
}

export async function changeAccessPassword(newPassword: string) {
  const store = getPasswordStore();
  if (!store) throw new Error("当前部署未配置密码存储，请先绑定 ACCESS_PASSWORD_KV");
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const record: PasswordRecord = {
    version: 1,
    salt,
    digest: await digest(newPassword, salt, ITERATIONS),
    iterations: ITERATIONS,
    sessionVersion: bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
  };
  await store.put(record);
}
