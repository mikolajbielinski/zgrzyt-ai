import { NextRequest, NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const appUser = requireEnv("APP_USER");
  const appPass = requireEnv("APP_PASS");
  const secret = requireEnv("APP_SECRET");

  if (username !== appUser || password !== appPass) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = Buffer.from(`${secret}:${appUser}`).toString("base64");

  const response = NextResponse.json({ ok: true });
  response.cookies.set("app_session", token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}
