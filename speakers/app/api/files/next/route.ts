import { NextRequest, NextResponse } from "next/server";
import { getRawTranscript, listPending } from "@/lib/s3";
import { logError, logInfo, since } from "@/lib/log";

const SPEAKER_PATTERN = /^SPEAKER_\d+$/;

type Word = {
  word: string;
  start?: number;
  end?: number;
  score?: number;
  speaker?: string;
};

type Utterance = {
  start: number;
  end: number;
  text: string;
  words: Word[];
  speaker?: string;
};

type SpeakerExample = {
  text: string;
  timestamp: number;
};

type SpeakerInfo = {
  examples: SpeakerExample[];
};

function extractSpeakers(data: Utterance[]): Record<string, SpeakerInfo> | null {
  const allUtterances: Record<string, SpeakerExample[]> = {};

  for (const utterance of data) {
    const speakerId = utterance.speaker;
    if (!speakerId || !SPEAKER_PATTERN.test(speakerId)) continue;
    if (!allUtterances[speakerId]) allUtterances[speakerId] = [];
    allUtterances[speakerId].push({
      text: utterance.text.trim(),
      timestamp: utterance.start,
    });
  }

  if (Object.keys(allUtterances).length === 0) return null;

  const speakers: Record<string, SpeakerInfo> = {};
  for (const [speakerId, utterances] of Object.entries(allUtterances)) {
    speakers[speakerId] = { examples: utterances };
  }

  return speakers;
}

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
