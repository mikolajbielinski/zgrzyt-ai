import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const appUser = process.env.APP_USER ?? "admin";
  const appPass = process.env.APP_PASS ?? "admin";
  const secret = process.env.APP_SECRET ?? "secret";

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
