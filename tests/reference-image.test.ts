import assert from "node:assert/strict";
import test from "node:test";
import { MAX_REFERENCE_BYTES, MAX_REFERENCE_EDGE, MAX_REFERENCE_INPUT_BYTES } from "../src/lib/reference-image-limits";
import { prepareReferenceImage, referenceDimensions, shouldOptimizeReference } from "../src/lib/reference-image";
import { generationInputSchema } from "../src/lib/generation-input";

test("oversized byte or pixel dimensions require optimization", () => {
  assert.equal(shouldOptimizeReference(MAX_REFERENCE_BYTES, MAX_REFERENCE_EDGE, 1000), false);
  assert.equal(shouldOptimizeReference(MAX_REFERENCE_BYTES + 1, 1000, 1000), true);
  assert.equal(shouldOptimizeReference(1000, MAX_REFERENCE_EDGE + 1, 1000), true);
  assert.deepEqual(referenceDimensions(6000, 4000), { width: 3072, height: 2048 });
  assert.throws(() => referenceDimensions(0, 1000), /尺寸/);
});

test("large reference is resized and encoded below the request limit", async () => {
  const originalImage = globalThis.Image;
  const originalReader = globalThis.FileReader;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const attempts: Array<{ width: number; height: number }> = [];
  let revoked = false;
  class FakeImage {
    naturalWidth = 6000;
    naturalHeight = 4000;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  class FakeReader {
    result = "data:image/webp;base64,dGVzdA==";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() { queueMicrotask(() => this.onload?.()); }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ clearRect: () => {}, drawImage: () => {} }),
    toBlob(callback: (blob: Blob) => void) {
      attempts.push({ width: this.width, height: this.height });
      callback({ type: "image/webp", size: attempts.length === 1 ? MAX_REFERENCE_BYTES + 1 : 2 * 1024 * 1024 } as Blob);
    },
  };
  try {
    globalThis.Image = FakeImage as unknown as typeof Image;
    globalThis.FileReader = FakeReader as unknown as typeof FileReader;
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => { revoked = true; };
    const file = { type: "image/png", size: 12 * 1024 * 1024 } as File;
    const result = await prepareReferenceImage(file);
    assert.equal(result.resized, true);
    assert.equal(result.bytes, 2 * 1024 * 1024);
    assert.deepEqual(attempts, [{ width: 3072, height: 2048 }, { width: 2304, height: 1536 }]);
    assert.equal(result.dataUrl.startsWith("data:image/webp;base64,"), true);
    assert.equal(generationInputSchema.safeParse({ prompt: "调整参考图", referenceImage: result.dataUrl }).success, true);
    assert.equal(revoked, true);
  } finally {
    globalThis.Image = originalImage;
    globalThis.FileReader = originalReader;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test("unsupported and extreme-sized references fail before image decoding", async () => {
  await assert.rejects(prepareReferenceImage({ type: "image/gif", size: 1 } as File), /PNG、JPEG 或 WebP/);
  await assert.rejects(prepareReferenceImage({ type: "image/png", size: MAX_REFERENCE_INPUT_BYTES + 1 } as File), /64 MB/);
});
