import { NextRequest, NextResponse } from "next/server";
import { getRawTranscript, putLabeled } from "@/lib/s3";
import { logError, logInfo, logWarn, since } from "@/lib/log";

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

function findUnlabeledSpeakers(data: Utterance[]): string[] {
  const left = new Set<string>();
  for (const utterance of data) {
    if (utterance.speaker && SPEAKER_PATTERN.test(utterance.speaker)) {
      left.add(utterance.speaker);
    }
    for (const word of utterance.words ?? []) {
      if (word.speaker && SPEAKER_PATTERN.test(word.speaker)) {
        left.add(word.speaker);
      }
    }
  }
  return [...left].sort();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    logWarn("files/[id]", `${id}: invalid mapping payload`);
    return NextResponse.json({ error: "Invalid mapping" }, { status: 400 });
  }

  const startedAt = Date.now();
  logInfo(
    "files/[id]",
    `${id}: saving, mapping = ${Object.entries(mapping).map(([k, v]) => `${k}->${v}`).join(", ")}`,
  );

  try {
    const data = (await getRawTranscript(id)) as Utterance[];

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

    const left = findUnlabeledSpeakers(updated);
    if (left.length > 0) {
      logWarn(
        "files/[id]",
        `${id}: REJECTED, still unlabeled after mapping: ${left.join(", ")}`,
      );
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
