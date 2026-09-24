import { z } from "zod";

const MAX_REFERENCE_DATA_URL = 11 * 1024 * 1024;

const providerSchema = z.object({
  protocol: z.enum(["openai", "apimart"]).default("openai"),
  apiKey: z.string().trim().min(1, "请输入 API Key").max(1000, "API Key 过长"),
  baseUrl: z.string().trim().url("API 地址无效").max(2048).refine((value) => /^https?:\/\//.test(value), "API 地址必须使用 HTTP 或 HTTPS"),
  model: z.string().trim().min(1, "请输入模型 ID").max(200),
  generationsPath: z.string().trim().min(1).max(300).default("/images/generations"),
  editsPath: z.string().trim().min(1).max(300).default("/images/edits"),
});

export const generationInputSchema = z.object({
  prompt: z.string().trim().min(1, "请输入图片描述").max(2000, "图片描述不能超过 2000 个字符"),
  aspectRatio: z.enum(["auto", "square", "landscape", "portrait"]).default("square"),
  size: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/, "尺寸参数格式无效").optional(),
  quantity: z.number().int().min(1, "至少生成 1 张").max(4, "单次最多生成 4 张").default(1),
  quality: z.enum(["low", "medium", "high"]).optional(),
  resolution: z.enum(["1k", "2k", "4k"]).optional(),
  referenceImage: z
    .string()
    .max(MAX_REFERENCE_DATA_URL, "参考图不能超过 8MB")
    .regex(/^data:image\/(png|jpeg|webp);base64,/, "参考图格式无效")
    .optional(),
  provider: providerSchema.optional(),
});
