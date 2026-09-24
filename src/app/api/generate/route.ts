import { NextResponse } from "next/server";
import { generationInputSchema } from "@/lib/generation-input";
import { generateImage } from "@/lib/image-provider";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "访问会话已失效，请重新输入密码" }, { status: 401 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  const parsed = generationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "请求格式无效" }, { status: 400 });
  }
  try {
    return NextResponse.json(await generateImage(parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败";
    console.error("Image generation failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
