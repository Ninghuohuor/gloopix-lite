import { getServerConfig } from "@/lib/config";
import { currentPasswordState, passwordMatches } from "@/lib/access-password";

export const SESSION_COOKIE = "gloopix_lite_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string, sessionVersion: string) {
  const secret = getServerConfig().sessionSecret;
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = sessionVersion === "env" ? value : `${value}.${sessionVersion}`;
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

export { passwordMatches };

export async function createSessionToken(now = Date.now()) {
  const issuedAt = Math.floor(now / 1000).toString();
  const { sessionVersion } = await currentPasswordState();
  return `${issuedAt}.${await hmac(issuedAt, sessionVersion)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [issuedAt, signature, extra] = token.split(".");
  if (!issuedAt || !signature || extra) return false;
  const timestamp = Number(issuedAt);
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(timestamp) || timestamp > current + 60 || current - timestamp > SESSION_SECONDS) {
    return false;
  }
  const { sessionVersion } = await currentPasswordState();
  return safeEqual(signature, await hmac(issuedAt, sessionVersion));
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  for (const item of header.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
}

export async function isAuthenticated(request: Request) {
  return verifySessionToken(readCookie(request, SESSION_COOKIE));
}
