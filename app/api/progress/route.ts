import { NextRequest, NextResponse } from "next/server";
import { listTranscriptFiles, getTranscriptFile } from "@/lib/s3";

const SPEAKER_PATTERN = /^SPEAKER_\d+$/;

type Utterance = {
  start: number;
  end: number;
  text: string;
  words: unknown[];
  speaker?: string;
};

function hasPendingSpeakers(data: Utterance[]): boolean {
  return data.some(
    (u) => u.speaker && SPEAKER_PATTERN.test(u.speaker)
  );
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const files = await listTranscriptFiles();
    let done = 0;
    let pending = 0;

    for (const id of files) {
      const data = (await getTranscriptFile(id)) as Utterance[];
      if (hasPendingSpeakers(data)) {
        pending++;
      } else {
        done++;
      }
    }

    return NextResponse.json({ done, pending, total: files.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "S3 error" }, { status: 500 });
  }
}
