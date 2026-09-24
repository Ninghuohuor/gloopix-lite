import { getServerConfig } from "@/lib/config";
import { generateWithApimart } from "@/lib/apimart-provider";

export type AspectRatio = "auto" | "square" | "landscape" | "portrait";
export type GenerateInput = {
  prompt: string;
  aspectRatio: AspectRatio;
  size?: string;
  quantity: number;
  quality?: "low" | "medium" | "high";
  resolution?: "1k" | "2k" | "4k";
  referenceImage?: string;
  provider?: {
    protocol?: "openai" | "apimart";
    apiKey: string;
    baseUrl: string;
    model: string;
    generationsPath: string;
    editsPath: string;
  };
};

type UpstreamImage = { b64_json?: string; url?: string; revised_prompt?: string };

function endpoint(baseUrl: string, path: string) {
  return new URL(path.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("参考图格式无效，请使用 PNG、JPEG 或 WebP");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { type: match[1], bytes };
}

function filenameFor(type: string) {
  return `reference.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`;
}

async function upstreamError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") return parsed.error;
    return parsed.error?.message || parsed.message || `上游 API 返回 ${response.status}`;
  } catch {
    return `上游 API 返回 ${response.status}`;
  }
}

async function remoteImageToDataUrl(url: string, fetcher: typeof fetch) {
  const response = await fetcher(url, { headers: { Accept: "image/*" } });
  if (!response.ok) throw new Error("生成成功，但读取结果图片失败");
  const type = response.headers.get("content-type")?.split(";")[0] || "image/png";
  if (!type.startsWith("image/")) throw new Error("上游结果不是图片");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("上游结果图片超过 20MB");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

export async function generateImage(input: GenerateInput, fetcher: typeof fetch = fetch) {
  const serverConfig = getServerConfig();
  const config = input.provider
    ? {
        ...serverConfig,
        apiKey: input.provider.apiKey,
        apiBaseUrl: input.provider.baseUrl,
        model: input.provider.model,
        generationsPath: input.provider.generationsPath,
        editsPath: input.provider.editsPath,
      }
    : serverConfig;
  if (!config.apiKey) throw new Error("站点尚未配置 IMAGE_API_KEY");
  if ((input.provider ? input.provider.protocol || "openai" : config.apiProtocol) === "apimart") {
    const urls = await generateWithApimart(input, config, fetcher);
    const imageUrls = await Promise.all(urls.map((url) => url.startsWith("data:image/") ? url : remoteImageToDataUrl(url, fetcher)));
    return { imageUrl: imageUrls[0], imageUrls };
  }
  const size = input.size === "auto"
    ? undefined
    : input.size || (input.resolution === "2k"
      ? input.aspectRatio === "landscape" ? "2048x1152" : input.aspectRatio === "portrait" ? "1152x2048" : "2048x2048"
      : input.resolution === "4k"
        ? input.aspectRatio === "landscape" ? "4096x2731" : input.aspectRatio === "portrait" ? "2731x4096" : "4096x4096"
        : input.aspectRatio === "landscape"
          ? config.landscapeSize
          : input.aspectRatio === "portrait"
            ? config.portraitSize
            : config.squareSize);
  const headers = { Authorization: `Bearer ${config.apiKey}` };
  let response: Response;

  if (input.referenceImage) {
    const image = parseDataUrl(input.referenceImage);
    const form = new FormData();
    form.append("model", config.model);
    form.append("prompt", input.prompt);
    if (size) form.append("size", size);
    form.append("n", String(input.quantity));
    form.append("response_format", "b64_json");
    if (input.quality) form.append("quality", input.quality);
    form.append("image", new Blob([image.bytes], { type: image.type }), filenameFor(image.type));
    response = await fetcher(endpoint(config.apiBaseUrl, config.editsPath), {
      method: "POST",
      headers,
      body: form,
    });
  } else {
    response = await fetcher(endpoint(config.apiBaseUrl, config.generationsPath), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt: input.prompt,
        n: input.quantity,
        response_format: "b64_json",
        ...(size ? { size } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
      }),
    });
  }

  if (!response.ok) throw new Error(await upstreamError(response));
  const payload = (await response.json()) as { data?: UpstreamImage[] | UpstreamImage };
  const items = (Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : []).filter((item) => item.b64_json || item.url);
  if (!items.length) throw new Error("上游 API 未返回图片数据");
  const imageUrls = await Promise.all(items.map((item) => item.b64_json ? `data:image/png;base64,${item.b64_json}` : remoteImageToDataUrl(item.url!, fetcher)));
  return { imageUrl: imageUrls[0], imageUrls, revisedPrompt: items[0]?.revised_prompt };
}
