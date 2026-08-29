import { NextRequest, NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const secret = requireEnv("APP_SECRET");
  const appUser = requireEnv("APP_USER");
  const expected = Buffer.from(`${secret}:${appUser}`).toString("base64");

  if (token === expected) {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false });
}
