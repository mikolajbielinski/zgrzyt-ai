import { NextRequest, NextResponse } from "next/server";
import { listTranscriptFiles, getTranscriptFile } from "@/lib/s3";

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
  // Collect all utterances per speaker
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

  // Send all utterances per speaker (frontend handles pagination)
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

  try {
    const direction = request.nextUrl.searchParams.get("direction") ?? "desc";
    const files = await listTranscriptFiles();
    if (direction === "desc") files.reverse();

    const skippedRaw = request.cookies.get("skipped_files")?.value;
    const skipped: string[] = skippedRaw ? JSON.parse(skippedRaw) : [];

    // Allow excluding specific IDs (comma-separated) for prefetching
    const excludeParam = request.nextUrl.searchParams.get("exclude") ?? "";
    const excludeIds = excludeParam ? excludeParam.split(",") : [];

    for (const id of files) {
      if (skipped.includes(id)) continue;
      if (excludeIds.includes(id)) continue;
      const data = (await getTranscriptFile(id)) as Utterance[];
      const speakers = extractSpeakers(data);
      if (speakers) {
        return NextResponse.json({ id, speakers });
      }
    }

    return NextResponse.json({ done: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "S3 error" }, { status: 500 });
  }
}
