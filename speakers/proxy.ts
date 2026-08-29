import { NextRequest, NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";

export function proxy(request: NextRequest) {
  const basicUser = requireEnv("BASIC_AUTH_USER");
  const basicPass = requireEnv("BASIC_AUTH_PASS");

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
