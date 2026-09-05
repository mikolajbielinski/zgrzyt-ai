import { NextRequest, NextResponse } from "next/server";
import { getRawTranscript, listPending } from "@/lib/s3";
import { logError, logInfo, since } from "@/lib/log";
import { extractSpeakers, type Utterance } from "@/lib/transcripts";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const direction = request.nextUrl.searchParams.get("direction") ?? "desc";
    const files = await listPending();
    if (direction === "desc") files.reverse();
    logInfo("files/next", `${files.length} pending, direction=${direction}`);

    const skippedRaw = request.cookies.get("skipped_files")?.value;
    const skipped: string[] = skippedRaw ? JSON.parse(skippedRaw) : [];

    const excludeParam = request.nextUrl.searchParams.get("exclude") ?? "";
    const excludeIds = excludeParam ? excludeParam.split(",") : [];

    for (const id of files) {
      if (skipped.includes(id)) continue;
      if (excludeIds.includes(id)) continue;
      const data = (await getRawTranscript(id)) as Utterance[];
      const speakers = extractSpeakers(data);
      if (speakers) {
        logInfo(
          "files/next",
          `serving ${id} with ${Object.keys(speakers).length} unnamed speaker(s), ${since(startedAt)}`,
        );
        return NextResponse.json({ id, speakers });
      }
    }

    logInfo("files/next", `nothing left to label, ${since(startedAt)}`);
    return NextResponse.json({ done: true });
  } catch (err) {
    logError("files/next", `failed after ${since(startedAt)}`, err);
    return NextResponse.json(
      { error: "S3 error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
