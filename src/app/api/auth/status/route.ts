import { NextResponse } from "next/server";
import { getPublicConfig } from "@/lib/config";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: await isAuthenticated(request), ...getPublicConfig() });
}
