import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSessionToken, passwordMatches, verifySessionToken } from "../src/lib/session";
import { changeAccessPassword } from "../src/lib/access-password";

process.env.ACCESS_PASSWORD = "correct horse battery staple";
process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";

test("validates the access password without exposing it", async () => {
  assert.equal(await passwordMatches("correct horse battery staple"), true);
  assert.equal(await passwordMatches("wrong"), false);
});

test("signs and expires access sessions", async () => {
  const now = Date.UTC(2026, 8, 24);
  const token = await createSessionToken(now);
  assert.equal(await verifySessionToken(token, now + 1000), true);
  assert.equal(await verifySessionToken(`${token}broken`, now + 1000), false);
  assert.equal(await verifySessionToken(token, now + 8 * 24 * 60 * 60 * 1000), false);
});

test("changing the password persists a hash and invalidates old sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gloopix-password-test-"));
  process.env.ACCESS_PASSWORD_STORE_FILE = join(directory, "access-password.json");
  try {
    const oldToken = await createSessionToken();
    await changeAccessPassword("654321");
    assert.equal(await passwordMatches("correct horse battery staple"), false);
    assert.equal(await passwordMatches("654321"), true);
    assert.equal(await verifySessionToken(oldToken), false);
    const newToken = await createSessionToken();
    assert.equal(await verifySessionToken(newToken), true);
    const saved = await readFile(process.env.ACCESS_PASSWORD_STORE_FILE, "utf8");
    assert.equal(saved.includes("654321"), false);
    assert.equal(saved.includes("correct horse battery staple"), false);
  } finally {
    delete process.env.ACCESS_PASSWORD_STORE_FILE;
    await rm(directory, { recursive: true, force: true });
  }
});
