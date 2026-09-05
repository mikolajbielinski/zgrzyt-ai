import { NextRequest, NextResponse } from "next/server";
import { getRawTranscript, putLabeled } from "@/lib/s3";
import { logError, logInfo, logWarn, since } from "@/lib/log";
import { applySpeakerMapping, findUnlabeledSpeakers, type Utterance } from "@/lib/transcripts";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { mapping } = (await request.json()) as {
    mapping: Record<string, string>;
  };

  if (!mapping || typeof mapping !== "object") {
    logWarn("files/[id]", `${id}: invalid mapping payload`);
    return NextResponse.json({ error: "Invalid mapping" }, { status: 400 });
  }

  const startedAt = Date.now();
  logInfo(
    "files/[id]",
    `${id}: saving, mapping = ${Object.entries(mapping)
      .map(([k, v]) => `${k}->${v}`)
      .join(", ")}`,
  );

  try {
    const data = (await getRawTranscript(id)) as Utterance[];

    const updated = applySpeakerMapping(data, mapping);

    const left = findUnlabeledSpeakers(updated);
    if (left.length > 0) {
      logWarn("files/[id]", `${id}: REJECTED, still unlabeled after mapping: ${left.join(", ")}`);
      return NextResponse.json(
        {
          error: "Not every speaker has been named — finish the mapping.",
          unlabeled: left,
        },
        { status: 400 },
      );
    }

    await putLabeled(id, updated);
    logInfo("files/[id]", `${id}: saved to labeled/, raw/ untouched, ${since(startedAt)}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("files/[id]", `${id}: failed after ${since(startedAt)}`, err);
    return NextResponse.json(
      { error: "S3 error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
