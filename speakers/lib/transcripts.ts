const SPEAKER_PATTERN = /^SPEAKER_\d+$/;

export type Word = {
  word: string;
  start?: number;
  end?: number;
  score?: number;
  speaker?: string;
};

export type Utterance = {
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

export function extractSpeakers(data: Utterance[]): Record<string, SpeakerInfo> | null {
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

export function applySpeakerMapping(
  data: Utterance[],
  mapping: Record<string, string>,
): Utterance[] {
  return data.map((utterance) => ({
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
}

export function findUnlabeledSpeakers(data: Utterance[]): string[] {
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
