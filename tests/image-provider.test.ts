import assert from "node:assert/strict";
import test from "node:test";
import { generateImage } from "../src/lib/image-provider";

process.env.IMAGE_API_KEY = "test-key";
process.env.IMAGE_API_BASE_URL = "https://images.example/v1";
process.env.IMAGE_MODEL = "gpt-image-2";

test("text generation uses the OpenAI-compatible generations route", async () => {
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://images.example/v1/images/generations");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-image-2");
    assert.equal(body.size, "2048x1152");
    assert.equal(body.n, 2);
    assert.equal(body.quality, "high");
    return Response.json({ data: [{ b64_json: "aGVsbG8=" }, { b64_json: "d29ybGQ=" }] });
  };
  const result = await generateImage({ prompt: "mountains", aspectRatio: "landscape", quantity: 2, quality: "high", resolution: "2k" }, fetcher as typeof fetch);
  assert.equal(result.imageUrl, "data:image/png;base64,aGVsbG8=");
  assert.deepEqual(result.imageUrls, ["data:image/png;base64,aGVsbG8=", "data:image/png;base64,d29ybGQ="]);
});

test("reference generation uses multipart edits without filesystem storage", async () => {
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://images.example/v1/images/edits");
    assert.ok(init?.body instanceof FormData);
    const form = init.body as FormData;
    assert.equal(form.get("model"), "gpt-image-2");
    assert.equal(form.get("prompt"), "make it blue");
    assert.ok(form.get("image") instanceof Blob);
    return Response.json({ data: [{ b64_json: "aW1hZ2U=" }] });
  };
  const result = await generateImage({ prompt: "make it blue", aspectRatio: "square", quantity: 1, referenceImage: "data:image/png;base64,aGVsbG8=" }, fetcher as typeof fetch);
  assert.equal(result.imageUrl, "data:image/png;base64,aW1hZ2U=");
});

test("optimized WebP references keep their MIME type in edits", async () => {
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    const form = init?.body as FormData;
    const image = form.get("image");
    assert.ok(image instanceof Blob);
    assert.equal(image.type, "image/webp");
    assert.equal(image.size, 5);
    return Response.json({ data: [{ b64_json: "aW1hZ2U=" }] });
  };
  const result = await generateImage({ prompt: "edit", aspectRatio: "square", quantity: 1, referenceImage: "data:image/webp;base64,aGVsbG8=" }, fetcher as typeof fetch);
  assert.equal(result.imageUrl, "data:image/png;base64,aW1hZ2U=");
});

test("browser provider settings override deployment defaults", async () => {
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://custom.example/api/generate");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer browser-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "custom-image-model");
    return Response.json({ data: [{ b64_json: "Y3VzdG9t" }] });
  };
  const result = await generateImage({
    prompt: "city",
    aspectRatio: "square",
    quantity: 1,
    provider: {
      apiKey: "browser-key",
      baseUrl: "https://custom.example/api",
      model: "custom-image-model",
      generationsPath: "/generate",
      editsPath: "/edit",
    },
  }, fetcher as typeof fetch);
  assert.equal(result.imageUrl, "data:image/png;base64,Y3VzdG9t");
});

test("automatic sizing omits the upstream size parameter", async () => {
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal("size" in body, false);
    return Response.json({ data: [{ b64_json: "YXV0bw==" }] });
  };
  await generateImage({ prompt: "auto", aspectRatio: "auto", size: "auto", quantity: 1 }, fetcher as typeof fetch);
});

test("automatic sizing also omits size for reference-image edits", async () => {
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    assert.ok(init?.body instanceof FormData);
    const form = init.body as FormData;
    assert.equal(form.has("size"), false);
    return Response.json({ data: [{ b64_json: "cmVmZXJlbmNl" }] });
  };
  await generateImage({
    prompt: "auto reference",
    aspectRatio: "auto",
    size: "auto",
    quantity: 1,
    referenceImage: "data:image/png;base64,aGVsbG8=",
  }, fetcher as typeof fetch);
});

