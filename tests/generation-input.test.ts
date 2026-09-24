import assert from "node:assert/strict";
import test from "node:test";
import { generationInputSchema } from "../src/lib/generation-input";

test("accepts text-only generation", () => {
  const result = generationInputSchema.parse({ prompt: "一只晒太阳的猫", aspectRatio: "square" });
  assert.equal(result.prompt, "一只晒太阳的猫");
  assert.equal(result.quantity, 1);
  assert.equal(result.referenceImage, undefined);
});

test("accepts one to four generated images", () => {
  assert.equal(generationInputSchema.safeParse({ prompt: "猫", quantity: 4 }).success, true);
  assert.equal(generationInputSchema.safeParse({ prompt: "猫", quantity: 5 }).success, false);
});

test("accepts configured quality and resolution", () => {
  const result = generationInputSchema.parse({ prompt: "猫", quality: "high", resolution: "2k", size: "2048x1152" });
  assert.equal(result.quality, "high");
  assert.equal(result.resolution, "2k");
  assert.equal(result.size, "2048x1152");
  assert.equal(generationInputSchema.safeParse({ prompt: "猫", quality: "ultra" }).success, false);
  assert.equal(generationInputSchema.safeParse({ prompt: "猫", size: "bad size" }).success, false);
});

test("accepts a reference image and rejects unsupported files", () => {
  assert.equal(generationInputSchema.safeParse({ prompt: "改成夜景", aspectRatio: "portrait", referenceImage: "data:image/png;base64,aGVsbG8=" }).success, true);
  assert.equal(generationInputSchema.safeParse({ prompt: "改成夜景", aspectRatio: "portrait", referenceImage: "data:image/gif;base64,aGVsbG8=" }).success, false);
});

test("accepts a browser-provided API and model configuration", () => {
  const result = generationInputSchema.parse({
    prompt: "a lighthouse",
    aspectRatio: "landscape",
    provider: {
      apiKey: "user-key",
      baseUrl: "https://images.example/v1",
      model: "image-model-v2",
      generationsPath: "/generate",
      editsPath: "/edit",
    },
  });
  assert.equal(result.provider?.model, "image-model-v2");
  assert.equal(result.provider?.baseUrl, "https://images.example/v1");
});

test("rejects unsafe provider protocols", () => {
  const result = generationInputSchema.safeParse({
    prompt: "a lighthouse",
    provider: {
      apiKey: "user-key",
      baseUrl: "file:///etc/passwd",
      model: "image-model-v2",
      generationsPath: "/generate",
      editsPath: "/edit",
    },
  });
  assert.equal(result.success, false);
});
