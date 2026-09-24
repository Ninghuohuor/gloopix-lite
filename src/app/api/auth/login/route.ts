import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { createSessionToken, passwordMatches, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const config = getServerConfig();
  if (!config.accessPassword || !config.sessionSecret) {
    return NextResponse.json({ error: "站点尚未配置访问密码" }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== "string" || !(await passwordMatches(body.password))) {
    return NextResponse.json({ error: "访问密码不正确" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
