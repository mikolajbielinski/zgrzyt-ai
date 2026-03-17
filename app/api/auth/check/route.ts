import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const secret = process.env.APP_SECRET ?? "secret";
  const appUser = process.env.APP_USER ?? "admin";
  const expected = Buffer.from(`${secret}:${appUser}`).toString("base64");

  if (token === expected) {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false });
}
