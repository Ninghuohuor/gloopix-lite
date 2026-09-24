import type { GenerateInput } from "@/lib/image-provider";

type ApimartConfig = {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  generationsPath: string;
};

type ImageItem = string | { url?: string | string[]; image_url?: string | string[]; b64_json?: string };
type Payload = {
  code?: number;
  error?: { message?: string } | string;
  message?: string;
  task_id?: string;
  id?: string;
  status?: string;
  data?: Payload | Payload[];
  images?: ImageItem[];
  result?: { images?: ImageItem[] };
};

function endpoint(baseUrl: string, path: string) {
  return new URL(path.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function errorMessage(payload: Payload, fallback: string) {
  return typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message || fallback;
}

async function fetchPayload(url: string, init: RequestInit, fetcher: typeof fetch): Promise<Payload> {
  const response = await fetcher(url, init);
  const payload = (await response.json().catch(() => null)) as Payload | null;
  if (!response.ok || !payload || (payload.code && payload.code !== 200)) {
    throw new Error(payload ? errorMessage(payload, `APIMart 返回 ${response.status}`) : `APIMart 返回 ${response.status}`);
  }
  return payload;
}

function firstData(payload: Payload) {
  return Array.isArray(payload.data) ? payload.data[0] : payload.data;
}

function imageUrls(payload: Payload): string[] {
  const data = firstData(payload);
  const images = data?.result?.images || data?.images || payload.result?.images || payload.images || [];
  return images.flatMap((image) => {
    const value = typeof image === "string" ? image : image.url || image.image_url || image.b64_json;
    return (Array.isArray(value) ? value : value ? [value] : []).map((url) => typeof image === "object" && image.b64_json && !url.startsWith("data:") ? `data:image/png;base64,${url}` : url);
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function generateOneWithApimart(
  input: GenerateInput,
  config: ApimartConfig,
  fetcher: typeof fetch,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<string[]> {
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  const request = {
    model: config.model,
    prompt: input.prompt,
    n: 1,
    ...(input.size && input.size !== "auto" ? { size: input.size } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.quality ? { quality: input.quality } : {}),
    ...(input.referenceImage ? { image_urls: [input.referenceImage] } : {}),
  };
  const submitted = await fetchPayload(endpoint(config.apiBaseUrl, config.generationsPath), {
    method: "POST", headers, body: JSON.stringify(request),
  }, fetcher);
  const immediateImages = imageUrls(submitted);
  if (immediateImages.length) return immediateImages;
  const data = firstData(submitted);
  const taskId = submitted.task_id || submitted.id || data?.task_id || data?.id;
  if (!taskId || !/^[A-Za-z0-9_-]{1,150}$/.test(taskId)) throw new Error("APIMart 未返回有效任务 ID");

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const polled = await fetchPayload(endpoint(config.apiBaseUrl, `/tasks/${taskId}`), { headers: { Authorization: `Bearer ${config.apiKey}` } }, fetcher);
    const status = String(firstData(polled)?.status || polled.status || "").toLowerCase();
    if (["completed", "succeeded", "success"].includes(status)) {
      const urls = imageUrls(polled);
      if (!urls.length) throw new Error("APIMart 任务完成，但未返回图片");
      return urls;
    }
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(errorMessage(firstData(polled) || polled, "APIMart 图片生成失败"));
    }
    await wait(2500);
  }
  throw new Error("APIMart 任务等待超时，请稍后重试");
}

export async function generateWithApimart(
  input: GenerateInput,
  config: ApimartConfig,
  fetcher: typeof fetch,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<string[]> {
  const groups = await Promise.all(Array.from({ length: input.quantity }, () => generateOneWithApimart(input, config, fetcher, wait)));
  return groups.flatMap((images) => images.slice(0, 1));
}
