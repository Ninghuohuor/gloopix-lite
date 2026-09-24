import assert from "node:assert/strict";
import test from "node:test";
import { formatStorageBytes, planHistoryEvictions } from "../src/lib/local-history";

test("formats local history storage without base64 overhead", () => {
  assert.equal(formatStorageBytes(0), "0 KB");
  assert.equal(formatStorageBytes(3 * 1024 * 1024), "3.0 MB");
  assert.equal(formatStorageBytes(512 * 1024 * 1024), "512.0 MB");
});

test("storage limit removes oldest images first and keeps newer history", () => {
  const records = [
    { id: "newest", createdAt: 3, bytes: 30 },
    { id: "oldest", createdAt: 1, bytes: 30 },
    { id: "middle", createdAt: 2, bytes: 30 },
  ];
  assert.deepEqual(planHistoryEvictions(records, 35, 100), ["oldest"]);
  assert.deepEqual(planHistoryEvictions(records, 70, 100), ["oldest", "middle"]);
  assert.deepEqual(planHistoryEvictions(records, 10, 100), []);
});

test("an oversized image cannot erase existing history", () => {
  assert.throws(() => planHistoryEvictions([{ id: "keep", createdAt: 1, bytes: 20 }], 101, 100), /超过本地历史存储上限/);
});
