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

type SpeakerInfo = {
  example: string;
  timestamp: number;
};

function extractSpeakers(data: Utterance[]): Record<string, SpeakerInfo> | null {
  const speakers: Record<string, SpeakerInfo> = {};

  // Scan entire file using utterance-level speaker field
  for (const utterance of data) {
    const speakerId = utterance.speaker;
    if (!speakerId || !SPEAKER_PATTERN.test(speakerId)) continue;
    if (!speakers[speakerId]) {
      speakers[speakerId] = {
        example: utterance.text.trim(),
        timestamp: utterance.start,
      };
    }
  }

  if (Object.keys(speakers).length === 0) return null;
  return speakers;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const files = await listTranscriptFiles();

    for (const id of files) {
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
