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
};

type SpeakerInfo = {
  example: string;
  timestamp: number;
};

function extractSpeakers(data: Utterance[]): Record<string, SpeakerInfo> | null {
  const speakers: Record<string, SpeakerInfo> = {};

  for (const utterance of data) {
    for (const word of utterance.words ?? []) {
      if (word.speaker && SPEAKER_PATTERN.test(word.speaker)) {
        if (!speakers[word.speaker]) {
          speakers[word.speaker] = {
            example: utterance.text.trim(),
            timestamp: utterance.start,
          };
        }
      }
    }
    // Stop early if we found at least a few examples
    if (Object.keys(speakers).length > 0 && utterance.start > 60) break;
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
