export type OutputShape = "auto" | "square" | "landscape" | "portrait";

export type ModelSizeOption = {
  key: string;
  label: string;
  value: string;
  shape: OutputShape;
};

export const AUTO_SIZE_OPTION: ModelSizeOption = {
  key: "auto",
  label: "自动（推荐）",
  value: "auto",
  shape: "auto",
};

const GPT_IMAGE_2_SIZES: ModelSizeOption[] = [
  AUTO_SIZE_OPTION,
  { key: "square-1k", label: "1:1 方形 · 1K", value: "1024x1024", shape: "square" },
  { key: "landscape-1k", label: "3:2 横图 · 1K", value: "1536x1024", shape: "landscape" },
  { key: "portrait-1k", label: "2:3 竖图 · 1K", value: "1024x1536", shape: "portrait" },
  { key: "square-2k", label: "1:1 方形 · 2K", value: "2048x2048", shape: "square" },
  { key: "landscape-2k", label: "16:9 横图 · 2K", value: "2048x1152", shape: "landscape" },
  { key: "portrait-2k", label: "9:16 竖图 · 2K", value: "1152x2048", shape: "portrait" },
];

const APIMART_GPT_IMAGE_2_RATIOS: Array<[string, string, OutputShape]> = [
  ["1:1", "方形", "square"], ["3:2", "横图", "landscape"], ["2:3", "竖图", "portrait"],
  ["4:3", "横图", "landscape"], ["3:4", "竖图", "portrait"],
  ["5:4", "横图", "landscape"], ["4:5", "竖图", "portrait"],
  ["16:9", "横图", "landscape"], ["9:16", "竖图", "portrait"],
  ["2:1", "横图", "landscape"], ["1:2", "竖图", "portrait"],
  ["3:1", "横图", "landscape"], ["1:3", "竖图", "portrait"],
  ["21:9", "横图", "landscape"], ["9:21", "竖图", "portrait"],
];

const APIMART_GPT_IMAGE_2_SIZES: ModelSizeOption[] = [
  AUTO_SIZE_OPTION,
  ...APIMART_GPT_IMAGE_2_RATIOS.map(([ratio, direction, shape]) => ({ key: ratio, label: `${ratio} ${direction}`, value: ratio, shape })),
];

export function modelSizeTemplate(modelId: string, protocol: "openai" | "apimart" = "openai") {
  if (modelId.trim().toLowerCase() !== "gpt-image-2") return [{ ...AUTO_SIZE_OPTION }];
  return (protocol === "apimart" ? APIMART_GPT_IMAGE_2_SIZES : GPT_IMAGE_2_SIZES).map((option) => ({ ...option }));
}

export function isValidSizeValue(value: string) {
  return value === "auto" || /^[A-Za-z0-9_.:-]{1,100}$/.test(value);
}

export function validSizeOptions(value: unknown, modelId: string, protocol: "openai" | "apimart" = "openai"): ModelSizeOption[] {
  if (!Array.isArray(value)) return modelSizeTemplate(modelId, protocol);
  const options = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<ModelSizeOption>;
    if (typeof candidate.key !== "string" || typeof candidate.label !== "string" || typeof candidate.value !== "string") return [];
    if (!isValidSizeValue(candidate.value)) return [];
    const shape: OutputShape = candidate.shape === "square" || candidate.shape === "landscape" || candidate.shape === "portrait" ? candidate.shape : "auto";
    return [{ key: candidate.key, label: candidate.label, value: candidate.value, shape }];
  });
  const withoutAuto = options.filter((option) => option.value !== "auto");
  return [{ ...AUTO_SIZE_OPTION }, ...withoutAuto];
}