test("APIMart text generation submits, polls, and downloads the image", async () => {
  const calls: string[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/images/generations")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-image-2");
      assert.equal(body.size, "16:9");
      assert.equal(body.resolution, "2k");
      assert.equal(body.n, 1);
      assert.equal("response_format" in body, false);
      return Response.json({ code: 200, data: [{ status: "submitted", task_id: "task_123" }] });
    }
    if (url.endsWith("/tasks/task_123")) return Response.json({ code: 200, data: { status: "completed", result: { images: [{ url: ["https://images.example/result.png"] }] } } });
    assert.equal(url, "https://images.example/result.png");
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
  };
  const result = await generateImage({ prompt: "cat", aspectRatio: "landscape", size: "16:9", resolution: "2k", quantity: 1, provider: {
    protocol: "apimart", apiKey: "test-key", baseUrl: "https://api.example/v1", model: "gpt-image-2", generationsPath: "/images/generations", editsPath: "/images/edits",
  } }, fetcher as typeof fetch);
  assert.deepEqual(calls, ["https://api.example/v1/images/generations", "https://api.example/v1/tasks/task_123", "https://images.example/result.png"]);
  assert.equal(result.imageUrl, "data:image/png;base64,iVBORw==");
});

test("APIMart reference generation sends base64 image_urls to generations", async () => {
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://api.example/v1/images/generations");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.image_urls, ["data:image/png;base64,aGVsbG8="]);
    assert.equal("size" in body, false);
    return Response.json({ code: 200, data: { result: { images: [{ url: "data:image/png;base64,aGVsbG8=" }] } } });
  };
  const result = await generateImage({ prompt: "make it blue", aspectRatio: "auto", size: "auto", quantity: 1, referenceImage: "data:image/png;base64,aGVsbG8=", provider: {
    protocol: "apimart", apiKey: "test-key", baseUrl: "https://api.example/v1", model: "gpt-image-2", generationsPath: "/images/generations", editsPath: "/images/edits",
  } }, fetcher as typeof fetch);
  assert.equal(result.imageUrl, "data:image/png;base64,aGVsbG8=");
});

test("APIMart sends one task per requested image", async () => {
  let submissions = 0;
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.n, 1);
    submissions += 1;
    return Response.json({ code: 200, data: { result: { images: [{ url: `data:image/png;base64,${submissions === 1 ? "YQ==" : "Yg=="}` }] } } });
  };
  const result = await generateImage({ prompt: "two cups", aspectRatio: "auto", size: "auto", quantity: 2, provider: {
    protocol: "apimart", apiKey: "test-key", baseUrl: "https://api.example/v1", model: "gpt-image-2", generationsPath: "/images/generations", editsPath: "/images/edits",
  } }, fetcher as typeof fetch);
  assert.equal(submissions, 2);
  assert.deepEqual(result.imageUrls, ["data:image/png;base64,YQ==", "data:image/png;base64,Yg=="]);
});

test("APIMart surfaces a failed task instead of saving an empty image", async () => {
  const fetcher = async (input: string | URL | Request) => String(input).endsWith("/images/generations")
    ? Response.json({ code: 200, data: { task_id: "task_failed" } })
    : Response.json({ code: 200, data: { status: "failed", error: { message: "不支持此尺寸" } } });
  await assert.rejects(generateImage({ prompt: "cat", aspectRatio: "square", size: "1:1", quantity: 1, provider: {
    protocol: "apimart", apiKey: "test-key", baseUrl: "https://api.example/v1", model: "gpt-image-2", generationsPath: "/images/generations", editsPath: "/images/edits",
  } }, fetcher as typeof fetch), /不支持此尺寸/);
});

test("APIMart rejects a task response without a usable task ID", async () => {
  const fetcher = async () => Response.json({ code: 200, data: { status: "submitted" } });
  await assert.rejects(generateImage({ prompt: "cat", aspectRatio: "auto", quantity: 1, provider: {
    protocol: "apimart", apiKey: "test-key", baseUrl: "https://api.example/v1", model: "gpt-image-2", generationsPath: "/images/generations", editsPath: "/images/edits",
  } }, fetcher as typeof fetch), /未返回有效任务 ID/);
});
