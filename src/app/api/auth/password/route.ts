import { NextResponse } from "next/server";
import { changeAccessPassword } from "@/lib/access-password";
import { createSessionToken, isAuthenticated, passwordMatches, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "请求格式无效" }, { status: 415 });
  const body = (await request.json().catch(() => null)) as { currentPassword?: unknown; newPassword?: unknown } | null;
  if (typeof body?.currentPassword !== "string" || typeof body.newPassword !== "string" || body.newPassword.length < 6 || body.newPassword.length > 128) {
    return NextResponse.json({ error: "新密码需为 6–128 个字符" }, { status: 400 });
  }
  if (!(await passwordMatches(body.currentPassword))) return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
  if (body.currentPassword === body.newPassword) return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
  try {
    await changeAccessPassword(body.newPassword);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "修改访问密码失败";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
