import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const basicUser = process.env.BASIC_AUTH_USER ?? "admin";
  const basicPass = process.env.BASIC_AUTH_PASS ?? "admin";

  const authHeader = request.headers.get("authorization");

  if (authHeader && authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const [user, pass] = decoded.split(":");
    if (user === basicUser && pass === basicPass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Speaker Labeler"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
