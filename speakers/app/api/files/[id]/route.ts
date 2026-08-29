import { NextRequest, NextResponse } from "next/server";
import { getTranscriptFile, putTranscriptFile } from "@/lib/s3";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("app_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { mapping } = (await request.json()) as {
    mapping: Record<string, string>;
  };

  if (!mapping || typeof mapping !== "object") {
    return NextResponse.json({ error: "Invalid mapping" }, { status: 400 });
  }

  try {
    const data = (await getTranscriptFile(id)) as Utterance[];

    const updated = data.map((utterance) => ({
      ...utterance,
      speaker:
        utterance.speaker && mapping[utterance.speaker]
          ? mapping[utterance.speaker]
          : utterance.speaker,
      words: utterance.words.map((word) => {
        if (word.speaker && mapping[word.speaker]) {
          return { ...word, speaker: mapping[word.speaker] };
        }
        return word;
      }),
    }));

    await putTranscriptFile(id, updated);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "S3 error" }, { status: 500 });
  }
}
