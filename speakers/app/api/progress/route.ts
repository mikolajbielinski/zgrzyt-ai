import { NextRequest, NextResponse } from "next/server";
import { getProgress } from "@/lib/s3";
import { logError, logInfo, since } from "@/lib/log";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const progress = await getProgress();
    logInfo(
      "progress",
      `done=${progress.done} pending=${progress.pending} total=${progress.total} ${since(startedAt)}`,
    );
    return NextResponse.json(progress);
  } catch (err) {
    logError("progress", `failed after ${since(startedAt)}`, err);
    return NextResponse.json(
      { error: "S3 error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
