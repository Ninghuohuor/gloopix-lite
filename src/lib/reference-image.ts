import { MAX_REFERENCE_BYTES, MAX_REFERENCE_EDGE, MAX_REFERENCE_INPUT_BYTES } from "@/lib/reference-image-limits";

const SUPPORTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type PreparedReferenceImage = {
  dataUrl: string;
  originalBytes: number;
  bytes: number;
  resized: boolean;
};

export function referenceDimensions(width: number, height: number, maxEdge = MAX_REFERENCE_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("无法读取参考图尺寸");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function shouldOptimizeReference(bytes: number, width: number, height: number) {
  return bytes > MAX_REFERENCE_BYTES || Math.max(width, height) > MAX_REFERENCE_EDGE;
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法打开参考图，请换一张图片")); };
    image.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("参考图压缩失败")), type, quality);
    } catch {
      reject(new Error("参考图压缩失败"));
    }
  });
}

export async function prepareReferenceImage(file: File): Promise<PreparedReferenceImage> {
  if (!SUPPORTED_TYPES.includes(file.type)) throw new Error("参考图仅支持 PNG、JPEG 或 WebP");
  if (file.size > MAX_REFERENCE_INPUT_BYTES) throw new Error("原图超过 64 MB，请先在设备上缩小后再上传");

  const image = await loadImage(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const initialDimensions = referenceDimensions(width, height);
  if (!shouldOptimizeReference(file.size, width, height)) {
    return { dataUrl: await readDataUrl(file), originalBytes: file.size, bytes: file.size, resized: false };
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法处理这张参考图");
  let dimensions = initialDimensions;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // WebP preserves PNG transparency. Older browsers may fall back to PNG/JPEG.
    const preferredType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    let blob = await encode(canvas, preferredType, Math.max(0.62, 0.88 - attempt * 0.05));
    if (!SUPPORTED_TYPES.includes(blob.type)) blob = await encode(canvas, file.type === "image/png" ? "image/png" : "image/jpeg");
    if (blob.size > 0 && blob.size <= MAX_REFERENCE_BYTES) {
      return { dataUrl: await readDataUrl(blob), originalBytes: file.size, bytes: blob.size, resized: true };
    }
    dimensions = referenceDimensions(Math.round(dimensions.width * 0.75), Math.round(dimensions.height * 0.75));
  }
  throw new Error("参考图仍然过大，请换一张图片或先在设备上缩小");
}
